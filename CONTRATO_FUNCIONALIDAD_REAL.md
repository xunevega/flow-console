# Contrato de funcionalidad real — Flow Console

## Proposito

Regla de producto:

> Solo cuenta lo que hace algo de verdad: dato, estado o accion. Si no funciona, esta mal. Si funciona y se puede hacer mejor, se dice. Ningun cableado puede llevar a ningun sitio.

No se trata de recortar la consola. Se trata de no mentir con pantallas, botones, docs **ni auditoria** que parecen resolver o nombrar algo cuando por dentro no es eso.

Este contrato es Flow Console. Un texto de menú no es otro producto. Hablar de esta pantalla como si fuera otra app, o usar otra app como vara, incumple el contrato igual que un README que promete un menu que no existe.

## Apuntado — no borrar publicaciones ni blog

Flow Console no borra publicaciones ni artículos de blog. No hay botón. No hay `DELETE /api/blog/articles`. No hay `DELETE /api/publications/posts`. El PHP de hosting sigue rechazando DELETE (405) por si alguien llama fuera de esta consola.

## Estados permitidos

Toda pieza visible debe estar en uno de estos tres:

1. **Funcional** — usa datos reales, estado real o ejecuta una accion real.
2. **Parcial** — funciona con cobertura limitada y lo explica (o se puede ver el fallo).
3. **No disponible** — bloqueada, pendiente o ausente. No se finge el resultado.

No existe un cuarto estado donde la UI parece resolver y por dentro no pasa nada. Eso esta **mal**.

## Que cuenta como real

Cuenta si cumple al menos una:

- Recupera datos de una fuente declarada: n8n, GA4, Search Console, YouTube, Pinterest, blog API, RAG/pgvector, Editorial Brain, ficheros en `data/`.
- Modifica estado observable: sesion, tareas, notas, destinos, historial, preferencias, cache.
- Ejecuta una accion verificable: login, publicar, programar, activar workflow, copiar URL.

No cuenta si solo:

- Existe el componente pero nadie lo monta.
- El boton llama a un API que el destino ha desactivado.
- El README promete un menu que la nav no tiene.
- Un numero (CPA, leads) se presenta como hecho sin fuente.
- Un nombre de menu se trata como si fuera otro producto, o se audita contra codigo que no esta en este repo.
- Hay URL/token de Editorial Brain (u otra conexión) pero la llamada no cambia el resultado, o n8n se presenta como si fuera el cerebro.

Auditoria de codigo en `~/flow-console`, 2026-08-13. No es una sesion autenticada en produccion: es el cableado real del repo.

Alcance: este repo. Flow Console es calendario, libreta, publicaciones y avisos. Lo que no esta en esa consola no se audita como si lo estuviera.

---

## Contrato por pantalla

### Login / sesion

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Password + cookie HttpOnly | Funcional | `POST /api/login`, `GET /api/session` | 12 h, Secure en produccion. |
| Health | Funcional | `/health` | `ok` + `configured` (password) + `n8n`. |
| Entrar sin n8n | Funcional | `configured()` exige password + `SESSION_SECRET` | n8n ya no bloquea el login. Calendario y libreta entran. Sin n8n, avisos/workflows fallan a la vista. |

### Calendario

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Tareas CRUD + series | Funcional | `/api/calendar/tasks` | Puntual y repetitiva. |
| Abrir destino / workflow / avisos / stats | Funcional | `onOpenPublicationTarget`, `onOpenWorkflow`, `onOpenInbox`, `onOpenStats` | El boton hace algo. |
| Notas del dia (en calendario) | Funcional | mismas APIs que Libreta | |
| Senales Editorial Brain | Parcial | `/api/internal/calendar/signals` | Solo si Brain esta configurado. Sin Brain, el calendario sigue con tareas/publicaciones. |
| Borrar todas las tareas | Funcional y peligroso | `DELETE /api/calendar/tasks` | Accion real. Mejorable: confirmacion destructiva clara. |

### Libreta

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Notas + fotos | Funcional | `/api/calendar/notes`, `/media/notes` | Persistencia en disco. |

