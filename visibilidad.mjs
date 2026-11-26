// Visibilidad: que la gente encuentre lo que hace Æternal Flow sin vivir en las redes.
//
// El ciclo:
//   1. Ideas: Flow mira qué se busca (Search Console y Bing), qué hay ya en el blog y las
//      fichas de los productos, y propone artículos que alguien buscaría de verdad.
//   2. Borrador: escribe el artículo con los datos de la ficha (sin inventar nada).
//   3. Publicar: Roberto lo revisa y aprueba; Flow lo sube al blog, avisa a Bing (IndexNow)
//      y prepara una versión para cada red, con las reglas de cada una.
//
// Guarda en DATA_DIRECTORY/visibilidad.json: fichas, ideas y borradores.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { instruccionVoz, aprenderDeCorreccion } from "./mivoz.mjs";

let d = null; // dependencias que pasa server.mjs
let archivo = "";

const SITIO = "https://aeternal-flow.es/";
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

// ───────────────────────── fichas de producto ─────────────────────────
// Lo que se puede decir de cada cosa. Los artículos solo usan estos datos.
// Se editan desde la pantalla de Visibilidad.

export const FICHAS_INICIALES = [
  {
    id: "facturae",
    nombre: "Facturae",
    url: "https://facturae-landing.vercel.app/",
    demo: "https://facturae-api.vercel.app/",
    para: "Quien factura a administraciones públicas y lleva las facturas en Excel, CSV o PDF; gestorías y programadores que lo integran.",
    hechos: "Sube CSV, Excel o PDF (también escaneado, con OCR). Detecta los campos y propone el mapeo, editable. Vista previa y validación de NIF/CIF, tipos de IVA e importes. Genera XML Facturae 3.2.2 y PDF. Facturas ordinarias, simplificadas y rectificativas. Procesa los archivos en el navegador. No firma: la firma se hace con AutoFirma y certificado. Verifactu aún no. Licencia del código fuente: 59 €, pago único.",
  },
  {
    id: "dataimporter",
    nombre: "DataImporter",
    url: "https://xunevega-dataimporter.vercel.app/",
    para: "Quien tiene que meter datos de hojas de cálculo o exportaciones en otro sistema sin romper campos.",
    hechos: "Importa CSV, Excel (XLSX), JSON, XML o TXT, detecta los campos, los asigna a tu esquema y los valida antes de exportar.",
  },
  {
    id: "renta",
    nombre: "Renta · Programa PADRE",
    url: "https://programa-padre.vercel.app/",
    para: "Quien quiere revisar el borrador de la renta entendiendo cada cambio.",
    hechos: "Lee el borrador de Hacienda y recalcula la declaración sección a sección, con cada cambio a la vista.",
  },
  {
    id: "panel-cobros",
    nombre: "Panel de Cobros",
    url: "https://panel-cobros.vercel.app/",
    para: "Profesionales y autónomos que llevan clientes, presupuestos, facturas y cobros en sitios distintos.",
    hechos: "Clientes, presupuestos, facturas, pagos, gastos y horas en una sola vista. React, API REST con FastAPI y PostgreSQL. En evolución.",
  },
  {
    id: "el-mago",
    nombre: "El mago y las bolas de hierro",
    url: "https://aeternal-flow.es/el-mago.php",
    para: "Gente que busca juegos arcade de navegador, gratis y sin instalar.",
    hechos: "Arcade de navegador con sprites originales: diez fases, jefe final y bolas que no paran de dividirse. Terminado y gratis.",
  },
  {
    id: "land-of-battle-kings",
    nombre: "Land of Battle Kings",
    url: "https://aeternal-flow.es/land-of-battle-kings.php",
    para: "Gente que juega estrategia y defensa de castillos en PC.",
    hechos: "Defensa de castillo en 3D hecha con Godot: de día construyes y preparas el reino, de noche resistes el asedio. Prototipo.",
  },
  {
    id: "flow-console",
    nombre: "Flow Console",
    url: "https://aeternal-flow.es/productos/flow-console.html",
    para: "Creadores que odian las redes y quieren publicar desde un solo sitio.",
    hechos: "Calendario de tareas y publicaciones, avisos de n8n, resúmenes con IA y estadísticas de todos los canales en un solo sitio. Prototipo.",
  },
];

