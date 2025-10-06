import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_USERS = process.env.TABLE_USERS || 'socialapp-users';
const TABLE_POSTS = process.env.TABLE_POSTS || 'socialapp-posts';
const TABLE_LIKES = process.env.TABLE_LIKES || 'socialapp-likes';

const client = new DynamoDBClient({ region: REGION });
const doc = DynamoDBDocumentClient.from(client);

export async function ensureTables() {
  // Assume Terraform created tables; a simple scan to test perms
  await doc.send(new ScanCommand({ TableName: TABLE_USERS, Limit: 1 }));
  await doc.send(new ScanCommand({ TableName: TABLE_POSTS, Limit: 1 }));
  await doc.send(new ScanCommand({ TableName: TABLE_LIKES, Limit: 1 }));
  return true;
}

// Users
export async function getUserByUsername(username) {
  const out = await doc.send(new GetCommand({ TableName: TABLE_USERS, Key: { username } }));
  return out.Item || null;
}

export async function createUser(user) {
  await doc.send(new PutCommand({
    TableName: TABLE_USERS,
    Item: user,
    ConditionExpression: "attribute_not_exists(username)"
  }));
}

// Posts
export async function createPost(post) {
  await doc.send(new PutCommand({ TableName: TABLE_POSTS, Item: post }));
}

export async function getPost(post_id) {
  const out = await doc.send(new GetCommand({ TableName: TABLE_POSTS, Key: { post_id } }));
  return out.Item || null;
}

export async function listRecentPosts(limit = 100) {
  // For demo, Scan and sort client-side. For prod scale, add a GSI on createdAt.
  const out = await doc.send(new ScanCommand({ TableName: TABLE_POSTS, Limit: limit }));
  const items = (out.Items || []).sort((a,b) => (b.createdAt||0) - (a.createdAt||0)).slice(0, limit);
  return items;
}

export async function listPostsByAuthor(author, limit = 100) {
  // Without GSI, we scan and filter; for scale, add GSI "by_author".
  const out = await doc.send(new ScanCommand({ TableName: TABLE_POSTS, Limit: limit * 5 }));
  const items = (out.Items || []).filter(p => p.author === author).sort((a,b) => (b.createdAt||0) - (a.createdAt||0)).slice(0, limit);
  return items;
}

// Likes
export async function hasLiked(post_id, username) {
  const out = await doc.send(new GetCommand({ TableName: TABLE_LIKES, Key: { post_id, username } }));
  return !!out.Item;
}

export async function toggleLike(post_id, username) {
  const liked = await hasLiked(post_id, username);
  if (liked) {
    await doc.send(new DeleteCommand({ TableName: TABLE_LIKES, Key: { post_id, username } }));
    await doc.send(new UpdateCommand({
      TableName: TABLE_POSTS,
      Key: { post_id },
      UpdateExpression: "SET likes = if_not_exists(likes, :zero) - :one",
      ConditionExpression: "attribute_exists(post_id) AND likes >= :one",
      ExpressionAttributeValues: { ":one": 1, ":zero": 0 }
    }));
    return { liked: false };
  } else {
    await doc.send(new PutCommand({ TableName: TABLE_LIKES, Item: { post_id, username } }));
    await doc.send(new UpdateCommand({
      TableName: TABLE_POSTS,
      Key: { post_id },
      UpdateExpression: "SET likes = if_not_exists(likes, :zero) + :one",
      ConditionExpression: "attribute_exists(post_id)",
      ExpressionAttributeValues: { ":one": 1, ":zero": 0 }
    }));
    return { liked: true };
  }
}