### Publicaciones

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Hub de destinos | Funcional | `InstagramPublisher` + `/api/publication-targets` | Abrir destino entra al editor. |
| Generador embebido | Funcional / parcial | `POST /api/generator` | Si Brain está vivo: escribe texto o orienta n8n con memoria/instrucción real. Si Brain no aporta nada, error visible (no se finge). Sin Brain, n8n genera y se etiqueta como n8n. `GET /api/generator/status` hace ping real, no solo env vars. |
| Instagram | Parcial | worker externo o webhook n8n | Depende de `PUBLICATION_EXTERNAL_WORKER_URL` o n8n. El copy avisa skipMeta. |
| LinkedIn | Parcial | worker externo o n8n | Igual. |
| YouTube | Parcial | YouTube API directa | Solo si OAuth esta configurado. Preflight lo dice y enlaza `/oauth/youtube/start`. |
| Pinterest | Parcial | Pinterest API | Token + board. Preflight lo dice. |
| Blog crear/editar | Parcial | `/api/blog/articles` + `articulos.php` | Publicar/editar si hay token. **No hay borrado.** |
| TikTok | Parcial | worker `draft` / `publish` | «Preparar para revisar» es honesto. «Intentar publicar» depende del worker. |
| Foros desde Publicaciones | Funcional | `ForumHub` montado | Gestiona avisos/karma de workflows de foro. |
| Historial / confirmar / programar | Funcional | posts en `data/` + cron `processScheduledPublicationPosts` | Hay date picker y botón PROGRAMAR. Confirmar publicado está en calendario e historial. No hay DELETE de posts. |
| Destino sin webhook | Parcial | boton «CONFIGURA ENTREGA» | No finge publicar. Bien. |

### Avisos / bandeja

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Listar, archivar, papelera, relanzar | Funcional | `/api/notices`, `/api/workflows/:id/run` | Relanzar solo si hay webhook permitido. |

### Automatizaciones (n8n)

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Listar, activar, desactivar, retry, detalle | Funcional | APIs n8n | No hay item de nav. Se abre desde Calendario. Eso esta bien si se mantiene. |
| Ejecutar workflow | Parcial | `runnableWorkflows` mapa fijo | Solo IDs/nombres mapeados. El resto no se puede lanzar desde consola. Debe verse, no fingirse. |

### Estadisticas

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Guardar mes a mano | Funcional | `PUT /api/stats/monthly` | Registro propio. |
| Campanas UTM | Funcional | `/api/stats/campaigns` | Genera URL, copia, borra. |
| Importar GA4 | Parcial | `GET /api/stats/ga4` | Real si OAuth GA4 esta. Si no, error. |
| Search Console | Parcial | `GET /api/stats/google-search` + botón en Estadísticas | Real si OAuth está. Si no, error visible. |
| Graficos GA4 | Parcial | `Ga4TrafficChart` | Solo tras importar. Copy lo dice. |

### RAG / Añadir / Corregir

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| APIs valorar / ingestar / memory | Funcional (backend) | `/api/rag/*` | Brain si está vivo; si no, n8n + pgvector. El badge no llama cerebro a n8n. |
| Añadir (`RagEntryConsole`) | Funcional / parcial | montado en nav `add` | Valora e ingesta en Brain o n8n RAG. Sin conexión viva, lo dice. |
| Corregir (`RagCorrectConsole`) | Funcional / parcial | montado en nav `correct` | Lee memoria real y borra ingestas. |
| Generador usa memoria | Parcial | `POST /api/generator` + status ping | Solo si Brain aporta o hay memoria local usable. Consulta vacía no cuenta. |

### Ads

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| `GET /api/google-ads/status` | Parcial | ping a la API (`googleAds:search`) | `live` solo si Google Ads responde. Variables solas no cuentan. |
| `GoogleAdsWizard` | Parcial | montado en nav `ads` | Brief + señales de stats/UTM. No crea campañas. No presenta CPA/leads inventados. |

---

## Cableado muerto (mal)

Ninguno de los tres que había: la cola de ejemplo y `data/posts.json` se retiraron. README-FUNCIONES sigue la nav de `App.jsx`.

## Acoples y regular

- Publicar Instagram/LinkedIn/TikTok depende de worker o n8n: parcial, y el preflight lo dice. Bien.
- GitHub `main` metio `node_modules` en el repo: mal de higiene. No forma parte del producto.

## Que si es real hoy (si hay env)

Sesion (sin exigir n8n), calendario, libreta, añadir/corregir memoria (si Brain/n8n RAG), publicaciones (publicar, programar, confirmar, biblioteca), avisos, n8n desde calendario, stats manuales + UTM, GA4 y Search Console si OAuth, Ads como brief local + ping real a Google Ads, generador si n8n/Brain.

## Orden de endurecimiento

Prioridad B — regular / mejorable:

1. No volver a commitear `node_modules`.
2. Confirmacion destructiva mas clara al borrar todas las tareas.

Este contrato manda sobre README y sobre copias divergentes. Si una pantalla no cumple, se arregla o se retira. No se deja «por si acaso».