// Reglas de cada red: Roberto no vuelve a pensar en formatos; si una regla cambia, se cambia aquí.
export const REGLAS_CANAL = {
  blog: { nombre: "Blog Æternal Flow", reglas: "Original completo", completo: true },
  linkedin_article: { nombre: "LinkedIn · artículo", reglas: "Original completo", completo: true },
  linkedin_newsletter: { nombre: "LinkedIn Newsletter", reglas: "Original completo", completo: true },
  substack: { nombre: "Substack", reglas: "Original completo", completo: true },
  substack_notes: { nombre: "Substack Notes", reglas: "Reflexión breve autónoma, sin clickbait ni enlaces inventados." },
  medium: { nombre: "Medium", reglas: "Original completo", completo: true },
  reddit: { nombre: "Reddit", reglas: "Abre un debate genuino, sin publicidad ni pedir votos. Título y texto." },
  youtube_long: { nombre: "YouTube", reglas: "Guion narrado para vídeo horizontal con escenas, título y descripción." },
  tiktok: { nombre: "TikTok", reglas: "Guion breve vertical, título y descripción." },
  reels: { nombre: "Instagram Reels", reglas: "Guion breve vertical y pie de vídeo." },
  linkedin: {
    nombre: "LinkedIn",
    reglas: "Texto de 700 a 1.200 caracteres. Primera línea que enganche sin clickbait. Párrafos de una o dos frases. Cuenta el problema y lo aprendido, en primera persona. Añade el enlace únicamente si se proporciona. Máximo 3 hashtags. Sin emojis de adorno.",
  },
  pinterest: {
    nombre: "Pinterest",
    reglas: "Título de pin de máximo 100 caracteres con la búsqueda principal. Descripción de 200 a 400 caracteres con palabras que la gente busca, sin hashtags. El enlace va aparte (no lo escribas en el texto).",
  },
  instagram: {
    nombre: "Instagram",
    reglas: "Pie de foto de 600 a 1.000 caracteres. Primera línea que se entienda sola. No prometas un enlace en la bio si no existe. Entre 3 y 6 hashtags concretos al final. Propón en una línea aparte qué imagen o carrusel acompaña.",
  },
  youtube: {
    nombre: "YouTube Shorts",
    reglas: "Guion de 35 a 45 segundos: gancho en los 3 primeros segundos, el problema, la solución en pantalla y cierre. Indica entre corchetes qué se ve en cada momento. Añade título (máx. 70 caracteres) y descripción corta; incluye enlace solo si está disponible.",
  },
};

// ───────────────────────── utilidades ─────────────────────────

async function leer() {
  try {
    const datos = JSON.parse(await fs.readFile(archivo, "utf8"));
    return {
      fichas: (Array.isArray(datos.fichas) && datos.fichas.length ? datos.fichas : FICHAS_INICIALES).filter(f => !/^mibo(?:-deck)?$/i.test(f.id)),
      ideas: datos.ideas ? { ...datos.ideas, lista: (datos.ideas.lista || []).map(({proyectoMibo: _p, ...idea}) => idea), fuentes: Object.fromEntries(Object.entries(datos.ideas.fuentes || {}).filter(([key]) => key !== "mibo")) } : { fecha: "", lista: [], fuentes: {} },
      borradores: Array.isArray(datos.borradores) ? datos.borradores.map(b => {
        const { proyectoMibo: _proyecto, imagenes: _imagenes, ...rest } = b;
        return { ...rest, imagen: /^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(b.imagen || "") ? b.imagen : "" };
      }) : [],
    };
  } catch {
    return { fichas: FICHAS_INICIALES, ideas: { fecha: "", lista: [], fuentes: {} }, borradores: [] };
  }
}

async function guardar(datos) {
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(datos, null, 2), { mode: 0o600 });
  await fs.rename(tmp, archivo);
}

const texto = (v, max = 4000) => String(v ?? "").trim().slice(0, max);

