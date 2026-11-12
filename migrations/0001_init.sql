CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  picture TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  emoji TEXT NOT NULL DEFAULT '🧾'
);

-- Todos los montos están en centavos de ARS (enteros).
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                       -- YYYY-MM-DD
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  payer_id INTEGER NOT NULL REFERENCES users(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expenses_date ON expenses(date);

-- Cuánto "consume" cada persona de un gasto. La suma debe ser amount_cents.
CREATE TABLE expense_splits (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  owed_cents INTEGER NOT NULL CHECK (owed_cents >= 0),
  PRIMARY KEY (expense_id, user_id)
);

-- Devoluciones de dinero: from_user le pagó amount a to_user.
CREATE TABLE settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  from_user INTEGER NOT NULL REFERENCES users(id),
  to_user INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  note TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO categories (name, emoji) VALUES
  ('Supermercado', '🛒'),
  ('Servicios', '💡'),
  ('Alquiler', '🏠'),
  ('Comida afuera', '🍽️'),
  ('Transporte', '🚌'),
  ('Salidas', '🎉'),
  ('Otros', '🧾');
