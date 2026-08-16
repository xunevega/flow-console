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
| Senales Editorial Brain | Funcional / parcial | `GET /api/calendar/signals` pide al cerebro; `PATCH` conserva el contenido; push interno sigue | Si Brain esta vivo, la consola tira senales. Vacio tras un pull es honesto. Si Brain no responde, se ve el error y el calendario sigue con tareas/publicaciones. Hecho/Borrar ya no borra titulo ni fecha. |
| Borrar todas las tareas | Funcional y peligroso | `DELETE /api/calendar/tasks` | Accion real. Mejorable: confirmacion destructiva clara. |

### Libreta

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Notas + fotos | Funcional | `/api/calendar/notes`, `/media/notes` | Persistencia en disco. |

### Publicaciones

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Hub de destinos | Funcional | `InstagramPublisher` + `/api/publication-targets` | Abrir destino entra al editor. |
| Generador embebido | Funcional / parcial | `POST /api/generator` | Cerebro si escribe. Si no, n8n o ChatGPT (`OPENAI_API_KEY`), siempre con la fuente dicha. Sin los tres, error visible. |
| Visión ChatGPT | Funcional / parcial | `POST /api/publications/vision` + análisis al generar | ChatGPT. Si falta clave o falla, el error se ve. |
| Imagen IA | Funcional / parcial | `POST /api/publications/generate-image` | ChatGPT (`OPENAI_API_KEY`, Images API). Si falta la clave o la API no devuelve archivo, el error se ve. El archivo entra en biblioteca. |
| Instagram | Parcial | worker externo o webhook n8n | Depende de worker o n8n. Programar desde Calendario crea el post. Preflight lo dice. |
| LinkedIn | Parcial | worker externo o n8n | Igual. |
| YouTube | Parcial | YouTube API directa | Solo si OAuth esta configurado. Preflight lo dice y enlaza `/oauth/youtube/start`. |
| Pinterest | Parcial | Pinterest API | Token + board. Preflight lo dice. |
| Blog crear/editar | Parcial | `/api/blog/articles` + `articulos.php` | Publicar/editar si hay token. **No hay borrado.** |
| TikTok | Parcial | worker `draft` / `publish` | «Preparar para revisar» es honesto. «Intentar publicar» depende del worker. |
| Foros desde Publicaciones | Funcional | `ForumHub` montado | Gestiona avisos/karma de workflows de foro. |
| Historial / confirmar / programar | Funcional | posts en `data/` + cron | Crear destino en Calendario crea `action: schedule` en posts. Hay date picker y PROGRAMAR. El cron publica cuando toca. |
| Destino sin webhook | Parcial | boton «CONFIGURA ENTREGA» | No finge publicar. Bien. |

### Avisos / bandeja

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Listar, archivar, papelera, relanzar | Funcional | `/api/notices`, `/api/workflows/:id/run` | Relanzar solo si hay webhook permitido. |

### Automatizaciones (n8n)

| Pieza | Estado | Evidencia | Nota honesta |
| --- | --- | --- | --- |
| Listar, activar, desactivar, retry, detalle | Funcional | APIs n8n | No hay item de nav. Se abre desde Calendario. Eso esta bien si se mantiene. |
| Ejecutar workflow | Funcional / parcial | webhook del workflow o mapa fijo | Si el workflow tiene nodo webhook, se puede lanzar. Si no, se ve. |

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
| Añadir (`RagEntryConsole`) | Funcional / parcial | montado en nav `add` | Cerebro si está vivo; si no, ChatGPT o memoria local. El hueco se ve. |
| Corregir (`RagCorrectConsole`) | Funcional / parcial | montado en nav `correct` | Sube, baja, quita y renombra. Si el cerebro no acepta, se ve; la memoria local sigue. |
| Generador usa memoria | Funcional / parcial | `POST /api/generator` | Cerebro, memoria local o ChatGPT. Consulta vacía no cuenta. n8n recibe instrucción; no se afirma que la usara. |

---

## Cableado muerto (mal)

Ninguno de los tres que había: la cola de ejemplo y `data/posts.json` se retiraron. README-FUNCIONES sigue la nav de `App.jsx`.

## Acoples y regular

- Publicar Instagram/LinkedIn/TikTok depende de worker o n8n: parcial, y el preflight lo dice. Bien.
- GitHub `main` metio `node_modules` en el repo: mal de higiene. No forma parte del producto.

## Que si es real hoy (si hay env)

Sesion (sin exigir n8n), calendario (pide senales al cerebro si esta configurado), libreta, añadir/corregir el almacén de estilo (si Brain/n8n RAG; imagen de estilo con ChatGPT si hay `OPENAI_API_KEY`), publicaciones (publicar, programar, confirmar; el aprendizaje se ve si llega o si falla; visión e imagen IA con ChatGPT si hay `OPENAI_API_KEY`), avisos, n8n desde calendario, stats manuales + UTM, GA4 y Search Console si OAuth, generador si n8n/Brain/ChatGPT (sin fingir que n8n uso la memoria; texto listo por canal). No hay pantalla Ads.

## Orden de endurecimiento

Prioridad B — regular / mejorable:

1. No volver a commitear `node_modules`.
2. Confirmacion destructiva mas clara al borrar todas las tareas.

Este contrato manda sobre README y sobre copias divergentes. Si una pantalla no cumple, se arregla o se retira. No se deja «por si acaso».
