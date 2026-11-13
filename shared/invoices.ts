import { parseAmount } from "./money";

export type ProviderId = "metrogas" | "edenor" | "aysa" | "iplan";

export interface ParsedInvoice {
  provider: ProviderId;
  providerName: string;
  kind: string;                  // "gas" | "luz" | "agua" | "internet"
  total_cents: number;
  invoice_number: string | null;
  issue_date: string | null;     // YYYY-MM-DD
  due_date: string | null;
  debit_date: string | null;
}
export type ParseResult = { ok: true; invoice: ParsedInvoice } | { ok: false; error: string };

const D = "(\\d{2}/\\d{2}/\\d{4})";
const N = "([\\d.,]*\\d)";

interface Rule {
  id: ProviderId; name: string; kind: string; detect: RegExp;
  total: RegExp; number: RegExp; issue: RegExp; due: RegExp; debit?: RegExp;
}

// Un parser por proveedor: cada uno escribe los montos y fechas a su manera.
const RULES: Rule[] = [
  {
    id: "metrogas", name: "MetroGAS", kind: "gas", detect: /metrogas/gi,
    total: new RegExp(`TOTAL A PAGAR\\s*\\$\\s*${N}`, "i"),
    number: /N[ÚU]MERO DE IMPRESI[ÓO]N\s+(\d{8,})/i,
    issue: new RegExp(`FECHA DE EMISI[OÓ]N:\\s*${D}`, "i"),
    due: new RegExp(`FECHA DE VENCIMIENTO:\\s*${D}`, "i"),
  },
  {
    id: "edenor", name: "Edenor", kind: "luz", detect: /edenor/gi,
    total: new RegExp(`TOTAL A PAGAR\\s*\\$\\s*${N}`, "i"),
    number: /Servicio P[úu]blico N[°º]\s*(\d[\d-]{5,})/i,
    issue: new RegExp(`\\bEmisi[oó]n\\s+${D}`, "i"),
    due: new RegExp(`Fecha de Vencimiento:\\s*${D}`, "i"),
  },
  {
    id: "aysa", name: "AySA", kind: "agua", detect: /aysa|agua y saneamientos argentinos/gi,
    total: new RegExp(`Total a debitar(?:\\s+el\\s+${D})?\\s*\\$\\s*${N}`, "i"),
    number: /N[°º]\s*(\d{4}[A-Z]\d{8,})/,
    issue: new RegExp(`Fecha de emisi[oó]n:\\s*${D}`, "i"),
    due: new RegExp(`Fecha Vto\\s*:\\s*${D}`, "i"),
    debit: new RegExp(`A debitar el\\s*${D}`, "i"),
  },
  {
    id: "iplan", name: "IPLAN", kind: "internet", detect: /iplan/gi,
    total: new RegExp(`\\bTOTAL\\s*\\$\\s*${N}`),
    number: /FACTURA\s+N[°º]\s*(\d[\d-]{7,})/,
    issue: new RegExp(`Fecha de emisi[oó]n:\\s*${D}`, "i"),
    due: new RegExp(`Fecha de vencimiento\\.?\\s*:\\s*${D}`, "i"),
  },
];

export function normalizeInvoiceNumber(n: string | undefined | null): string | null {
  return (n ?? "").replace(/\s+/g, "").replace(/[\u2212\u2013]/g, "-") || null;
}

export function toIsoDate(ddmmyyyy: string | undefined): string | null {
  if (!ddmmyyyy) return null;
  const [d, m, y] = ddmmyyyy.split("/").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseInvoiceText(raw: string): ParseResult {
  const text = raw.replace(/\u00a0/g, " ").replace(/[\u2212\u2013]/g, "-"); // espacios duros y signos "menos" raros
  // Proveedor = el que más veces se menciona en el documento.
  let best: { rule: Rule; hits: number } | null = null;
  for (const rule of RULES) {
    const hits = (text.match(rule.detect) ?? []).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { rule, hits };
  }
  if (!best) return { ok: false, error: "No reconozco el proveedor de esta factura (aún)." };
  const r = best.rule;

  const totalMatch = r.total.exec(text);
  const totalStr = totalMatch?.[totalMatch.length - 1];
  const total = totalStr ? parseAmount(totalStr) : null;
  if (!total) return { ok: false, error: `Reconocí la factura de ${r.name}, pero no pude leer el monto total.` };

  return {
    ok: true,
    invoice: {
      provider: r.id, providerName: r.name, kind: r.kind, total_cents: total,
      invoice_number: normalizeInvoiceNumber(r.number.exec(text)?.[1]),
      issue_date: toIsoDate(r.issue.exec(text)?.[1]),
      due_date: toIsoDate(r.due.exec(text)?.[1]),
      debit_date: r.debit ? toIsoDate(r.debit.exec(text)?.[1]) : null,
    },
  };
}

/** Datos para precargar el formulario de gasto. */
export function invoiceToPrefill(inv: ParsedInvoice, today: string) {
  return {
    description: `${inv.providerName} (${inv.kind})`,
    amount_cents: inv.total_cents,
    date: inv.issue_date ?? inv.due_date ?? today,
    invoice_provider: inv.provider as string,
    invoice_number: inv.invoice_number,
  };
}
