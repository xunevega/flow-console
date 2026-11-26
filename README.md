# Flow Console

Consola privada de ejecucion. Flow no es el cerebro editorial: ejecuta, publica, registra avisos, mide y envia aprendizajes al cerebro cuando corresponde.

## Acciones que ejecuta

### Sesion

- Inicia sesion con password privado.
- Cierra sesion.
- Comprueba si la consola esta configurada y disponible.

### Calendario

- Muestra tareas, publicaciones programadas, avisos de n8n y consejos del cerebro si los hay.
- Crea tareas puntuales.
- Crea tareas repetitivas semanales, quincenales, cada tres semanas o mensuales.
- Edita una tarea individual.
- Edita una serie de tareas.
- Marca tareas como hechas.
- Borra tareas individuales.
- Borra series completas.
- Abre la pantalla correcta segun la tarea: publicaciones, blog, foro, bandeja, estadisticas o workflow tecnico.
- Pide senales a Editorial Brain al sincronizar. Si no responde o no aporta, se ve y el calendario sigue.
- Recibe senales internas si Editorial Brain las empuja.
- Marca senales como gestionadas sin borrar titulo ni fecha.
- Ignora o borra senales del calendario.
- Prepara una publicacion desde una tarea de calendario.

### Libreta

- Crea notas de calendario.
- Edita notas.
- Borra notas.
- Sube imagenes asociadas a notas.
- Muestra notas por dia.

### Inbox / avisos

- Lee avisos generados desde ejecuciones reales de n8n.
- Agrupa avisos por entrada, hechos, archivados y papelera.
- Abre un aviso.
- Marca avisos como hechos.
- Archiva avisos.
- Manda avisos a papelera.
- Relanza el workflow asociado cuando esta permitido.
- Copia el cuerpo util de un aviso.
- Abre enlaces externos incluidos en el aviso.

### Foros

- Muestra una pantalla de foros/reputacion.
- Lista foros configurados.
- Muestra karma editorial y karma real cuando existe.
- Muestra abiertos, nuevos y total de avisos por foro.
- Abre la gestion de un foro concreto.
- Edita la configuracion de un foro.
- Anade nuevos foros.
- Relanza el workflow del foro si tiene webhook.
- Copia borradores de respuesta.
- Genera aviso de oportunidad promocional cuando el karma lo permite.
- Guarda karma real manual por foro.

### n8n / workflows

- Lista workflows de n8n.
- Muestra estado activo/inactivo.
- Activa workflows.
- Desactiva workflows.
- Ejecuta workflows permitidos mediante webhook privado.
- Reintenta ejecuciones fallidas.
- Muestra ultimas ejecuciones.
- Muestra detalle tecnico de ejecucion.
- Abre el workflow en n8n.
- Gestiona grupos visuales de workflows.

### Publicaciones

- Genera publicaciones usando el generador conectado a memoria/cerebro.
- Crea variantes de texto.
- Permite editar el resultado antes de usarlo.
- Aprende de diferencias entre texto generado y texto editado.
- Abre el editor de publicacion para un destino concreto.
- Crea destinos/canales de publicacion.
- Sube imagen o video para una publicacion.
- Analiza la imagen con ChatGPT al generar y en Publicaciones. Si falta `OPENAI_API_KEY` o falla, se ve.
- Genera imagen IA con ChatGPT. Si falta `OPENAI_API_KEY` o la API no devuelve archivo, se ve. El archivo entra en la biblioteca.
- Ajusta aspecto de imagen.
- Reposiciona imagen.
- Ejecuta preflight antes de publicar.
- Publica o prepara publicaciones segun el canal.
- Programa una publicacion con fecha y hora.
- Guarda publicaciones preparadas.
- Recupera el borrador local.
- Lista el historial reciente. No borra posts.
- Confirma publicaciones como publicadas.
- Elige un archivo de la biblioteca del destino.

### Canales de publicacion

