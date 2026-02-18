import { MessageQueue } from '../router/messageRouter';
import { OutboundMessage } from '../types';

describe('MessageQueue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    jest.useFakeTimers();
    queue = new MessageQueue();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('add', () => {
    it('should add a message to the queue', () => {
      const message: OutboundMessage = {
        messageId: 'msg_123',
        target: { type: 'user', id: 'user_1' },
        content: { text: 'Hello' },
      };

      queue.add(message);
      const pending = queue.getPending();

      expect(pending.has('msg_123')).toBe(true);
      expect(pending.get('msg_123')!.message).toBe(message);
      expect(pending.get('msg_123')!.retryCount).toBe(0);
    });
  });

  describe('remove', () => {
    it('should remove a message from the queue', () => {
      const message: OutboundMessage = {
        messageId: 'msg_123',
        target: { type: 'user', id: 'user_1' },
        content: { text: 'Hello' },
      };

      queue.add(message);
      queue.remove('msg_123');

      expect(queue.getPending().has('msg_123')).toBe(false);
    });

    it('should handle removing non-existent message', () => {
      expect(() => queue.remove('non_existent')).not.toThrow();
    });
  });

  describe('getExpired', () => {
    it('should return expired messages', () => {
      const message: OutboundMessage = {
        messageId: 'msg_123',
        target: { type: 'user', id: 'user_1' },
        content: { text: 'Hello' },
      };

      queue.add(message);
      // Advance time beyond the TIMEOUT (30000ms)
      jest.advanceTimersByTime(31000);
      const expired = queue.getExpired();

      expect(expired).toContain('msg_123');
    });

    it('should not return messages within timeout', () => {
      const message: OutboundMessage = {
        messageId: 'msg_123',
        target: { type: 'user', id: 'user_1' },
        content: { text: 'Hello' },
      };

      queue.add(message);
      // Advance time by less than timeout
      jest.advanceTimersByTime(20000);

      const expired = queue.getExpired();

      expect(expired).not.toContain('msg_123');
    });
  });

  describe('incrementRetry', () => {
    it('should increment retry count', () => {
      const message: OutboundMessage = {
        messageId: 'msg_123',
        target: { type: 'user', id: 'user_1' },
        content: { text: 'Hello' },
      };

      queue.add(message);
      const canContinue = queue.incrementRetry('msg_123');

      expect(canContinue).toBe(true);
      expect(queue.getPending().get('msg_123')!.retryCount).toBe(1);
    });

    it('should return false when max retries exceeded', () => {
      const message: OutboundMessage = {
        messageId: 'msg_123',
        target: { type: 'user', id: 'user_1' },
        content: { text: 'Hello' },
      };

      queue.add(message);

      for (let i = 0; i < 3; i++) {
        queue.incrementRetry('msg_123');
      }

      const canContinue = queue.incrementRetry('msg_123');

      expect(canContinue).toBe(false);
    });

    it('should return false for non-existent message', () => {
      const result = queue.incrementRetry('non_existent');
      expect(result).toBe(false);
    });
  });
});
