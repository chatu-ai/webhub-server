import { Channel, ChannelStatus } from '../types';

export interface ChannelStore {
  create(channel: Omit<Channel, 'id' | 'createdAt' | 'updatedAt'>): Promise<Channel>;
  getById(id: string): Promise<Channel | null>;
  getBySecret(secret: string): Promise<Channel | null>;
  getByAccessToken(token: string): Promise<Channel | null>;
  updateStatus(id: string, status: ChannelStatus): Promise<Channel | null>;
  updateLastHeartbeat(id: string): Promise<Channel | null>;
  delete(id: string): Promise<boolean>;
  list(): Promise<Channel[]>;
}

export class InMemoryChannelStore implements ChannelStore {
  private channels: Map<string, Channel> = new Map();
  private secretIndex: Map<string, string> = new Map(); // secret -> channelId
  private tokenIndex: Map<string, string> = new Map(); // accessToken -> channelId

  async create(channel: Omit<Channel, 'id' | 'createdAt' | 'updatedAt'>): Promise<Channel> {
    const now = new Date();
    const fullChannel: Channel = {
      ...channel,
      id: `wh_ch_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };

    this.channels.set(fullChannel.id, fullChannel);
    this.secretIndex.set(fullChannel.secret, fullChannel.id);
    this.tokenIndex.set(fullChannel.accessToken, fullChannel.id);

    return fullChannel;
  }

  async getById(id: string): Promise<Channel | null> {
    return this.channels.get(id) || null;
  }

  async getBySecret(secret: string): Promise<Channel | null> {
    const channelId = this.secretIndex.get(secret);
    if (!channelId) return null;
    return this.channels.get(channelId) || null;
  }

  async getByAccessToken(token: string): Promise<Channel | null> {
    const channelId = this.tokenIndex.get(token);
    if (!channelId) return null;
    return this.channels.get(channelId) || null;
  }

  async updateStatus(id: string, status: ChannelStatus): Promise<Channel | null> {
    const channel = this.channels.get(id);
    if (!channel) return null;

    channel.status = status;
    channel.updatedAt = new Date();
    this.channels.set(id, channel);
    return channel;
  }

  async updateLastHeartbeat(id: string): Promise<Channel | null> {
    const channel = this.channels.get(id);
    if (!channel) return null;

    channel.lastHeartbeat = new Date();
    channel.updatedAt = new Date();
    this.channels.set(id, channel);
    return channel;
  }

  async delete(id: string): Promise<boolean> {
    const channel = this.channels.get(id);
    if (!channel) return false;

    this.channels.delete(id);
    this.secretIndex.delete(channel.secret);
    this.tokenIndex.delete(channel.accessToken);
    return true;
  }

  async list(): Promise<Channel[]> {
    return Array.from(this.channels.values());
  }
}
