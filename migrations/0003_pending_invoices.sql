-- Facturas que llegaron por correo y esperan que alguien las confirme.
CREATE TABLE pending_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE,                 -- id del mensaje en Gmail: evita procesar dos veces el mismo
  provider TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  kind_name TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  invoice_number TEXT,
  issue_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  note TEXT,                              -- p. ej. "duplicado (exact)"
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pending_status ON pending_invoices(status);
