import { useState } from "react";
import { api } from "./api";
import { parseAmount } from "../shared/money";
import type { AppData } from "../shared/types";

export default function SettleForm({ data, fromId, toId, cents, onClose, onSaved }: {
  data: AppData; fromId: number; toId: number; cents: number; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState(cents ? String(cents / 100).replace(".", ",") : "");
  const [date, setDate] = useState(new Date().toLocaleDateString("sv-SE"));
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const name = (id: number) => data.users.find((u) => u.id === id)?.name ?? "?";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = parseAmount(amount);
    if (!c) return setErr("Monto inválido");
    try { await api.addSettlement({ date, from_user: fromId, to_user: toId, amount_cents: c, note }); onSaved(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Registrar devolución</h2>
        <p><b>{name(fromId)}</b> le paga a <b>{name(toId)}</b></p>
        <div className="row">
          <label>Monto (ARS)<input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>Fecha<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <label>Nota (opcional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transferencia, efectivo…" /></label>
        {err && <p className="error">{err}</p>}
        <div className="row actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn">Guardar</button>
        </div>
      </form>
    </div>
  );
}
