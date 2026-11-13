import { parseAmount } from "./money";
import { toIsoDate, type ProviderId } from "./invoices";

export interface EmailInput { from: string; subject: string; date: string; html: string }

export type EmailResult =
  | { kind: "invoice"; provider: ProviderId; providerName: string; kindName: string; total_cents: number;
      invoice_number: string | null; issue_date: string; due_date: string | null }
  | { kind: "notice"; provider: ProviderId; due_date: string | null; account: string | null }   // aviso sin monto
  | { kind: "reminder"; provider: ProviderId }                                                  // recordatorio de vencimiento
  | { kind: "ignored"; reason: string; unreadable: boolean };   // unreadable: conozco al proveedor pero no pude leer el monto

const NAMED: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', iexcl: "¡", iquest: "¿", deg: "°", ordm: "º",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n] ?? m)
    .replace(/\s+/g, " ").trim();
}

/** Fecha del correo en hora de Argentina, como YYYY-MM-DD. */
export function emailDate(date: string): string {
  return new Date(date).toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
}

const D = "(\\d{2}/\\d{2}/\\d{4})";
const N = "([\\d.,]*\\d)";
const rx = (s: string, f = "i") => new RegExp(s, f);

const SENDERS: { id: ProviderId; domains: RegExp }[] = [
  { id: "metrogas", domains: /metrogas\.com\.ar/gi },
  { id: "aysa", domains: /aysadigital\.com\.ar|aysa\.com\.ar/gi },
  { id: "iplan", domains: /iplan\.com\.ar/gi },
  { id: "edenor", domains: /edenor\.com/gi },
];

/** El remitente real; si el correo fue reenviado a mano, se deduce de los dominios que aparecen en el texto. */
function detectProvider(from: string, text: string): ProviderId | null {
  for (const s of SENDERS) if (new RegExp(s.domains.source, "i").test(from)) return s.id;
  let best: { id: ProviderId; hits: number } | null = null;
  for (const s of SENDERS) {
    const hits = (text.match(s.domains) ?? []).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { id: s.id, hits };
  }
  return best?.id ?? null;
}

const unreadable = (name: string): EmailResult => ({ kind: "ignored", reason: `${name}: no encontré el monto en el correo`, unreadable: true });

export function parseInvoiceEmail(mail: EmailInput): EmailResult {
  const text = htmlToText(mail.html);
  const provider = detectProvider(mail.from, text);
  const sent = emailDate(mail.date);
  const total = (s?: string) => (s ? parseAmount(s) : null);

  if (provider === "metrogas") {
    const m = rx(`D[eé]bito Autom[aá]tico:\\s*(?:SI|NO)\\s*\\$\\s*${N}\\s*${D}`).exec(text);
    const cents = total(m?.[1]);
    if (!m || !cents) return unreadable("MetroGAS");
    return {
      kind: "invoice", provider: "metrogas", providerName: "MetroGAS", kindName: "gas", total_cents: cents,
      invoice_number: null,
      issue_date: toIsoDate(rx(`Fecha de emisi[oó]n:\\s*${D}`).exec(text)?.[1]) ?? sent,
      due_date: toIsoDate(m[2]),
    };
  }

  if (provider === "aysa") {
    const m = rx(`(\\d{4}[A-Z]\\d{8,})[^$]{0,160}\\$\\s*${N}\\s*${D}`, "").exec(text);
    const cents = total(m?.[2]);
    if (!m || !cents) return unreadable("AySA");
    return {
      kind: "invoice", provider: "aysa", providerName: "AySA", kindName: "agua", total_cents: cents,
      invoice_number: m[1], issue_date: sent, due_date: toIsoDate(m[3]),
    };
  }

  if (provider === "iplan") {
    const m = rx(`valor de tus servicios[^$]{0,40}\\$\\s*${N}\\s*y su 1er vencimiento es el\\s*${D}`).exec(text);
    const cents = total(m?.[1]);
    if (!m || !cents) return unreadable("IPLAN");
    return {
      kind: "invoice", provider: "iplan", providerName: "IPLAN", kindName: "internet", total_cents: cents,
      invoice_number: null, issue_date: sent, due_date: toIsoDate(m[2]),
    };
  }

  if (provider === "edenor") {
    // Edenor nunca manda el monto ni el PDF: solo avisos. El gasto se crea subiendo el PDF.
    if (/Vencimiento de tu factura/i.test(mail.subject) || /vence tu factura/i.test(text)) {
      return { kind: "reminder", provider: "edenor" };
    }
    return {
      kind: "notice", provider: "edenor",
      due_date: toIsoDate(rx(`que vence el\\s*${D}`).exec(text)?.[1]),
      account: rx("n[uú]mero de cuenta:\\s*(\\d+)").exec(text)?.[1] ?? null,
    };
  }

  return { kind: "ignored", reason: "Remitente desconocido", unreadable: false };
}
