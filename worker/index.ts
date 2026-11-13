import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_DAYS, createSession, readSession, verifyGoogleIdToken } from "./auth";
import { findDuplicate } from "../shared/dedupe";
import { parseInvoiceEmail } from "../shared/emails";
import type { AppData, Expense, PendingInvoice, Settlement, User } from "../shared/types";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;   // secret
  ALLOWED_EMAILS: string;     // secret: "a@gmail.com,b@gmail.com"
  SESSION_SECRET: string;     // secret
  INGEST_TOKEN?: string;      // secret: clave con la que el script de Gmail envía correos a /api/ingest
  DEV_AUTH?: string;          // solo en .dev.vars: "1" habilita /api/auth/dev
}
type Vars = { user: User };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const COOKIE = "session";
const allowed = (env: Env) => env.ALLOWED_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function loginUser(c: any, email: string, name: string, picture: string | null) {
  const db: D1Database = c.env.DB;
  // Crea una fila por cada correo permitido, para poder asignar gastos al otro antes de que entre.
  for (const e of allowed(c.env)) {
    await db.prepare("INSERT OR IGNORE INTO users (email, name) VALUES (?, ?)").bind(e, e.split("@")[0]).run();
  }
  await db.prepare(
    `INSERT INTO users (email, name, picture) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name, picture = excluded.picture`,
  ).bind(email, name, picture).run();
  const user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<User>();
  const token = await createSession(user!.id, c.env.SESSION_SECRET);
  setCookie(c, COOKIE, token, {
    httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax",
    path: "/", maxAge: SESSION_DAYS * 86400,
  });
  return user!;
}

// ---------- Rutas públicas ----------
app.get("/api/config", (c) => c.json({ googleClientId: c.env.GOOGLE_CLIENT_ID, devAuth: c.env.DEV_AUTH === "1" }));

app.post("/api/auth/google", async (c) => {
  const { credential } = await c.req.json<{ credential: string }>();
  let claims;
  try { claims = await verifyGoogleIdToken(credential, c.env.GOOGLE_CLIENT_ID); }
  catch { return c.json({ error: "No se pudo verificar la cuenta de Google" }, 401); }
  if (!allowed(c.env).includes(claims.email)) return c.json({ error: "Esta cuenta no tiene acceso" }, 403);
  return c.json(await loginUser(c, claims.email, claims.name, claims.picture ?? null));
});

app.post("/api/auth/dev", async (c) => {
  if (c.env.DEV_AUTH !== "1") return c.notFound();
  const { email } = await c.req.json<{ email: string }>();
  if (!allowed(c.env).includes(email.toLowerCase())) return c.json({ error: "No permitido" }, 403);
  return c.json(await loginUser(c, email.toLowerCase(), email.split("@")[0], null));
});

app.post("/api/auth/logout", (c) => { deleteCookie(c, COOKIE, { path: "/" }); return c.json({ ok: true }); });

// ---------- Recepción de correos (la usa el script de la casilla dedicada, no el navegador) ----------
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  return (crypto.subtle as any).timingSafeEqual(ha, hb);
}

