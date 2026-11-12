# Gastos compartidos

App web (PWA) para llevar gastos entre dos personas, estilo Splitwise/Splid. Moneda: ARS.
Acceso solo con Google y solo para los correos autorizados.

**Stack (todo en el plan gratuito de Cloudflare):** Cloudflare Workers + D1 (SQLite) + React/Vite. Un solo despliegue.

## Qué hace (MVP)
- Login con Google, restringido a una lista de correos.
- Gastos con categoría, fecha, quién pagó y división 50/50 (por defecto), préstamo 100%, o porcentaje libre.
- Saldo en vivo, devoluciones ("saldar"), historial con filtros por mes, categoría y persona.
- Categorías editables. Funciona en celular y computador, instalable como app.

## Desarrollo local
```bash
npm install
npm run db:migrate:local
npm run dev            # http://localhost:8787
```
Crea un archivo `.dev.vars` (no se sube a git):
```
GOOGLE_CLIENT_ID=dev
ALLOWED_EMAILS=tu@gmail.com,roomie@gmail.com
SESSION_SECRET=cualquier-cosa-larga
DEV_AUTH=1
```
Con `DEV_AUTH=1` aparece un login por correo solo para desarrollo. **Nunca** lo definas en producción.
Tests: `npm test` · Tipos: `npm run typecheck`.

## Despliegue (una sola vez)
1. **Cliente OAuth de Google** (gratis): en <https://console.cloud.google.com/apis/credentials> crea un proyecto → "Crear credenciales" → "ID de cliente de OAuth" → tipo *Aplicación web*.
   En *Orígenes de JavaScript autorizados* agrega la URL final (`https://super-splid.<tu-subdominio>.workers.dev`) y `http://localhost:8787`. Si te pide pantalla de consentimiento, elige *Externo* y agrega a los dos como usuarios de prueba (o publícala; solo usa el login básico).
2. `npx wrangler login`
3. `npx wrangler d1 create super-splid` y copia el `database_id` que imprime a `wrangler.jsonc`.
4. `npm run db:migrate:remote`
5. Secretos (cada comando pide el valor):
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put ALLOWED_EMAILS     # a@gmail.com,b@gmail.com
   npx wrangler secret put SESSION_SECRET     # ej: salida de `openssl rand -hex 32`
   ```
6. `npm run deploy`

Para actualizar después: `npm run deploy`. Si agregamos migraciones: `npm run db:migrate:remote` primero.

## Modelo de datos
Montos en centavos (enteros). `expenses` + `expense_splits` (cuánto consume cada uno) + `settlements` (devoluciones).
Saldo = pagado − consumido ± devoluciones; se calcula, no se guarda (`shared/balance.ts`).

## Roadmap
- Estadísticas por categoría, mes y persona.
- Lectura automática de facturas de servicios (parsers por proveedor sobre el texto del PDF) y, como respaldo, IA para boletas variadas.
- Ingreso de facturas por correo (Gmail dedicado + Apps Script).
