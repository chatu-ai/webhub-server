// Channel-centric types (Channel = tenant unit)

export interface Channel {
  id: string;
  name: string;
  serverUrl: string;
  description?: string;
  status: ChannelStatus;
  secret: string;
  accessToken: string;
  config: Record<string, unknown>;
  metrics: ChannelMetrics;
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

export interface ChannelMetrics {
  totalMessages: number;
  messagesToday: number;
  lastMessageAt?: Date;
  connections: number;
}

export interface Message {
  id: string;
  channelId: string;
  direction: 'inbound' | 'outbound';
  messageType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'system';
  content: string;
  metadata: Record<string, unknown>;
  senderId?: string;
  senderName?: string;
  targetId?: string;
  replyTo?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: Date;
}

export interface MessageQueueItem {
  id: string;
  channelId: string;
  messageId: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'file';
  content: string;
  priority: number;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'expired';
  scheduledAt?: Date;
  processedAt?: Date;
  error?: string;
  createdAt: Date;
}

export interface WebSocketConnection {
  id: string;
  channelId: string;
  connectionId: string;
  remoteAddr?: string;
  userAgent?: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt: Date;
  disconnectedAt?: Date;
  metadata: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  channelId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
