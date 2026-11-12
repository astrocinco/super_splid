import type { Split } from "./types";

/** Divide un gasto entre dos personas. `payerPercent` = porcentaje que consume quien pagó (0-100). */
export function splitTwoWays(
  amountCents: number, payerId: number, otherId: number, otherPercent: number,
): Split[] {
  const otherOwes = Math.round((amountCents * otherPercent) / 100);
  return [
    { user_id: payerId, owed_cents: amountCents - otherOwes },
    { user_id: otherId, owed_cents: otherOwes },
  ];
}

/** "1234,56" | "1.234,56" | "1234.56" -> 123456 centavos. null si no es válido. */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/\s|\$/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function formatARS(cents: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(cents / 100);
}
