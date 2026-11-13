# Facturas por correo

Las facturas llegan a una **casilla de Gmail dedicada**, un script (dentro de esa casilla) las manda a la app,
y aparecen en el inicio como **📬 Facturas por confirmar**. Tú revisas y confirmas; nada se carga solo.

Tu correo personal **no se lee nunca**: el script vive en la casilla nueva y solo ve lo que haya ahí.
Los pasos 3 y 4 conviene hacerlos desde una computadora (una sola vez, ~10 minutos).

## 1. Crear la casilla
Crea un Gmail nuevo solo para facturas (por ejemplo `gastos.casa.xxxx@gmail.com`).

## 2. Clave de recepción (Cloudflare)
En el Worker → *Settings → **Runtime variables and secrets** → Production* → **Add variable**, tipo **Secret**:

| Nombre | Valor |
|---|---|
| `INGEST_TOKEN` | un texto aleatorio largo (en la consola del navegador: `crypto.randomUUID()`) |

Guárdalo; lo vas a pegar en el paso 3. Sin esta variable la app rechaza todo (503), y con una clave equivocada también (401).

## 3. El script (en la casilla nueva)
1. Con la sesión de la **casilla nueva**, abre <https://script.google.com> → *Nuevo proyecto*.
2. Borra el contenido y pega el de [`tools/gmail/facturas.gs`](../tools/gmail/facturas.gs).
3. *Configuración del proyecto* (engranaje) → *Propiedades de la secuencia de comandos* → agrega:
   `APP_URL` = la dirección de tu app (sin `/` al final) y `INGEST_TOKEN` = la misma clave del paso 2.
4. En el editor, elige la función **`instalar`** y pulsa *Ejecutar*. Google pedirá permisos
   (leer Gmail y conectarse a servicios externos). Si aparece "Google no ha verificado esta app":
   *Configuración avanzada → Ir a (proyecto)*. Es normal: el script es tuyo.

Desde ahí corre solo cada 10 minutos. Etiquetas que pone en la casilla: `facturas-ok` (procesado) y
`facturas-revisar` (lo reconocí pero no pude leer el monto; avísame para ajustar el lector).

## 4. Hacer llegar las facturas a la casilla nueva
**Opción A, filtro automático (recomendada).** En tu Gmail personal:
1. *Configuración → Ver todos los ajustes → Reenvío y correo POP/IMAP → Agregar una dirección de reenvío* y pon la casilla nueva.
   Google manda un código de confirmación a esa casilla: léelo allí y confírmalo.
2. *Filtros y direcciones bloqueadas → Crear un filtro nuevo*. En **De** pega:
   `facturadigital@metrogas.com.ar OR avisos@aysadigital.com.ar OR noreply@iplan.com.ar OR notificaciones@edenor.com`
3. *Crear filtro* → marca **Reenviar a** (la casilla nueva) → *Crear filtro*.

Solo se reenvían esos 4 remitentes. Si algún proveedor escribe desde otra dirección, agrégala al filtro.

**Opción B, a mano.** Reenvía el correo de la factura a la casilla nueva. El lector reconoce al proveedor por el
contenido. Una diferencia: la fecha que se usa es la del reenvío, no la original.

## 5. Probar
Reenvía una factura (o espera la próxima), y ejecuta `procesarFacturas` en el editor, o espera hasta 10 minutos.
Debe aparecer en el inicio de la app. El registro de ejecución (*Ejecuciones*) muestra el estado de cada correo.

## Qué pasa con cada proveedor
| Proveedor | Qué trae el correo | Resultado |
|---|---|---|
| MetroGAS | monto, emisión y vencimiento | factura por confirmar |
| AySA | monto, vencimiento y número de factura | factura por confirmar |
| IPLAN | monto y primer vencimiento | factura por confirmar |
| Edenor | solo avisos, sin monto | no crea nada: se carga subiendo el PDF |

Los correos repetidos (reenvíos, avisos duplicados, o una factura que ya cargaste por PDF) se descartan solos.

## Seguridad y privacidad
- El script solo envía correos que mencionan a uno de los 4 proveedores; el resto no sale de Gmail.
- La app guarda únicamente los datos extraídos (proveedor, monto, fechas, número), **no el correo**.
- La clave viaja por HTTPS y se compara en tiempo constante. Para rotarla, cambia el secreto en Cloudflare y la propiedad del script.
- Para apagarlo: borra el trigger en script.google.com (*Activadores*) o quita el filtro de reenvío.
