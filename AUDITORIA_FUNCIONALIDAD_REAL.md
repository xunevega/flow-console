# Auditoria de funcionalidad real — Flow Console

Fecha: 2026-08-13  
Contrato: `CONTRATO_FUNCIONALIDAD_REAL.md`  
Alcance: codigo unificado en `~/flow-console` (`App.jsx`, `server.mjs`). No es una sesion autenticada en produccion. Solo este producto.

Estados:

- **OK** — hay dato, estado o accion real de punta a punta.
- **Parcial** — funciona con cobertura limitada; el fallo o el hueco se puede ver.
- **Regular** — funciona, pero se puede hacer mejor (y hay que decirlo).
- **Mal** — UI/docs/API parecen resolver y por dentro no cambia nada, o mienten.

Veredicto global: **parcial con incumplimientos A**. El bucle diario (calendario → publicar canal configurado → avisos) es real. El contrato se rompe donde hay pantalla muerta, boton a callejón o README que promete menu que no existe.

---

## Nav real vs docs

Nav cableada en `App`:

`Calendario · Libreta · Añadir · Corregir · Publicaciones · Avisos · Estadisticas · Ads`

| Doc | Lo que promete | Cumple contrato |
| --- | --- | --- |
| `README-OPERATIVO.md` | Añadir, Corregir, Ads, Avisos | **OK** en menu |
| `README-FUNCIONES.md` | Añadir, Corregir, Ads, Avisos | **OK** en menu y cuerpo |
| `README.md` | Search Console, estado Google Ads, borrar historial, vision OpenAI | **Mal** en esas lineas |

---

## Botones y pantallas (contrato)

### Sesion

| Control | Estado | Evidencia |
| --- | --- | --- |
| Entrar | OK si `configured()` | `POST /api/login` + cookie. |
| Entrar sin n8n | OK | `configured()` es password + secret. n8n aparte. |
| Salir | OK | `POST /api/logout` |
| Health produccion | OK | `/health` → `ok: true, configured: true` |

### Calendario

| Control | Estado | Evidencia |
| --- | --- | --- |
| Tarea puntual / repetitiva | OK | `POST/PATCH /api/calendar/tasks` y `/series` |
| Editar / borrar esta / borrar serie | OK | confirmacion `window.confirm` en serie |
| Hecho / Borrar en tarjeta | OK | cambia status o DELETE |
| Abrir destino (IG, blog…) | OK | `onOpenPublicationTarget` → editor |
| Abrir workflow | OK | `navigate("management")` |
| Abrir avisos | OK | `openInbox` |
| Abrir stats desde senal | OK | `onOpenStats` |
| Senales Brain | Parcial | `GET/PATCH /api/calendar/signals`. Vacias sin Brain. |
| Programar publicacion desde calendario | Parcial | Crea **tarea**, no un `action: "schedule"` en posts. El scheduler de posts no se alimenta desde aqui. |

`DELETE /api/calendar/tasks` (borrar todas) **no tiene boton**. API huerfana, no UI falsa. No es incumplimiento de pantalla.

`POST /api/calendar/tasks/:id/prepare-instagram` **sin caller en UI**. API huerfana.

### Libreta

| Control | Estado | Evidencia |
| --- | --- | --- |
| Crear / editar / borrar nota | OK | `/api/calendar/notes` |
| Subir foto | OK | `/api/calendar/notes/media` + `/media/notes` |

### Publicaciones

| Control | Estado | Evidencia |
| --- | --- | --- |
| Hub destinos | OK | `GET /api/publication-targets` + `channels/status` |
| Nuevo destino | OK | `POST /api/publication-targets` |
| Abrir Foros | OK | monta `ForumHub` |
| Generador embebido | Parcial | `POST /api/generator`. Brain vivo o n8n, nunca fingido. |
| Last 30 days | Parcial | `POST /api/claude/last30days` → webhook. Falla visible. |
| Subir media | OK | `POST /api/publications/media` |
| Diagnostico preflight | OK | `POST /api/publications/preflight`; bloquea publicar si `level=block` |
| Publicar | Parcial | `POST /api/publications/post` → worker / YouTube / Pinterest / blog / n8n |
| Guardar / recuperar borrador | OK | localStorage. Copy honesto: no entra en historial. |
| Programar | OK | Date picker + `submit("schedule")` + cron |
| Historial en esta pantalla | OK | Lista reciente. **No se borra historial ni blog.** |
| Confirmar publicado | OK | Botón en historial y en calendario |
| Biblioteca de archivos | OK | `GET /api/publications/library` para elegir archivo |
| Borrar articulo blog / posts | **Retirado** | Sin botón. Sin `DELETE` de blog ni de posts en `server.mjs`. |
| YouTube OAuth desde UI | OK | Preflight enlaza `/oauth/youtube/start` |

