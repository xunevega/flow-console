// Mi voz: cómo escribe Roberto, para que todo lo que escribe Flow suene a él.
//
// Sustituye a AÑADIR y CORREGIR (la memoria editorial con base de datos, parada el 19/11):
//   - ejemplos: textos suyos que le gustan, pegados tal cual;
//   - reglas: lo que sí y lo que no, con sus palabras;
//   - lecciones: lo que Flow aprende solo cuando Roberto corrige un borrador antes de publicarlo.
// Todo entra en las instrucciones de cualquier texto que escriba Flow (artículos, publicaciones
// y versiones para redes). Se guarda en DATA_DIRECTORY/mi-voz.json.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

let d = null;
let archivo = "";

const MAX_EJEMPLOS = 20;
const MAX_LECCIONES = 40;
const texto = (v, max) => String(v ?? "").trim().slice(0, max);

const VACIA = { ejemplos: [], reglas: "", lecciones: [] };

export async function leerVoz() {
  if (!archivo) return { ...VACIA };
  try {
    const v = JSON.parse(await fs.readFile(archivo, "utf8"));
    return {
      ejemplos: Array.isArray(v.ejemplos) ? v.ejemplos : [],
      reglas: String(v.reglas || ""),
      lecciones: Array.isArray(v.lecciones) ? v.lecciones : [],
    };
  } catch {
    return { ...VACIA };
  }
}

async function guardarVoz(v) {
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(v, null, 2), { mode: 0o600 });
  await fs.rename(tmp, archivo);
}

// Lo que se añade a las instrucciones de cualquier texto. Vacío si no hay nada todavía.
export async function instruccionVoz({ maxEjemplos = 4 } = {}) {
  const v = await leerVoz();
  const partes = [];
  if (v.reglas.trim()) partes.push(`Reglas de Roberto (obligatorias):\n${v.reglas.trim()}`);
  const lecciones = v.lecciones.filter((l) => l.activa !== false).slice(0, 25);
  if (lecciones.length) partes.push(`Lo aprendido de sus correcciones (obligatorio):\n${lecciones.map((l) => `- ${l.texto}`).join("\n")}`);
  const ejemplos = v.ejemplos.slice(0, maxEjemplos);
  if (ejemplos.length) {
    partes.push(`Textos suyos que le gustan. Imita el tono, el ritmo y el vocabulario, no el contenido:\n${ejemplos
      .map((e, i) => `--- Ejemplo ${i + 1}${e.donde ? ` (${e.donde})` : ""} ---\n${e.texto.slice(0, 1500)}`).join("\n")}`);
  }
  return partes.length ? `ESCRIBE COMO ROBERTO.\n${partes.join("\n\n")}` : "";
}

// Cuando Roberto cambia un borrador antes de publicarlo, se saca qué ha corregido y se apunta.
export async function aprenderDeCorreccion({ antes, despues, donde = "" }) {
  const a = String(antes || "").trim();
  const b = String(despues || "").trim();
  if (!a || !b || a === b || !d?.openaiChat) return [];
  // Cambios mínimos (una errata, una coma) no enseñan nada.
  const distintos = Math.abs(a.length - b.length) + [...a].filter((c, i) => c !== b[i]).length;
  if (distintos < 40) return [];
  const v = await leerVoz();
  const r = await d.openaiChat({
    model: d.openaiTextModel,
    json: true,
    temperature: 0.2,
    maxTokens: 700,
    messages: [
      {
        role: "system",
        content: "Comparas el texto que escribió una IA con la versión que dejó su autor, Roberto, y sacas de 0 a 3 lecciones de estilo generales y reutilizables (no sobre el tema concreto). Cada lección es una orden corta en español («No uses…», «Frases más cortas en…»). Si los cambios son solo de datos o contenido, devuelve ninguna. No repitas lecciones que ya existen. Responde solo JSON: {\"lecciones\": [\"...\"]}.",
      },
      { role: "user", content: JSON.stringify({ escrito_por_la_ia: a.slice(0, 6000), corregido_por_roberto: b.slice(0, 6000), ya_aprendido: v.lecciones.map((l) => l.texto) }) },
    ],
  });
  let nuevas = [];
  try {
    nuevas = (JSON.parse(String(r.text).replace(/^```(?:json)?\s*|\s*```$/g, "")).lecciones || [])
      .map((t) => texto(t, 240)).filter(Boolean).slice(0, 3);
  } catch {
    return [];
  }
  const ya = new Set(v.lecciones.map((l) => l.texto.toLowerCase()));
  const fecha = new Date().toISOString();
  const añadidas = nuevas.filter((t) => !ya.has(t.toLowerCase())).map((t) => ({ id: crypto.randomUUID(), texto: t, fecha, donde: texto(donde, 120), activa: true }));
  if (añadidas.length) {
    v.lecciones = [...añadidas, ...v.lecciones].slice(0, MAX_LECCIONES);
    await guardarVoz(v);
  }
  return añadidas;
}

