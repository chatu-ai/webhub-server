import { WebSocketMessageRouter } from '../router/messageRouter';
import { InboundMessage, OutboundMessage, Channel } from '../types';

describe('WebSocketMessageRouter', () => {
  let router: WebSocketMessageRouter;
  let mockWs: jest.Mocked<WebSocket>;
  let mockHandler: jest.Mock;

  beforeEach(() => {
    router = new WebSocketMessageRouter();
    mockWs = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
    } as unknown as jest.Mocked<WebSocket>;
    mockHandler = jest.fn();
    router.registerOutboundHandler(mockHandler);
  });

  describe('registerConnection', () => {
    it('should register a WebSocket connection', () => {
      router.registerConnection('channel_1', mockWs);
      // Just verify no error is thrown
    });

    it('should allow multiple connections per channel', () => {
      const mockWs2 = { readyState: WebSocket.OPEN, send: jest.fn() } as unknown as jest.Mocked<WebSocket>;

      router.registerConnection('channel_1', mockWs);
      router.registerConnection('channel_1', mockWs2);
      // Both should be registered without error
    });
  });

  describe('unregisterConnection', () => {
    it('should remove a WebSocket connection', () => {
      router.registerConnection('channel_1', mockWs);
      router.unregisterConnection('channel_1', mockWs);
      // Just verify no error is thrown
    });
  });

  describe('routeInbound', () => {
    it('should send message to registered connections', async () => {
      router.registerConnection('channel_1', mockWs);

      const message: InboundMessage = {
        id: 'msg_123',
        channelId: 'channel_1',
        timestamp: Date.now(),
        sender: { id: 'user_1', name: 'Test User' },
        content: { text: 'Hello' },
      };

      await router.routeInbound(message);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"message"')
      );
    });

    it('should not send to closed connections', async () => {
      const closedWs = {
        readyState: WebSocket.CLOSED,
        send: jest.fn(),
      } as unknown as jest.Mocked<WebSocket>;

      router.registerConnection('channel_1', closedWs);

      const message: InboundMessage = {
        id: 'msg_123',
        channelId: 'channel_1',
        timestamp: Date.now(),
        sender: { id: 'user_1' },
        content: { text: 'Hello' },
      };

      await router.routeInbound(message);

      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('should not send to closing connections', async () => {
      const closingWs = {
        readyState: WebSocket.CLOSING,
        send: jest.fn(),
      } as unknown as jest.Mocked<WebSocket>;

      router.registerConnection('channel_1', closingWs);

      const message: InboundMessage = {
        id: 'msg_123',
        channelId: 'channel_1',
        timestamp: Date.now(),
        sender: { id: 'user_1' },
        content: { text: 'Hello' },
      };

      await router.routeInbound(message);

      expect(closingWs.send).not.toHaveBeenCalled();
    });
  });

  describe('routeOutbound', () => {
    it('should call registered handlers', async () => {
      const channel: Channel = {
        id: 'channel_1',
        name: 'Test',
        serverUrl: 'https://test.com',
        status: 'connected',
        secret: 'secret',
        accessToken: 'token',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const message: OutboundMessage = {
        messageId: 'msg_123',
        target: { type: 'user', id: 'user_1' },
        content: { text: 'Hello' },
      };

      await router.routeOutbound(message, channel);

      expect(mockHandler).toHaveBeenCalledWith(message, channel);
    });

    it('should continue calling other handlers if one fails', async () => {
      const channel: Channel = {
        id: 'channel_1',
        name: 'Test',
        serverUrl: 'https://test.com',
        status: 'connected',
        secret: 'secret',
        accessToken: 'token',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const failingHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const successHandler = jest.fn();
      router.registerOutboundHandler(failingHandler);
      router.registerOutboundHandler(successHandler);

      const message: OutboundMessage = {
        messageId: 'msg_123',
        target: { type: 'user', id: 'user_1' },
        content: { text: 'Hello' },
      };

      await router.routeOutbound(message, channel);

      expect(failingHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });
});
