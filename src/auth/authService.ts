import crypto from 'crypto';
import { db, UserRecord } from '../db/database';

const JWT_SECRET = process.env.JWT_SECRET || 'pulsechat_dev_secret_key_super_secure_9921';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface TokenPayload {
  userId: string;
  username: string;
  exp: number;
}

export class AuthService {
  /**
   * Hash password using PBKDF2 with unique salt
   */
  public static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verify password against salt:hash
   */
  public static verifyPassword(password: string, storedHash: string): boolean {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(originalHash), Buffer.from(testHash));
  }

  /**
   * Lightweight HMAC-SHA256 JWT implementation without external deps
   */
  public static generateToken(userId: string, username: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadData: TokenPayload = {
      userId,
      username,
      exp: Date.now() + TOKEN_EXPIRY_MS
    };
    const payload = Buffer.from(JSON.stringify(payloadData)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }

  /**
   * Verify token signature and expiration
   */
  public static verifyToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [header, payload, signature] = parts;
      const expectedSignature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${header}.${payload}`)
        .digest('base64url');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
      }

      const decodedPayload: TokenPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
      if (Date.now() > decodedPayload.exp) {
        return null; // Expired
      }

      return decodedPayload;
    } catch {
      return null;
    }
  }

  /**
   * Register or login a user
   */
  public static registerOrLogin(username: string, password?: string): { user: UserRecord; token: string; isNew: boolean } {
    const cleanUsername = username.trim();
    if (!cleanUsername || cleanUsername.length < 2) {
      throw new Error('Username must be at least 2 characters');
    }

    const defaultPass = password || 'pulsechat123';
    let user = db.getUserByUsername(cleanUsername);
    let isNew = false;

    if (!user) {
      const hash = this.hashPassword(defaultPass);
      user = db.createUser(cleanUsername, hash);
      isNew = true;
    } else if (password) {
      const valid = this.verifyPassword(password, user.passwordHash);
      if (!valid) {
        throw new Error('Invalid credentials');
      }
    }

    const token = this.generateToken(user.id, user.username);
    return { user, token, isNew };
  }
}
