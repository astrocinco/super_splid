import { useState } from "react";
import { api } from "./api";
import { formatARS, parseAmount, splitTwoWays } from "../shared/money";
import type { AppData, Expense, User } from "../shared/types";

type Mode = "half" | "loan" | "mine" | "custom";
const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD en hora local

function initialMode(e: Expense | undefined, otherId: number): { mode: Mode; pct: string } {
  if (!e) return { mode: "half", pct: "50" };
  const owed = e.splits.find((s) => s.user_id === otherId)?.owed_cents ?? 0;
  const pct = (owed / e.amount_cents) * 100;
  if (pct === 50) return { mode: "half", pct: "50" };
  if (pct === 100) return { mode: "loan", pct: "100" };
  if (pct === 0) return { mode: "mine", pct: "0" };
  return { mode: "custom", pct: String(Math.round(pct * 100) / 100) };
}

export default function ExpenseForm({ data, me, expense, onClose, onSaved }: {
  data: AppData; me: User; expense?: Expense; onClose: () => void; onSaved: () => void;
}) {
  const [payerId, setPayerId] = useState(expense?.payer_id ?? me.id);
  const other = data.users.find((u) => u.id !== payerId)!;
  const init = initialMode(expense, other.id);
  const [desc, setDesc] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount_cents / 100).replace(".", ",") : "");
  const [date, setDate] = useState(expense?.date ?? today());
  const [cat, setCat] = useState<number | "">(expense?.category_id ?? "");
  const [mode, setMode] = useState<Mode>(init.mode);
  const [pct, setPct] = useState(init.pct);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const payer = data.users.find((u) => u.id === payerId)!;
  const who = (u: User) => (u.id === me.id ? "mí" : u.name);
  const whoSubj = (u: User) => (u.id === me.id ? "Yo" : u.name);

  const cents = parseAmount(amount);
  const otherPct = mode === "half" ? 50 : mode === "loan" ? 100 : mode === "mine" ? 0 : Number(pct);
  const pctOk = Number.isFinite(otherPct) && otherPct >= 0 && otherPct <= 100;
  const preview = cents && pctOk ? Math.round((cents * otherPct) / 100) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim()) return setErr("Escribe una descripción");
    if (!cents) return setErr("Monto inválido");
    if (!pctOk) return setErr("Porcentaje inválido");
    setBusy(true); setErr("");
    try {
      await api.saveExpense(expense?.id ?? null, {
        date, description: desc, amount_cents: cents, category_id: cat === "" ? null : cat,
        payer_id: payerId, splits: splitTwoWays(cents, payerId, other.id, otherPct),
      });
      onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{expense ? "Editar gasto" : "Nuevo gasto"}</h2>
        <label>Descripción<input autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej: Supermercado" /></label>
        <div className="row">
          <label>Monto (ARS)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></label>
          <label>Fecha<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <label>Categoría
          <select value={cat} onChange={(e) => setCat(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Sin categoría</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </label>
        <label>Pagó
          <select value={payerId} onChange={(e) => setPayerId(Number(e.target.value))}>
            {data.users.map((u) => <option key={u.id} value={u.id}>{u.id === me.id ? "Yo" : u.name}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>División</legend>
          <label className="radio"><input type="radio" checked={mode === "half"} onChange={() => setMode("half")} /> 50 / 50</label>
          <label className="radio"><input type="radio" checked={mode === "loan"} onChange={() => setMode("loan")} /> Todo de {who(other)} (préstamo)</label>
          <label className="radio"><input type="radio" checked={mode === "mine"} onChange={() => setMode("mine")} /> Todo de {who(payer)} (sin deuda)</label>
          <label className="radio"><input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> Otro %
            {mode === "custom" && <> · {whoSubj(other)} consume <input className="pct" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /> %</>}
          </label>
          {preview !== null && cents && <p className="muted small">{whoSubj(other)} {other.id === me.id ? "debo" : "debe"} {formatARS(preview)} a {who(payer)}.</p>}
        </fieldset>
        {err && <p className="error">{err}</p>}
        <div className="row actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
