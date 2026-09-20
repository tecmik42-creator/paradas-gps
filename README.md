# Paradas GPS

Aplicación web progresiva (PWA) **móvil primero** para registrar eventos de trabajo con geolocalización: recogidas, entregas, traslados de personal y tareas hechas.

Pensada para conductores en España (ropa, alfombras, traslado de personal de limpieza). Los datos se guardan **solo en el dispositivo** (`localStorage`). No hace falta servidor ni cuenta.

**Zona horaria:** Europe/Madrid.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Página principal |
| `styles.css` | Estilos alto contraste |
| `app.js` | Lógica de la app |
| `manifest.json` | Manifiesto PWA |
| `sw.js` | Service worker (modo offline) |
| `icons/` | Iconos de instalación |

## Cómo abrirla en el móvil

### Opción A — Servidor local en el PC (prueba rápida)

Desde esta carpeta:

```bash
cd /workspace/paradas-gps
python3 -m http.server 8080
```

Luego abre en el navegador del PC: `http://localhost:8080`

Para probar en el **móvil**, el teléfono y el PC deben estar en la misma red Wi‑Fi. Sustituye `localhost` por la IP local del PC (ej. `http://192.168.1.20:8080`).

> **Importante:** la geolocalización en muchos navegadores **exige HTTPS** (o `localhost`). En HTTP plano por IP de red local, el GPS puede fallar o pedirse con restricciones.

### Opción B — HTTPS (recomendado para GPS real)

Sube la carpeta a cualquier hosting estático con HTTPS, por ejemplo:

- GitHub Pages, Netlify, Cloudflare Pages, Vercel, o un hosting propio con certificado.

Abre la URL `https://…` en el móvil.

### Por qué hace falta HTTPS para el GPS

Los navegadores modernos (Chrome, Safari, Firefox) solo permiten `navigator.geolocation` en contextos **seguros**:

- `https://…`
- `http://localhost` / `http://127.0.0.1`

Sin HTTPS, la app sigue funcionando: puedes **guardar sin GPS** o introducir latitud/longitud a mano.

## Añadir a la pantalla de inicio (instalar PWA)

### Android (Chrome)

1. Abre la app en Chrome por HTTPS.
2. Menú ⋮ → **Instalar aplicación** o **Añadir a la pantalla de inicio**.
3. Confirma. Aparecerá el icono «Paradas GPS».

### iPhone / iPad (Safari)

1. Abre la app en Safari por HTTPS.
2. Botón Compartir → **Añadir a la pantalla de inicio**.
3. Confirma el nombre y pulsa **Añadir**.

Una vez instalada, funciona a pantalla completa y puede usarse **sin conexión** para ver el historial y registrar eventos (el GPS solo si el sistema lo permite en ese momento).

## Cómo usar

1. Pulsa uno de los cuatro botones grandes:
   - **Recogida**
   - **Entrega**
   - **Traslado personal**
   - **Tarea hecha**
2. Se pide la ubicación de alta precisión. Mientras tanto (o después) puedes rellenar:
   - **Tipo de lugar** (recomendado): Comunidad / Piso / Casa / Oficina
   - **Nombre** (opcional) con autocompletado desde clientes en `localStorage` (`paradas-gps-clientes`)
   - **Equipo** (opcional, chips o texto libre en eventos de demo)
   - **Importe (€)** (opcional)
   - **Notas** (opcional)
   - **Dejar abierto** (marca si el ítem queda incompleto; estado `abierto`)
3. Si el GPS falla o deniegas el permiso:
   - Marca **Guardar sin GPS**, o
   - Introduce **latitud** y **longitud** manualmente.
4. Pulsa **Guardar**. Un nombre+tipo nuevo se guarda también en la base de clientes.
5. El historial muestra los eventos (más recientes arriba). Filtra **Hoy** o **Todos**.
6. En cada tarjeta: **Editar** (tipo/nombre/notas/coords) o **Borrar**.

## Exportar datos

- Botón **CSV**: descarga un archivo UTF‑8 **con BOM** (abre bien en Excel) con columnas:

  `fecha,hora,tipo,lat,lng,precision_m,comunidad_casa,cliente_tipo,notas,equipo,importe_eur,estado,maps_url`

  `maps_url` es un enlace a Google Maps con las coordenadas.

- Botón **JSON**: descarga todos los eventos en JSON.

Los tiempos de fecha/hora del CSV usan la zona **Europe/Madrid**.


## Día de referencia (demo)

La app incluye un **día de referencia real**: lunes **14 de septiembre de 2026** (Europe/Madrid), con traslados, recogidas, entregas y tareas en la zona Ribeira / A Pobra / Corrubedo (Galicia).

- Si el historial está vacío la primera vez, se **carga solo** ese día (~17 eventos).
- Botón **Cargar día de referencia**: vuelve a cargarlo (pide confirmación si ya hay datos).
- Botón **Vaciar historial**: borra todos los eventos del dispositivo.

Algunas coordenadas son Nominatim/OSM reales (Amarella 4, CEIP Aguiño, Corrubedo, O Campiño, Xarás, calles Rosalía / Monumento / Miguel Rodríguez Bautista, Coroso). Otras son **aproximaciones** en la misma zona (Caramicheiros, Comunidad 84, Coral, Eco Cabañas / Crocha de Poniente, Av. Coruña 70 Faro, salida 12:00) con offsets distintos para que `maps_url` siga funcionando. Detalle en las notas de cada evento.

Campos extra del modelo (opcionales): `cliente_tipo` (`comunidad` | `piso` | `casa` | `oficina`), `equipo`, `importe_eur`, `estado` (`cerrado` | `abierto`). El nombre del lugar sigue en `comunidad_casa` (compatibilidad CSV).

## Privacidad

- No hay backend ni envío a servidores.
- Todo queda en el almacenamiento del navegador de este dispositivo.
- Si borras los datos del sitio o desinstalas la PWA, se pierden los eventos (exporta antes si los necesitas).

## Requisitos técnicos

- Navegador moderno con JavaScript.
- Para GPS: permiso de ubicación + HTTPS (o localhost).
- Sin dependencias npm: HTML, CSS y JS vanila.

## Licencia

Uso libre para el conductor / equipo que la necesite.
