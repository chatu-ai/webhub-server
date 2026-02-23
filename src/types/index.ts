// Plugin-Channel Realtime: MessageType union
export type MessageType = 'text' | 'image' | 'file' | 'action' | 'unknown';

// Plugin-Channel Realtime: ConnectionStatusEvent pushed to frontend WS
export interface ConnectionStatusEvent {
  type: 'channel_status';
  channelId: string;
  status: 'online' | 'reconnecting' | 'offline';
  pluginVersion?: string;
  timestamp: number;
}

// Plugin-Channel Realtime: plugin connection status
export type PluginConnectionStatus = 'online' | 'reconnecting' | 'offline';

// Channel Types
export interface Channel {
  id: string;
  name: string;
  status: ChannelStatus;
  serverUrl: string;
  secret: string;
  accessToken: string;
  description?: string;
  mode?: string;
  createdAt: Date;
  updatedAt: Date;
  lastHeartbeat?: Date;
}

export type ChannelStatus = 
  | 'pending'     // 待注册
  | 'registered'  // 已注册，待连接
  | 'connected'   // 已连接
  | 'disconnected' // 断开连接
  | 'disabled';   // 已禁用

// Message Types
export interface InboundMessage {
  id: string;
  channelId: string;
  timestamp: number;
  sender: {
    id: string;
    name?: string;
    avatar?: string;
  };
  content: {
    text: string;
    format?: 'plain' | 'markdown' | 'html';
  };
  media?: Media[];
  replyTo?: {
    messageId: string;
    text?: string;
  };
}

export interface OutboundMessage {
  messageId: string;
  target: {
    type: 'user' | 'group';
    id: string;
    name?: string;
  };
  content: {
    text: string;
    format?: 'plain' | 'markdown' | 'html';
  };
  media?: Media[];
  replyTo?: string;
}

export interface Media {
  type: 'image' | 'audio' | 'video' | 'file';
  url: string;
  mimeType?: string;
  size?: number;
}

// WebSocket Frame Types
export interface WebSocketFrame {
  type: 'message' | 'heartbeat' | 'ack' | 'error' | 'open' | 'close';
  channelId: string;
  timestamp: number;
  payload?: unknown;
}

export interface HeartbeatPayload {
  status: ConnectionStatus;
  nextHeartbeat?: number;
}

export type ConnectionStatus = 
  | 'connecting'
  | 'connected'
  | 'heartbeat_ok'
  | 'heartbeat_fail'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

// API Request/Response Types
export interface ApplyChannelRequest {
  serverName: string;
  serverUrl: string;
  description?: string;
}

export interface ApplyChannelResponse {
  success: boolean;
  data?: {
    channelId: string;
    channelName: string;
    registerCommand: string;
    secret: string;
    createdAt: string;
  };
  error?: string;
}

export interface ChannelStatusResponse {
  success: boolean;
  data?: {
    channelId: string;
    status: ChannelStatus;
    lastHeartbeat?: string;
    nextHeartbeat?: string;
  };
  error?: string;
}

export interface SendMessageRequest {
  messageId: string;
  target: {
    type: 'user' | 'group';
    id: string;
  };
  content: {
    text: string;
    format?: 'plain' | 'markdown' | 'html';
  };
  replyTo?: string;
}

export interface SendMessageResponse {
  success: boolean;
  data?: {
    messageId: string;
    deliveredAt: string;
  };
  error?: string;
}

// WebSocket Client Messages
export interface WSClientMessage {
  type: 'message';
  channelId: string;
  message: OutboundMessage;
}

// WebSocket Server Messages
export interface WSMessage {
  type: 'message';
  channelId: string;
  message: InboundMessage;
}

// Error Response
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}
