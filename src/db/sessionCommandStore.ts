/**
 * T004 display-sender-session: Session command store.
 * Persists async commands (reset / switch) from frontend to be polled and
 * executed by the OpenClaw plugin.
 */
import { v4 as uuidv4 } from 'uuid';
import db from './schema';
import type { SessionCommand, SessionCommandStatus, SessionCommandType } from '../types';

// Row shape returned from sql.js
interface SessionCommandRow {
  id: string;
  channel_id: string;
  sender_id: string;
  command_type: string;
  payload: string | null;
  status: string;
  error: string | null;
  created_at: number;
  acked_at: number | null;
}

function mapRow(row: SessionCommandRow): SessionCommand {
  return {
    id: row.id,
    channelId: row.channel_id,
    senderId: row.sender_id,
    commandType: row.command_type as SessionCommandType,
    payload: row.payload ? JSON.parse(row.payload) : null,
    status: row.status as SessionCommandStatus,
    error: row.error ?? null,
    createdAt: row.created_at,
    ackedAt: row.acked_at ?? null,
  };
}

export const sessionCommandStore = {
  /**
   * Enqueue a new command for a channel/sender.
   * Returns the created command.
   */
  enqueue(
    channelId: string,
    senderId: string,
    commandType: SessionCommandType,
    payload?: SessionCommand['payload'],
  ): SessionCommand {
    const id = uuidv4();
    const now = Date.now();
    db.prepare(`
      INSERT INTO session_commands
        (id, channel_id, sender_id, command_type, payload, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, channelId, senderId, commandType, payload ? JSON.stringify(payload) : null, now);

    return this.getById(id)!;
  },

  /** Fetch a command by id. */
  getById(id: string): SessionCommand | null {
    const row = db.prepare('SELECT * FROM session_commands WHERE id = ?').get(id) as SessionCommandRow | undefined;
    return row ? mapRow(row) : null;
  },

  /**
   * Return pending commands for a channel, ordered oldest-first.
   * The plugin calls this to discover work.
   */
  getPending(channelId: string, limit = 50): SessionCommand[] {
    const rows = db.prepare(`
      SELECT * FROM session_commands
      WHERE channel_id = ? AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(channelId, limit) as unknown as SessionCommandRow[];
    return rows.map(mapRow);
  },

  /**
   * Acknowledge (complete or fail) a command once the plugin has acted on it.
   */
  ack(id: string, success: boolean, error?: string): void {
    const status: SessionCommandStatus = success ? 'done' : 'failed';
    const now = Date.now();
    db.prepare(`
      UPDATE session_commands
      SET status = ?, error = ?, acked_at = ?
      WHERE id = ?
    `).run(status, error ?? null, now, id);
  },

  /**
   * Returns true if there is at least one pending command for this
   * channel + sender combo (prevents duplicate queuing by the frontend).
   */
  hasPending(channelId: string, senderId: string): boolean {
    const row = db.prepare(`
      SELECT id FROM session_commands
      WHERE channel_id = ? AND sender_id = ? AND status = 'pending'
      LIMIT 1
    `).get(channelId, senderId) as { id: string } | undefined;
    return !!row;
  },

  /** List all commands for a channel (for debugging / admin). */
  listByChannel(channelId: string): SessionCommand[] {
    const rows = db.prepare(`
      SELECT * FROM session_commands WHERE channel_id = ? ORDER BY created_at DESC
    `).all(channelId) as unknown as SessionCommandRow[];
    return rows.map(mapRow);
  },
};
