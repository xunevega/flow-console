# Flow Console: README operativo

Flow Console es la consola diaria para planificar acciones, preparar publicaciones, guardar notas, corregir memoria editorial, medir rendimiento y crear enlaces UTM.

No es una pagina de reporting decorativo. Es una mesa de trabajo.

## Menu actual

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

## Principio de uso

El flujo principal empieza en Calendario.

Desde Calendario se ve:

- Que dias tienen acciones.
- Cuantas acciones hay por dia.
- Que toca hacer hoy.
- Que toca hacer cualquier otro dia.
- Si una accion es tarea, publicacion o aviso.
- Donde hay que abrir la gestion real.

Si una accion necesita detalle tecnico, se abre desde la propia accion. La consola no obliga a entrar primero en una bandeja o en automatizaciones.

## Flujo diario recomendado

1. Entrar en Calendario.
2. Revisar el dia de hoy.
3. Abrir cada accion desde su boton principal.
4. Publicar, revisar, borrar o marcar como gestionado.
5. Crear nuevas tareas puntuales o repetitivas si hace falta.
6. Usar Publicaciones cuando se necesite preparar contenido.
7. Usar Estadísticas al final del ciclo para medir y etiquetar trafico.

## Calendario

Calendario es el centro operativo.

Sirve para:

- Ver el mes con contador de acciones por dia.
- Seleccionar un dia y ver sus acciones.
- Crear tarea puntual.
- Crear tarea repetitiva.
- Abrir destino de una tarea: Blog, LinkedIn, Instagram, Pinterest, TikTok, YouTube u otro.
- Abrir gestion tecnica solo cuando una accion viene de un workflow.
- Borrar acciones que no tienen sentido.
- Marcar como gestionado cuando ya se ha hecho.

Regla operativa:

- Una tarea debe decir claramente que hay que hacer.
- Si solo hay que publicar en LinkedIn, debe abrir LinkedIn y permitir cerrar la tarea.
- Si el usuario no puede saber que hacer, la accion esta mal definida.

## Libreta

Libreta es el espacio para notas largas, ideas, referencias y fotos.

Sirve para:

- Escribir notas sin comprimir el calendario.
- Guardar ideas largas.
- Adjuntar imagenes.
- Ver, editar y borrar notas.
- Mantener las notas con etiquetas compactas para que la pantalla no se descontrole.

Regla operativa:

- La tarjeta de una nota debe mostrar solo una parte del texto.
- El contenido completo se abre al pulsar Ver.

## Añadir

Añadir sirve para meter conocimiento nuevo en la memoria.

Sirve para:

- Pegar texto, referencias, ideas o material bruto.
- Valorar si merece entrar en memoria.
- Clasificar el material.
- Dividirlo por secciones si hace falta.
- Confirmar la ingesta.

Regla operativa:

- Añadir es para material nuevo.
- No debe usarse para corregir lo que ya existe.

## Corregir

Corregir sirve para ajustar el estilo que el cerebro ya tiene.

Sirve para:

- Subir peso a temas utiles.
- Bajar peso a criterios que estorben.
- Eliminar ruido.
- Quitar etiquetas sin sentido.
- Revisar si la memoria aprendio conceptos reales o basura de contexto.

Regla operativa:

- Un tema debe ser un concepto reconocible.
- Un criterio debe poder funcionar como criterio.
- Un estilo debe describir una forma de escribir o comunicar.
- Nombres de canales como Instagram, YouTube o publish no son criterios editoriales.
- Expresiones raras o sin uso real deben eliminarse.

Ejemplos aceptables:

- Liberalismo economico.
- Automatizacion.
- Realismo magico.
- Marxismo clasico.
- Estilo literario-comunicativo.

Ejemplos a evitar:

- received_by_external_workflow.
- con-video.
- publish.
- narrativa espacial.
- pintura-abstracta-figurativa, salvo que realmente se este trabajando arte visual.

## Publicaciones

Publicaciones sirve para preparar y publicar contenido.

Sirve para:

- Elegir destino.
- Crear publicacion.
- Escribir articulo.
- Adaptar un articulo a formato publicacion.
- Subir imagen.
- Ajustar formato de imagen.
- Editar texto con formato.
- Copiar borrador util, no todo el bloque tecnico.
- Publicar o preparar segun canal.
- Editar articulos de Blog desde Flow Console. No se borran.

Destinos habituales:

- Blog.
- LinkedIn.
- Instagram.
- Pinterest.
- TikTok.
- YouTube.

Regla operativa:

- Blog puede contener articulo largo.
- LinkedIn puede recibir una version deducida del articulo.
- Una publicacion social no tiene que repetir todo el articulo si el articulo ya existe.
- Si el contenido ya esta publicado, la publicacion social puede ser una adaptacion fiel.

