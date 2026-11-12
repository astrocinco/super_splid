import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import Login from "./Login";
import ExpenseForm from "./ExpenseForm";
import SettleForm from "./SettleForm";
import { computeBalances, pairwiseDebt } from "../shared/balance";
import { formatARS } from "../shared/money";
import type { AppData, Expense, Settlement, User } from "../shared/types";

type Tab = "home" | "history" | "settings";
type Item = { kind: "e"; date: string; id: number; e: Expense } | { kind: "s"; date: string; id: number; s: Settlement };

export default function App() {
  const [me, setMe] = useState<User | null | undefined>(undefined);
  useEffect(() => { api.me().then(setMe).catch(() => setMe(null)); }, []);
  if (me === undefined) return <p className="center muted">Cargando…</p>;
  if (me === null) return <Login onLogin={setMe} />;
  return <Main me={me} onLogout={async () => { await api.logout(); setMe(null); }} />;
}

function Main({ me, onLogout }: { me: User; onLogout: () => void }) {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [form, setForm] = useState<{ expense?: Expense } | null>(null);
  const [settle, setSettle] = useState<{ from: number; to: number; cents: number } | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => api.data().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { reload(); }, [reload]);

  if (!data) return <p className="center muted">{error || "Cargando…"}</p>;
  const done = () => { setForm(null); setSettle(null); reload(); };

  return (
    <div className="app">
      <header><h1>💸 Gastos</h1></header>
      <main>
        {tab === "home" && <Home data={data} me={me} onSettle={setSettle} onEdit={(e) => setForm({ expense: e })} onAll={() => setTab("history")} />}
        {tab === "history" && <History data={data} me={me} onEdit={(e) => setForm({ expense: e })} onChanged={reload} />}
        {tab === "settings" && <Settings data={data} me={me} onChanged={reload} onLogout={onLogout} />}
      </main>
      <nav>
        <button className={tab === "home" ? "on" : ""} onClick={() => setTab("home")}>🏠<span>Inicio</span></button>
        <button className="fab" onClick={() => setForm({})} aria-label="Nuevo gasto">＋</button>
        <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>📜<span>Historial</span></button>
        <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>⚙️<span>Ajustes</span></button>
      </nav>
      {form && <ExpenseForm data={data} me={me} expense={form.expense} onClose={() => setForm(null)} onSaved={done} />}
      {settle && <SettleForm data={data} fromId={settle.from} toId={settle.to} cents={settle.cents} onClose={() => setSettle(null)} onSaved={done} />}
    </div>
  );
}

const nameOf = (data: AppData, me: User, id: number) => (id === me.id ? "Tú" : data.users.find((u) => u.id === id)?.name ?? "?");
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });

function Home({ data, me, onSettle, onEdit, onAll }: {
  data: AppData; me: User; onSettle: (s: { from: number; to: number; cents: number }) => void;
  onEdit: (e: Expense) => void; onAll: () => void;
}) {
  const other = data.users.find((u) => u.id !== me.id);
  const debt = other ? pairwiseDebt(computeBalances(data.expenses, data.settlements), me.id, other.id) : null;
  const items = useMemo(() => mergeItems(data).slice(0, 6), [data]);
  return (
    <>
      <section className={`card balance ${debt ? (debt.creditor === me.id ? "pos" : "neg") : ""}`}>
        {!other ? <p>Esperando a que tu roomie inicie sesión por primera vez.</p> : !debt ? <><p className="big">Están al día ✅</p></> : (
          <>
            <p className="muted">{debt.creditor === me.id ? `${other.name} te debe` : `Le debes a ${other.name}`}</p>
            <p className="big">{formatARS(debt.cents)}</p>
            <button className="btn" onClick={() => onSettle({ from: debt.debtor, to: debt.creditor, cents: debt.cents })}>Registrar devolución</button>
          </>
        )}
      </section>
      <h2>Últimos movimientos</h2>
      <ItemList data={data} me={me} items={items} onEdit={onEdit} />
      {items.length > 0 && <button className="btn ghost" onClick={onAll}>Ver todo el historial</button>}
    </>
  );
}

