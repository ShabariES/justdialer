# JustCall - P2P Voice Calling PWA

JustCall is a production-ready Progressive Web Application that allows users to make real-time voice calls using their Roll Numbers. Built with WebRTC and Socket.io.

## 🚀 Tech Stack
- **Frontend:** Vanilla JS, WebRTC, Socket.io client
- **Backend:** Node.js, Express, Socket.io
- **Database:** Supabase (PostgreSQL)

## 📁 Project Structure
- `frontend/`: PWA assets, UI, and WebRTC logic.
- `backend/`: Express server, Signaling logic, and Supabase client.

## 🛠️ Setup Instructions

### 1. Supabase Setup
1. Create a project on [Supabase](https://supabase.com).
2. Go to the SQL Editor and run the content of `backend/setup.sql`.
3. Go to Project Settings -> API and get your `URL` and `anon key`.

### 2. Backend Configuration
1. Navigate to `/backend`.
2. Open `.env` and fill in your Supabase credentials:
   ```env
   PORT=3000
   SUPABASE_URL=your_url_here
   SUPABASE_ANON_KEY=your_key_here
   ```
3. Install dependencies and start:
   ```bash
   npm install
   node server.js
   ```

### 3. Frontend Configuration
1. Open `frontend/app.js`.
2. Update `API_URL` if your backend is running on a different port/host.
3. Serve the `frontend` folder using any static server (e.g., Live Server in VS Code, or `npx serve`).

### 4. PWA Features
- The app is installable on Mobile and Desktop.
- Service worker handles offline caching of static assets.
- Integrated WebRTC handles secure P2P audio transmission.

## 📱 Features
- **Registration/Login:** Securely handle user identity based on Roll Number.
- **Real-time Status:** Users show as online/offline based on socket connection.
- **Voice Calls:** Peer-to-peer audio calls with ringtones and intuitive UI.
- **Responsive Design:** Works seamlessly on mobile, tablet, and desktop.

## ⚠️ Notes
- Ensure you serve the frontend over `https` (or `localhost` for development) to grant microphone permissions.
- You can add icons to `frontend/icons/` to customize the PWA look.
