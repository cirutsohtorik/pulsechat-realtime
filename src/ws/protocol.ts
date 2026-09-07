/**
 * WebSocket Protocol Types & Contracts for PulseChat
 */

export type ClientMessageType =
  | 'AUTH'
  | 'JOIN_ROOM'
  | 'CHAT_MESSAGE'
  | 'TYPING'
  | 'PING';

export type ServerMessageType =
  | 'AUTH_SUCCESS'
  | 'ROOM_JOINED'
  | 'CHAT_MESSAGE'
  | 'TYPING_STATUS'
  | 'USER_JOINED'
  | 'USER_LEFT'
  | 'ROOM_USERS'
  | 'ROOM_HISTORY'
  | 'PONG'
  | 'ERROR';

export interface BaseMessage {
  type: string;
  timestamp?: number;
}

// Client inbound messages
export interface ClientAuthMessage extends BaseMessage {
  type: 'AUTH';
  token?: string;
  username: string;
}

export interface ClientJoinRoomMessage extends BaseMessage {
  type: 'JOIN_ROOM';
  room: string;
}

export interface ClientChatMessage extends BaseMessage {
  type: 'CHAT_MESSAGE';
  room: string;
  content: string;
}

export interface ClientTypingMessage extends BaseMessage {
  type: 'TYPING';
  room: string;
  isTyping: boolean;
}

export interface ClientPingMessage extends BaseMessage {
  type: 'PING';
}

export type ClientMessage =
  | ClientAuthMessage
  | ClientJoinRoomMessage
  | ClientChatMessage
  | ClientTypingMessage
  | ClientPingMessage;

// Server outbound messages
export interface ServerAuthSuccessMessage extends BaseMessage {
  type: 'AUTH_SUCCESS';
  user: {
    id: string;
    username: string;
  };
  token: string;
  availableRooms: string[];
}

export interface ServerChatMessage extends BaseMessage {
  type: 'CHAT_MESSAGE';
  id: string;
  room: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

export interface ServerRoomHistoryMessage extends BaseMessage {
  type: 'ROOM_HISTORY';
  room: string;
  messages: ServerChatMessage[];
}

export interface ServerTypingStatusMessage extends BaseMessage {
  type: 'TYPING_STATUS';
  room: string;
  username: string;
  isTyping: boolean;
}

export interface ServerUserPresenceMessage extends BaseMessage {
  type: 'USER_JOINED' | 'USER_LEFT';
  room: string;
  username: string;
  userCount: number;
}

export interface ServerRoomUsersMessage extends BaseMessage {
  type: 'ROOM_USERS';
  room: string;
  users: string[];
}

export interface ServerErrorMessage extends BaseMessage {
  type: 'ERROR';
  code: string;
  message: string;
}

export interface ServerPongMessage extends BaseMessage {
  type: 'PONG';
}

export type ServerMessage =
  | ServerAuthSuccessMessage
  | ServerChatMessage
  | ServerRoomHistoryMessage
  | ServerTypingStatusMessage
  | ServerUserPresenceMessage
  | ServerRoomUsersMessage
  | ServerErrorMessage
  | ServerPongMessage;