function jsonDelModelo(t) {
  const limpio = String(t || "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(limpio);
}

function escapar(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Markdown sencillo → HTML del blog (títulos ##/###, listas, negritas, cursivas, enlaces, separador).
export function markdownAHtml(md) {
  const enLinea = (t) => escapar(t)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|[a-z0-9-]+\.php[^)\s]*)\)/gi, (_, a, b) => `<a href="${b.replace(/"/g, "%22")}">${a}</a>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return String(md || "")
    .replace(/\r/g, "")
    .replace(/^# .*\n?/, "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const lineas = b.split("\n");
      if (/^###\s/.test(b)) return `<h3>${enLinea(b.replace(/^###\s*/, ""))}</h3>`;
      if (/^##\s/.test(b)) return `<h2>${enLinea(b.replace(/^##\s*/, ""))}</h2>`;
      if (b === "---") return "<hr>";
      if (lineas.every((l) => /^[-*]\s/.test(l))) return `<ul>${lineas.map((l) => `<li>${enLinea(l.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      if (lineas.every((l) => /^\d+\.\s/.test(l))) return `<ol>${lineas.map((l) => `<li>${enLinea(l.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
      return `<p>${enLinea(lineas.join(" "))}</p>`;
    })
    .join("\n");
}

export function slugDe(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").slice(0, 80).replace(/^-+|-+$/g, "") || "articulo";
}

function categoriaDe(ficha, titulo) {
  const t = `${ficha?.id || ""} ${titulo}`.toLowerCase();
  if (/factur|renta|cobro|fiscal|iva/.test(t)) return { category: "Facturación", cat_class: "cat-amber" };
  if (/flow|automat|mac|deck/.test(t)) return { category: "Automatización", cat_class: "cat-blue" };
  if (/mago|battle|juego/.test(t)) return { category: "Juegos", cat_class: "cat-teal" };
  return { category: "Datos", cat_class: "cat-teal" };
}

// ───────────────────────── 1. qué se busca ─────────────────────────

async function consultasGoogle() {
  const { siteUrl, refreshToken } = d.searchConsoleOAuthConfig();
  if (!siteUrl || !refreshToken) return { estado: "sin_conectar", filas: [] };
  const token = await d.searchConsoleAccessToken();
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 90 * 24 * 60 * 60 * 1000);
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: desde.toISOString().slice(0, 10), endDate: hasta.toISOString().slice(0, 10), dimensions: ["query", "page"], rowLimit: 100 }),
    signal: AbortSignal.timeout(45000),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(cuerpo?.error?.message || `Search Console respondió ${r.status}`);
  return {
    estado: "ok",
    filas: (cuerpo.rows || []).map((x) => ({
      busqueda: x.keys?.[0] || "", pagina: x.keys?.[1] || "", clics: Math.round(x.clicks || 0),
      impresiones: Math.round(x.impressions || 0), posicion: Math.round((x.position || 0) * 10) / 10,
    })),
  };
}

async function consultasBing() {
  const clave = String(process.env.BING_WEBMASTER_API_KEY || "").trim();
  if (!clave) return { estado: "sin_conectar", filas: [] };
  const sitio = String(process.env.BING_SITE_URL || SITIO).trim();
  const r = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?siteUrl=${encodeURIComponent(sitio)}&apikey=${encodeURIComponent(clave)}`, { signal: AbortSignal.timeout(45000) });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Bing respondió ${r.status}`);
  return {
    estado: "ok",
    filas: (cuerpo.d || []).map((x) => ({ busqueda: x.Query, clics: Math.round(x.Clicks || 0), impresiones: Math.round(x.Impressions || 0), posicion: Math.round((x.AvgImpressionPosition || 0) * 10) / 10 })),
  };
}

async function articulosDelBlog() {
  try {
    const r = await d.requestAeternalBlogArticles("");
    return (Array.isArray(r.articles) ? r.articles : []).map((a) => ({ titulo: a.title || "", slug: a.slug || "" }));
  } catch {
    return [];
  }
}

const seguro = (p) => p.then((v) => v, (e) => ({ estado: "error", detalle: e.message, filas: [] }));
const canalesEditoriales = Object.fromEntries(Object.entries(REGLAS_CANAL).map(([k,v])=>[k,v.nombre]));
export function normalizarRecomendaciones(lista) {
  const vistos = new Set();
  return (Array.isArray(lista)?lista:[]).filter(r=>r && Object.hasOwn(REGLAS_CANAL,r.canal) && !vistos.has(r.canal) && vistos.add(r.canal)).map(r=>({
    canal:r.canal, prioridad:["prioritario","recomendado","opcional","no_recomendado"].includes(r.prioridad)?r.prioridad:"opcional",
    motivo:texto(r.motivo,300), formato:texto(r.formato,150), momento:texto(r.momento,120)
  }));
}
async function recomendarArticulo(b) {
  const respuesta=await d.openaiChat({model:d.openaiTextModel,json:true,temperature:0.3,maxTokens:3000,messages:[
    {role:"system",content:"Eres asesor editorial de una publicación independiente que empieza a construir lectores recurrentes. Recomienda dónde merece la pena publicar este artículo, no publicar por publicar. Substack y Medium para ensayos completos cuando encajen, LinkedIn para perspectivas profesionales, Reddit para debates pertinentes sin autopromoción, blog propio como archivo, Notes para ideas breves. Los vídeos solo si el autor decide producirlos. Diferencia recomendación editorial de datos reales; no inventes tendencias, métricas, reglas de comunidades ni horarios óptimos. Propón momento cualitativo (ahora, esta semana, atemporal) y explica por qué. Responde JSON con recomendaciones, cada una con canal, prioridad (prioritario, recomendado, opcional, no_recomendado), motivo, formato, momento."},
    {role:"user",content:JSON.stringify({titulo:b.titulo,cuerpo:b.cuerpo,descripcion:b.descripcion,canales:canalesEditoriales})}
  ]});
  const recomendaciones=normalizarRecomendaciones(jsonDelModelo(respuesta.text).recomendaciones);
  if(!recomendaciones.length)throw new Error("No se recibieron recomendaciones válidas.");
  return recomendaciones;
}

export async function proponerIdeas() {
  const datos = await leer();
  const [google, bing, blog] = await Promise.all([seguro(consultasGoogle()), seguro(consultasBing()), articulosDelBlog()]);
  const busquedas = [...google.filas, ...bing.filas]
    .filter((x) => x.busqueda)
    .sort((a, b) => b.impresiones - a.impresiones)
    .slice(0, 60);
  const respuesta = await d.openaiChat({
    model: d.openaiTextModel,
    json: true,
    temperature: 0.5,
    maxTokens: 4500,
    messages: [
      {
        role: "system",
        content: "Eres el responsable de visibilidad de Æternal Flow, un estudio pequeño de Roberto Díaz (España). Propones artículos para su blog de dos tipos. «producto»: búsquedas prácticas que una persona real haría en Google o a un asistente de IA (cómo hacer X, qué es X, X frente a Y, errores al hacer X) y que llevan de forma natural a uno de sus productos o proyectos. «libre»: temas que no tienen que ver con lo suyo, sobre cualquier cosa que le pueda interesar escribir y a otros leer: ideas, curiosidades, cultura, tecnología, trabajo, historia, cómo funciona algo… en la línea de sus ensayos (pensamiento crítico, internet, el mercado laboral, la especialización), sin vender nada. Escribes en español de España. Respondes solo JSON.",
      },
      {
        role: "user",
        content: JSON.stringify({
          tarea: "Propón 6 artículos nuevos, principalmente ensayos, divulgación y temas libres; incluye productos propios solo si aportan valor editorial. Varía temas y formatos. No repitas temas que ya están en el blog. Para los de tipo «producto»: Si hay búsquedas reales donde la web sale pero lejos (posición > 8) o con muchas impresiones y pocos clics, prioriza esas. Si no hay datos de búsquedas, elige huecos claros a partir de las fichas. Las fichas solo restringen afirmaciones sobre productos propios. Para temas libres usa criterio editorial, sin inventar noticias, datos de tendencias ni fuentes. Distingue oportunidades apoyadas en búsquedas reales de hipótesis editoriales. Recomienda destinos y momento de publicación para cada idea.",
          formato: { ideas: [{ tipo: "producto o libre", titulo: "título del artículo (en los de producto, con la búsqueda dentro)", busqueda: "lo que la persona teclearía, o vacío en los libres", producto: "id de la ficha, o vacío en los libres", porque: "por qué interesa y qué dato real lo apoya, o indicar hipótesis editorial", recomendaciones: [{canal:"id de canal",prioridad:"prioritario|recomendado|opcional|no_recomendado",motivo:"razón",formato:"formato",momento:"ahora, esta semana o atemporal"}] }] },
          canales: canalesEditoriales,
          fichas: datos.fichas.map(({ id, nombre, para, hechos }) => ({ id, nombre, para, hechos })),
          busquedas_reales: busquedas,
          ya_en_el_blog: blog.map((a) => a.titulo),
        }),
      },
    ],
  });
  const lista = (jsonDelModelo(respuesta.text).ideas || [])
    .filter((i) => i && i.titulo)
    .slice(0, 8)
    .map((i) => ({
      id: crypto.randomUUID(),
      tipo: i.tipo === "libre" ? "libre" : "producto",
      titulo: texto(i.titulo, 160),
      busqueda: texto(i.busqueda, 160),
      producto: datos.fichas.some((f) => f.id === i.producto) ? i.producto : "",
      porque: texto(i.porque, 400),
      recomendaciones: normalizarRecomendaciones(i.recomendaciones),
    }));
  datos.ideas = {
    fecha: new Date().toISOString(),
    lista,
    fuentes: { google: google.estado, bing: bing.estado, busquedas: busquedas.length, articulos: blog.length },
  };
  await guardar(datos);
  return datos.ideas;
}

// ───────────────────────── 2. borrador ─────────────────────────

export async function escribirBorrador({ titulo, busqueda = "", producto = "", porque = "", recomendaciones = [] }) {
  const datos = await leer();
  const ficha = datos.fichas.find((f) => f.id === producto) || null;
  const voz = await instruccionVoz();
  const respuesta = await d.openaiChat({
    model: d.openaiTextModel,
    json: true,
    temperature: 0.4,
    maxTokens: 3500,
    messages: [
      {
        role: "system",
        content: [
          "Escribes artículos para el blog de Æternal Flow (aeternal-flow.es), el estudio de Roberto Díaz.",
          "Voz: primera persona de Roberto, cercana y directa, frases cortas, algo de ironía, cero relleno, nada de «en el mundo actual» ni de vender humo.",
          ficha
            ? "El artículo resuelve de verdad la búsqueda aunque el lector no compre nada. El producto aparece al final, en una sección corta, contando lo que hace y lo que NO hace."
            : "Es un tema libre: no menciones ni vendas ningún producto ni proyecto de Æternal Flow salvo que el tema trate de eso. Que se sostenga solo: una idea clara, ejemplos concretos y una conclusión con opinión propia.",
          "Solo para afirmaciones sobre un producto propio, usa los hechos de su ficha. Los ensayos y otros temas no están limitados a las fichas. No inventes cifras, citas, clientes, premios ni fechas.",
          "Sobre leyes, impuestos o normas: solo lo general y seguro; si dependes de un detalle, di que hay que comprobarlo con la fuente oficial.",
          "Formato: Markdown. Sin título # (va aparte). Secciones con ##. Entre 600 y 1.000 palabras.",
          "Responde solo JSON: {\"titulo\": \"...\", \"descripcion\": \"150-160 caracteres para Google\", \"cuerpo\": \"markdown\"}.",
          voz,
        ].filter(Boolean).join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({ titulo, busqueda, porque, producto: ficha, correo: "roberto@aeternal-flow.es" }),
      },
    ],
  });
  const r = jsonDelModelo(respuesta.text);
  const ahora = new Date().toISOString();
  const borrador = {
    id: crypto.randomUUID(),
    titulo: texto(r.titulo || titulo, 160),
    descripcion: texto(r.descripcion, 300),
    cuerpo: texto(r.cuerpo, 20000),
    original: texto(r.cuerpo, 20000),
    busqueda: texto(busqueda, 160),
    producto: ficha?.id || "",
    imagen: "",
    estado: "borrador",
    creado: ahora,
    actualizado: ahora,
    versiones: {},
    recomendaciones: normalizarRecomendaciones(recomendaciones),
  };
  datos.borradores.unshift(borrador);
  datos.borradores = datos.borradores.slice(0, 60);
  await guardar(datos);
  return borrador;
}

// ───────────────────────── 3. publicar ─────────────────────────

async function subirAlBlog(borrador, ficha, imagenUrl = "") {
  const url = String(process.env.AETERNAL_BLOG_API_URL || `${SITIO}api/publicar.php`).trim();
  const token = String(process.env.AETERNAL_BLOG_API_TOKEN || process.env.BLOG_API_TOKEN || "").trim();
  if (!token) throw new Error("Falta AETERNAL_BLOG_API_TOKEN para publicar en el blog.");
  const cuerpo = markdownAHtml(borrador.cuerpo);
  const palabras = cuerpo.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const enlace = ficha?.demo || ficha?.url || "contacto.php";
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "X-Blog-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: borrador.slug || slugDe(borrador.titulo),
      title: borrador.titulo,
      ...categoriaDe(ficha, borrador.titulo),
      minutes: Math.max(1, Math.ceil(palabras / 190)),
      excerpt: borrador.descripcion || borrador.titulo,
      lede: borrador.descripcion || borrador.titulo,
      body: cuerpo,
      image_url: imagenUrl,
      cta_note: ficha ? `¿Te sirve ${ficha.nombre}?` : "",
      cta_text: ficha ? (ficha.demo ? `Probar ${ficha.nombre}` : `Ver ${ficha.nombre}`) : "",
      cta_href: enlace,
      published: 1,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const respuesta = await r.json().catch(() => ({}));
  if (!r.ok || respuesta.ok === false) throw new Error(respuesta.error || `El blog respondió ${r.status}`);
  return { url: respuesta.url || `${SITIO}blog.php?post=${respuesta.slug}`, slug: respuesta.slug };
}

// IndexNow: avisa a Bing (y a los buscadores que lo usan) de que hay una página nueva.
// Necesita el archivo <clave>.txt en la raíz de la web, con la clave dentro.
export async function avisarBuscadores(urls) {
  const clave = String(process.env.INDEXNOW_KEY || "").trim();
  if (!clave) return { estado: "sin_clave" };
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITIO).host, key: clave, keyLocation: `${SITIO}${clave}.txt`, urlList: urls }),
    signal: AbortSignal.timeout(30000),
  });
  return { estado: r.ok ? "ok" : "error", codigo: r.status };
}

