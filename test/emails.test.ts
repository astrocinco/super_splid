import { describe, expect, it } from "vitest";
import { emailDate, htmlToText, parseInvoiceEmail } from "../shared/emails";

// HTML sintético con la misma forma que los correos reales (sin datos personales).
const metrogas = { from: "MetroGAS Factura Digital <facturadigital@metrogas.com.ar>", subject: "Factura MetroGAS 1", date: "Wed, 14 Oct 2026 19:14:30 -0300",
  html: "<p>Fecha de emisión: 13/10/2026</p><p>Período de liquidación: 13/08/2026 A 11/09/2026</p><table><tr><td>Débito Automático: SI</td><td>$ 15.000,10</td><td>30/10/2026</td><td>$ 0,00</td></tr></table>" };
const aysa = { from: "AySA Digital <avisos@aysadigital.com.ar>", subject: "Aviso de Factura Digital Disponible", date: "Wed, 21 Oct 2026 1:03:26 +0200",
  html: "<td>Cuenta:</td><td>Factura N°</td><td>Domicilio</td><td>Importe</td><td>Vencimiento</td><td>000000000001</td><td>0111B00000002</td><td>CALLE 123 </td><td>CAPITAL FEDERAL</td><td>$ 30000,50</td><td>10/11/2026</td><td><a>Descargar</a></td>" };
const iplan = { from: "Iplan Hogar <noreply@iplan.com.ar>", subject: "Tu factura de Iplan* Hogar 10/2026 est&aacute; disponible", date: "Sun, 11 Oct 2026 19:09:42 +0000",
  html: "<span>Ya est&aacute; disponible tu <b>Factura de Octubre</b>. El valor de tus servicios este mes es <b>$42000.20</b> y su 1er vencimiento es el <b>21/10/2026</b>.</span>" };
const edenorNotice = { from: "Edenor <notificaciones@edenor.com>", subject: "Tu factura está disponible", date: "Wed, 11 Nov 2026 13:59:59 +0000",
  html: "<td>Te informamos que ya est&#225; disponible tu factura de la calle X 123, n&#250;mero de cuenta: 1234567, que vence el 24/11/2026. Acced&#233; desde edenordigital.</td>" };
const edenorReminder = { ...edenorNotice, subject: "Vencimiento de tu factura", html: "<p>Te informamos que el 22/10/2026 vence tu factura del domicilio en X y se encuentra disponible en edenordigital.</p>" };

describe("parseInvoiceEmail", () => {
  it("MetroGAS: monto y vencimiento del cuerpo", () =>
    expect(parseInvoiceEmail(metrogas)).toMatchObject({ kind: "invoice", provider: "metrogas", total_cents: 1500010, issue_date: "2026-10-13", due_date: "2026-10-30" }));
  it("AySA: trae el número de factura (sin separador de miles en el monto)", () =>
    expect(parseInvoiceEmail(aysa)).toMatchObject({ kind: "invoice", provider: "aysa", total_cents: 3000050, invoice_number: "0111B00000002", due_date: "2026-11-10", issue_date: "2026-10-20" }));
  it("IPLAN: monto con punto decimal y 1er vencimiento", () =>
    expect(parseInvoiceEmail(iplan)).toMatchObject({ kind: "invoice", provider: "iplan", total_cents: 4200020, due_date: "2026-10-21", issue_date: "2026-10-11" }));
  it("Edenor: el aviso no trae monto, así que no es una factura", () =>
    expect(parseInvoiceEmail(edenorNotice)).toEqual({ kind: "notice", provider: "edenor", due_date: "2026-11-24", account: "1234567" }));
  it("Edenor: el recordatorio de vencimiento se descarta (el segundo correo)", () =>
    expect(parseInvoiceEmail(edenorReminder)).toEqual({ kind: "reminder", provider: "edenor" }));
  it("remitente desconocido o formato roto -> ignorado", () => {
    expect(parseInvoiceEmail({ ...metrogas, from: "x@spam.com" })).toMatchObject({ kind: "ignored" });
    expect(parseInvoiceEmail({ ...metrogas, html: "<p>sin datos</p>" })).toMatchObject({ kind: "ignored" });
  });
});

describe("utilidades", () => {
  it("htmlToText decodifica entidades", () => expect(htmlToText("<b>est&aacute;</b>&nbsp;&#250;ltimo")).toBe("está último"));
  it("emailDate usa la hora de Argentina", () => expect(emailDate("Wed, 21 Oct 2026 1:03:26 +0200")).toBe("2026-10-20"));
});
