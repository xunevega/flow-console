// Avisos de Flow: lo que Flow ve por su cuenta y Roberto tiene que saber. Sustituye a los flujos
// de n8n (que llegaban por Telegram) y vive en la pestaña AVISOS, encima de los de n8n.
//
//   conversación   hilos en Hacker News (y Reddit, si hay app) donde alguien pregunta algo que
//                  resuelve una de sus cosas, con una respuesta ya escrita en su voz. La publica él.
//   ideas          VISIBILIDAD tiene ideas nuevas.
//   borradores     hay borradores esperando a que los revise.
//   web            un enlace roto en aeternal-flow.es o en las páginas de sus productos (semanal).
//   mibo / robot   MiBØ lleva más de un día sin mandar nada, o el robot del día 1 no ha pasado.
//
// Guarda en DATA_DIRECTORY/avisos-flow.json.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { instruccionVoz } from "./mivoz.mjs";
import { contextoMibo } from "./desde-mibo.mjs";
import { FICHAS_INICIALES } from "./visibilidad.mjs";

let d = null;
let archivo = "";
let enMarcha = null;

const SITIO = "https://aeternal-flow.es/";
const CADA_MS = 2 * 60 * 60 * 1000;
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AVISOS = 300;
const MAX_RESPUESTAS_POR_VUELTA = 3;
const texto = (v, max) => String(v ?? "").trim().slice(0, max);

// Qué buscar en Hacker News para cada ficha (en inglés: HN es en inglés). Una ficha puede traer
// su propio campo «buscar» (separado por comas) y entonces manda ese.
export const BUSQUEDAS = {
  facturae: ["facturae", "spanish e-invoicing", "spain electronic invoice", "e-invoice xml spain", "verifactu"],
  dataimporter: ["csv import", "csv importer", "spreadsheet import", "import excel to", "field mapping csv", "bulk upload csv"],
  renta: ["spanish tax return", "spain income tax"],
  "panel-cobros": ["freelancer invoicing tool", "invoice tracking freelancer", "simple invoicing app"],
  mibo: ["personal ai assistant mac", "ai memory desktop", "macos automation assistant", "local ai assistant"],
  "mibo-deck": ["phone as stream deck", "photoshop control panel", "blender macro pad", "phone as macro pad"],
  "el-mago": ["browser arcade game", "pixel art arcade"],
  "land-of-battle-kings": ["castle defense game godot", "tower defense godot"],
  "flow-console": ["post to all social networks", "hate social media creator", "social media scheduler self hosted"],
};

async function leer() {
  try {
    const v = JSON.parse(await fs.readFile(archivo, "utf8"));
    return { avisos: Array.isArray(v.avisos) ? v.avisos : [], estado: v.estado || {} };
  } catch {
    return { avisos: [], estado: {} };
  }
}

async function guardar(v) {
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  v.avisos = v.avisos.slice(0, MAX_AVISOS);
  const tmp = `${archivo}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(v, null, 2), { mode: 0o600 });
  await fs.rename(tmp, archivo);
}

// Un aviso por «clave»: si ya existe no se repite; si está nuevo y es de los que cambian, se actualiza.
function poner(v, aviso, { actualizar = false } = {}) {
  const i = v.avisos.findIndex((a) => a.clave === aviso.clave);
  if (i >= 0) {
    if (actualizar && v.avisos[i].estado === "nuevo") v.avisos[i] = { ...v.avisos[i], ...aviso, fecha: v.avisos[i].fecha, actualizado: new Date().toISOString() };
    return false;
  }
  v.avisos.unshift({ id: crypto.randomUUID(), estado: "nuevo", fecha: new Date().toISOString(), ...aviso });
  return true;
}

function cerrar(v, clave) {
  for (const a of v.avisos) if (a.clave === clave && a.estado === "nuevo") a.estado = "hecho";
}

const jsonDelModelo = (t) => JSON.parse(String(t || "").replace(/^```(?:json)?\s*|\s*```$/g, ""));
const sinHtml = (t) => String(t || "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ───────────────────────── conversaciones ─────────────────────────

async function buscarHn(consulta, desde) {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(consulta)}&tags=(story,comment)&numericFilters=created_at_i>${desde}&hitsPerPage=10`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  const j = await r.json().catch(() => ({}));
  return (j.hits || []).map((h) => ({
    id: `hn-${h.objectID}`,
    sitio: "Hacker News",
    titulo: sinHtml(h.title || h.story_title || ""),
    texto: sinHtml(h.story_text || h.comment_text || "").slice(0, 1500),
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    fecha: h.created_at,
    idioma: "en",
  })).filter((x) => x.titulo || x.texto.length > 60);
}

