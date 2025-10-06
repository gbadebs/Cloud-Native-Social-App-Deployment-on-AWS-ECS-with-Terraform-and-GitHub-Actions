# syntax=docker/dockerfile:1
FROM node:20-alpine

ENV NODE_ENV=production     PORT=8000     APP_NAME=socialapp

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# Add a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 8000
CMD ["node", "server.js"]