async function versionesPorRed(borrador, url, canales = Object.keys(REGLAS_CANAL)) {
  const elegidos = canales.filter(k => Object.hasOwn(REGLAS_CANAL,k));
  const completos = Object.fromEntries(elegidos.filter(k => REGLAS_CANAL[k].completo).map(k => [k, "# " + borrador.titulo + "\n\n" + borrador.cuerpo]));
  const adaptados = elegidos.filter(k => !REGLAS_CANAL[k].completo);
  if (!adaptados.length) return completos;
  const voz = await instruccionVoz({ maxEjemplos: 3 });
  const respuesta = await d.openaiChat({
    model: d.openaiTextModel,
    json: true,
    temperature: 0.5,
    maxTokens: 6500,
    messages: [
      {
        role: "system",
        content: "Adaptas un artículo del blog de Æternal Flow a cada red social, siguiendo al pie de la letra las reglas de cada una. Voz de Roberto: primera persona, directo, sin humo ni frases de gurú. No añadas datos que no estén en el artículo. Español de España. Responde solo JSON con una clave por red y el texto como valor." + (voz ? `\n\n${voz}` : ""),
      },
      {
        role: "user",
        content: JSON.stringify({
          articulo: { titulo: borrador.titulo, descripcion: borrador.descripcion, cuerpo: borrador.cuerpo, enlace: url || null },
          redes: Object.fromEntries(adaptados.map(k => [k, REGLAS_CANAL[k].reglas])),
        }),
      },
    ],
  });
  const r = jsonDelModelo(respuesta.text);
  return { ...completos, ...Object.fromEntries(adaptados.filter(k => typeof r[k] === "string" && r[k].trim()).map(k => [k, r[k].trim()])) };
}

