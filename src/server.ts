import http from 'http';
import path from 'path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { WebSocketManager } from './ws/wsManager';
import { db } from './db/database';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const wsManager = new WebSocketManager();

const PORT = process.env.PORT || 3000;

import fs from 'fs';

// Serve frontend assets
const candidates = [
  path.join(__dirname, 'public'),
  path.join(__dirname, '../src/public'),
  path.join(process.cwd(), 'src/public'),
  path.join(process.cwd(), 'public')
];
const publicPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
app.use(express.static(publicPath));
app.use(express.json());

// API Endpoints
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/rooms', (_req, res) => {
  res.json({
    rooms: db.getRooms()
  });
});

app.get('/api/rooms/:roomId/messages', (req, res) => {
  const roomId = req.params.roomId;
  const messages = db.getRecentMessages(roomId, 50);
  res.json({ messages });
});

// Attach WebSocket connection listener
wss.on('connection', (ws) => {
  wsManager.handleConnection(ws);
});

// Fallback to index.html for client routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`=============================================`);
  console.log(`🚀 PulseChat Real-Time Server running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`⚡ WebSocket: ws://localhost:${PORT}`);
  console.log(`📁 Persistence: SQLite JSON WAL in /data`);
  console.log(`=============================================`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wsManager.close();
  server.close(() => {
    console.log('PulseChat server closed cleanly.');
    process.exit(0);
  });
});
