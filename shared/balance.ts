import type { Expense, Settlement } from "./types";

/**
 * Saldo neto por usuario en centavos.
 * Positivo = le deben plata; negativo = debe plata.
 * neto = pagado - consumido + devoluciones enviadas - devoluciones recibidas
 */
export function computeBalances(
  expenses: Expense[], settlements: Settlement[],
): Map<number, number> {
  const net = new Map<number, number>();
  const add = (id: number, n: number) => net.set(id, (net.get(id) ?? 0) + n);
  for (const e of expenses) {
    add(e.payer_id, e.amount_cents);
    for (const s of e.splits) add(s.user_id, -s.owed_cents);
  }
  for (const s of settlements) {
    add(s.from_user, s.amount_cents);
    add(s.to_user, -s.amount_cents);
  }
  return net;
}

/** Con dos personas: quién le debe a quién y cuánto. null si están al día. */
export function pairwiseDebt(
  net: Map<number, number>, aId: number, bId: number,
): { debtor: number; creditor: number; cents: number } | null {
  const a = net.get(aId) ?? 0;
  if (a === 0) return null;
  return a > 0
    ? { debtor: bId, creditor: aId, cents: a }
    : { debtor: aId, creditor: bId, cents: -a };
}
