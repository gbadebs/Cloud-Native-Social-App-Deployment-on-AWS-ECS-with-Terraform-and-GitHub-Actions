import express from 'express';
import path from 'path';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieSession from 'cookie-session';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import Joi from 'joi';
import { nanoid } from 'nanoid';
import {
  ensureTables, getUserByUsername, createUser, createPost,
  listRecentPosts, listPostsByAuthor, toggleLike, hasLiked, getPost
} from './lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;
const APP_NAME = process.env.APP_NAME || 'socialapp';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-prod';

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "img-src": ["'self'", "data:"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"]
    }
  }
}));
app.use(compression());
app.use(morgan('combined'));

// Sessions
app.use(cookieSession({
  name: 'sid',
  secret: SESSION_SECRET,
  sameSite: 'lax',
  httpOnly: true,
  secure: false, // set true when behind HTTPS
  maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
}));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static & views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Health endpoints
app.get('/healthz', (_, res) => res.json({ status: 'ok' }));
app.get('/readyz', async (_, res) => {
  try {
    await ensureTables();
    res.json({ ready: true });
  } catch {
    res.status(500).json({ ready: false });
  }
});

// Auth helpers
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Rate limiters
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
const writeLimiter = rateLimit({ windowMs: 10_000, max: 30 });

// Validation schemas
const signupSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(20).required(),
  displayName: Joi.string().min(1).max(50).required(),
  password: Joi.string().min(6).max(100).required()
});

const loginSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(20).required(),
  password: Joi.string().min(6).max(100).required()
});

const postSchema = Joi.object({
  content: Joi.string().min(1).max(280).required()
});

// Routes
app.get('/', async (req, res) => {
  const user = req.session.user || null;
  const posts = await listRecentPosts(100);
  res.render('feed', { user, posts });
});

app.get('/signup', authLimiter, (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('signup', { error: null });
});

app.post('/signup', authLimiter, async (req, res) => {
  const { error, value } = signupSchema.validate(req.body);
  if (error) return res.status(400).render('signup', { error: error.message });
  const { username, displayName, password } = value;

  const existing = await getUserByUsername(username);
  if (existing) return res.status(409).render('signup', { error: 'Username already taken.' });

  const hash = await bcrypt.hash(password, 10);
  await createUser({ username, displayName, passwordHash: hash, createdAt: Date.now() });
  req.session.user = { username, displayName };
  res.redirect('/');
});

app.get('/login', authLimiter, (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

app.post('/login', authLimiter, async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).render('login', { error: error.message });
  const { username, password } = value;

  const user = await getUserByUsername(username);
  if (!user) return res.status(401).render('login', { error: 'Invalid credentials.' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).render('login', { error: 'Invalid credentials.' });

  req.session.user = { username: user.username, displayName: user.displayName };
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

app.get('/compose', requireAuth, (req, res) => {
  res.render('compose', { error: null, user: req.session.user });
});

app.post('/posts', writeLimiter, requireAuth, async (req, res) => {
  const { error, value } = postSchema.validate(req.body);
  if (error) return res.status(400).render('compose', { error: error.message, user: req.session.user });
  const { content } = value;
  const post = {
    post_id: nanoid(12),
    author: req.session.user.username,
    author_name: req.session.user.displayName,
    content,
    likes: 0,
    createdAt: Date.now()
  };
  await createPost(post);
  res.redirect('/');
});

app.post('/posts/:id/like', writeLimiter, requireAuth, async (req, res) => {
  const id = req.params.id;
  const user = req.session.user.username;
  const { liked } = await toggleLike(id, user);
  // Redirect back to the referrer
  res.redirect(req.get('referer') || '/');
});

app.get('/u/:username', async (req, res) => {
  const username = req.params.username;
  const posts = await listPostsByAuthor(username, 100);
  const viewer = req.session.user || null;
  res.render('profile', { viewer, profile: { username }, posts });
});

// Minimal post page (optional)
app.get('/p/:id', async (req, res) => {
  const post = await getPost(req.params.id);
  if (!post) return res.status(404).render('404');
  const viewer = req.session.user || null;
  const liked = viewer ? await hasLiked(post.post_id, viewer.username) : false;
  res.render('post', { viewer, post, liked });
});

app.use((req, res) => res.status(404).render('404'));

app.listen(PORT, () => {
  console.log(`${APP_NAME} listening on ${PORT}`);
});
