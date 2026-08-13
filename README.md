# Flow Console

Consola privada de ejecucion. Flow no es el cerebro editorial: ejecuta, publica, registra avisos, mide y envia aprendizajes al cerebro cuando corresponde.

## Acciones que ejecuta

### Sesion

- Inicia sesion con password privado.
- Cierra sesion.
- Comprueba si la consola esta configurada y disponible.

### Calendario

- Muestra tareas, publicaciones programadas, avisos de n8n y consejos enviados por Editorial Brain.
- Crea tareas puntuales.
- Crea tareas repetitivas semanales, quincenales, cada tres semanas o mensuales.
- Edita una tarea individual.
- Edita una serie de tareas.
- Marca tareas como hechas.
- Borra tareas individuales.
- Borra series completas.
- Abre la pantalla correcta segun la tarea: publicaciones, blog, foro, bandeja, estadisticas o workflow tecnico.
- Recibe senales internas desde Editorial Brain.
- Marca senales como gestionadas.
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
- Prepara/publica para LinkedIn segun modo configurado.
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
- Guarda URLs UTM/campanas.
- Copia URLs UTM generadas.
- Recupera campanas guardadas.
- Borra campanas guardadas.
- Comprueba si la API de Google Ads responde. No crea campanas.

### Cerebro editorial

- Consulta Editorial Brain antes de generar contenido si esta configurado.
- Envia uso de memoria al cerebro.
- Envia feedback de ediciones al cerebro.
- Envia publicaciones confirmadas al cerebro como aprendizaje.
- Analiza imagenes de publicaciones con vision cuando hay clave Gemini.
- Extrae aprendizaje visual: estilo, composicion, tono, presencia de producto y calidad.
- Envia aprendizajes visuales al cerebro.

### RAG local heredado

- Muestra estado del RAG.
- Lee memoria RAG local.
- Valora material nuevo.
- Ingresa material confirmado.
- Limpia memoria RAG local.
- Recibe inserciones internas de pgvector desde n8n.

## Acciones que no ejecuta

- No decide la identidad editorial permanente.
- No mantiene el libro de estilo vivo como fuente principal.
- No prepara campanas Ads completas; eso vive en Editorial Brain.
- No genera anuncios directamente dentro de Google Ads.
- No guarda secretos en el navegador.
