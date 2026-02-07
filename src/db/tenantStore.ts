import { v4 as uuidv4 } from 'uuid';
import db from './schema.js';
import { Tenant } from './types.js';

export class TenantStore {
  create(data: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Tenant {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO tenants (id, name, domain, plan, max_channels, max_messages_per_day, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.name,
      data.domain || null,
      data.plan,
      data.maxChannels,
      data.maxMessagesPerDay,
      JSON.stringify(data.settings),
      now,
      now
    );

    return this.getById(id)!;
  }

  getById(id: string): Tenant | null {
    const stmt = db.prepare('SELECT * FROM tenants WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  getByDomain(domain: string): Tenant | null {
    const stmt = db.prepare('SELECT * FROM tenants WHERE domain = ?');
    const row = stmt.get(domain) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  update(id: string, data: Partial<Tenant>): Tenant | null {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.domain !== undefined) {
      updates.push('domain = ?');
      values.push(data.domain);
    }
    if (data.plan !== undefined) {
      updates.push('plan = ?');
      values.push(data.plan);
    }
    if (data.maxChannels !== undefined) {
      updates.push('max_channels = ?');
      values.push(data.maxChannels);
    }
    if (data.maxMessagesPerDay !== undefined) {
      updates.push('max_messages_per_day = ?');
      values.push(data.maxMessagesPerDay);
    }
    if (data.settings !== undefined) {
      updates.push('settings = ?');
      values.push(JSON.stringify(data.settings));
    }

    if (updates.length === 0) return this.getById(id);

    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = db.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getById(id);
  }

  delete(id: string): boolean {
    const stmt = db.prepare('DELETE FROM tenants WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  list(limit = 100, offset = 0): Tenant[] {
    const stmt = db.prepare('SELECT * FROM tenants ORDER BY created_at DESC LIMIT ? OFFSET ?');
    const rows = stmt.all(limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>): Tenant {
    return {
      id: row.id as string,
      name: row.name as string,
      domain: row.domain as string | undefined,
      plan: row.plan as 'free' | 'pro' | 'enterprise',
      maxChannels: row.max_channels as number,
      maxMessagesPerDay: row.max_messages_per_day as number,
      settings: JSON.parse((row.settings as string) || '{}'),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

export const tenantStore = new TenantStore();
