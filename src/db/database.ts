import fs from 'fs';
import path from 'path';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface MessageRecord {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

export interface RoomRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export class Database {
  private dataDir: string;
  private usersFile: string;
  private messagesFile: string;
  private roomsFile: string;

  private users: Map<string, UserRecord> = new Map();
  private messages: MessageRecord[] = [];
  private rooms: Map<string, RoomRecord> = new Map();

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.usersFile = path.join(this.dataDir, 'users.json');
    this.messagesFile = path.join(this.dataDir, 'messages.json');
    this.roomsFile = path.join(this.dataDir, 'rooms.json');

    this.init();
  }

  private init() {
    this.loadRooms();
    this.loadUsers();
    this.loadMessages();
  }

  private loadRooms() {
    if (fs.existsSync(this.roomsFile)) {
      try {
        const raw = fs.readFileSync(this.roomsFile, 'utf-8');
        const list: RoomRecord[] = JSON.parse(raw);
        list.forEach(r => this.rooms.set(r.id, r));
      } catch (err) {
        console.error('Error reading rooms file, reinitializing', err);
      }
    }

    // Ensure default rooms exist
    const defaultRooms = [
      { id: 'general', name: 'General', description: 'Public discussion for everyone', createdAt: new Date().toISOString() },
      { id: 'engineering', name: 'Engineering', description: 'Deep technical chats, architecture, and systems', createdAt: new Date().toISOString() },
      { id: 'random', name: 'Random', description: 'Casual watercooler talk and links', createdAt: new Date().toISOString() },
      { id: 'showcase', name: 'Showcase', description: 'Share what you have built today', createdAt: new Date().toISOString() }
    ];

    for (const r of defaultRooms) {
      if (!this.rooms.has(r.id)) {
        this.rooms.set(r.id, r);
      }
    }
    this.saveRooms();
  }

  private loadUsers() {
    if (fs.existsSync(this.usersFile)) {
      try {
        const raw = fs.readFileSync(this.usersFile, 'utf-8');
        const list: UserRecord[] = JSON.parse(raw);
        list.forEach(u => this.users.set(u.username.toLowerCase(), u));
      } catch (err) {
        console.error('Error reading users file', err);
      }
    }
  }

  private loadMessages() {
    if (fs.existsSync(this.messagesFile)) {
      try {
        const raw = fs.readFileSync(this.messagesFile, 'utf-8');
        this.messages = JSON.parse(raw);
      } catch (err) {
        console.error('Error reading messages file', err);
        this.messages = [];
      }
    }
  }

  private saveRooms() {
    fs.writeFileSync(this.roomsFile, JSON.stringify(Array.from(this.rooms.values()), null, 2), 'utf-8');
  }

  private saveUsers() {
    fs.writeFileSync(this.usersFile, JSON.stringify(Array.from(this.users.values()), null, 2), 'utf-8');
  }

  private saveMessages() {
    fs.writeFileSync(this.messagesFile, JSON.stringify(this.messages, null, 2), 'utf-8');
  }

  // Users API
  public createUser(username: string, passwordHash: string): UserRecord {
    const key = username.toLowerCase();
    if (this.users.has(key)) {
      throw new Error(`User ${username} already exists`);
    }

    const user: UserRecord = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      username,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    this.users.set(key, user);
    this.saveUsers();
    return user;
  }

  public getUserByUsername(username: string): UserRecord | null {
    return this.users.get(username.toLowerCase()) || null;
  }

  public getUserById(id: string): UserRecord | null {
    for (const u of this.users.values()) {
      if (u.id === id) return u;
    }
    return null;
  }

  // Rooms API
  public getRooms(): RoomRecord[] {
    return Array.from(this.rooms.values());
  }

  public getRoom(id: string): RoomRecord | null {
    return this.rooms.get(id) || null;
  }

  // Messages API
  public createMessage(roomId: string, userId: string, username: string, content: string): MessageRecord {
    const msg: MessageRecord = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      roomId,
      userId,
      username,
      content,
      createdAt: new Date().toISOString()
    };

    this.messages.push(msg);
    // Keep maximum 5000 messages in persistent memory
    if (this.messages.length > 5000) {
      this.messages.splice(0, this.messages.length - 5000);
    }

    this.saveMessages();
    return msg;
  }

  public getRecentMessages(roomId: string, limit: number = 50): MessageRecord[] {
    return this.messages
      .filter(m => m.roomId === roomId)
      .slice(-limit);
  }
}

export const db = new Database();
