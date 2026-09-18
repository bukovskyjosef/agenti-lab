import { DatabaseSync } from "node:sqlite";

export class OperationalStore {
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (
        delivery_id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        repository TEXT,
        payload_json TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        lease_owner TEXT,
        lease_until INTEGER,
        last_error_class TEXT
      );
      CREATE INDEX IF NOT EXISTS deliveries_due ON deliveries(status, next_attempt_at);
      CREATE TABLE IF NOT EXISTS effects (
        effect_key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        last_error_class TEXT
      );
      CREATE TABLE IF NOT EXISTS work_leases (
        work_key TEXT PRIMARY KEY,
        lease_owner TEXT NOT NULL,
        lease_until INTEGER NOT NULL
      );
    `);
  }

  close() { this.db.close(); }

  enqueue({ deliveryId, eventName, repository = null, payload, now = Date.now() }) {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO deliveries
      (delivery_id,event_name,repository,payload_json,received_at,status,attempt_count,next_attempt_at)
      VALUES (?,?,?,?,?,'pending',0,?)
    `).run(deliveryId, eventName, repository, JSON.stringify(payload), now, now);
    return { inserted: result.changes === 1 };
  }

  claimNext({ owner, leaseMs, now = Date.now() }) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare(`
        SELECT * FROM deliveries
        WHERE status IN ('pending','retry')
          AND next_attempt_at <= ?
          AND (lease_until IS NULL OR lease_until < ?)
        ORDER BY received_at ASC, delivery_id ASC
        LIMIT 1
      `).get(now, now);
      if (!row) {
        this.db.exec("COMMIT");
        return null;
      }
      this.db.prepare(`
        UPDATE deliveries
        SET status='processing', lease_owner=?, lease_until=?, attempt_count=attempt_count+1
        WHERE delivery_id=?
      `).run(owner, now + leaseMs, row.delivery_id);
      this.db.exec("COMMIT");
      return {
        ...row,
        status: "processing",
        attempt_count: row.attempt_count + 1,
        payload: JSON.parse(row.payload_json)
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  complete(deliveryId) {
    this.db.prepare("UPDATE deliveries SET status='done', lease_owner=NULL, lease_until=NULL WHERE delivery_id=?").run(deliveryId);
  }

  retry(deliveryId, errorClass, delayMs, now = Date.now()) {
    this.db.prepare(`
      UPDATE deliveries
      SET status='retry', next_attempt_at=?, last_error_class=?, lease_owner=NULL, lease_until=NULL
      WHERE delivery_id=?
    `).run(now + delayMs, errorClass, deliveryId);
  }

  fail(deliveryId, errorClass) {
    this.db.prepare("UPDATE deliveries SET status='failed', last_error_class=?, lease_owner=NULL, lease_until=NULL WHERE delivery_id=?").run(errorClass, deliveryId);
  }

  acquireWorkLease({ workKey, owner, leaseMs, now = Date.now() }) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db.prepare("SELECT * FROM work_leases WHERE work_key=?").get(workKey);
      if (current && current.lease_until >= now && current.lease_owner !== owner) {
        this.db.exec("COMMIT");
        return false;
      }
      this.db.prepare(`
        INSERT INTO work_leases(work_key,lease_owner,lease_until) VALUES(?,?,?)
        ON CONFLICT(work_key) DO UPDATE SET lease_owner=excluded.lease_owner, lease_until=excluded.lease_until
      `).run(workKey, owner, now + leaseMs);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  releaseWorkLease(workKey, owner) {
    this.db.prepare("DELETE FROM work_leases WHERE work_key=? AND lease_owner=?").run(workKey, owner);
  }

  getEffect(effectKey) {
    return this.db.prepare("SELECT * FROM effects WHERE effect_key=?").get(effectKey) ?? null;
  }

  beginEffect({ effectKey, kind, now = Date.now() }) {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO effects(effect_key,kind,status,updated_at)
      VALUES (?,?,'started',?)
    `).run(effectKey, kind, now);
    return result.changes === 1;
  }

  completeEffect(effectKey, now = Date.now()) {
    this.db.prepare("UPDATE effects SET status='done', updated_at=?, last_error_class=NULL WHERE effect_key=?").run(now, effectKey);
  }

  failEffect(effectKey, errorClass, now = Date.now()) {
    this.db.prepare("UPDATE effects SET status='failed', updated_at=?, last_error_class=? WHERE effect_key=?").run(now, errorClass, effectKey);
  }

  counts() {
    return this.db.prepare("SELECT status, COUNT(*) AS count FROM deliveries GROUP BY status").all();
  }
}
