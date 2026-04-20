# Pulse Messenger

A real-time messenger app built with Node.js, MongoDB, Socket.io, and vanilla JS.

## Features
- User registration & login (JWT auth)
- Real-time messaging with Socket.io
- Online/offline status indicators
- Typing indicators
- Read receipts
- User search
- Message history (paginated)
- Message deletion
- Date dividers in chat

## Prerequisites
- Node.js v18+
- MongoDB running locally (`mongod`) or a MongoDB Atlas URI

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB URI and a strong JWT secret
   ```

3. **Start MongoDB** (if running locally)
   ```bash
   mongod --dbpath /data/db
   ```

4. **Run the server**
   ```bash
   # Development (auto-restart)
   npm run dev

   # Production
   npm start
   ```

5. **Open** http://localhost:3000

## Project Structure

```
messenger/
├── server/
│   ├── index.js          # Entry point (Express + Socket.io)
│   ├── models/
│   │   ├── User.js       # User schema
│   │   └── Message.js    # Message schema
│   ├── routes/
│   │   ├── auth.js       # Register / Login / Me
│   │   ├── messages.js   # Conversation history
│   │   └── users.js      # User search
│   ├── middleware/
│   │   └── auth.js       # JWT middleware
│   └── socket/
│       └── handler.js    # Real-time event handlers
├── public/
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
├── .env.example
└── package.json
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Sign in |
| GET | /api/auth/me | Get current user |
| GET | /api/messages/conversations | List all conversations |
| GET | /api/messages/conversation/:id | Get messages with user |
| DELETE | /api/messages/:id | Delete a message |
| GET | /api/users/search?q= | Search users |

## Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| message:send | Client → Server | Send a message |
| message:received | Server → Client | New message delivered |
| typing:start / stop | Both | Typing indicators |
| messages:read | Both | Mark as read |
| user:status | Server → Client | Online/offline updates |
| message:delete | Client → Server | Delete a message |
| message:deleted | Server → Client | Message deletion confirmed |
