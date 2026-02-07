// Multi-tenant types with tenant scoping

export interface Tenant {
  id: string;
  name: string;
  domain?: string;
  plan: 'free' | 'pro' | 'enterprise';
  maxChannels: number;
  maxMessagesPerDay: number;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  tenantId: string;
  username: string;
  email?: string;
  passwordHash?: string;
  role: 'admin' | 'user' | 'readonly';
  permissions: string[];
  metadata: Record<string, unknown>;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions: string[];
  lastUsed?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface Channel {
  id: string;
  tenantId: string;
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
  tenantId: string;
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
  tenantId: string;
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
  tenantId: string;
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
  tenantId: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

// Request context with tenant info
export interface RequestContext {
  tenantId: string;
  userId?: string;
  apiKeyId?: string;
  ipAddress?: string;
  userAgent?: string;
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
