# Flow Console: funciones

## Menu principal

```text
Flow Console
├─ Calendario
├─ Libreta
├─ Añadir
├─ Corregir
├─ Publicaciones
├─ Avisos
└─ Estadísticas
```

## Calendario

- Ver publicaciones, tareas y señales por día.
- Pedir señales al cerebro al sincronizar. Si no hay o no responde, el calendario sigue y se ve.
- Crear tareas puntuales o repetitivas.
- Editar una tarea.
- Editar una serie completa.
- Borrar una tarea.
- Borrar una serie.
- Confirmar una publicación pendiente (no borra el post).
- Crear repeticiones semanales, cada 2 semanas, cada 3 semanas o mensuales.
- Usar hora local por defecto.
- Ver contador de acciones por día.
- Abrir Publicaciones desde una programación.
- Abrir Avisos desde una señal.
- Abrir workflows de n8n desde una tarea.

### Libreta de notas

- Añadir notas por día.
- Editar notas.
- Ocultar o desplegar notas.
- Subir fotos en una nota.
- Ver notas sin descontrolar el tamaño del calendario.

## Avisos

- Revisar avisos y salidas de automatizaciones.
- Leer mensajes generados por n8n.
- Abrir enlaces o formularios.
- Archivar avisos.
- Mandar avisos a papelera.
- Restaurar avisos.
- Reintentar acciones cuando esté disponible.

## Añadir

- Enviar material de estilo al cerebro.
- Pegar texto, ideas o referencias.
- Subir texto, PDF o imagen de estilo (ChatGPT analiza la imagen si hay `OPENAI_API_KEY`; si no, se ve).
- Clasificar material por tipo.
- Valorar utilidad.
- Definir tags, temas y estilo.
- Confirmar ingesta. El cerebro lo guarda; Flow no es el cerebro.

## Corregir

- Revisar el estilo que el cerebro ya tiene.
- Subir o bajar peso.
- Renombrar un criterio.
- Quitar ruido.
- Retirar ingestas que no deban pesar.

## Publicaciones

- Preparar contenido para canales.
- Elegir destino. Si eliges un canal, se crea también la publicación programada.
- Editar texto de publicación.
- Editar texto de publicación.
- Añadir imagen o vídeo.
- Analizar la imagen con ChatGPT al abrirla. Si falta `OPENAI_API_KEY` o falla, se ve.
- Generar imagen IA con ChatGPT. Si falta `OPENAI_API_KEY` o la API no devuelve archivo, se ve. El archivo entra en la biblioteca.
- Guardar borrador local (no es el historial de posts).
- Programar publicación (fecha/hora + cron del servidor).
- Publicar o entregar a n8n / API del canal.
- Revisar diagnóstico antes de publicar.
- Ver historial reciente. No se borra. Si una pieza se aprendió o no, se ve.
- Recuperar el borrador local.
- Confirmar publicado cuando la entrega quedó pendiente. Si el cerebro no recibe el aprendizaje, se dice.
- Elegir un archivo de la biblioteca del destino.

### Destinos

- Instagram.
- YouTube.
- LinkedIn.
- TikTok.
- Pinterest.
- Blog.

### Generador de texto

- Generar captions listos para el canal.
- Adaptar texto por canal.
- Generar hashtags del estilo guardado y del texto.
- Usar el estilo del cerebro si aporta.
- Si el cerebro no escribe, generar con n8n o ChatGPT y decirlo.
- Analizar la imagen adjunta con ChatGPT antes de escribir. Si no hay visión, se dice.
- Mostrar si el cerebro escribió, si se envió instrucción a n8n, y si el uso se registró.
- Mandar resultado a Publicaciones.

## Estadísticas

- Registrar rendimiento mensual por canal.
- Guardar publicaciones.
- Guardar impresiones.
- Guardar interacciones.
- Guardar clics.
- Añadir canales.
- Importar datos de GA4.
- Importar datos de Search Console.
- Ver usuarios activos de GA4.
- Ver sesiones con interacción.
- Ver calendario anual de rendimiento.
- Ver gráficas de evolución.

### Campaign URL Builder

- Crear URLs con UTMs para GA4.
- Definir nombre de campaña.
- Definir URL base.
- Definir source.
- Definir medium.
- Definir campaign.
- Definir content.
- Definir term.
- Generar URL.
- Guardar campaña.
- Copiar URL.
- Recuperar campaña guardada.
- Copiar campaña guardada.
- Borrar campaña guardada.

## Automatizaciones

No hay ítem de menú. Se abren desde Calendario cuando una tarea lo pide.

- Ver workflows de n8n.
- Ver grupos de workflows.
- Crear grupos.
- Editar grupos.
- Asignar workflows a grupos.
- Ver detalle de workflow.
- Ver ejecuciones.
- Revisar errores.
- Refrescar estado.
- Lanzar workflows permitidos.

## Botones globales

- Atrás: vuelve a la pantalla anterior.
- Sync: recarga la vista actual.
- Salir: cierra la sesión.

## Resumen rápido

```text
Calendario = agenda y notas
Avisos = entradas del sistema
Añadir = estilo nuevo al cerebro
Corregir = ajustar el estilo ya aprendido
Publicaciones = crear, programar y publicar
Estadísticas = rendimiento, GA4, Search Console y UTMs
```
