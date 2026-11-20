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
    id: "mibo",
    nombre: "MiBØ",
    url: "https://aeternal-flow.es/mibo.php",
    para: "Quien trabaja en un Mac con muchos proyectos a la vez y pierde el hilo.",
    hechos: "Asistente personal de IA para macOS: memoria externa de escritorio que recuerda el contexto de cada día y automatiza tareas del Mac, siempre con aprobación.",
  },
  {
    id: "mibo-deck",
    nombre: "MiBØ Deck",
    url: "https://aeternal-flow.es/productos/mibo-deck.html",
    para: "Quien trabaja con Photoshop o Blender y quiere mandos físicos sin comprar un panel caro.",
    hechos: "Convierte un móvil en un panel de control táctil para Photoshop y Blender: botones, capas y nodos a mano. Prototipo.",
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
  linkedin: {
    nombre: "LinkedIn",
    reglas: "Texto de 700 a 1.200 caracteres. Primera línea que enganche sin clickbait. Párrafos de una o dos frases. Cuenta el problema y lo aprendido, en primera persona. Enlace al artículo al final. Máximo 3 hashtags. Sin emojis de adorno.",
  },
  pinterest: {
    nombre: "Pinterest",
    reglas: "Título de pin de máximo 100 caracteres con la búsqueda principal. Descripción de 200 a 400 caracteres con palabras que la gente busca, sin hashtags. El enlace va aparte (no lo escribas en el texto).",
  },
  instagram: {
    nombre: "Instagram",
    reglas: "Pie de foto de 600 a 1.000 caracteres. Primera línea que se entienda sola. Termina con «Enlace en la bio». Entre 3 y 6 hashtags concretos al final. Propón en una línea aparte qué imagen o carrusel acompaña.",
  },
  youtube: {
    nombre: "YouTube Shorts",
    reglas: "Guion de 35 a 45 segundos: gancho en los 3 primeros segundos, el problema, la solución en pantalla y cierre. Indica entre corchetes qué se ve en cada momento. Añade título (máx. 70 caracteres) y descripción corta con el enlace.",
  },
};

// ───────────────────────── utilidades ─────────────────────────

