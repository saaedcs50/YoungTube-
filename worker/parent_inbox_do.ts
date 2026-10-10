/** SQLite-backed inbox storage. Isolated from the existing telemetry Durable Object. */
type MessageType = 'bug' | 'suggestion' | 'thanks' | 'question';
type MessageStatus = 'new' | 'read' | 'replied' | 'closed';

interface ParentInboxRow {
  id: string; device_id: string; created_at: string; updated_at: string;
  type: MessageType; body: string; contact: string; app_version: string; platform: string;
  status: MessageStatus; read_at: string | null; reply: string | null; replied_at: string | null;
  admin_note: string; pinned: number; archived: number; closed_at: string | null; archived_at: string | null;
}

interface ParentInboxMessage {
  id: string; deviceId: string; createdAt: string; updatedAt: string; type: MessageType; body: string;
  contact: string; appVersion: string; platform: string; status: MessageStatus; readAt: string | null;
  reply: string | null; repliedAt: string | null; adminNote: string; pinned: boolean; archived: boolean;
  closedAt: string | null; archivedAt: string | null;
}

function toMessage(row: ParentInboxRow): ParentInboxMessage {
  return {
    id: row.id, deviceId: row.device_id, createdAt: row.created_at, updatedAt: row.updated_at,
    type: row.type, body: row.body, contact: row.contact, appVersion: row.app_version,
    platform: row.platform, status: row.status, readAt: row.read_at, reply: row.reply,
    repliedAt: row.replied_at, adminNote: row.admin_note, pinned: row.pinned === 1,
    archived: row.archived === 1, closedAt: row.closed_at, archivedAt: row.archived_at,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function cleanText(value: string): string {
  return value.replace(/\u0000/g, '').replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}
function isType(value: unknown): value is MessageType {
  return value === 'bug' || value === 'suggestion' || value === 'thanks' || value === 'question';
}

export class ParentInboxStore {
  private state: any;
  private ready: Promise<unknown>;

  constructor(state: any, _env?: unknown) {
    this.state = state;
    this.ready = typeof state.blockConcurrencyWhile === 'function'
      ? state.blockConcurrencyWhile(() => this.initialize())
      : Promise.resolve().then(() => this.initialize());
  }

  private initialize(): void {
    const sql = this.state.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS parent_inbox_messages (
      id TEXT PRIMARY KEY, device_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('bug','suggestion','thanks','question')),
      body TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', app_version TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','replied','closed')),
      read_at TEXT, reply TEXT, replied_at TEXT, admin_note TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT, archived_at TEXT
    )`);
    sql.exec('CREATE INDEX IF NOT EXISTS parent_inbox_created_idx ON parent_inbox_messages(created_at DESC)');
    sql.exec('CREATE INDEX IF NOT EXISTS parent_inbox_device_idx ON parent_inbox_messages(device_id, created_at DESC)');
    sql.exec('CREATE INDEX IF NOT EXISTS parent_inbox_status_idx ON parent_inbox_messages(status, archived)');
    sql.exec('CREATE TABLE IF NOT EXISTS parent_inbox_device_rate (device_id TEXT NOT NULL, created_at_ms INTEGER NOT NULL)');
    sql.exec('CREATE INDEX IF NOT EXISTS parent_inbox_device_rate_idx ON parent_inbox_device_rate(device_id, created_at_ms)');
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    try {
      if (method === 'POST' && url.pathname === '/create') {
        const input = await request.json() as Record<string, unknown>;
        return this.createMessage(input);
      }
      if (method === 'GET' && url.pathname === '/device') {
        const deviceId = url.searchParams.get('deviceId') || '';
        const rows = this.state.storage.sql.exec(
          'SELECT * FROM parent_inbox_messages WHERE device_id = ? ORDER BY created_at DESC LIMIT 500', deviceId,
        ).toArray() as ParentInboxRow[];
        return json({ ok: true, messages: rows.map(toMessage) });
      }
      if (method === 'GET' && url.pathname === '/admin') {
        const search = cleanText(url.searchParams.get('search') || '').toLocaleLowerCase().slice(0, 100);
        let rows: ParentInboxRow[];
        if (search) {
          const recent = this.state.storage.sql.exec('SELECT * FROM parent_inbox_messages ORDER BY created_at DESC LIMIT 200').toArray() as ParentInboxRow[];
          rows = recent.filter((row) => row.body.toLocaleLowerCase().includes(search)
            || row.type.toLocaleLowerCase().includes(search)
            || row.contact.toLocaleLowerCase().includes(search));
        } else {
          rows = this.state.storage.sql.exec('SELECT * FROM parent_inbox_messages ORDER BY created_at DESC LIMIT 500').toArray() as ParentInboxRow[];
        }
        const newRow = this.state.storage.sql.exec("SELECT COUNT(*) AS count FROM parent_inbox_messages WHERE status = 'new' AND archived = 0").toArray()[0] as { count: number };
        const totalRow = this.state.storage.sql.exec('SELECT COUNT(*) AS count FROM parent_inbox_messages').toArray()[0] as { count: number };
        return json({ ok: true, messages: rows.map(toMessage), newCount: Number(newRow?.count || 0), retainedCount: Number(totalRow?.count || 0) });
      }
      if (method === 'POST' && url.pathname === '/admin-action') {
        const input = await request.json() as Record<string, unknown>;
        return this.applyAdminAction(input);
      }
      return json({ ok: false, error: 'not_found' }, 404);
    } catch {
      // Do not disclose storage errors or stored message content.
      return json({ ok: false, error: 'inbox_unavailable' }, 500);
    }
  }

  private createMessage(input: Record<string, unknown>): Response {
    const deviceId = typeof input.deviceId === 'string' ? cleanText(input.deviceId) : '';
    const body = typeof input.body === 'string' ? cleanText(input.body) : '';
    const contact = typeof input.contact === 'string' ? cleanText(input.contact) : '';
    const appVersion = typeof input.appVersion === 'string' ? cleanText(input.appVersion) : '';
    const platform = typeof input.platform === 'string' ? cleanText(input.platform) : 'unknown';
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(deviceId) || !isType(input.type) || body.length < 5 || body.length > 1000
      || contact.length > 120 || appVersion.length > 60 || !['android', 'ios', 'web', 'unknown'].includes(platform)) {
      return json({ ok: false, error: 'invalid' }, 400);
    }
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const id = `m_${crypto.randomUUID()}`;
    const sql = this.state.storage.sql;
    const result = this.state.storage.transactionSync(() => {
      sql.exec('DELETE FROM parent_inbox_device_rate WHERE created_at_ms < ?', nowMs - 86_400_000);
      const rate = sql.exec('SELECT COUNT(*) AS count FROM parent_inbox_device_rate WHERE device_id = ? AND created_at_ms >= ?', deviceId, nowMs - 86_400_000).toArray() as Array<{ count: number }>;
      if (Number(rate[0]?.count || 0) >= 5) return { limited: true as const };
      sql.exec('INSERT INTO parent_inbox_device_rate (device_id, created_at_ms) VALUES (?, ?)', deviceId, nowMs);
      sql.exec(`INSERT INTO parent_inbox_messages
        (id, device_id, created_at, updated_at, type, body, contact, app_version, platform, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`, id, deviceId, now, now, input.type as string, body, contact, appVersion, platform);
      sql.exec(`DELETE FROM parent_inbox_messages WHERE id NOT IN
        (SELECT id FROM parent_inbox_messages ORDER BY created_at DESC, rowid DESC LIMIT 500)`);
      const rows = sql.exec('SELECT * FROM parent_inbox_messages WHERE id = ?', id).toArray() as ParentInboxRow[];
      return { limited: false as const, message: toMessage(rows[0]) };
    });
    if (result.limited) return json({ ok: false, error: 'rate_limited' }, 429);
    return json({ ok: true, message: result.message }, 201);
  }

  private applyAdminAction(input: Record<string, unknown>): Response {
    const id = typeof input.id === 'string' ? input.id : '';
    const action = typeof input.action === 'string' ? input.action : '';
    if (!/^m_[A-Za-z0-9_-]{8,80}$/.test(id)) return json({ ok: false, error: 'invalid' }, 400);
    if (!['mark_read', 'reply', 'close', 'reopen', 'pin', 'note', 'archive'].includes(action)) return json({ ok: false, error: 'invalid' }, 400);
    let reply = '';
    let note = '';
    if (action === 'reply') {
      reply = typeof input.reply === 'string' ? cleanText(input.reply) : '';
      if (reply.length < 1 || reply.length > 2000) return json({ ok: false, error: 'invalid' }, 400);
    }
    if (action === 'note') {
      note = typeof input.note === 'string' ? cleanText(input.note) : '';
      if (note.length > 2000) return json({ ok: false, error: 'invalid' }, 400);
    }
    if (action === 'pin' && typeof input.pinned !== 'boolean') return json({ ok: false, error: 'invalid' }, 400);
    if (action === 'archive' && typeof input.archived !== 'boolean') return json({ ok: false, error: 'invalid' }, 400);

    const now = new Date().toISOString();
    const sql = this.state.storage.sql;
    const result = this.state.storage.transactionSync(() => {
      const found = sql.exec('SELECT * FROM parent_inbox_messages WHERE id = ?', id).toArray() as ParentInboxRow[];
      if (!found.length) return { error: 'not_found' as const };
      if (action === 'reply' && found[0].status === 'closed') return { error: 'message_closed' as const };
      switch (action) {
        case 'mark_read':
          sql.exec("UPDATE parent_inbox_messages SET status = CASE WHEN status = 'new' THEN 'read' ELSE status END, read_at = COALESCE(read_at, ?), updated_at = ? WHERE id = ?", now, now, id); break;
        case 'reply':
          sql.exec("UPDATE parent_inbox_messages SET reply = ?, replied_at = ?, status = 'replied', read_at = COALESCE(read_at, ?), updated_at = ? WHERE id = ?", reply, now, now, now, id); break;
        case 'close':
          sql.exec("UPDATE parent_inbox_messages SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?", now, now, id); break;
        case 'reopen':
          sql.exec("UPDATE parent_inbox_messages SET status = CASE WHEN status = 'closed' THEN 'read' ELSE status END, closed_at = NULL, updated_at = ? WHERE id = ?", now, id); break;
        case 'pin':
          sql.exec('UPDATE parent_inbox_messages SET pinned = ?, updated_at = ? WHERE id = ?', input.pinned ? 1 : 0, now, id); break;
        case 'note':
          sql.exec('UPDATE parent_inbox_messages SET admin_note = ?, updated_at = ? WHERE id = ?', note, now, id); break;
        case 'archive':
          sql.exec('UPDATE parent_inbox_messages SET archived = ?, archived_at = ?, updated_at = ? WHERE id = ?', input.archived ? 1 : 0, input.archived ? now : null, now, id); break;
      }
      const updated = sql.exec('SELECT * FROM parent_inbox_messages WHERE id = ?', id).toArray() as ParentInboxRow[];
      return { message: toMessage(updated[0]) };
    });
    if ('error' in result) {
      if (result.error === 'not_found') return json({ ok: false, error: 'not_found' }, 404);
      return json({ ok: false, error: 'message_closed' }, 409);
    }
    return json({ ok: true, message: result.message });
  }
}