## Editor de publicaciones

El editor debe conservar estructura util:

- Negrita.
- Cursiva.
- Subrayado.
- Listas.
- Tablas cuando proceda.
- Linea divisoria real.
- Tamaño de fuente.
- Imagen y texto.

Regla operativa:

- El boton Copiar debe copiar el borrador publicable.
- No debe copiar diagnosticos, notas internas ni bloques que no se publican.

## Estadísticas

Estadísticas sirve para medir rendimiento mensual y preparar trazabilidad.

Sirve para:

- Registrar publicaciones, impresiones, interacciones y clics por canal.
- Importar datos GA4 cuando este configurado.
- Ver rendimiento por mes.
- Revisar el calendario anual de rendimiento.
- Crear enlaces UTM.
- Guardar campanas.
- Recuperar, copiar o borrar URLs guardadas.

Regla operativa:

- Los datos sin guardar empiezan en cero.
- No se inventan metricas.
- El calendario anual de rendimiento no debe moverse por listas largas.

## Campaign URL Builder

El Campaign URL Builder crea enlaces UTM para medir origen de trafico en GA4.

Campos:

- Nombre: etiqueta interna de la campana.
- URL: destino final.
- Source: origen, por ejemplo instagram, linkedin, youtube.
- Medium: tipo de medio, por ejemplo social, email, referral.
- Campaign: nombre de campana.
- Content: variacion, pieza o creatividad.
- Term: opcional.

Flujo:

1. Rellenar campos.
2. Pulsar Generar URL.
3. Revisar el enlace.
4. Guardar.
5. Copiar URL.
6. Usar esa URL en perfil, post, bio o campana.

Organizacion:

- Las campanas guardadas se agrupan por source.
- Cada source es plegable.
- La lista tiene scroll propio.
- Recuperar carga una copia para crear una nueva variante.
- Guardar crea un nuevo enlace, no pisa el anterior.

## Automatizaciones y workflows

Los workflows existen como infraestructura tecnica, pero no deben ser el punto principal de trabajo.

Regla operativa:

- El usuario trabaja desde Calendario.
- Si una accion necesita abrir un workflow, la accion debe explicar por que.
- Ver tecnica solo sirve para diagnosticar o gestionar una automatizacion concreta.
- No debe aparecer una tarea que mande a una pantalla tecnica sin explicar que hacer.

## Estados de acciones

Estados esperados:

- Pendiente: aun no hecho.
- Gestionado: revisado o ejecutado.
- Hecho: completado.
- Error: necesita revision.
- Archivado/Papelera: fuera del flujo activo.

Regla operativa:

- Ignorar no debe ser ambiguo. Si se descarta, debe actuar como borrar o retirar del dia.
- Gestionado debe cambiar estado y dejar claro que esa accion ya no requiere trabajo.

## Aprendizaje del sistema

Flow Console puede alimentar memoria editorial a partir de material y correcciones.

Debe aprender:

- Temas reales.
- Conceptos reconocibles.
- Estilo comunicativo.
- Preferencias editoriales.
- Correcciones hechas por el usuario.
- Que se publico finalmente.

No debe aprender:

- Ruido tecnico.
- Nombres de variables.
- Canales como si fueran criterios.
- Etiquetas internas sin significado editorial.
- Palabras juntas que no forman concepto.

## Criterio de calidad de memoria

Una etiqueta o concepto debe pasar al menos una de estas pruebas:

- Es una expresion comun en textos reales.
- Tiene significado estable en un diccionario, teoria, disciplina o uso profesional.
- Puede buscarse y aparecer como conjunto reconocido.
- Ayuda a generar mejor contenido.

Si no pasa ninguna, se elimina.

## Operacion local

```bash
npm install
npm run dev
```

Vite sirve el frontend y Express sirve la API.

## Comprobacion antes de publicar cambios

```bash
npm run lint
npm run build
```

## Produccion

La app esta desplegada como servicio Railway:

```text
https://flow-console-production.up.railway.app/
```

Despliegue habitual:

```bash
railway up --service flow-console --detach
```

Comprobacion:

```bash
curl -L -s -o /dev/null -w "%{http_code}" https://flow-console-production.up.railway.app/
```

Debe devolver `200`.

## Resumen operativo corto

```text
Calendario = que tengo que hacer y desde donde lo hago.
Libreta = notas largas, ideas y fotos.
Añadir = meter conocimiento nuevo.
Corregir = limpiar memoria.
Publicaciones = crear, adaptar, publicar y editar contenido.
Estadísticas = medir, GA4 y UTMs.
```