app.post("/api/ingest", async (c) => {
  const secret = c.env.INGEST_TOKEN;
  if (!secret) return c.json({ error: "La recepción de correos no está configurada" }, 503);
  const given = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!(await safeEqual(given, secret))) return c.json({ error: "No autorizado" }, 401);

  const raw = await c.req.text();
  if (raw.length > 800_000) return c.json({ error: "Correo demasiado grande" }, 413);
  let b: any;
  try { b = JSON.parse(raw); } catch { return c.json({ error: "JSON inválido" }, 400); }
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
  const messageId = str(b.message_id, 200), from = str(b.from, 500), subject = str(b.subject, 1000), date = str(b.date, 100), html = str(b.html, 700_000);
  if (!messageId || from === null || subject === null || !date || html === null || isNaN(Date.parse(date)))
    return c.json({ error: "Faltan campos del correo" }, 400);

  const r = parseInvoiceEmail({ from, subject, date, html });
  if (r.kind === "ignored") return c.json({ status: r.unreadable ? "unreadable" : "ignored", reason: r.reason });
  if (r.kind !== "invoice") return c.json({ status: "no_invoice", kind: r.kind }); // avisos y recordatorios de Edenor: no traen monto

  // ¿Ya la tenemos? Se compara con los gastos y con las facturas pendientes o descartadas.
  const db = c.env.DB;
  const [ex, pe] = await db.batch([
    db.prepare("SELECT invoice_provider, invoice_number, amount_cents, date FROM expenses WHERE invoice_provider = ?").bind(r.provider),
    db.prepare("SELECT provider AS invoice_provider, invoice_number, total_cents AS amount_cents, issue_date AS date FROM pending_invoices WHERE provider = ?").bind(r.provider),
  ]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  const dup = findDuplicate(
    { provider: r.provider, invoice_number: r.invoice_number, total_cents: r.total_cents, date: r.issue_date },
    [...(ex.results as any[]), ...(pe.results as any[])], today);

  const res = await db.prepare(
    `INSERT OR IGNORE INTO pending_invoices
       (message_id, provider, provider_name, kind_name, total_cents, invoice_number, issue_date, due_date, status, note)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).bind(messageId, r.provider, r.providerName, r.kindName, r.total_cents, r.invoice_number, r.issue_date, r.due_date,
    dup ? "dismissed" : "pending", dup ? `duplicado (${dup.level})` : null).run();
  if (!res.meta.changes) return c.json({ status: "already_processed" });
  return c.json({ status: dup ? "duplicate" : "created", level: dup?.level ?? null });
});

// ---------- Todo lo demás requiere sesión ----------
app.use("/api/*", async (c, next) => {
  const uid = await readSession(getCookie(c, COOKIE), c.env.SESSION_SECRET);
  const user = uid ? await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first<User>() : null;
  if (!user || !allowed(c.env).includes(user.email)) return c.json({ error: "No autenticado" }, 401);
  c.set("user", user);
  await next();
});

app.get("/api/me", (c) => c.json(c.get("user")));

async function loadData(db: D1Database): Promise<AppData> {
  const [users, categories, expenses, splits, settlements, pending] = await db.batch([
    db.prepare("SELECT id, email, name, picture FROM users ORDER BY id"),
    db.prepare("SELECT * FROM categories ORDER BY name"),
    db.prepare("SELECT * FROM expenses ORDER BY date DESC, id DESC"),
    db.prepare("SELECT * FROM expense_splits"),
    db.prepare("SELECT * FROM settlements ORDER BY date DESC, id DESC"),
    db.prepare(`SELECT id, provider, provider_name, kind_name, total_cents, invoice_number, issue_date, due_date
                FROM pending_invoices WHERE status = 'pending' ORDER BY issue_date DESC, id DESC`),
  ]);
  const byExpense = new Map<number, { user_id: number; owed_cents: number }[]>();
  for (const s of splits.results as any[]) {
    (byExpense.get(s.expense_id) ?? byExpense.set(s.expense_id, []).get(s.expense_id)!)
      .push({ user_id: s.user_id, owed_cents: s.owed_cents });
  }
  return {
    users: users.results as any,
    categories: categories.results as any,
    expenses: (expenses.results as any[]).map((e) => ({ ...e, splits: byExpense.get(e.id) ?? [] })) as Expense[],
    settlements: settlements.results as unknown as Settlement[],
    pending: pending.results as unknown as PendingInvoice[],
  };
}

app.get("/api/data", async (c) => c.json(await loadData(c.env.DB)));

// ---------- Validación ----------
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const isCents = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) < 1e13;

async function parseExpense(c: any, userIds: Set<number>) {
  const b = await c.req.json();
  const splits = Array.isArray(b.splits) ? b.splits : [];
  const problems: string[] = [];
  if (!isDate(b.date)) problems.push("fecha");
  if (typeof b.description !== "string" || !b.description.trim()) problems.push("descripción");
  if (!isCents(b.amount_cents)) problems.push("monto");
  if (!userIds.has(b.payer_id)) problems.push("quién pagó");
  if (splits.some((s: any) => !userIds.has(s.user_id) || !Number.isInteger(s.owed_cents) || s.owed_cents < 0)
    || new Set(splits.map((s: any) => s.user_id)).size !== splits.length || splits.length === 0
    || splits.reduce((a: number, s: any) => a + s.owed_cents, 0) !== b.amount_cents) problems.push("división");
  if (problems.length) return { error: `Datos inválidos: ${problems.join(", ")}` } as const;
  const provider = typeof b.invoice_provider === "string" && /^[a-z]{2,20}$/.test(b.invoice_provider) ? b.invoice_provider : null;
  const number = provider && typeof b.invoice_number === "string" && b.invoice_number.trim()
    ? b.invoice_number.trim().slice(0, 40) : null;
  return {
    value: {
      invoice_provider: provider, invoice_number: number, pending_id: (Number.isInteger(b.pending_id) ? b.pending_id : null) as number | null,
      date: b.date as string, description: (b.description as string).trim().slice(0, 200),
      amount_cents: b.amount_cents as number, category_id: (b.category_id ?? null) as number | null,
      payer_id: b.payer_id as number, splits: splits as { user_id: number; owed_cents: number }[],
    },
  } as const;
}

const allUserIds = async (db: D1Database) =>
  new Set(((await db.prepare("SELECT id FROM users").all()).results as { id: number }[]).map((r) => r.id));

async function writeExpense(db: D1Database, id: number | null, userId: number, v: any) {
  const stmts: D1PreparedStatement[] = [];
  if (id === null) {
    stmts.push(db.prepare(
      "INSERT INTO expenses (date, description, amount_cents, category_id, payer_id, created_by, invoice_provider, invoice_number) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(v.date, v.description, v.amount_cents, v.category_id, v.payer_id, userId, v.invoice_provider, v.invoice_number));
    const res = await stmts[0].run();
    id = res.meta.last_row_id as number;
    stmts.length = 0;
  } else {
    stmts.push(db.prepare(
      "UPDATE expenses SET date=?, description=?, amount_cents=?, category_id=?, payer_id=? WHERE id=?",
    ).bind(v.date, v.description, v.amount_cents, v.category_id, v.payer_id, id));
    stmts.push(db.prepare("DELETE FROM expense_splits WHERE expense_id = ?").bind(id));
  }
  for (const s of v.splits) {
    stmts.push(db.prepare("INSERT INTO expense_splits (expense_id, user_id, owed_cents) VALUES (?,?,?)").bind(id, s.user_id, s.owed_cents));
  }
  await db.batch(stmts);
  return id;
}

app.post("/api/expenses", async (c) => {
  const r = await parseExpense(c, await allUserIds(c.env.DB));
  if ("error" in r) return c.json({ error: r.error }, 400);
  try {
    const id = await writeExpense(c.env.DB, null, c.get("user").id, r.value);
    if (Number.isInteger(r.value.pending_id)) {
      await c.env.DB.prepare("UPDATE pending_invoices SET status = 'accepted', expense_id = ? WHERE id = ? AND status = 'pending'")
        .bind(id, r.value.pending_id).run();
    }
    return c.json({ id }, 201);
  } catch (e) {
    if (String(e).includes("UNIQUE")) return c.json({ error: "Esta factura ya fue cargada antes (mismo proveedor y número)." }, 409);
    throw e;
  }
});

app.put("/api/expenses/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await c.env.DB.prepare("SELECT 1 FROM expenses WHERE id = ?").bind(id).first())) return c.json({ error: "No existe" }, 404);
  const r = await parseExpense(c, await allUserIds(c.env.DB));
  if ("error" in r) return c.json({ error: r.error }, 400);
  await writeExpense(c.env.DB, id, c.get("user").id, r.value);
  return c.json({ id });
});

app.delete("/api/expenses/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM expenses WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

app.post("/api/pending/:id/dismiss", async (c) => {
  await c.env.DB.prepare("UPDATE pending_invoices SET status = 'dismissed', note = 'descartada a mano' WHERE id = ? AND status = 'pending'")
    .bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

app.post("/api/settlements", async (c) => {
  const b = await c.req.json();
  const ids = await allUserIds(c.env.DB);
  if (!isDate(b.date) || !isCents(b.amount_cents) || !ids.has(b.from_user) || !ids.has(b.to_user) || b.from_user === b.to_user)
    return c.json({ error: "Datos inválidos" }, 400);
  const res = await c.env.DB.prepare(
    "INSERT INTO settlements (date, from_user, to_user, amount_cents, note, created_by) VALUES (?,?,?,?,?,?)",
  ).bind(b.date, b.from_user, b.to_user, b.amount_cents, b.note ? String(b.note).slice(0, 200) : null, c.get("user").id).run();
  return c.json({ id: res.meta.last_row_id }, 201);
});

app.delete("/api/settlements/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM settlements WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

app.post("/api/categories", async (c) => {
  const b = await c.req.json();
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "";
  if (!name) return c.json({ error: "Nombre requerido" }, 400);
  try {
    const res = await c.env.DB.prepare("INSERT INTO categories (name, emoji) VALUES (?, ?)")
      .bind(name, typeof b.emoji === "string" && b.emoji ? b.emoji.slice(0, 8) : "🧾").run();
    return c.json({ id: res.meta.last_row_id }, 201);
  } catch { return c.json({ error: "Ya existe esa categoría" }, 409); }
});

app.delete("/api/categories/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

export default app;
