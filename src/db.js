const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'orders.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    bundle TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    mpesa_receipt TEXT,
    checkout_request_id TEXT UNIQUE,
    failure_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const statements = {
  insert: db.prepare('INSERT INTO orders (id, name, phone, bundle, amount) VALUES (?, ?, ?, ?, ?)'),
  byId: db.prepare('SELECT * FROM orders WHERE id = ?'),
  byCheckoutId: db.prepare('SELECT * FROM orders WHERE checkout_request_id = ?'),
  setCheckoutId: db.prepare('UPDATE orders SET checkout_request_id = ? WHERE id = ?'),
  // A paid order can never change. A failed one can still become paid, because
  // a real receipt from M-PESA outranks an earlier status check.
  markPaid: db.prepare("UPDATE orders SET status = 'paid', mpesa_receipt = ? WHERE id = ? AND status IN ('pending', 'failed')"),
  markFailed: db.prepare("UPDATE orders SET status = 'failed', failure_reason = ? WHERE id = ? AND status = 'pending'"),
  recentPending: db.prepare(
    "SELECT 1 FROM orders WHERE phone = ? AND status = 'pending' AND created_at > datetime('now', '-60 seconds') LIMIT 1"
  ),
};

module.exports = {
  // Random ids, so one customer cannot look up another's order by counting.
  createOrder({ name, phone, bundle, amount }) {
    const id = crypto.randomUUID();
    statements.insert.run(id, name, phone, bundle, amount);
    return id;
  },
  getOrder: (id) => statements.byId.get(id),
  getOrderByCheckoutId: (checkoutId) => statements.byCheckoutId.get(checkoutId),
  saveCheckoutId: (id, checkoutId) => statements.setCheckoutId.run(checkoutId, id),
  markPaid: (id, receipt) => statements.markPaid.run(receipt, id),
  markFailed: (id, reason) => statements.markFailed.run(reason, id),
  hasRecentPending: (phone) => Boolean(statements.recentPending.get(phone)),
};
