# Deployment Guide

Recommended production split for this repository:

- Frontend: Vercel
- Backend: self-hosted Node.js service on your machine, or Render/Railway
- Database: MongoDB Atlas

## Important architecture note

The backend can now be deployed to Vercel for REST API/demo usage, but the full feature set still fits a long-running Node server better.

This backend uses:

- Express
- Socket.IO realtime connections
- local file uploads

Socket.IO realtime connections and durable local uploads need a long-running Node server or external services. On Vercel, REST endpoints work through a serverless entrypoint, Socket.IO emits become no-ops, and upload files use Vercel's temporary `/tmp` storage.

## Option: backend on Vercel

This repository includes `social-backend/api/index.js` and `social-backend/vercel.json` for Vercel Functions.

### 1. Import backend project

- Import this repository into Vercel as a new project
- Set the Root Directory to `social-backend`
- Leave Framework Preset as Other if Vercel asks
- Deploy after adding the required environment variables below

### 2. Backend Vercel environment variables

Required:

```env
MONGO_URI=your_mongodb_atlas_connection_string
MONGODB_SERVER_SELECTION_TIMEOUT_MS=8000
JWT_SECRET=replace_with_a_long_random_secret
MEDIA_PUBLIC_BASE_URL=https://social-backend-indol.vercel.app
CORS_ALLOWED_ORIGINS=https://datn-hx48.vercel.app
CORS_ALLOW_VERCEL_PREVIEWS=true
```

`MONGO_URI` must not be `mongodb://localhost...` or `mongodb://127.0.0.1...` on Vercel. Use MongoDB Atlas or another public MongoDB host, and allow Vercel access in the database network settings.

Optional for admin/moderation demos:

```env
ADMIN_EMAILS=admin@example.com
ADMIN_USERNAMES=admin
ADULT_MODERATION_PROVIDER_URL=
```

After deploy, verify:

```text
https://social-backend-indol.vercel.app/api/health
```

### 3. Frontend variables when backend is on Vercel

Set these in the frontend Vercel project:

```env
VITE_API_BASE_URL=https://social-backend-indol.vercel.app/api
VITE_MEDIA_BASE_URL=https://social-backend-indol.vercel.app
VITE_SOCKET_URL=https://social-backend-indol.vercel.app
VITE_SOCKET_ENABLED=false
```

Realtime chat/call will not behave like the local Socket.IO server on Vercel Functions. For full realtime behavior, use the self-hosted or Render/Railway option below.

## Recommended option: Vercel + self-hosted backend

This is the best fit if you want the frontend on Vercel and want your own machine to act as the backend server.

### 1. Frontend on Vercel

- Import this repository into Vercel
- Set the Root Directory to `social-frontend`
- Vercel should detect Vite automatically
- This repository now includes `social-frontend/vercel.json` so React Router routes can refresh correctly

### 2. Backend on your machine

Run the backend as a long-running process on the machine that will act as the server:

```bash
cd social-backend
npm install
npm start
```

Recommended backend `.env` values for self-hosting:

```env
HOST=0.0.0.0
PORT=4000
MONGO_URI=mongodb+srv://dongyh2002bghs_db_user:<Xincamon123>@instagramclone.owta2ao.mongodb.net/?appName=InstagramClone
JWT_SECRET=replace_with_a_long_random_secret
MEDIA_PUBLIC_BASE_URL=https://api.example.com
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app
CORS_ALLOW_VERCEL_PREVIEWS=true
```

If you also use a custom Vercel domain, add it to `CORS_ALLOWED_ORIGINS` too:

```env
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://your-custom-domain.com
```

### 3. Expose the backend to the Internet over HTTPS

This step is required.

If your frontend is served from Vercel over `https://...`, the backend must also be reachable over `https://...`. A plain public `http://<ip>:4000` backend will usually fail in the browser because secure pages cannot safely call insecure API and WebSocket endpoints.

Recommended approach:

- Use Cloudflare Tunnel to publish a hostname such as `https://api.example.com`
- Point that hostname to your local backend service `http://localhost:4000`

Typical published app mapping:

- Public hostname: `api.example.com`
- Local service: `http://localhost:4000`

If you do not want to use Cloudflare Tunnel, the alternative is:

- static IP or dynamic DNS
- router port forwarding
- Windows firewall allow rule
- reverse proxy with HTTPS certificate, such as Caddy or Nginx

### 4. Set Vercel environment variables

Add these variables in the Vercel project for `social-frontend`:

- `VITE_API_BASE_URL=https://api.example.com/api`
- `VITE_MEDIA_BASE_URL=https://api.example.com`
- `VITE_SOCKET_URL=https://api.example.com`
- `VITE_BACKEND_PORT=4000`
- `VITE_FIREBASE_API_KEY=...`
- `VITE_FIREBASE_AUTH_DOMAIN=...`
- `VITE_FIREBASE_PROJECT_ID=...`
- `VITE_FIREBASE_STORAGE_BUCKET=...`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=...`
- `VITE_FIREBASE_APP_ID=...`

After changing environment variables on Vercel, redeploy the frontend.

### 5. Verify after deploy

Check these flows:

- `/login` and `/register`
- page refresh on routes like `/messages`, `/profile/:username`, `/reels`
- feed load
- image/video upload
- direct messages
- Socket.IO realtime chat
- voice/video call

### 6. Keep the self-hosted backend online

Your machine must stay:

- powered on
- connected to the Internet
- logged in if the backend process depends on the user session
- protected from sleep/hibernate stopping the service

For a more stable setup on Windows, run the backend and tunnel as services or under a process manager.

## Alternative option: Vercel + Render

If later you prefer managed hosting, `render.yaml` is still available for the backend.

Render environment variables:

- `HOST=0.0.0.0`
- `PORT=10000`
- `MONGO_URI=...`
- `JWT_SECRET=...`
- `MEDIA_PUBLIC_BASE_URL=https://your-backend.onrender.com`
- `CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app`
- `CORS_ALLOW_VERCEL_PREVIEWS=true`

Frontend Vercel variables:

- `VITE_API_BASE_URL=https://your-backend.onrender.com/api`
- `VITE_MEDIA_BASE_URL=https://your-backend.onrender.com`
- `VITE_SOCKET_URL=https://your-backend.onrender.com`

## Important limitation

The backend currently stores uploads on the local filesystem.

That means:

- self-hosting keeps files on your machine
- Render free instances use ephemeral storage
- uploaded files can disappear after restart or redeploy on ephemeral platforms

If you want more durable media storage later, move uploads to:

- Cloudinary
- Supabase Storage
- S3-compatible object storage

## Example production values

Frontend on Vercel:

- `https://datn-sand.vercel.app`

Backend on your machine via HTTPS hostname:

- `https://api.example.com`

Use:

- `VITE_API_BASE_URL=https://api.example.com/api`
- `VITE_MEDIA_BASE_URL=https://api.example.com`
- `VITE_SOCKET_URL=https://api.example.com`
- `MEDIA_PUBLIC_BASE_URL=https://api.example.com`
- `CORS_ALLOWED_ORIGINS=https://datn-sand.vercel.app`
