// Channel-centric types (Channel = tenant unit)

export interface Channel {
  id: string;
  name: string;
  webhubUrl: string;  // WebHub Backend URL
  description?: string;
  status: ChannelStatus;
  secret: string;
  accessToken: string;
  /** Plugin-Channel Realtime: connection mode, 'user' | 'group' (future) */
  mode: string;
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

export interface Attachment {
  url: string;
  size: number;
  mimeType: string;
  filename: string;
}

export interface RichCard {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  actions?: { label: string; value: string }[];
}

export interface Poll {
  question: string;
  options: { id: string; label: string }[];
  multiSelect?: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  direction: 'inbound' | 'outbound';
  messageType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'system' | 'richCard' | 'poll';
  content: string;
  metadata: {
    attachments?: Attachment[];
    streaming?: boolean;
    richCard?: RichCard;
    poll?: Poll;
    [key: string]: unknown;
  };
  senderId?: string;
  senderName?: string;
  targetId?: string;
  replyTo?: string;
  threadId?: string;
  /** Phase 11 T044: role of the message author — visitor (end user), agent (human operator), ai (bot) */
  role?: 'visitor' | 'agent' | 'ai';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';
  createdAt: Date;
}

// P4 Reaction
export interface Reaction {
  id: string;
  messageId: string;
  channelId: string;
  emoji: string;
  userId: string;
  createdAt: Date;
}

// P4 Read Receipt
export interface ReadReceipt {
  messageId: string;
  channelId: string;
  userId: string;
  ts: number;
}

// P4 Directory Entry
export interface DirectoryEntry {
  channelId: string;
  userId: string;
  displayName?: string;
  avatar?: string;
  updatedAt: Date;
}

// P4 WS Broadcast Event union
export type BroadcastEvent =
  | { type: 'message'; data: Message }
  | { type: 'message_updated'; data: Message }
  | { type: 'reaction_added'; data: Reaction }
  | { type: 'reaction_removed'; data: Reaction }
  | { type: 'typing'; data: { channelId: string; username: string; ts: number } }
  | { type: 'read'; data: { messageId: string; userId: string; ts: number } }
  // Plugin-Channel Realtime: plugin connection status event
  | { type: 'channel_status'; channelId: string; status: 'online' | 'reconnecting' | 'offline'; pluginVersion?: string; timestamp: number };

export interface MessageQueueItem {
  id: string;
  channelId: string;
  messageId: string;
  /** Plugin-Channel Realtime: extended to include action/unknown (DB col: message_type) */
  messageType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'action' | 'unknown';
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
