

export interface InvoiceKey {
  provider: string;
  invoice_number: string | null;
  total_cents: number;
  date: string; // YYYY-MM-DD (emisión, o fecha del correo)
}
/** Lo mínimo que hace falta de un gasto (o de una factura pendiente) para compararlo. */
export interface DupRow { invoice_provider?: string | null; invoice_number?: string | null; amount_cents: number; date: string }
export interface Duplicate<T extends DupRow> { level: "exact" | "likely"; expense: T }

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

/**
 * Detecta si una factura ya fue cargada, venga de PDF o de correo.
 * - exact:  mismo proveedor y mismo número de factura (en cualquier fecha).
 * - likely: mismo proveedor y mismo monto con fechas cercanas (≤ nearDays), dentro de los
 *           últimos windowDays días. Solo si falta el número en alguno de los dos lados:
 *           dos números distintos son facturas distintas aunque tengan el mismo monto
 *           (p. ej. el abono fijo de internet de dos meses seguidos).
 */
export function findDuplicate<T extends DupRow>(
  c: InvoiceKey, existing: T[], today: string, windowDays = 120, nearDays = 20,
): Duplicate<T> | null {
  let likely: Duplicate<T> | null = null;
  for (const e of existing) {
    if (e.invoice_provider !== c.provider) continue;
    if (c.invoice_number && e.invoice_number) {
      if (c.invoice_number === e.invoice_number) return { level: "exact", expense: e };
      continue;
    }
    if (likely || daysBetween(e.date, today) > windowDays) continue;
    if (e.amount_cents === c.total_cents && daysBetween(e.date, c.date) <= nearDays) {
      likely = { level: "likely", expense: e };
    }
  }
  return likely;
}
