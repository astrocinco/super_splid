/**
 * Envía a la app de gastos las facturas que llegan a ESTA casilla de Gmail.
 *
 * IMPORTANTE: este script se instala SOLO en la casilla dedicada a facturas,
 * nunca en tu correo personal. Solo puede leer lo que haya en la casilla donde lo autorices.
 *
 * Configuración (en "Configuración del proyecto" > "Propiedades de la secuencia de comandos"):
 *   APP_URL      = https://tu-app.workers.dev        (sin barra final)
 *   INGEST_TOKEN = la misma clave que cargaste como secreto en Cloudflare
 *
 * Uso: ejecuta una vez la función "instalar". Después corre sola cada 10 minutos.
 */

const ETIQUETA_OK = "facturas-ok";           // procesado (o no era una factura)
const ETIQUETA_REVISAR = "facturas-revisar"; // lo reconocí pero no pude leer el monto: míralo a mano
const PROVEEDORES = /metrogas|aysa|iplan|edenor/i;

function procesarFacturas() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty("APP_URL") || "").replace(/\/+$/, "");
  const token = props.getProperty("INGEST_TOKEN");
  if (!base || !token) throw new Error("Faltan APP_URL o INGEST_TOKEN en las propiedades del script.");

  const ok = etiqueta_(ETIQUETA_OK);
  const revisar = etiqueta_(ETIQUETA_REVISAR);
  const hilos = GmailApp.search("in:inbox newer_than:60d -label:" + ETIQUETA_OK + " -label:" + ETIQUETA_REVISAR, 0, 25);

  hilos.forEach(function (hilo) {
    let ilegible = false;
    let fallo = false;

    hilo.getMessages().forEach(function (m) {
      const html = m.getBody();
      // Privacidad: un correo que no menciona a ninguno de los 4 proveedores no sale de Gmail.
      if (!PROVEEDORES.test(m.getFrom() + " " + m.getSubject() + " " + html)) return;

      const resp = UrlFetchApp.fetch(base + "/api/ingest", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + token },
        muteHttpExceptions: true,
        payload: JSON.stringify({
          message_id: m.getId(),
          from: m.getFrom(),
          subject: m.getSubject(),
          date: m.getDate().toUTCString(),
          html: html,
        }),
      });
      const code = resp.getResponseCode();
      if (code === 401) throw new Error("La app rechazó la clave (401). Revisa INGEST_TOKEN.");
      if (code !== 200) { Logger.log("Falló " + code + ": " + resp.getContentText().slice(0, 200)); fallo = true; return; }
      const r = JSON.parse(resp.getContentText());
      Logger.log(m.getSubject().slice(0, 50) + " -> " + r.status);
      if (r.status === "unreadable") ilegible = true;
    });

    if (fallo) return; // sin etiqueta: se reintenta en la próxima pasada
    hilo.addLabel(ilegible ? revisar : ok);
  });
}

/** Ejecútala una sola vez: deja el trigger de cada 10 minutos. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("procesarFacturas").timeBased().everyMinutes(10).create();
  procesarFacturas();
}

function etiqueta_(nombre) {
  return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre);
}
