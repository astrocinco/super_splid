import { describe, expect, it } from "vitest";
import { invoiceToPrefill, parseInvoiceText, toIsoDate } from "../shared/invoices";

// Textos sintéticos con la misma forma que producen las facturas (sin datos personales).
const SAMPLES = {
  metrogas: `LIQUIDACION DE SERVICIOS PÚBLICOS   MetroGAS S.A.
TOTAL A PAGAR   $ 12.345,67
NÚMERO DE IMPRESIÓN 500000000001
PERIODO 05/2026 - LIQUIDACIÓN 2 DE 2   FECHA DE EMISIÓN: 10/11/2026
FECHA DE VENCIMIENTO: 24/11/2026   PERIODO DE LIQUIDACIÓN: 12/09/2026 A 13/10/2026
TOTAL CONSUMO   10.170,80
Más información en metrogas.com.ar`,
  edenor: `Liquidación de Servicio Público N° 0027-00000001   Emisión 09/11/2026 C.A.B.A.
B   C.E.S.P Nº 1   Fecha de Vencimiento: 14/11/2026
Hasta el 24/11/2026
TOTAL A PAGAR   $ 20.000,00
Oficina Online: edenordigital   Sitio web: edenor.com`,
  aysa: `Agua y Saneamientos Argentinos S.A.   FACTURA DIGITAL   SERVICIOS PÚBLICOS B18 Nº 0111B00000001
Fecha de emisión: 10/10/2026 | Frecuencia: MENSUAL
C.E.S.P: 1 | Fecha Vto : 14/10/2026
A debitar el   10/11/2026   Total a debitar   $ 30.000,50
Total a debitar el 10/11/2026   $ 30.000,50   www.aysa.com.ar`,
  iplan: `FACTURA   Nº 00005−00000001
Fecha de emisión: 10/09/2026
TOTAL   $41000.75
Fecha de vencimiento.: 20/09/2026   Pagá en iplan.com.ar`,
};

describe("parseInvoiceText", () => {
  it("MetroGAS", () => {
    const r = parseInvoiceText(SAMPLES.metrogas);
    expect(r).toMatchObject({ ok: true, invoice: { provider: "metrogas", total_cents: 1234567, invoice_number: "500000000001", issue_date: "2026-11-10", due_date: "2026-11-24" } });
  });
  it("Edenor", () => {
    expect(parseInvoiceText(SAMPLES.edenor)).toMatchObject({ ok: true, invoice: { provider: "edenor", invoice_number: "0027-00000001", total_cents: 2000000, issue_date: "2026-11-09", due_date: "2026-11-14" } });
  });
  it("AySA (total a debitar y fecha de débito)", () => {
    expect(parseInvoiceText(SAMPLES.aysa)).toMatchObject({ ok: true, invoice: { provider: "aysa", invoice_number: "0111B00000001", total_cents: 3000050, issue_date: "2026-10-10", due_date: "2026-10-14", debit_date: "2026-11-10" } });
  });
  it("IPLAN (monto con punto decimal, sin miles)", () => {
    expect(parseInvoiceText(SAMPLES.iplan)).toMatchObject({ ok: true, invoice: { provider: "iplan", invoice_number: "00005-00000001", total_cents: 4100075, issue_date: "2026-09-10", due_date: "2026-09-20" } });
  });
  it("rechaza proveedores desconocidos", () => {
    expect(parseInvoiceText("Ticket de compra TOTAL $ 100,00")).toMatchObject({ ok: false });
  });
  it("avisa si reconoce el proveedor pero no el monto", () => {
    expect(parseInvoiceText("Edenor sin monto legible")).toMatchObject({ ok: false, error: expect.stringContaining("Edenor") });
  });
});

describe("fechas y prefill", () => {
  it("valida fechas imposibles", () => {
    expect(toIsoDate("31/02/2026")).toBeNull();
    expect(toIsoDate("05/03/2026")).toBe("2026-03-05");
  });
  it("usa la emisión, o el vencimiento, o hoy", () => {
    const inv = (p: any) => ({ provider: "edenor", providerName: "Edenor", kind: "luz", total_cents: 1, debit_date: null, issue_date: null, due_date: null, ...p });
    expect(invoiceToPrefill(inv({ issue_date: "2026-01-02", due_date: "2026-01-09" }), "2026-05-05").date).toBe("2026-01-02");
    expect(invoiceToPrefill(inv({ due_date: "2026-01-09" }), "2026-05-05").date).toBe("2026-01-09");
    expect(invoiceToPrefill(inv({}), "2026-05-05").date).toBe("2026-05-05");
  });
});
