import { WebSocketManager } from '../ws/websocketManager';
import { MessageQueue } from '../router/messageRouter';
import WebSocket from 'ws';

describe('WebSocketManager', () => {
  let manager: WebSocketManager;
  let messageQueue: MessageQueue;
  let mockWs: jest.Mocked<WebSocket>;

  beforeEach(() => {
    messageQueue = new MessageQueue();
    manager = new WebSocketManager(messageQueue);
    mockWs = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<WebSocket>;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('addConnection', () => {
    it('should add a connection', () => {
      manager.addConnection('channel_1', mockWs);

      const state = manager.getConnection('channel_1');
      expect(state).toBeDefined();
      expect(state!.channelId).toBe('channel_1');
      expect(state!.ws).toBe(mockWs);
    });

    it('should set status to connecting initially', () => {
      manager.addConnection('channel_1', mockWs);

      const state = manager.getConnection('channel_1');
      expect(state!.status).toBe('connecting');
    });
  });

  describe('removeConnection', () => {
    it('should remove a connection', () => {
      manager.addConnection('channel_1', mockWs);
      manager.removeConnection('channel_1');

      expect(manager.getConnection('channel_1')).toBeUndefined();
    });
  });

  describe('isConnected', () => {
    it('should return true for connected status', () => {
      manager.addConnection('channel_1', mockWs);

      // Simulate open event by updating status
      const state = manager.getConnection('channel_1');
      if (state) state.status = 'connected';

      expect(manager.isConnected('channel_1')).toBe(true);
    });

    it('should return false for disconnected status', () => {
      manager.addConnection('channel_1', mockWs);

      const state = manager.getConnection('channel_1');
      if (state) state.status = 'disconnected';

      expect(manager.isConnected('channel_1')).toBe(false);
    });

    it('should return false for non-existent channel', () => {
      expect(manager.isConnected('non_existent')).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      manager.addConnection('channel_1', mockWs);

      const status = manager.getStatus('channel_1');
      expect(status).toBe('connecting');
    });
  });

  describe('getLastHeartbeat', () => {
    it('should return last heartbeat timestamp', () => {
      manager.addConnection('channel_1', mockWs);

      const lastHeartbeat = manager.getLastHeartbeat('channel_1');
      expect(lastHeartbeat).toBeDefined();
      expect(typeof lastHeartbeat).toBe('number');
    });

    it('should return undefined for non-existent channel', () => {
      expect(manager.getLastHeartbeat('non_existent')).toBeUndefined();
    });
  });

  describe('getAllConnections', () => {
    it('should return all connections', () => {
      const mockWs2 = { readyState: WebSocket.OPEN, send: jest.fn(), on: jest.fn(), close: jest.fn() } as unknown as jest.Mocked<WebSocket>;

      manager.addConnection('channel_1', mockWs);
      manager.addConnection('channel_2', mockWs2);

      const connections = manager.getAllConnections();
      expect(connections.size).toBe(2);
    });
  });
});
