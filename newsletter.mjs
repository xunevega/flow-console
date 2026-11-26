// Newsletter de Æternal Flow, con Brevo (europeo, gratis hasta 300 correos al día).
//
//   Alta:    el formulario de la web envía el correo aquí (/newsletter/alta, sin JavaScript).
//            Flow manda un correo de confirmación; solo al pulsar el enlace (/newsletter/confirmar)
//            entra en la lista de Brevo. Doble confirmación, como pide la ley.
//   Números: Flow escribe el borrador con la voz de Roberto (lo publicado, las notas del autor y
//            algún tema libre); él lo repasa, se manda una prueba y lo envía. La baja la pone Brevo.
//   Cifras:  suscriptores y aperturas/clics de los últimos envíos.
//
// Variables: BREVO_API_KEY (con poner-clave.command), NEWSLETTER_REMITENTE (por defecto
// roberto@aeternal-flow.es). Guarda en DATA_DIRECTORY/newsletter.json.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { instruccionVoz, aprenderDeCorreccion } from "./mivoz.mjs";
import { markdownAHtml } from "./visibilidad.mjs";
import { avisoExterno } from "./avisos-flow.mjs";

let d = null;
let archivo = "";

const WEB = "https://aeternal-flow.es/";
const BREVO = "https://api.brevo.com/v3";
const NOMBRE_LISTA = "Newsletter Æternal Flow";
const texto = (v, max) => String(v ?? "").trim().slice(0, max);
const RE_CORREO = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,190}\.[a-z]{2,24}$/i;

const clave = () => String(process.env.BREVO_API_KEY || "").trim();
const remitente = () => ({ name: "Roberto Díaz · Æternal Flow", email: String(process.env.NEWSLETTER_REMITENTE || "roberto@aeternal-flow.es").trim() });

async function leer() {
  try {
    const v = JSON.parse(await fs.readFile(archivo, "utf8"));
    return { pendientes: v.pendientes || {}, listaId: v.listaId || 0, numeros: Array.isArray(v.numeros) ? v.numeros : [] };
  } catch {
    return { pendientes: {}, listaId: 0, numeros: [] };
  }
}

async function guardar(v) {
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(v, null, 2), { mode: 0o600 });
  await fs.rename(tmp, archivo);
}