### Avisos

| Control | Estado | Evidencia |
| --- | --- | --- |
| Listar / abrir / archivar / papelera | OK | `GET/PATCH /api/notices` |
| Relanzar | Parcial | `POST /api/workflows/:id/run` solo si el workflow esta en `runnableWorkflows` |

### Automatizaciones (vista management)

| Control | Estado | Evidencia |
| --- | --- | --- |
| Lista + grupos | OK | `/api/workflows`, `/api/groups` |
| Activar / desactivar | OK | `POST /api/workflows/:id/:action` |
| Retry ejecucion | OK | `POST /api/executions/:id/retry` |
| Run | Parcial | mismo mapa fijo |
| Nav propia | Regular | No esta en la barra. Se abre desde calendario. Aceptable si los docs no prometen menu. |

### Estadisticas

| Control | Estado | Evidencia |
| --- | --- | --- |
| Guardar mes | OK | `PUT /api/stats/monthly` |
| Calendario anual | OK | estado local sobre entries |
| UTM crear / copiar / borrar | OK | `/api/stats/campaigns` |
| Importar GA4 | Parcial | `GET /api/stats/ga4`. Copy de error pide `/oauth/ga4/start`. |
| Grafica GA4 | Parcial | `Ga4TrafficChart` solo tras importar |
| Search Console | Parcial | Botón Importar. Error si no hay OAuth. |
| Google Ads status | Parcial | Ping real a la API. `live` solo si responde. |

### RAG / Ads (componentes)

| Pieza | Estado | Evidencia |
| --- | --- | --- |
| `RagEntryConsole` | Parcial | montado en AÑADIR. `/rag/valorar` + `/ingestar`. Sin cerebro: error visible. |
| `RagCorrectConsole` | Parcial | montado en CORREGIR. Lee memoria; borra ingesta con `/rag/memory/clean`. |
| `GoogleAdsWizard` | Parcial | montado en ADS. Brief local + status de credenciales. No crea campaña. No muestra CPA inventado. |
| Generator lee `/rag/memory` | Parcial | usa memoria si existe. |

---

## APIs huerfanas (backend sin UI)

No fingen pantalla, pero son cableado muerto de servidor:

| API | Notas |
| --- | --- |
| `GET /api/stats/google-search` | README la promete |
| `POST /api/calendar/tasks/:id/prepare-instagram` | sin boton |
| `GET/POST /api/publications/library` | sin boton |
| `POST /api/publications/posts/:id/confirm` | sin boton |
| `DELETE /api/calendar/tasks` (todas) | sin boton |
| `GET /api/oauth/youtube/url` `.../status` `pinterest/status` | status agregado en `channels/status`; URL OAuth no enlazada |

Internas (`/api/internal/*`) son para n8n/Brain. No son UI. OK.

---

## Docs que incumplen

- Menu Añadir / Corregir / Ads / Automatizaciones.
- «Programar publicacion», «Ver historial», «Reenviar», «Confirmar publicado», «Borrar historial» en Publicaciones.
- «Consulta Search Console».
- «Comprueba estado de conexion de Google Ads».
- «Analiza imagenes con vision cuando hay clave OpenAI» — el server usa Gemini, no OpenAI.

`README.md` acierta en: no genera anuncios dentro de Google Ads; no decide identidad editorial.

---

## Tests de contrato

No hay tests unitarios en este repo. El contrato no esta fijado por assert. Hueco.

---

## Prioridad A — deja de fingir

Hecho en este disco: Programar, README-FUNCIONES, historial, confirmar, biblioteca, login sin n8n, Search Console, ping Google Ads, cola de ejemplo retirada.

## Prioridad B — regular

1. Enlace a `/oauth/ga4/start` desde el error de import (la URL ya está en el mensaje).
2. Confirmacion destructiva al borrar todas las tareas.

## Prioridad C

3. No commitear `node_modules`.
4. Tests minimos de contrato.

---

## Que si pasa el contrato hoy

Con env puesto: login (sin exigir n8n), calendario, libreta, publicar/programar/confirmar un destino configurado, avisos, n8n desde calendario, stats + UTM, GA4 y Search Console si OAuth, Ads brief + ping API, generador si n8n/Brain.

Eso es la mesa de trabajo. Lo que no hace algo, no se deja.
