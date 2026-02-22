/**
 * T016: Unit tests for MessageStore.listPendingUserMessages and MessageStore.markProcessed
 */
import { MessageStore } from './messageStore';
import { initDatabase, getDb } from './schema';

let store: MessageStore;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  // Clear messages table before each test for isolation
  getDb().run('DELETE FROM messages');
  store = new MessageStore();
});

describe('MessageStore.listPendingUserMessages', () => {
  it('returns outbound sent/pending messages for a channel', () => {
    const now = new Date();
    const mkTime = (offset: number) => new Date(now.getTime() + offset).toISOString();

    // Insert test messages via create
    store.create({ channelId: 'ch1', direction: 'outbound', messageType: 'text', content: 'hello 1', metadata: {}, status: 'sent' });
    store.create({ channelId: 'ch1', direction: 'outbound', messageType: 'text', content: 'hello 2', metadata: {}, status: 'pending' });
    // Inbound message — should NOT appear
    store.create({ channelId: 'ch1', direction: 'inbound', messageType: 'text', content: 'ai reply', metadata: {}, status: 'sent' });
    // Delivered message — should NOT appear
    const delivered = store.create({ channelId: 'ch1', direction: 'outbound', messageType: 'text', content: 'done', metadata: {}, status: 'delivered' });

    const results = store.listPendingUserMessages('ch1', null, 20);

    expect(results).toHaveLength(2);
    expect(results.every(m => m.direction === 'outbound')).toBe(true);
    expect(results.every(m => ['sent', 'pending'].includes(m.status))).toBe(true);
    expect(results.find(m => m.id === delivered.id)).toBeUndefined();
  });

  it('returns empty array when no pending messages', () => {
    const results = store.listPendingUserMessages('empty_channel', null, 20);
    expect(results).toHaveLength(0);
  });

  it('respects the after cursor (ISO timestamp)', async () => {
    const m1 = store.create({ channelId: 'ch2', direction: 'outbound', messageType: 'text', content: 'first', metadata: {}, status: 'sent' });

    // Wait a millisecond so the next message has a later timestamp
    await new Promise(r => setTimeout(r, 5));

    const m2 = store.create({ channelId: 'ch2', direction: 'outbound', messageType: 'text', content: 'second', metadata: {}, status: 'sent' });

    // After cursor = m1.createdAt — should only return m2
    const cursor = m1.createdAt.toISOString();
    const results = store.listPendingUserMessages('ch2', cursor, 20);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(m2.id);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      store.create({ channelId: 'ch3', direction: 'outbound', messageType: 'text', content: `msg ${i}`, metadata: {}, status: 'sent' });
    }

    const results = store.listPendingUserMessages('ch3', null, 3);
    expect(results).toHaveLength(3);
  });

  it('only returns messages for the specified channelId', () => {
    store.create({ channelId: 'ch4', direction: 'outbound', messageType: 'text', content: 'ch4 msg', metadata: {}, status: 'sent' });
    store.create({ channelId: 'ch5', direction: 'outbound', messageType: 'text', content: 'ch5 msg', metadata: {}, status: 'sent' });

    const results = store.listPendingUserMessages('ch4', null, 20);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('ch4 msg');
  });
});

describe('MessageStore.markProcessed', () => {
  it('sets status to delivered', () => {
    const msg = store.create({ channelId: 'ch6', direction: 'outbound', messageType: 'text', content: 'test', metadata: {}, status: 'sent' });

    store.markProcessed(msg.id);
    const updated = store.getById(msg.id);

    expect(updated?.status).toBe('delivered');
  });

  it('is idempotent — calling twice does not throw', () => {
    const msg = store.create({ channelId: 'ch7', direction: 'outbound', messageType: 'text', content: 'test', metadata: {}, status: 'sent' });

    store.markProcessed(msg.id);
    expect(() => store.markProcessed(msg.id)).not.toThrow();

    const updated = store.getById(msg.id);
    expect(updated?.status).toBe('delivered');
  });

  it('does not affect already-delivered messages', () => {
    const msg = store.create({ channelId: 'ch8', direction: 'outbound', messageType: 'text', content: 'test', metadata: {}, status: 'delivered' });

    store.markProcessed(msg.id);
    const updated = store.getById(msg.id);

    expect(updated?.status).toBe('delivered');
  });

  it('does not affect messages from other channels', () => {
    const msg1 = store.create({ channelId: 'ch9a', direction: 'outbound', messageType: 'text', content: 'msg1', metadata: {}, status: 'sent' });
    const msg2 = store.create({ channelId: 'ch9b', direction: 'outbound', messageType: 'text', content: 'msg2', metadata: {}, status: 'sent' });

    store.markProcessed(msg1.id);

    const updated1 = store.getById(msg1.id);
    const updated2 = store.getById(msg2.id);

    expect(updated1?.status).toBe('delivered');
    expect(updated2?.status).toBe('sent');
  });
});

/** T006: thread_id column exists and listByChannel does not throw */
describe('MessageStore.listByChannel — thread_id column (BUG-04 fix)', () => {
  it('listByChannel returns messages without SQL error after thread_id migration', () => {
    store.create({ channelId: 'ch_thread', direction: 'inbound', messageType: 'text', content: 'hello', metadata: {}, status: 'pending' });
    expect(() => store.listByChannel('ch_thread', 20, undefined)).not.toThrow();
  });

  it('listByChannel returns correct messages for channel', () => {
    store.create({ channelId: 'ch_thr2', direction: 'inbound', messageType: 'text', content: 'msg1', metadata: {}, status: 'pending' });
    store.create({ channelId: 'ch_thr2', direction: 'outbound', messageType: 'text', content: 'msg2', metadata: {}, status: 'pending' });
    store.create({ channelId: 'ch_other', direction: 'inbound', messageType: 'text', content: 'other', metadata: {}, status: 'pending' });

    const results = store.listByChannel('ch_thr2', 20, undefined);
    expect(results.length).toBe(2);
    expect(results.every((m) => m.channelId === 'ch_thr2')).toBe(true);
  });
});