async function brevo(metodo, ruta, cuerpo) {
  if (!clave()) throw Object.assign(new Error("Falta la clave de Brevo: ponla con poner-clave.command."), { status: 503 });
  const r = await fetch(`${BREVO}${ruta}`, {
    method: metodo,
    headers: { "api-key": clave(), "Content-Type": "application/json", Accept: "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const t = await r.text();
  let j = {};
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    j = { message: t.slice(0, 200) };
  }
  if (!r.ok) throw Object.assign(new Error(`Brevo: ${j.message || r.status}`), { status: 502 });
  return j;
}

// La lista se crea sola la primera vez (en una carpeta propia) y se recuerda su número.
async function listaId(v) {
  if (v.listaId) return v.listaId;
  const listas = await brevo("GET", "/contacts/lists?limit=50&offset=0");
  let lista = (listas.lists || []).find((l) => l.name === NOMBRE_LISTA);
  if (!lista) {
    const carpetas = await brevo("GET", "/contacts/folders?limit=50&offset=0");
    let carpeta = (carpetas.folders || [])[0];
    if (!carpeta) carpeta = await brevo("POST", "/contacts/folders", { name: "Æternal Flow" });
    lista = await brevo("POST", "/contacts/lists", { name: NOMBRE_LISTA, folderId: carpeta.id });
  }
  v.listaId = lista.id;
  await guardar(v);
  return v.listaId;
}

function plantilla({ cuerpoHtml, pie }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f2ee;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;color:#23211d">
<div style="max-width:600px;margin:0 auto;background:#fffdf9;border:1px solid #e3ded4;border-radius:10px;padding:28px 26px;font-size:17px;line-height:1.6">
<p style="margin:0 0 18px;font:600 12px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#8a8275">Æternal Flow</p>
${cuerpoHtml.replace(/<h2>/g, '<h2 style="font:700 20px/1.3 Helvetica,Arial,sans-serif;margin:26px 0 8px">').replace(/<a /g, '<a style="color:#3f5bd9" ')}
</div>
<p style="max-width:600px;margin:14px auto 0;font:12px/1.5 Helvetica,Arial,sans-serif;color:#8a8275;text-align:center">${pie}</p>
</body></html>`;
}

// ───────────────────────── altas ─────────────────────────

const intentos = new Map(); // ip -> [marcas de tiempo]
function demasiados(ip) {
  const ahora = Date.now();
  const lista = (intentos.get(ip) || []).filter((t) => ahora - t < 3600000);
  lista.push(ahora);
  intentos.set(ip, lista);
  return lista.length > 6;
}

export async function pedirAlta(email, origen) {
  const correo = texto(email, 254).toLowerCase();
  if (!RE_CORREO.test(correo)) throw new Error("correo no válido");
  const v = await leer();
  const hace3dias = Date.now() - 3 * 24 * 3600 * 1000;
  for (const [t, p] of Object.entries(v.pendientes)) if (Date.parse(p.fecha) < hace3dias) delete v.pendientes[t];
  const token = crypto.randomBytes(24).toString("base64url");
  v.pendientes[token] = { email: correo, fecha: new Date().toISOString() };
  await guardar(v);
  const enlace = `${origen}/newsletter/confirmar?t=${token}`;
  await brevo("POST", "/smtp/email", {
    sender: remitente(),
    to: [{ email: correo }],
    subject: "Confirma tu suscripción a Æternal Flow",
    htmlContent: plantilla({
      cuerpoHtml: `<p>Hola:</p><p>Alguien (seguramente tú) ha pedido recibir por correo lo nuevo de Æternal Flow: artículos, avances de los proyectos y alguna cosa más. Pocas veces y sin relleno.</p>
<p style="margin:26px 0"><a href="${enlace}" style="display:inline-block;background:#23211d;color:#fffdf9;text-decoration:none;padding:12px 20px;border-radius:8px;font:600 15px Helvetica,Arial,sans-serif">Sí, apúntame</a></p>
<p>Si no has sido tú, ignora este correo y no pasará nada.</p><p>Roberto</p>`,
      pie: "Este enlace caduca en 3 días.",
    }),
  });
}

export async function confirmarAlta(token) {
  const v = await leer();
  const p = v.pendientes[String(token || "")];
  if (!p) return null;
  const id = await listaId(v);
  await brevo("POST", "/contacts", { email: p.email, listIds: [id], updateEnabled: true });
  delete v.pendientes[token];
  await guardar(v);
  await avisoExterno({ clave: `suscriptor:${p.email}`, tipo: "suscriptor", titulo: "Nuevo suscriptor a la newsletter", texto: p.email.replace(/^(.).*(@.*)$/, "$1…$2") }).catch(() => {});
  return p.email;
}

// ───────────────────────── números ─────────────────────────

async function articulosRecientes(dias) {
  try {
    const r = await d.requestAeternalBlogArticles("");
    const desde = Date.now() - dias * 24 * 3600 * 1000;
    return (r.articles || [])
      .filter((a) => !a.created_at || Date.parse(String(a.created_at).replace(" ", "T")) > desde)
      .slice(0, 6)
      .map((a) => ({ titulo: a.title, entradilla: a.excerpt, url: `${WEB}blog.php?post=${a.slug}` }));
  } catch {
    return [];
  }
}

export async function escribirNumero({ notas = "" } = {}) {
  const v = await leer();
  const ultimo = v.numeros.find((n) => n.estado === "enviado");
  const dias = ultimo ? Math.max(7, Math.ceil((Date.now() - Date.parse(ultimo.enviado)) / 86400000)) : 45;
  const [voz, articulos] = await Promise.all([instruccionVoz(), articulosRecientes(dias)]);
  const r = await d.openaiChat({
    model: d.openaiTextModel,
    json: true,
    temperature: 0.5,
    maxTokens: 2200,
    messages: [
      {
        role: "system",
        content: [
          "Escribes la newsletter de Roberto Díaz (Æternal Flow): un correo personal a gente que se ha apuntado porque le interesa lo que hace. Primera persona, como una carta a alguien que te conoce un poco.",
          "Estructura libre pero corta (300-600 palabras): lo que ha publicado (con su enlace), lo que el autor cuenta en sus notas, y una idea o tema libre que le ronde, si encaja. Nada de «en esta edición», ni secciones de boletín corporativo, ni pedir que compartan.",
          "No inventes nada: ni avances, ni cifras, ni fechas. Si hay poco que contar, que sea corto.",
          "Markdown sencillo (## para algún apartado si hace falta, listas, **negritas**, [enlaces](url)). Sin título #. Termina firmando «Roberto».",
          "Responde solo JSON: {\"asunto\": \"asunto del correo, máx. 70 caracteres, nada de clickbait\", \"cuerpo\": \"markdown\"}.",
          voz,
        ].filter(Boolean).join("\n"),
      },
      { role: "user", content: JSON.stringify({ publicado_desde_el_ultimo_envio: articulos, notas_de_roberto: texto(notas, 1500), dias_desde_el_ultimo: ultimo ? dias : null }) },
    ],
  });
  const j = JSON.parse(String(r.text).replace(/^```(?:json)?\s*|\s*```$/g, ""));
  const ahora = new Date().toISOString();
  const numero = { id: crypto.randomUUID(), asunto: texto(j.asunto, 120), cuerpo: texto(j.cuerpo, 20000), original: texto(j.cuerpo, 20000), estado: "borrador", creado: ahora, actualizado: ahora };
  v.numeros.unshift(numero);
  v.numeros = v.numeros.slice(0, 60);
  await guardar(v);
  return numero;
}

const htmlDeNumero = (n) => plantilla({
  cuerpoHtml: markdownAHtml(n.cuerpo),
  pie: `Recibes esto porque te apuntaste en <a href="${WEB}" style="color:#8a8275">aeternal-flow.es</a>. <a href="{{ unsubscribe }}" style="color:#8a8275">Darte de baja</a>.`,
});

async function campana(n, v) {
  if (n.campanaId) return n.campanaId;
  const c = await brevo("POST", "/emailCampaigns", {
    name: `Newsletter ${new Date().toISOString().slice(0, 10)} · ${n.asunto}`.slice(0, 120),
    subject: n.asunto,
    sender: remitente(),
    htmlContent: htmlDeNumero(n),
    recipients: { listIds: [await listaId(v)] },
  });
  n.campanaId = c.id;
  return c.id;
}

export async function enviarNumero(id, { prueba = false } = {}) {
  const v = await leer();
  const n = v.numeros.find((x) => x.id === id);
  if (!n) throw Object.assign(new Error("Número no encontrado"), { status: 404 });
  if (n.estado === "enviado") throw new Error("Este número ya se envió.");
  if (!n.asunto || !n.cuerpo.trim()) throw new Error("Falta el asunto o el texto.");
  if (prueba) {
    await brevo("POST", "/smtp/email", { sender: remitente(), to: [{ email: remitente().email }], subject: `[Prueba] ${n.asunto}`, htmlContent: htmlDeNumero(n).replace("{{ unsubscribe }}", "#") });
    n.prueba = new Date().toISOString();
  } else {
    // Si se ha cambiado algo desde que se creó la campaña, se rehace con el texto bueno.
    if (n.campanaId && n.campanaActualizada !== n.actualizado) {
      await brevo("PUT", `/emailCampaigns/${n.campanaId}`, { subject: n.asunto, htmlContent: htmlDeNumero(n) });
    }
    const cid = await campana(n, v);
    await brevo("POST", `/emailCampaigns/${cid}/sendNow`);
    Object.assign(n, { estado: "enviado", enviado: new Date().toISOString() });
    if (n.original && n.original !== n.cuerpo) {
      n.lecciones = (await aprenderDeCorreccion({ antes: n.original, despues: n.cuerpo, donde: `newsletter: ${n.asunto}` }).catch(() => [])).map((l) => l.texto);
    }
  }
  n.campanaActualizada = n.actualizado;
  await guardar(v);
  return n;
}

export async function cifras() {
  if (!clave()) return { conectado: false };
  const v = await leer();
  const salida = { conectado: true, suscriptores: null, envios: [], pendientes: Object.keys(v.pendientes).length };
  try {
    const id = await listaId(v);
    const l = await brevo("GET", `/contacts/lists/${id}`);
    salida.suscriptores = l.uniqueSubscribers ?? l.totalSubscribers ?? 0;
  } catch (e) {
    salida.error = e.message;
  }
  try {
    const c = await brevo("GET", "/emailCampaigns?status=sent&limit=6&offset=0&sort=desc&statistics=globalStats");
    salida.envios = (c.campaigns || []).map((x) => {
      const s = x.statistics?.globalStats || {};
      return { asunto: x.subject, fecha: x.sentDate, entregados: s.delivered ?? 0, abiertos: s.uniqueViews ?? 0, clics: s.uniqueClicks ?? 0, bajas: s.unsubscriptions ?? 0 };
    });
  } catch { /* sin envíos todavía */ }
  return salida;
}

export async function numerosEnviados(desde = 0) {
  const v = await leer();
  return v.numeros.filter((n) => n.estado === "enviado" && Date.parse(n.enviado) > desde);
}

// ───────────────────────── rutas ─────────────────────────

export function montarNewsletter(app, dependencias) {
  d = dependencias;
  archivo = path.join(d.dataDirectory, "newsletter.json");
  const { requireAuth } = d;
  const responder = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  };

  // Formulario de la web (sin sesión). Devuelve a la web con ?suscripcion=… para que lo diga.
  app.post("/newsletter/alta", express.urlencoded({ extended: false, limit: "4kb" }), async (req, res) => {
    const volver = (estado) => res.redirect(303, `${WEB}?suscripcion=${estado}#newsletter`);
    if (texto(req.body?.web, 200)) return volver("pendiente"); // campo trampa: un robot lo rellena
    if (demasiados(req.ip || "")) return volver("error");
    try {
      await pedirAlta(req.body?.email, d.publicOrigin(req));
      volver("pendiente");
    } catch (error) {
      console.error("Newsletter: alta fallida:", error.message);
      volver(/correo no válido/.test(error.message) ? "correo" : "error");
    }
  });

  app.get("/newsletter/confirmar", async (req, res) => {
    try {
      const email = await confirmarAlta(req.query.t);
      res.redirect(303, `${WEB}?suscripcion=${email ? "ok" : "caducado"}#newsletter`);
    } catch (error) {
      console.error("Newsletter: confirmación fallida:", error.message);
      res.redirect(303, `${WEB}?suscripcion=error#newsletter`);
    }
  });

  app.get("/api/newsletter", requireAuth, responder(async () => ({ ...(await cifras()), numeros: (await leer()).numeros, remitente: remitente().email })));
  app.post("/api/newsletter/numeros", requireAuth, responder((req) => escribirNumero({ notas: req.body?.notas })));
  app.patch("/api/newsletter/numeros/:id", requireAuth, responder(async (req) => {
    const v = await leer();
    const n = v.numeros.find((x) => x.id === req.params.id);
    if (!n) throw Object.assign(new Error("Número no encontrado"), { status: 404 });
    if (n.estado === "enviado") throw new Error("Ya se envió: no se puede cambiar.");
    if (typeof req.body?.asunto === "string") n.asunto = texto(req.body.asunto, 120);
    if (typeof req.body?.cuerpo === "string") n.cuerpo = texto(req.body.cuerpo, 20000);
    n.actualizado = new Date().toISOString();
    await guardar(v);
    return n;
  }));
  app.post("/api/newsletter/numeros/:id/prueba", requireAuth, responder((req) => enviarNumero(req.params.id, { prueba: true })));
  app.post("/api/newsletter/numeros/:id/enviar", requireAuth, responder((req) => enviarNumero(req.params.id)));
  app.delete("/api/newsletter/numeros/:id", requireAuth, responder(async (req) => {
    const v = await leer();
    v.numeros = v.numeros.filter((x) => x.id !== req.params.id || x.estado === "enviado");
    await guardar(v);
    return { ok: true };
  }));
}

export const _interno = { leer, guardar, plantilla, htmlDeNumero, RE_CORREO };