let tokenReddit = { valor: "", hasta: 0 };
async function buscarReddit(consulta) {
  const id = String(process.env.REDDIT_CLIENT_ID || "").trim();
  const secreto = String(process.env.REDDIT_CLIENT_SECRET || "").trim();
  if (!id || !secreto) return [];
  if (Date.now() > tokenReddit.hasta) {
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secreto}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "FlowConsole/1.0" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) return [];
    tokenReddit = { valor: j.access_token, hasta: Date.now() + (Number(j.expires_in) || 3600) * 900 };
  }
  const r = await fetch(`https://oauth.reddit.com/search?q=${encodeURIComponent(consulta)}&sort=new&t=week&limit=10`, {
    headers: { Authorization: `Bearer ${tokenReddit.valor}`, "User-Agent": "FlowConsole/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  return (j.data?.children || []).map(({ data: p }) => ({
    id: `reddit-${p.id}`,
    sitio: `Reddit · r/${p.subreddit}`,
    titulo: texto(p.title, 300),
    texto: texto(p.selftext, 1500),
    url: `https://www.reddit.com${p.permalink}`,
    fecha: new Date((p.created_utc || 0) * 1000).toISOString(),
    idioma: /spain|espana|es$/i.test(p.subreddit || "") ? "es" : "en",
  }));
}

async function fichas() {
  try {
    const v = JSON.parse(await fs.readFile(path.join(d.dataDirectory, "visibilidad.json"), "utf8"));
    if (Array.isArray(v.fichas) && v.fichas.length) return v.fichas;
  } catch { /* sin fichas guardadas: las de serie */ }
  return FICHAS_INICIALES;
}

