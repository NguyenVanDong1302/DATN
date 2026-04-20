# Deployment Guide

This project is best deployed with:

- Frontend: Vercel
- Backend: Render or Railway
- Database: MongoDB Atlas

## Recommended architecture

Do not deploy the current backend to Vercel Functions.

The backend uses:

- Express
- Socket.IO realtime connections
- local file uploads

That combination works better on a long-running Node web service such as Render or Railway.

## Option A: Vercel + Render

### 1. Push the repo to GitHub

- Create a GitHub repository
- Push the full monorepo to `main`

### 2. Deploy the backend on Render

- Sign in to Render
- Choose `New -> Blueprint`
- Select this repository
- Render will detect `render.yaml`
- Create the `social-backend` web service

Then add these environment variables in the Render dashboard:

- `HOST=0.0.0.0`
- `PORT=10000`
- `MONGO_URI=...`
- `JWT_SECRET=...`
- `MEDIA_PUBLIC_BASE_URL=https://your-backend.onrender.com`
- `CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app`
- `CORS_ALLOW_VERCEL_PREVIEWS=true`

If you later attach a custom frontend domain, add it to `CORS_ALLOWED_ORIGINS` too.

### 3. Deploy the frontend on Vercel

- Sign in to Vercel
- Import the same GitHub repository
- Set the Root Directory to `social-frontend`
- Vercel should detect Vite automatically

Add these environment variables in Vercel:

- `VITE_API_BASE_URL=https://your-backend.onrender.com/api`
- `VITE_MEDIA_BASE_URL=https://your-backend.onrender.com`
- `VITE_SOCKET_URL=https://your-backend.onrender.com`
- `VITE_BACKEND_PORT=4000`
- `VITE_FIREBASE_API_KEY=...`
- `VITE_FIREBASE_AUTH_DOMAIN=...`
- `VITE_FIREBASE_PROJECT_ID=...`
- `VITE_FIREBASE_STORAGE_BUCKET=...`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=...`
- `VITE_FIREBASE_APP_ID=...`

After deployment, your frontend URL will look like:

- `https://your-project.vercel.app`

### 4. Verify

Check these flows after deploy:

- login/register
- feed load
- image/video upload
- direct messages
- Socket.IO realtime chat
- voice/video call

## Option B: Vercel + Railway

If you prefer Railway:

- deploy `social-backend` as a Node service
- set the same backend environment variables
- use the Railway public domain for:
  - `VITE_API_BASE_URL`
  - `VITE_MEDIA_BASE_URL`
  - `VITE_SOCKET_URL`

## Important limitation

The backend currently stores uploads on the local filesystem.

That means:

- free Render deploys use ephemeral storage
- uploaded files can disappear after restart or redeploy

If you want stable production media storage, move uploads to a persistent service such as:

- Cloudinary
- Supabase Storage
- S3-compatible object storage

## Example production values

Frontend on Vercel:

- `https://ig-clone-web.vercel.app`

Backend on Render:

- `https://ig-clone-api.onrender.com`

Use:

- `VITE_API_BASE_URL=https://ig-clone-api.onrender.com/api`
- `VITE_MEDIA_BASE_URL=https://ig-clone-api.onrender.com`
- `VITE_SOCKET_URL=https://ig-clone-api.onrender.com`
- `MEDIA_PUBLIC_BASE_URL=https://ig-clone-api.onrender.com`
- `CORS_ALLOWED_ORIGINS=https://ig-clone-web.vercel.app`
