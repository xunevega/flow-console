# Flow completo de Flow Console

Este documento describe el recorrido real de la app por apartados. No es una lista de ideas futuras: es para entender como se usa Flow Console de principio a fin.

## 1. Entrada

```text
Abrir Flow Console
-> Login
-> Calendario
```

Flow Console se abre con sesion privada. Si la sesion no existe, pide clave. Una vez dentro, carga calendario, publicaciones, avisos y memoria editorial segun la pantalla. n8n solo si esta configurado.

## 2. Calendario

```text
Calendario
-> ver el dia
-> ver publicaciones, tareas y señales
-> abrir detalle
-> actuar: editar, marcar pendiente, gestionar, ignorar o abrir avisos
```

El Calendario es el centro diario. Sirve para ver lo que paso o lo que toca hacer en una fecha concreta.

En Calendario aparecen:

- publicaciones publicadas, pendientes o programadas
- tareas manuales
- programaciones repetidas: cada semana, cada 2 semanas, cada 3 semanas o cada mes
- señales del dia que vienen de automatizaciones o avisos
- accesos para abrir Avisos o Publicaciones cuando toca actuar

No es una pantalla de configuracion. Es la agenda operativa.

## 3. Avisos

```text
Avisos
-> revisar avisos de automatizaciones
-> leer el contenido limpio
-> abrir enlaces o formularios
-> archivar, restaurar, papelera o reintentar si aplica
```

Avisos sirve para recibir salidas de workflows: avisos, borradores, errores, enlaces, formularios o resultados que necesitan revision humana.

Lo importante de Avisos es que centraliza lo que llega del sistema. Si algo falla o genera una senal, aqui es donde se revisa.

## 4. Añadir

```text
Añadir
-> meter texto, archivo, URL o idea
-> valorar con RAG
-> revisar metadatos
-> confirmar ingesta
-> queda como linea editorial para futuras generaciones
```

Añadir es la entrada de conocimiento nuevo. Sirve para meter cosas que Flow Console todavia no sabe y convertirlas en memoria editorial.

Flujo normal:

1. Pegas material o subes archivo.
2. Flow Console lo valora.
3. Editas titulo, proyecto, utilidad, tags, temas, estilo o chunking.
4. Confirmas.
5. El contenido queda guardado como memoria para generar mejor.

Añadir no publica y no limpia memoria antigua. Añadir enseña cosas nuevas.

## 5. Publicaciones

```text
Publicaciones
-> elegir canal o generador
-> preparar texto, imagen o video
-> diagnostico previo
-> publicar, preparar, programar o confirmar
-> ver historial (sin borrar posts)
```

Publicaciones es la salida real de contenido. Aqui se decide canal, formato, modo y accion.

Canales actuales:

- Instagram: publicacion por worker.
- LinkedIn: publicacion por worker. Incluye articulos con formato e imagen.
- YouTube: subida por API directa.
- Blog: publicacion por API.
- TikTok: asistido; prepara para revisar.
- Pinterest: publicacion por API si hay token y board.

La pantalla distingue entre:

- publicar
- preparar para revisar
- subir privado/publico segun canal
- guardar borrador
- programar

El diagnostico previo avisa antes de publicar si falta video, imagen, sesion o credencial.

## 6. Generador de texto dentro de Publicaciones

```text
Publicaciones
-> Generador de texto
-> meter objetivo, tono, formato e instrucciones
-> usa memoria/RAG
-> devuelve texto y hashtags
-> usar en Publicaciones
```

El Generador no publica. Solo crea texto y hashtags. Despues puedes llevar ese resultado a Publicaciones y elegir canal.

Fuentes que usa:

- lo que escribes en el formulario
- material pegado o contexto
- memoria editorial/RAG
- aprendizajes de publicaciones buenas

## 7. Automatizaciones

No hay item de menu. Se abren desde Calendario.

```text
Calendario
-> tarea de workflow
-> ver workflows de n8n
-> ver estado activo/inactivo
-> ver ejecuciones recientes
-> activar/desactivar
-> reintentar errores
-> abrir n8n
```

Si algo falla en una automatizacion, se revisa aqui o desde Avisos/Calendario si ha generado una senal.

## 8. Estadisticas

```text
Estadisticas
-> elegir mes y año
-> registrar canales
-> guardar publicaciones, impresiones, interacciones y clics
-> revisar calendario anual
-> ver graficas de linea
```

Estadisticas sirve para medir el rendimiento mensual del contenido. Es un registro propio de Flow Console: permite guardar datos por canal y ver la evolucion del año.

Usalo para:

- anotar clics hacia la web o hacia otra red propia
- comparar YouTube, Pinterest, LinkedIn u otros canales
- revisar meses fuertes y meses flojos
- ver tendencias de impresiones, interacciones y clics

Los datos son editables. GA4 y Search Console se importan con boton si OAuth esta.

## 9. Corregir

```text
Corregir
-> ver memoria de creacion
-> subir/bajar/eliminar pesos editoriales
-> limpiar linea editorial
```

Corregir es mantenimiento de conocimiento existente. No mete material nuevo: corrige lo que ya esta guardado.

Aqui puedes ajustar:

- marco conceptual
- posiciones
- influencias
- estilo
- temas
- tags
- preferencias de prompt

Frontera practica:

```text
Añadir = meter cosas nuevas
Corregir = corregir lo que ya hay
```

Si algo esta ensuciando la linea editorial, se baja o se elimina.

## 10. Flujo editorial completo

```text
Idea o material
-> Añadir
-> se guarda como memoria editorial
-> Generador crea texto
-> Publicaciones prepara canal/formato
-> diagnostico previo
-> publicar/preparar/programar
-> Calendario registra actividad
-> publicacion buena alimenta la memoria editorial
```

Este es el flujo ideal para contenido:

1. Meter conocimiento nuevo en Añadir.
2. Generar contenido con ese criterio.
3. Revisar texto y hashtags.
4. Elegir canal en Publicaciones.
5. Publicar o preparar segun canal.
6. Revisar resultado en Calendario/Publicaciones.
7. Usar lo bueno como aprendizaje para futuras piezas.
8. Registrar rendimiento mensual en Estadisticas.

## 11. Donde mirar cada cosa

```text
Que tengo hoy que hacer?
-> Calendario

Que aviso o error ha llegado?
-> Avisos

Como esta o que paso en n8n?
-> Calendario (abrir el workflow de la tarea)

Quiero crear o publicar contenido?
-> Publicaciones

Quiero medir clics e impacto mensual?
-> Estadisticas

Quiero un brief de campaña?
-> Ads

Quiero meter conocimiento nuevo?
-> Añadir

Quiero corregir lo aprendido?
-> Corregir
```