export async function buscarConversaciones(v) {
  const lista = await fichas();
  const desde = Math.floor(Date.now() / 1000) - 48 * 3600;
  const vistos = new Set(v.estado.vistosConversaciones || []);
  const candidatos = new Map();
  for (const f of lista) {
    const consultas = f.buscar ? String(f.buscar).split(",").map((x) => x.trim()).filter(Boolean) : (BUSQUEDAS[f.id] || []);
    for (const q of consultas.slice(0, 6)) {
      const hallados = [...await buscarHn(q, desde).catch(() => []), ...await buscarReddit(q).catch(() => [])];
      for (const h of hallados) if (!vistos.has(h.id) && !candidatos.has(h.id)) candidatos.set(h.id, { ...h, ficha: f.id });
    }
  }
  const todos = [...candidatos.values()].slice(0, 30);
  v.estado.vistosConversaciones = [...vistos, ...todos.map((c) => c.id)].slice(-3000);
  if (!todos.length || !d.openaiChat) return 0;
  const porFicha = Object.fromEntries(lista.map((f) => [f.id, { nombre: f.nombre, para: f.para, hechos: f.hechos }]));
  const puntuado = await d.openaiChat({
    model: d.openaiTextModel,
    json: true,
    temperature: 0.2,
    maxTokens: 1500,
    messages: [
      {
        role: "system",
        content: "Valoras conversaciones de foros para Roberto Díaz (Æternal Flow). Puntúa de 0 a 10 si merece la pena que Roberto conteste: 9-10 alguien pregunta justo lo que resuelve su producto; 7-8 puede aportar algo útil de verdad desde su experiencia; menos de 7 ruido, noticias, temas viejos o donde mencionar nada sería spam. «modo»: «mencion_suave» si su producto resuelve lo que se pregunta; «ayuda» si solo puede aportar conocimiento sin mencionar nada. Responde solo JSON: {\"valoraciones\": [{\"id\": \"...\", \"puntuacion\": 0, \"modo\": \"ayuda|mencion_suave\", \"porque\": \"una frase en español\"}]}.",
      },
      { role: "user", content: JSON.stringify({ productos: porFicha, conversaciones: todos.map(({ id, sitio, titulo, texto: t, ficha }) => ({ id, sitio, titulo, texto: t.slice(0, 700), producto_buscado: ficha })) }) },
    ],
  });
  let valoraciones = [];
  try {
    valoraciones = jsonDelModelo(puntuado.text).valoraciones || [];
  } catch {
    return 0;
  }
  const buenas = valoraciones
    .filter((x) => Number(x.puntuacion) >= 7 && candidatos.has(x.id))
    .sort((a, b) => b.puntuacion - a.puntuacion)
    .slice(0, MAX_RESPUESTAS_POR_VUELTA);
  const voz = await instruccionVoz({ maxEjemplos: 2 });
  let nuevos = 0;
  for (const b of buenas) {
    const c = candidatos.get(b.id);
    const f = lista.find((x) => x.id === c.ficha);
    const respuesta = await d.openaiChat({
      model: d.openaiTextModel,
      temperature: 0.5,
      maxTokens: 700,
      messages: [
        {
          role: "system",
          content: [
            `Escribes la respuesta que Roberto Díaz publicaría él mismo en ${c.sitio}. Idioma: ${c.idioma === "es" ? "español de España" : "inglés natural, el del foro"}.`,
            "Primero ayuda de verdad a quien pregunta, con algo concreto. Corta: de 60 a 180 palabras. Sin saludos de plantilla ni frases de marketing.",
            b.modo === "mencion_suave" && f
              ? `Al final, y solo si encaja, menciona ${f.nombre} en una frase diciendo que lo hizo él (sé transparente: «I built…» / «Lo hice yo…»), con su enlace ${f.demo || f.url}. Solo puedes afirmar esto del producto: ${f.hechos}`
              : "No menciones ningún producto ni enlace tuyo.",
            voz ? `\nSu manera de escribir (adáptala al idioma del foro):\n${voz}` : "",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify({ titulo: c.titulo, texto: c.texto }) },
      ],
    });
    if (poner(v, {
      clave: `conversacion:${c.id}`,
      tipo: "conversacion",
      titulo: c.titulo || "Conversación sin título",
      texto: `${c.sitio} · ${b.porque || ""}`.trim(),
      url: c.url,
      cita: c.texto.slice(0, 500),
      respuesta: texto(respuesta.text, 3000),
      producto: f?.nombre || "",
      modo: b.modo === "mencion_suave" ? "mencion_suave" : "ayuda",
      puntuacion: Number(b.puntuacion) || 0,
    })) nuevos += 1;
  }
  return nuevos;
}

// ───────────────────────── web rota ─────────────────────────

async function estadoDe(url) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (Flow Console; revisión de enlaces)" }, signal: AbortSignal.timeout(15000) });
    return r.status;
  } catch {
    return 0;
  }
}