// Las portadas se guardan en la biblioteca pública de Flow.
async function imagenPublica(nombre, origen) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(nombre) || !origen) throw new Error("Selecciona una portada de Flow válida.");
  await fs.access(path.join(d.publicationMediaDirectory, nombre));
  return `${origen}/media/publications/${nombre}`;
}

export async function publicarBorrador(id, origen = "") {
  const datos = await leer();
  const borrador = datos.borradores.find((b) => b.id === id);
  if (!borrador) throw Object.assign(new Error("Borrador no encontrado"), { status: 404 });
  if (!borrador.cuerpo.trim()) throw new Error("El borrador está vacío.");
  const ficha = datos.fichas.find((f) => f.id === borrador.producto) || null;
  const imagenUrl = borrador.imagen ? await imagenPublica(borrador.imagen, origen) : "";
  const blog = await subirAlBlog(borrador, ficha, imagenUrl);
  if (imagenUrl) borrador.imagenUrl = imagenUrl;
  Object.assign(borrador, { estado: "publicado", url: blog.url, slug: blog.slug, publicado: new Date().toISOString(), actualizado: new Date().toISOString() });
  await guardar(datos);
  // Lo que viene después no deshace la publicación si falla: se apunta y se puede repetir.
  if (borrador.original && borrador.original !== borrador.cuerpo) {
    borrador.lecciones = (await aprenderDeCorreccion({ antes: borrador.original, despues: borrador.cuerpo, donde: borrador.titulo }).catch(() => [])).map((l) => l.texto);
  }
  borrador.aviso = await avisarBuscadores([blog.url, `${SITIO}blog.php`]).catch((e) => ({ estado: "error", detalle: e.message }));
  try {
    if (!Object.keys(borrador.versiones || {}).length) borrador.versiones = await versionesPorRed(borrador, blog.url);
  } catch (error) {
    borrador.versiones = {};
    borrador.errorVersiones = error.message;
  }
  const otra = await leer();
  const i = otra.borradores.findIndex((b) => b.id === id);
  if (i >= 0) otra.borradores[i] = borrador;
  await guardar(otra);
  return borrador;
}