function mergeItems(data: AppData): Item[] {
  const items: Item[] = [
    ...data.expenses.map((e): Item => ({ kind: "e", date: e.date, id: e.id, e })),
    ...data.settlements.map((s): Item => ({ kind: "s", date: s.date, id: s.id, s })),
  ];
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function ItemList({ data, me, items, onEdit }: { data: AppData; me: User; items: Item[]; onEdit: (e: Expense) => void }) {
  if (!items.length) return <p className="muted center">Todavía no hay movimientos. Usa ＋ para anotar el primer gasto.</p>;
  return (
    <ul className="list">
      {items.map((it) => {
        if (it.kind === "s") {
          const s = it.s;
          return (
            <li key={`s${s.id}`} className="item">
              <span className="emoji">🤝</span>
              <div className="grow"><b>{nameOf(data, me, s.from_user)} → {nameOf(data, me, s.to_user)}</b><small>{fmtDate(s.date)}{s.note ? ` · ${s.note}` : ""}</small></div>
              <span className="amt settle">{formatARS(s.amount_cents)}</span>
            </li>
          );
        }
        const e = it.e;
        const cat = data.categories.find((c) => c.id === e.category_id);
        const mine = e.splits.find((s) => s.user_id === me.id)?.owed_cents ?? 0;
        const delta = e.payer_id === me.id ? e.amount_cents - mine : -mine;
        return (
          <li key={`e${e.id}`} className="item click" onClick={() => onEdit(e)}>
            <span className="emoji">{cat?.emoji ?? "🧾"}</span>
            <div className="grow"><b>{e.description}</b><small>{fmtDate(e.date)} · pagó {nameOf(data, me, e.payer_id)} · {formatARS(e.amount_cents)}</small></div>
            <span className={`amt ${delta >= 0 ? "pos" : "neg"}`}>{delta === 0 ? "—" : (delta > 0 ? "+" : "−") + formatARS(Math.abs(delta))}</span>
          </li>
        );
      })}
    </ul>
  );
}

function History({ data, me, onEdit, onChanged }: { data: AppData; me: User; onEdit: (e: Expense) => void; onChanged: () => void }) {
  const [month, setMonth] = useState("");
  const [cat, setCat] = useState("");
  const [payer, setPayer] = useState("");
  const all = useMemo(() => mergeItems(data), [data]);
  const months = [...new Set(all.map((i) => i.date.slice(0, 7)))];
  const items = all.filter((i) => {
    if (month && !i.date.startsWith(month)) return false;
    if (i.kind === "s") return !cat && !payer;
    if (cat && String(i.e.category_id ?? "none") !== cat) return false;
    if (payer && String(i.e.payer_id) !== payer) return false;
    return true;
  });
  const total = items.reduce((a, i) => a + (i.kind === "e" ? i.e.amount_cents : 0), 0);
  return (
    <>
      <div className="filters">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">Todos los meses</option>
          {months.map((m) => <option key={m} value={m}>{new Date(m + "-15").toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          <option value="none">Sin categoría</option>
        </select>
        <select value={payer} onChange={(e) => setPayer(e.target.value)}>
          <option value="">Pagó cualquiera</option>
          {data.users.map((u) => <option key={u.id} value={u.id}>{nameOf(data, me, u.id)}</option>)}
        </select>
      </div>
      <p className="muted small">Gastado en la selección: <b>{formatARS(total)}</b></p>
      <ItemList data={data} me={me} items={items} onEdit={onEdit} />
      <SettlementsAdmin data={data} me={me} onChanged={onChanged} />
    </>
  );
}

function SettlementsAdmin({ data, me, onChanged }: { data: AppData; me: User; onChanged: () => void }) {
  if (!data.settlements.length) return null;
  return (
    <details className="card">
      <summary>Borrar una devolución registrada por error</summary>
      <ul className="list">
        {data.settlements.map((s) => (
          <li key={s.id} className="item">
            <div className="grow"><b>{nameOf(data, me, s.from_user)} → {nameOf(data, me, s.to_user)}</b><small>{fmtDate(s.date)} · {formatARS(s.amount_cents)}</small></div>
            <button className="btn danger small" onClick={async () => { if (confirm("¿Borrar esta devolución?")) { await api.deleteSettlement(s.id); onChanged(); } }}>Borrar</button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Settings({ data, me, onChanged, onLogout }: { data: AppData; me: User; onChanged: () => void; onLogout: () => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [err, setErr] = useState("");
  return (
    <>
      <h2>Categorías</h2>
      <ul className="list">
        {data.categories.map((c) => (
          <li key={c.id} className="item">
            <span className="emoji">{c.emoji}</span><div className="grow"><b>{c.name}</b></div>
            <button className="btn danger small" onClick={async () => { if (confirm(`¿Borrar "${c.name}"? Los gastos quedarán sin categoría.`)) { await api.deleteCategory(c.id); onChanged(); } }}>Borrar</button>
          </li>
        ))}
      </ul>
      <form className="row addcat" onSubmit={async (e) => {
        e.preventDefault(); setErr("");
        try { await api.addCategory(name, emoji); setName(""); setEmoji(""); onChanged(); } catch (x: any) { setErr(x.message); }
      }}>
        <input className="emojiin" placeholder="🙂" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        <input placeholder="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn">Agregar</button>
      </form>
      {err && <p className="error">{err}</p>}
      <h2>Cuenta</h2>
      <p className="muted">Sesión iniciada como <b>{me.email}</b></p>
      <button className="btn ghost" onClick={onLogout}>Cerrar sesión</button>
    </>
  );
}