function enlacesDe(html, base) {
  const salida = new Set();
  // Solo enlaces que se pulsan (<a>): los <link> de fuentes o estilos no son enlaces.
  for (const m of String(html).matchAll(/<a\b[^>]*?\bhref\s*=\s*"([^"#]+)"/gi)) {
    if (/\$\{|%7B/i.test(m[1])) continue; // plantillas de JavaScript («${API}/…»), no enlaces de verdad
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"), base);
      if (/^https?:$/.test(u.protocol)) salida.add(u.href);
    } catch { /* enlace raro: fuera */ }
  }
  return [...salida];
}

// Las redes sociales y algunos sitios contestan 403/429/999 a cualquier robot: eso no es un enlace roto.
const SE_NIEGAN_A_ROBOTS = /(linkedin|instagram|facebook|tiktok|twitter|x)\.com|pinterest\./i;

export async function revisarWeb(v) {
  const paginas = new Set([SITIO]);
  try {
    const sm = await fetch(`${SITIO}sitemap.php`, { signal: AbortSignal.timeout(20000) }).then((r) => r.text());
    for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) paginas.add(m[1].replace(/&amp;/g, "&"));
  } catch { /* sin sitemap: al menos la portada */ }
  for (const f of await fichas()) {
    if (f.url) paginas.add(f.url);
    if (f.demo) paginas.add(f.demo);
  }
  const dondeSale = new Map();
  for (const p of [...paginas].slice(0, 60)) {
    const r = await fetch(p, { headers: { "User-Agent": "Mozilla/5.0 (Flow Console)" }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r || !r.ok) {
      dondeSale.set(p, new Set([...(dondeSale.get(p) || []), "(la propia página)"]));
      continue;
    }
    for (const e of enlacesDe(await r.text(), p)) {
      if (/\.(css|js|woff2?|png|jpe?g|webp|svg|ico)(\?|$)/i.test(e) || /^mailto:/.test(e)) continue;
      if (!dondeSale.has(e)) dondeSale.set(e, new Set());
      dondeSale.get(e).add(p);
    }
  }
  const rotos = [];
  const lista = [...dondeSale.keys()].slice(0, 250);
  for (let i = 0; i < lista.length; i += 8) {
    const lote = lista.slice(i, i + 8);
    const estados = await Promise.all(lote.map(estadoDe));
    lote.forEach((u, j) => {
      const s = estados[j];
      if ((s === 0 || s >= 400) && !(SE_NIEGAN_A_ROBOTS.test(u) && [0, 400, 403, 429, 999].includes(s))) rotos.push({ url: u, estado: s, en: [...dondeSale.get(u)] });
    });
  }
  let nuevos = 0;
  for (const r of rotos) {
    if (poner(v, {
      clave: `web:${r.url}`,
      tipo: "web",
      titulo: `Enlace roto (${r.estado || "no responde"})`,
      texto: `Sale en: ${r.en.slice(0, 3).join(", ")}`,
      url: r.url,
    })) nuevos += 1;
  }
  // Lo que ya funciona se da por arreglado.
  const rotasAhora = new Set(rotos.map((r) => `web:${r.url}`));
  for (const a of v.avisos) if (a.tipo === "web" && a.estado === "nuevo" && !rotasAhora.has(a.clave)) a.estado = "hecho";
  v.estado.ultimaWeb = new Date().toISOString();
  return { revisados: lista.length, rotos: rotos.length, nuevos };
}

// ───────────────────────── ideas, borradores, MiBØ y robot ─────────────────────────

export async function revisarEstado(v) {
  let vis = { ideas: {}, borradores: [] };
  try {
    vis = JSON.parse(await fs.readFile(path.join(d.dataDirectory, "visibilidad.json"), "utf8"));
  } catch { /* sin visibilidad todavía */ }
  const fechaIdeas = vis.ideas?.fecha || "";
  if (fechaIdeas && fechaIdeas !== v.estado.ultimasIdeas) {
    v.estado.ultimasIdeas = fechaIdeas;
    for (const a of v.avisos) if (a.tipo === "ideas" && a.estado === "nuevo") a.estado = "hecho";
    const n = vis.ideas?.lista?.length || 0;
    if (n) poner(v, { clave: `ideas:${fechaIdeas}`, tipo: "ideas", titulo: `${n} ideas nuevas en VISIBILIDAD`, texto: (vis.ideas.lista || []).slice(0, 3).map((i) => `· ${i.titulo}`).join("\n"), ir: "visibilidad" });
  }
  const dosDias = Date.now() - 2 * 24 * 3600 * 1000;
  const esperando = (vis.borradores || []).filter((b) => b.estado === "borrador" && new Date(b.actualizado || b.creado).getTime() < dosDias);
  if (esperando.length) {
    poner(v, { clave: "borradores", tipo: "borradores", titulo: `${esperando.length} borrador${esperando.length > 1 ? "es" : ""} esperando tu repaso`, texto: esperando.slice(0, 4).map((b) => `· ${b.titulo}`).join("\n"), ir: "visibilidad" }, { actualizar: true });
  } else {
    cerrar(v, "borradores");
  }
  if (process.env.MIBO_FLOW_TOKEN) {
    const c = await contextoMibo();
    const horas = c.recibido ? (Date.now() - new Date(c.recibido).getTime()) / 3600000 : Infinity;
    if (horas > 26) {
      poner(v, { clave: "mibo-sin-enviar", tipo: "mibo", titulo: "MiBØ no manda nada desde hace más de un día", texto: c.recibido ? `Último envío: ${c.recibido.slice(0, 16).replace("T", " ")}. ¿Está encendido el Mac y MiBØ en marcha?` : "Todavía no ha mandado nada.", ir: "mivoz" }, { actualizar: true });
    } else {
      cerrar(v, "mibo-sin-enviar");
    }
  }
  const hoy = new Date();
  const mes = hoy.toISOString().slice(0, 7);
  if (hoy.getUTCDate() >= 3) {
    let manual = [];
    try {
      manual = JSON.parse(await fs.readFile(path.join(d.dataDirectory, "estadisticas-manual.json"), "utf8"));
    } catch { /* sin entradas */ }
    const paso = (Array.isArray(manual) ? manual : manual.entradas || []).some((e) => e.origen === "robot" && String(e.actualizado || e.fecha || "").startsWith(mes));
    if (paso) cerrar(v, `robot:${mes}`);
    else poner(v, { clave: `robot:${mes}`, tipo: "robot", titulo: "El robot de LinkedIn e Instagram no ha pasado este mes", texto: "Se lanza el día 1 a las 10:00 en el Mac. Puedes lanzarlo a mano con doble clic en robot-redes/estadisticas-redes.command.", ir: "stats" });
  }
}

// ───────────────────────── vuelta completa ─────────────────────────

export async function revisarTodo({ web = false } = {}) {
  if (enMarcha) return enMarcha;
  enMarcha = (async () => {
    const v = await leer();
    const resumen = {};
    resumen.conversaciones = await buscarConversaciones(v).catch((e) => `error: ${e.message}`);
    await revisarEstado(v).catch((e) => { resumen.estado = `error: ${e.message}`; });
    const tocaWeb = web || !v.estado.ultimaWeb || Date.now() - new Date(v.estado.ultimaWeb).getTime() > SEMANA_MS;
    if (tocaWeb) resumen.web = await revisarWeb(v).catch((e) => `error: ${e.message}`);
    v.estado.ultimaVuelta = new Date().toISOString();
    await guardar(v);
    return resumen;
  })();
  try {
    return await enMarcha;
  } finally {
    enMarcha = null;
  }
}

// Para que otros módulos (la newsletter) dejen un aviso sin esperar a la vuelta de cada 2 horas.
export async function avisoExterno(aviso) {
  if (!archivo) return false;
  const v = await leer();
  const nuevo = poner(v, aviso);
  if (nuevo) await guardar(v);
  return nuevo;
}

export function montarAvisosFlow(app, dependencias) {
  d = dependencias;
  archivo = path.join(d.dataDirectory, "avisos-flow.json");
  const { requireAuth } = d;

  app.get("/api/avisos-flow", requireAuth, async (_, res) => {
    const v = await leer();
    res.json({ avisos: v.avisos.filter((a) => a.estado === "nuevo").concat(v.avisos.filter((a) => a.estado !== "nuevo").slice(0, 20)), ultimaVuelta: v.estado.ultimaVuelta || "", ultimaWeb: v.estado.ultimaWeb || "", reddit: Boolean(process.env.REDDIT_CLIENT_ID) });
  });

  app.patch("/api/avisos-flow/:id", requireAuth, async (req, res) => {
    const v = await leer();
    const a = v.avisos.find((x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: "Aviso no encontrado" });
    if (["nuevo", "hecho", "descartado"].includes(req.body?.estado)) a.estado = req.body.estado;
    if (typeof req.body?.respuesta === "string") a.respuesta = texto(req.body.respuesta, 3000);
    await guardar(v);
    res.json(a);
  });

  app.post("/api/avisos-flow/revisar", requireAuth, async (req, res) => {
    try {
      res.json(await revisarTodo({ web: Boolean(req.body?.web) }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  if (!process.env.FLOW_SIN_TEMPORIZADORES) {
    setTimeout(() => revisarTodo().catch(() => {}), 4 * 60 * 1000).unref?.();
    setInterval(() => revisarTodo().catch(() => {}), CADA_MS).unref?.();
  }
}

export const _interno = { leer, guardar, enlacesDe, poner };