// ───────────────────────── rutas ─────────────────────────

export function montarVisibilidad(app, dependencias) {
  d = dependencias;
  archivo = path.join(d.dataDirectory, "visibilidad.json");
  const { requireAuth } = d;
  const responder = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  };

  app.get("/api/visibilidad", requireAuth, responder(async () => {
    const datos = await leer();
    return {
      ...datos,
      redes: Object.fromEntries(Object.entries(REGLAS_CANAL).map(([k, v]) => [k, v.nombre])),
      estado: {
        blog: Boolean(process.env.AETERNAL_BLOG_API_TOKEN || process.env.BLOG_API_TOKEN),
        indexnow: Boolean(process.env.INDEXNOW_KEY),
        ia: Boolean(process.env.OPENAI_API_KEY),
      },
    };
  }));

  app.get("/api/visibilidad/imagenes", requireAuth, responder(async () => {
    const entradas = await fs.readdir(d.publicationMediaDirectory, { withFileTypes: true }).catch(error => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const imagenes = await Promise.all(entradas.filter(e => e.isFile() && /^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(e.name)).map(async e => ({ nombre: e.name, fecha: (await fs.stat(path.join(d.publicationMediaDirectory,e.name))).mtimeMs })));
    return { imagenes: imagenes.sort((a,b) => b.fecha-a.fecha).slice(0,100).map(e => e.nombre) };
  }));
  app.post("/api/visibilidad/ideas", requireAuth, responder(() => proponerIdeas()));

  app.post("/api/visibilidad/borradores", requireAuth, responder(async (req) => {
    const titulo = texto(req.body?.titulo, 160);
    if (!titulo) throw new Error("Falta el tema del artículo.");
    return escribirBorrador({ titulo, busqueda: req.body?.busqueda, producto: req.body?.producto, porque: req.body?.porque, recomendaciones: req.body?.recomendaciones, tipo: req.body?.tipo === "libre" ? "libre" : "" });
  }));

  app.patch("/api/visibilidad/borradores/:id", requireAuth, responder(async (req) => {
    const datos = await leer();
    const b = datos.borradores.find((x) => x.id === req.params.id);
    if (!b) throw Object.assign(new Error("Borrador no encontrado"), { status: 404 });
    for (const [campo, max] of [["titulo", 160], ["descripcion", 300], ["cuerpo", 20000]]) {
      if (typeof req.body?.[campo] === "string") b[campo] = texto(req.body[campo], max);
    }
    if (typeof req.body?.imagen === "string") {
      if (req.body.imagen) await imagenPublica(req.body.imagen, d.publicOrigin(req));
      b.imagen = req.body.imagen;
    }
    b.actualizado = new Date().toISOString();
    await guardar(datos);
    return b;
  }));

  app.delete("/api/visibilidad/borradores/:id", requireAuth, responder(async (req) => {
    const datos = await leer();
    datos.borradores = datos.borradores.filter((x) => x.id !== req.params.id || x.estado === "publicado");
    await guardar(datos);
    return { ok: true };
  }));

  app.post("/api/visibilidad/borradores/:id/recomendaciones", requireAuth, responder(async req=>{
    const datos=await leer();
    const b=datos.borradores.find(x=>x.id===req.params.id);
    if(!b || !b.cuerpo.trim())throw new Error("Artículo inexistente o vacío.");
    const recomendaciones=await recomendarArticulo(b);
    const actual=await leer();
    const destino=actual.borradores.find(x=>x.id===b.id);
    if(!destino || destino.titulo!==b.titulo || destino.cuerpo!==b.cuerpo)throw new Error("El artículo cambió durante el análisis.");
    destino.recomendaciones=recomendaciones;
    await guardar(actual);
    return {recomendaciones};
  }));
  app.post("/api/visibilidad/borradores/:id/versiones", requireAuth, responder(async req => {
    const datos = await leer();
    const b = datos.borradores.find(x => x.id === req.params.id);
    if (!b || !b.cuerpo.trim()) throw new Error("Artículo inexistente o vacío.");
    const canales = [...new Set(Array.isArray(req.body?.canales) ? req.body.canales : [])].filter(k => Object.hasOwn(REGLAS_CANAL,k));
    if (!canales.length) throw new Error("Selecciona algún destino.");
    const versiones = await versionesPorRed(b,b.url || "",canales);
    const actual = await leer();
    const destino = actual.borradores.find(x => x.id === b.id);
    if (!destino || destino.cuerpo !== b.cuerpo || destino.titulo !== b.titulo) throw new Error("El artículo cambió durante la preparación.");
    destino.versiones = { ...destino.versiones, ...versiones };
    destino.originalAprobado = { titulo:b.titulo, cuerpo:b.cuerpo, fecha:new Date().toISOString() };
    destino.errorVersiones = canales.filter(k => !versiones[k]).map(k => REGLAS_CANAL[k].nombre).join(", ");
    await guardar(actual);
    return destino;
  }));
  app.patch("/api/visibilidad/borradores/:id/versiones/:canal", requireAuth, responder(async req => {
    const datos = await leer();
    const b = datos.borradores.find(x => x.id === req.params.id);
    const canal = req.params.canal;
    if (!b || !Object.hasOwn(REGLAS_CANAL,canal)) throw new Error("Versión no encontrada.");
    const valor = String(req.body?.texto || "").trim();
    if (!valor || valor.length > 100000) throw new Error("Texto inválido.");
    b.versiones = {...b.versiones,[canal]:valor};
    await guardar(datos);
    return b;
  }));
  for (const tipo of ["medios","enlaces"]) {
    app.put("/api/visibilidad/borradores/:id/"+tipo+"/:canal", requireAuth, responder(async req => {
      const datos = await leer();
      const b = datos.borradores.find(x=>x.id===req.params.id);
      const canal=req.params.canal;
      if(!b || !Object.hasOwn(REGLAS_CANAL,canal) || !b.versiones?.[canal]) throw new Error("Versión no encontrada.");
      let valor;
      if(tipo==="medios"){
        valor=String(req.body?.nombre||"");
        const video=["youtube","youtube_long","tiktok","reels"].includes(canal);
        const patron=video?/^[a-f0-9-]{36}\.(mp4|webm|mov)$/i:/^[a-f0-9-]{36}\.(jpg|png|webp)$/i;
        if(!patron.test(valor)) throw new Error("Archivo no válido para este destino.");
        await fs.access(path.join(d.publicationMediaDirectory,valor));
      } else {
        const url=new URL(String(req.body?.url||""));
        if(url.protocol!=="https:"||url.username||url.password||url.pathname==="/") throw new Error("Indica el enlace HTTPS de la publicación real.");
        valor=url.href;
      }
      b[tipo]={...b[tipo],[canal]:valor};
      await guardar(datos);
      return b;
    }));
  }
  app.post("/api/visibilidad/borradores/:id/publicar", requireAuth, responder((req) => publicarBorrador(req.params.id, d.publicOrigin ? d.publicOrigin(req) : "")));

  app.put("/api/visibilidad/fichas", requireAuth, responder(async (req) => {
    const lista = Array.isArray(req.body?.fichas) ? req.body.fichas : [];
    const fichas = lista
      .map((f) => ({
        id: slugDe(f.id || f.nombre),
        nombre: texto(f.nombre, 80),
        url: texto(f.url, 300),
        demo: texto(f.demo, 300),
        para: texto(f.para, 600),
        hechos: texto(f.hechos, 2500),
        buscar: texto(f.buscar, 400),
      }))
      .filter((f) => f.nombre && f.hechos);
    if (!fichas.length) throw new Error("Hace falta al menos una ficha con nombre y hechos.");
    const datos = await leer();
    datos.fichas = fichas;
    await guardar(datos);
    return { fichas };
  }));

  // Ideas nuevas solas una vez a la semana (si hay IA). Se mira cada 6 horas.
  const revisar = async () => {
    if (!process.env.OPENAI_API_KEY) return;
    const { ideas } = await leer();
    if (ideas.fecha && Date.now() - new Date(ideas.fecha).getTime() < SEMANA_MS) return;
    await proponerIdeas().catch((e) => console.error("Visibilidad: no se pudieron proponer ideas:", e.message));
  };
  if (!process.env.FLOW_SIN_TEMPORIZADORES) {
    setTimeout(revisar, 2 * 60 * 1000).unref?.();
    setInterval(revisar, 6 * 60 * 60 * 1000).unref?.();
  }
}

export const _interno = { leer, guardar, categoriaDe };