// Texto principal de una página (artículo, post público…): <article>, si no <main>, si no el cuerpo.
export function textoDeHtml(html) {
  const sin = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside)\b[\s\S]*?<\/\1>/gi, " ");
  const trozo = (etiqueta) => sin.match(new RegExp(`<${etiqueta}\\b[^>]*>([\\s\\S]*?)<\\/${etiqueta}>`, "i"))?.[1] || "";
  const base = trozo("article") || trozo("main") || trozo("body") || sin;
  const entidades = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", mdash: "—", ndash: "–" };
  return base
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-zA-Z])(acute|grave|uml|circ|tilde);/g, (m, l, t) => `${l}${{ acute: "\u0301", grave: "\u0300", uml: "\u0308", circ: "\u0302", tilde: "\u0303" }[t]}`.normalize("NFC"))
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : entidades[e.toLowerCase()] ?? m))
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n")
    .trim();
}

async function textoDeUrl(url) {
  let u;
  try {
    u = new URL(String(url || "").trim());
  } catch {
    throw new Error("Esa dirección no es válida.");
  }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[|169\.254\.)/i.test(u.hostname)) {
    throw new Error("Solo direcciones públicas (http o https).");
  }
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Flow Console)", "Accept-Language": "es-ES,es" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`La página respondió ${r.status}.`);
  const tipo = r.headers.get("content-type") || "";
  const cuerpo = await r.text();
  const t = /html/i.test(tipo) ? textoDeHtml(cuerpo) : cuerpo.trim();
  if (t.length < 80) throw new Error("No he podido leer el texto de esa página (puede que pida iniciar sesión). Pégalo a mano.");
  return { texto: t.slice(0, 6000), donde: u.hostname.replace(/^www\./, "") };
}

async function anadirEjemplo({ texto: t, donde = "", url = "" }) {
  const ej = texto(t, 6000);
  if (ej.length < 80) throw new Error("Pega un texto un poco más largo (al menos un par de frases).");
  const v = await leerVoz();
  if (v.ejemplos.some((e) => (url && e.url === url) || e.texto === ej)) throw new Error("Ese texto ya está entre tus ejemplos.");
  v.ejemplos = [{ id: crypto.randomUUID(), texto: ej, donde: texto(donde, 80), url: texto(url, 500), fecha: new Date().toISOString() }, ...v.ejemplos].slice(0, MAX_EJEMPLOS);
  await guardarVoz(v);
  return v;
}

function robotAutorizado(req) {
  const esperada = String(process.env.ESTADISTICAS_ROBOT_TOKEN || "").trim();
  const llega = String(req.get("X-Robot-Token") || "").trim();
  if (!esperada || !llega) return false;
  const a = Buffer.from(esperada);
  const b = Buffer.from(llega);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function montarMiVoz(app, dependencias) {
  d = dependencias;
  archivo = path.join(d.dataDirectory, "mi-voz.json");
  const { requireAuth } = d;
  const responder = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  };

  app.get("/api/mivoz", requireAuth, responder(() => leerVoz()));

  app.put("/api/mivoz/reglas", requireAuth, responder(async (req) => {
    const v = await leerVoz();
    v.reglas = texto(req.body?.reglas, 4000);
    await guardarVoz(v);
    return v;
  }));

  // Un ejemplo pegado o, si llega una dirección, el texto de esa página.
  const nuevoEjemplo = async (body) => {
    const url = texto(body?.url, 500);
    if (url && !texto(body?.texto, 10)) {
      const leido = await textoDeUrl(url);
      return anadirEjemplo({ texto: leido.texto, donde: texto(body?.donde, 80) || leido.donde, url });
    }
    return anadirEjemplo({ texto: body?.texto, donde: body?.donde, url });
  };

  app.post("/api/mivoz/ejemplos", requireAuth, responder((req) => nuevoEjemplo(req.body)));

  // El robot del Mac (con su clave) puede traer textos de LinkedIn que Roberto ha elegido.
  app.post("/api/mivoz/robot", async (req, res) => {
    if (!robotAutorizado(req)) return res.status(401).json({ error: "No autorizado" });
    try {
      res.json(await nuevoEjemplo(req.body));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/mivoz/ejemplos/:id", requireAuth, responder(async (req) => {
    const v = await leerVoz();
    v.ejemplos = v.ejemplos.filter((e) => e.id !== req.params.id);
    await guardarVoz(v);
    return v;
  }));

  app.post("/api/mivoz/lecciones", requireAuth, responder(async (req) => {
    const t = texto(req.body?.texto, 240);
    if (!t) throw new Error("Escribe la lección.");
    const v = await leerVoz();
    v.lecciones = [{ id: crypto.randomUUID(), texto: t, fecha: new Date().toISOString(), donde: "a mano", activa: true }, ...v.lecciones].slice(0, MAX_LECCIONES);
    await guardarVoz(v);
    return v;
  }));

  app.delete("/api/mivoz/lecciones/:id", requireAuth, responder(async (req) => {
    const v = await leerVoz();
    v.lecciones = v.lecciones.filter((l) => l.id !== req.params.id);
    await guardarVoz(v);
    return v;
  }));
}
