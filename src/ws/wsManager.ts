import WebSocket from 'ws';
import { db } from '../db/database';
import { AuthService } from '../auth/authService';
import {
  ClientMessage,
  ServerMessage,
  ServerChatMessage
} from './protocol';

export interface ConnectedClient {
  ws: WebSocket;
  userId?: string;
  username?: string;
  currentRoom: string;
  isAlive: boolean;
}

export class WebSocketManager {
  private clients: Set<ConnectedClient> = new Set();
  private roomSubscriptions: Map<string, Set<ConnectedClient>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  public handleConnection(ws: WebSocket) {
    const client: ConnectedClient = {
      ws,
      currentRoom: 'general',
      isAlive: true
    };

    this.clients.add(client);

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const text = data.toString();
        const msg = JSON.parse(text) as ClientMessage;
        this.processClientMessage(client, msg);
      } catch (err) {
        this.sendError(client, 'INVALID_JSON', 'Could not parse message as valid JSON');
      }
    });

    ws.on('close', () => {
      this.handleDisconnection(client);
    });

    ws.on('error', (err) => {
      console.error('Socket error for client:', client.username, err.message);
      this.handleDisconnection(client);
    });
  }

  private processClientMessage(client: ConnectedClient, msg: ClientMessage) {
    switch (msg.type) {
      case 'AUTH':
        this.handleAuth(client, msg.username, msg.token);
        break;

      case 'JOIN_ROOM':
        if (!client.userId) {
          return this.sendError(client, 'UNAUTHORIZED', 'You must authenticate first');
        }
        this.joinRoom(client, msg.room);
        break;

      case 'CHAT_MESSAGE':
        if (!client.userId || !client.username) {
          return this.sendError(client, 'UNAUTHORIZED', 'You must authenticate first');
        }
        this.handleChatMessage(client, msg.room, msg.content);
        break;

      case 'TYPING':
        if (client.username) {
          this.broadcastToRoom(msg.room, {
            type: 'TYPING_STATUS',
            room: msg.room,
            username: client.username,
            isTyping: msg.isTyping
          }, client);
        }
        break;

      case 'PING':
        client.isAlive = true;
        this.send(client, { type: 'PONG' });
        break;

      default:
        this.sendError(client, 'UNKNOWN_TYPE', 'Message type not recognized');
    }
  }

  private handleAuth(client: ConnectedClient, username: string, token?: string) {
    try {
      let validatedUsername = username;
      let userId: string;
      let authToken: string;

      if (token) {
        const payload = AuthService.verifyToken(token);
        if (payload) {
          userId = payload.userId;
          validatedUsername = payload.username;
          authToken = token;
        } else {
          // Fallback to username login if token expired
          const authRes = AuthService.registerOrLogin(username);
          userId = authRes.user.id;
          authToken = authRes.token;
        }
      } else {
        const authRes = AuthService.registerOrLogin(username);
        userId = authRes.user.id;
        authToken = authRes.token;
      }

      client.userId = userId;
      client.username = validatedUsername;

      const rooms = db.getRooms().map(r => r.id);

      this.send(client, {
        type: 'AUTH_SUCCESS',
        user: { id: userId, username: validatedUsername },
        token: authToken,
        availableRooms: rooms
      });

      // Automatically join initial room
      this.joinRoom(client, client.currentRoom);
    } catch (err: any) {
      this.sendError(client, 'AUTH_FAILED', err.message || 'Authentication error');
    }
  }

  private joinRoom(client: ConnectedClient, newRoomId: string) {
    const room = db.getRoom(newRoomId) || db.getRoom('general');
    const targetRoomId = room ? room.id : 'general';

    // Remove from previous room
    if (client.currentRoom && this.roomSubscriptions.has(client.currentRoom)) {
      const prevSubscribers = this.roomSubscriptions.get(client.currentRoom)!;
      prevSubscribers.delete(client);

      if (client.username) {
        this.broadcastToRoom(client.currentRoom, {
          type: 'USER_LEFT',
          room: client.currentRoom,
          username: client.username,
          userCount: prevSubscribers.size
        });
      }
    }

    // Add to new room
    client.currentRoom = targetRoomId;
    if (!this.roomSubscriptions.has(targetRoomId)) {
      this.roomSubscriptions.set(targetRoomId, new Set());
    }
    const currentSubscribers = this.roomSubscriptions.get(targetRoomId)!;
    currentSubscribers.add(client);

    // Send recent room history to this client
    const recentMessages = db.getRecentMessages(targetRoomId, 50).map(m => ({
      type: 'CHAT_MESSAGE' as const,
      id: m.id,
      room: m.roomId,
      userId: m.userId,
      username: m.username,
      content: m.content,
      createdAt: m.createdAt
    }));

    this.send(client, {
      type: 'ROOM_HISTORY',
      room: targetRoomId,
      messages: recentMessages
    });

    // Send active users in the room
    const roomUsers = Array.from(currentSubscribers)
      .map(c => c.username)
      .filter((name): name is string => Boolean(name));

    this.send(client, {
      type: 'ROOM_USERS',
      room: targetRoomId,
      users: roomUsers
    });

    // Notify others that this user joined
    if (client.username) {
      this.broadcastToRoom(targetRoomId, {
        type: 'USER_JOINED',
        room: targetRoomId,
        username: client.username,
        userCount: currentSubscribers.size
      }, client);
    }
  }

  private handleChatMessage(client: ConnectedClient, roomId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;

    if (trimmed.length > 2000) {
      return this.sendError(client, 'MESSAGE_TOO_LONG', 'Message must be under 2000 characters');
    }

    // Persist message in database
    const saved = db.createMessage(roomId, client.userId!, client.username!, trimmed);

    const broadcastMsg: ServerChatMessage = {
      type: 'CHAT_MESSAGE',
      id: saved.id,
      room: roomId,
      userId: saved.userId,
      username: saved.username,
      content: saved.content,
      createdAt: saved.createdAt
    };

    // Broadcast to everyone in the room including sender
    this.broadcastToRoom(roomId, broadcastMsg);
  }

  private handleDisconnection(client: ConnectedClient) {
    this.clients.delete(client);

    if (client.currentRoom && this.roomSubscriptions.has(client.currentRoom)) {
      const subs = this.roomSubscriptions.get(client.currentRoom)!;
      subs.delete(client);

      if (client.username) {
        this.broadcastToRoom(client.currentRoom, {
          type: 'USER_LEFT',
          room: client.currentRoom,
          username: client.username,
          userCount: subs.size
        });
      }
    }
  }

  public broadcastToRoom(roomId: string, message: ServerMessage, excludeClient?: ConnectedClient) {
    const subs = this.roomSubscriptions.get(roomId);
    if (!subs) return;

    const payload = JSON.stringify(message);
    subs.forEach(c => {
      if (c !== excludeClient && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(payload);
      }
    });
  }

  public send(client: ConnectedClient, message: ServerMessage) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  public sendError(client: ConnectedClient, code: string, message: string) {
    this.send(client, {
      type: 'ERROR',
      code,
      message
    });
  }

  private startHeartbeat() {
    this.pingInterval = setInterval(() => {
      this.clients.forEach(c => {
        if (!c.isAlive) {
          console.log(`Terminating stale connection for ${c.username || 'anonymous'}`);
          c.ws.terminate();
          this.handleDisconnection(c);
          return;
        }

        c.isAlive = false;
        c.ws.ping();
      });
    }, 30000);
  }

  public close() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.clients.forEach(c => c.ws.close());
  }
}