async function leer() {
  try {
    const datos = JSON.parse(await fs.readFile(archivo, "utf8"));
    return {
      fichas: Array.isArray(datos.fichas) && datos.fichas.length ? datos.fichas : FICHAS_INICIALES,
      ideas: datos.ideas || { fecha: "", lista: [], fuentes: {} },
      borradores: Array.isArray(datos.borradores) ? datos.borradores : [],
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
  if (/mibo|flow|automat|mac|deck/.test(t)) return { category: "Automatización", cat_class: "cat-blue" };
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
    maxTokens: 1800,
    messages: [
      {
        role: "system",
        content: "Eres el responsable de visibilidad de Æternal Flow, un estudio pequeño de Roberto Díaz (España). Propones artículos para su blog que una persona real buscaría en Google o preguntaría a un asistente de IA, y que llevan de forma natural a uno de sus productos. Nada de temas de opinión ni de tendencias: búsquedas prácticas (cómo hacer X, qué es X, X frente a Y, errores al hacer X). Escribes en español de España. Respondes solo JSON.",
      },
      {
        role: "user",
        content: JSON.stringify({
          tarea: "Propón 3 artículos nuevos. No repitas temas que ya están en el blog. Si hay búsquedas reales donde la web sale pero lejos (posición > 8) o con muchas impresiones y pocos clics, prioriza esas. Si no hay datos de búsquedas, elige huecos claros a partir de las fichas.",
          formato: { ideas: [{ titulo: "título del artículo, con la búsqueda dentro", busqueda: "lo que la persona teclearía", producto: "id de la ficha", porque: "una frase: por qué alguien lo buscaría y qué dato lo apoya (cita la búsqueda real si la hay)" }] },
          fichas: datos.fichas.map(({ id, nombre, para, hechos }) => ({ id, nombre, para, hechos })),
          busquedas_reales: busquedas,
          ya_en_el_blog: blog.map((a) => a.titulo),
        }),
      },
    ],
  });
  const lista = (jsonDelModelo(respuesta.text).ideas || [])
    .filter((i) => i && i.titulo)
    .slice(0, 5)
    .map((i) => ({
      id: crypto.randomUUID(),
      titulo: texto(i.titulo, 160),
      busqueda: texto(i.busqueda, 160),
      producto: datos.fichas.some((f) => f.id === i.producto) ? i.producto : "",
      porque: texto(i.porque, 400),
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

export async function escribirBorrador({ titulo, busqueda = "", producto = "", porque = "" }) {
  const datos = await leer();
  const ficha = datos.fichas.find((f) => f.id === producto) || null;
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
          "El artículo resuelve de verdad la búsqueda aunque el lector no compre nada. El producto aparece al final, en una sección corta, contando lo que hace y lo que NO hace.",
          "REGLA DURA: del producto solo puedes afirmar lo que está en «hechos». Si algo no está ahí, no lo digas. No inventes cifras, clientes, premios ni fechas.",
          "Sobre leyes, impuestos o normas: solo lo general y seguro; si dependes de un detalle, di que hay que comprobarlo con la fuente oficial.",
          "Formato: Markdown. Sin título # (va aparte). Secciones con ##. Entre 600 y 1.000 palabras.",
          "Responde solo JSON: {\"titulo\": \"...\", \"descripcion\": \"150-160 caracteres para Google\", \"cuerpo\": \"markdown\"}.",
        ].join("\n"),
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
    busqueda: texto(busqueda, 160),
    producto: ficha?.id || "",
    estado: "borrador",
    creado: ahora,
    actualizado: ahora,
    versiones: {},
  };
  datos.borradores.unshift(borrador);
  datos.borradores = datos.borradores.slice(0, 60);
  await guardar(datos);
  return borrador;
}

// ───────────────────────── 3. publicar ─────────────────────────

async function subirAlBlog(borrador, ficha) {
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
      image_url: "",
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

async function versionesPorRed(borrador, url) {
  const respuesta = await d.openaiChat({
    model: d.openaiTextModel,
    json: true,
    temperature: 0.5,
    maxTokens: 2500,
    messages: [
      {
        role: "system",
        content: "Adaptas un artículo del blog de Æternal Flow a cada red social, siguiendo al pie de la letra las reglas de cada una. Voz de Roberto: primera persona, directo, sin humo ni frases de gurú. No añadas datos que no estén en el artículo. Español de España. Responde solo JSON con una clave por red y el texto como valor.",
      },
      {
        role: "user",
        content: JSON.stringify({
          articulo: { titulo: borrador.titulo, descripcion: borrador.descripcion, cuerpo: borrador.cuerpo.slice(0, 9000), enlace: url },
          redes: Object.fromEntries(Object.entries(REGLAS_CANAL).map(([k, v]) => [k, v.reglas])),
        }),
      },
    ],
  });
  const r = jsonDelModelo(respuesta.text);
  return Object.fromEntries(Object.keys(REGLAS_CANAL)
    .filter((k) => r[k])
    .map((k) => [k, texto(typeof r[k] === "string" ? r[k] : JSON.stringify(r[k], null, 2), 3000)]));
}

export async function publicarBorrador(id) {
  const datos = await leer();
  const borrador = datos.borradores.find((b) => b.id === id);
  if (!borrador) throw Object.assign(new Error("Borrador no encontrado"), { status: 404 });
  if (!borrador.cuerpo.trim()) throw new Error("El borrador está vacío.");
  const ficha = datos.fichas.find((f) => f.id === borrador.producto) || null;
  const blog = await subirAlBlog(borrador, ficha);
  Object.assign(borrador, { estado: "publicado", url: blog.url, slug: blog.slug, publicado: new Date().toISOString(), actualizado: new Date().toISOString() });
  await guardar(datos);
  // Lo que viene después no deshace la publicación si falla: se apunta y se puede repetir.
  borrador.aviso = await avisarBuscadores([blog.url, `${SITIO}blog.php`]).catch((e) => ({ estado: "error", detalle: e.message }));
  try {
    borrador.versiones = await versionesPorRed(borrador, blog.url);
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

  app.post("/api/visibilidad/ideas", requireAuth, responder(() => proponerIdeas()));

  app.post("/api/visibilidad/borradores", requireAuth, responder(async (req) => {
    const titulo = texto(req.body?.titulo, 160);
    if (!titulo) throw new Error("Falta el tema del artículo.");
    return escribirBorrador({ titulo, busqueda: req.body?.busqueda, producto: req.body?.producto, porque: req.body?.porque });
  }));

  app.patch("/api/visibilidad/borradores/:id", requireAuth, responder(async (req) => {
    const datos = await leer();
    const b = datos.borradores.find((x) => x.id === req.params.id);
    if (!b) throw Object.assign(new Error("Borrador no encontrado"), { status: 404 });
    for (const [campo, max] of [["titulo", 160], ["descripcion", 300], ["cuerpo", 20000]]) {
      if (typeof req.body?.[campo] === "string") b[campo] = texto(req.body[campo], max);
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

  app.post("/api/visibilidad/borradores/:id/publicar", requireAuth, responder((req) => publicarBorrador(req.params.id)));

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
