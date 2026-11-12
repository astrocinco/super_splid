# Gastos compartidos

App web (PWA) para llevar gastos entre dos personas, estilo Splitwise/Splid. Moneda: ARS.
Acceso solo con Google y solo para los correos autorizados.

**Stack (todo en el plan gratuito de Cloudflare):** Cloudflare Workers + D1 (SQLite) + React/Vite. Un solo despliegue.

## Qué hace (MVP)
- Login con Google, restringido a una lista de correos.
- Gastos con categoría, fecha, quién pagó y división 50/50 (por defecto), préstamo 100%, o porcentaje libre.
- Saldo en vivo, devoluciones ("saldar"), historial con filtros por mes, categoría y persona.
- Categorías editables. Funciona en celular y computador, instalable como app.

## Despliegue (todo desde el navegador, sin correr nada local)
Cloudflare Workers Builds construye y despliega automáticamente cada push a la rama de producción (`main`).

1. **Cliente OAuth de Google** (gratis): tipo *Aplicación web*, con la URL del Worker como origen de JavaScript autorizado.
2. **Base de datos:** en <https://dash.cloudflare.com> → *Storage & databases → D1 → Create database*, nombre `super-splid`. Copia su ID a `wrangler.jsonc` (`database_id`).
3. **Worker:** *Workers & Pages → Create → Import a repository* → elige este repo y la rama `main`. Nombre: `super-splid`.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler d1 migrations apply super-splid --remote && npx wrangler deploy`
4. **Secretos:** en el Worker → *Settings → Variables and secrets* agrega (tipo *Secret*): `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS` (`a@gmail.com,b@gmail.com`) y `SESSION_SECRET` (cualquier texto aleatorio largo).
5. Agrega la URL `https://super-splid.<subdominio>.workers.dev` a los orígenes autorizados del cliente OAuth de Google.

Cada cambio nuevo en `main` se despliega solo, y las migraciones nuevas se aplican en ese mismo paso.

## Desarrollo local (opcional)
```bash
npm install && npm run db:migrate:local && npm run dev   # http://localhost:8787
```
Requiere un `.dev.vars` con `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS`, `SESSION_SECRET` y `DEV_AUTH=1` (login de desarrollo; nunca en producción).
Tests: `npm test` · Tipos: `npm run typecheck`.

## Modelo de datos
Montos en centavos (enteros). `expenses` + `expense_splits` (cuánto consume cada uno) + `settlements` (devoluciones).
Saldo = pagado − consumido ± devoluciones; se calcula, no se guarda (`shared/balance.ts`).

## Roadmap
- Estadísticas por categoría, mes y persona.
- Lectura automática de facturas de servicios (parsers por proveedor sobre el texto del PDF) y, como respaldo, IA para boletas variadas.
- Ingreso de facturas por correo (Gmail dedicado + Apps Script).
