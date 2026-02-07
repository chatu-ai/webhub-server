import { InMemoryChannelStore } from '../store/channelStore';
import { Channel, ChannelStatus } from '../types';

describe('InMemoryChannelStore', () => {
  let store: InMemoryChannelStore;

  beforeEach(() => {
    store = new InMemoryChannelStore();
  });

  describe('create', () => {
    it('should create a new channel', async () => {
      const channelData = {
        name: 'Test Channel',
        serverUrl: 'https://test.example.com',
        description: 'Test description',
        status: 'pending' as ChannelStatus,
        secret: 'wh_secret_123',
        accessToken: 'wh_token_123',
      };

      const channel = await store.create(channelData);

      expect(channel).toBeDefined();
      expect(channel.id).toMatch(/^wh_ch_/);
      expect(channel.name).toBe(channelData.name);
      expect(channel.serverUrl).toBe(channelData.serverUrl);
      expect(channel.status).toBe('pending');
      expect(channel.secret).toBe(channelData.secret);
      expect(channel.accessToken).toBe(channelData.accessToken);
      expect(channel.createdAt).toBeInstanceOf(Date);
      expect(channel.updatedAt).toBeInstanceOf(Date);
    });

    it('should generate unique channel IDs', async () => {
      const channelData = {
        name: 'Test',
        serverUrl: 'https://test.com',
        status: 'pending' as ChannelStatus,
        secret: 'secret',
        accessToken: 'token',
      };

      const channel1 = await store.create(channelData);
      const channel2 = await store.create(channelData);

      expect(channel1.id).not.toBe(channel2.id);
    });
  });

  describe('getById', () => {
    it('should return channel by ID', async () => {
      const channelData = {
        name: 'Test Channel',
        serverUrl: 'https://test.example.com',
        status: 'pending' as ChannelStatus,
        secret: 'wh_secret_123',
        accessToken: 'wh_token_123',
      };

      const created = await store.create(channelData);
      const retrieved = await store.getById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe(channelData.name);
    });

    it('should return null for non-existent ID', async () => {
      const result = await store.getById('non_existent_id');
      expect(result).toBeNull();
    });
  });

  describe('getBySecret', () => {
    it('should return channel by secret', async () => {
      const channelData = {
        name: 'Test Channel',
        serverUrl: 'https://test.example.com',
        status: 'pending' as ChannelStatus,
        secret: 'wh_unique_secret',
        accessToken: 'wh_token_123',
      };

      const created = await store.create(channelData);
      const retrieved = await store.getBySecret('wh_unique_secret');

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return null for non-existent secret', async () => {
      const result = await store.getBySecret('non_existent_secret');
      expect(result).toBeNull();
    });
  });

  describe('getByAccessToken', () => {
    it('should return channel by access token', async () => {
      const channelData = {
        name: 'Test Channel',
        serverUrl: 'https://test.example.com',
        status: 'pending' as ChannelStatus,
        secret: 'wh_secret_123',
        accessToken: 'wh_unique_token',
      };

      const created = await store.create(channelData);
      const retrieved = await store.getByAccessToken('wh_unique_token');

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return null for non-existent token', async () => {
      const result = await store.getByAccessToken('non_existent_token');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update channel status', async () => {
      const channel = await store.create({
        name: 'Test',
        serverUrl: 'https://test.com',
        status: 'pending',
        secret: 'secret',
        accessToken: 'token',
      });

      const updated = await store.updateStatus(channel.id, 'connected');

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('connected');
    });

    it('should return null for non-existent channel', async () => {
      const result = await store.updateStatus('non_existent', 'connected');
      expect(result).toBeNull();
    });
  });

  describe('updateLastHeartbeat', () => {
    it('should update lastHeartbeat timestamp', async () => {
      const channel = await store.create({
        name: 'Test',
        serverUrl: 'https://test.com',
        status: 'connected',
        secret: 'secret',
        accessToken: 'token',
      });

      const now = new Date();
      const updated = await store.updateLastHeartbeat(channel.id);

      expect(updated).toBeDefined();
      expect(updated!.lastHeartbeat).toBeDefined();
      expect(updated!.lastHeartbeat!.getTime()).toBeGreaterThanOrEqual(now.getTime());
    });
  });

  describe('delete', () => {
    it('should delete existing channel', async () => {
      const channel = await store.create({
        name: 'Test',
        serverUrl: 'https://test.com',
        status: 'pending',
        secret: 'secret',
        accessToken: 'token',
      });

      const result = await store.delete(channel.id);

      expect(result).toBe(true);
      expect(await store.getById(channel.id)).toBeNull();
    });

    it('should return false for non-existent channel', async () => {
      const result = await store.delete('non_existent');
      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    it('should return all channels', async () => {
      await store.create({
        name: 'Channel 1',
        serverUrl: 'https://test1.com',
        status: 'pending',
        secret: 'secret1',
        accessToken: 'token1',
      });

      await store.create({
        name: 'Channel 2',
        serverUrl: 'https://test2.com',
        status: 'connected',
        secret: 'secret2',
        accessToken: 'token2',
      });

      const channels = await store.list();

      expect(channels).toHaveLength(2);
      expect(channels[0].name).toBe('Channel 1');
      expect(channels[1].name).toBe('Channel 2');
    });

    it('should return empty array when no channels exist', async () => {
      const channels = await store.list();
      expect(channels).toHaveLength(0);
    });
  });
});