- Publica en blog propio cuando esta configurado.
- Crea y edita articulos de blog.
- Adapta articulos de blog a LinkedIn.
- Publica posts en LinkedIn (hasta 3.000 caracteres, con imagen) por la API oficial
  si no hay worker externo. Necesita `LINKEDIN_CLIENT_ID` y `LINKEDIN_CLIENT_SECRET`
  (app de LinkedIn Developers con "Share on LinkedIn" y "Sign In with LinkedIn using
  OpenID Connect", URL de retorno `https://<dominio>/oauth/linkedin/callback`) y
  autorizar una vez con el boton CONECTAR LINKEDIN. El token se guarda en
  `DATA_DIRECTORY/linkedin-oauth.json` y dura 60 dias. Antes, sin worker, LinkedIn
  iba a n8n, que acusaba recibo sin publicar.
- Articulos de LinkedIn y textos de mas de 3.000 caracteres (la API no los admite) los
  publica el robot del Mac: Flow los deja en cola (`robot_queued`) y
  `robot-redes/robot.mjs --publicar` los recoge con `ESTADISTICAS_ROBOT_TOKEN`
  (`/api/publications/posts-robot/linkedin`), los escribe en «Escribir articulo» con el
  Chrome y la sesion de Roberto (titulo = primera linea, portada = la imagen) y avisa
  del resultado. `robot-redes/instalar-publicador.command` deja el Mac mirando la cola
  cada 10 minutos; `publicar-linkedin.command` lo lanza a mano. El robot busca el editor
  tambien dentro de shadow DOM e iframes (LinkedIn pinta asi parte de su interfaz) y
  sube la portada interceptando el selector de archivos. La portada sale a 1920 x 1080:
  apaisada se recorta al centro; cuadrada o vertical se encaja entera sobre fondo papel.
  Si falla antes de pulsar «Publicar» (no ha salido nada) vuelve a la cola sola hasta
  3 veces; si falla despues, o se corto a medias, vuelve a "a mano" con el motivo.
  Cada fallo deja `robot-redes/descargas/fallo-<id>.png` y `.json` (paso, botones y
  campos que veia) y Flow guarda ese resumen en `robotDiagnostico`.
- Las fotos se reducen en el navegador antes de subir: a 2048 px de lado en «Original»
  (los recortes 1:1, 4:5 y 16:9 ya salen a su tamano) y a 1600 px para el generador.
- Publica en Pinterest si la API esta configurada.
- Publica en YouTube si OAuth esta configurado.
- Prepara TikTok de forma asistida.
- Prepara Instagram de forma asistida o mediante worker externo.
- Sirve media subida para publicaciones.
- Guarda biblioteca de archivos por canal.

### Estadisticas

- Guarda datos mensuales por canal.
- Edita publicaciones, impresiones, interacciones y clics por canal.
- Importa datos de GA4 cuando OAuth esta configurado.
- Importa datos de Search Console cuando OAuth esta configurado.
- Resume totales mensuales.
- Muestra ranking de canales.
- Guarda URLs UTM.
- Copia URLs UTM generadas.
- Recupera enlaces UTM guardados.
- Borra enlaces UTM guardados.

### Cerebro editorial

El cerebro es el almacen de estilo. Flow no lo sustituye: le manda material, corrige pesos y le pide texto.

- Consulta el cerebro antes de generar si esta configurado y responde.
- Envia uso y ediciones como feedback. Si el registro falla, se ve.
- Envia publicaciones confirmadas como aprendizaje. Si no las recibe, la UI lo dice.

### RAG local heredado

- Muestra estado del RAG.
- Lee memoria RAG local.
- Valora material nuevo, incluida una imagen de estilo.
- Ingresa material confirmado.
- Limpia memoria RAG local.
- Recibe inserciones internas de pgvector desde n8n.

## Acciones que no ejecuta

- No es el cerebro ni decide la identidad editorial permanente. El estilo vive en el cerebro; Flow lo alimenta y lo corrige.
- No tiene pantalla Ads ni crea campañas de Google Ads.
- No guarda secretos en el navegador.
