// Lo que MiBØ cuenta a Flow desde el Mac: en qué anda Roberto y las imágenes de cada proyecto.
//
// MiBØ (en el Mac) llama aquí con su propia clave (cabecera X-MiBO-Token = MIBO_FLOW_TOKEN);
// Flow no puede llamar al Mac. MiBØ ya ha pasado su filtro de privacidad antes de enviar.
//
// Guarda en DATA_DIRECTORY:
//   mibo-contexto.json     proyectos (estado, objetivo, siguiente paso, notas recientes) y diario
//   mibo-imagenes/         imágenes recientes de cada proyecto, con su índice (indice.json)

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { numerosEnviados } from "./newsletter.mjs";

let d = null;
let dir = "";
let archivoContexto = "";

const MAX_IMAGENES = 150;
const MAX_BYTES = 6 * 1024 * 1024;
const TIPOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const texto = (v, max) => String(v ?? "").trim().slice(0, max);

async function leerJson(f, vacio) {
  try {
    return JSON.parse(await fs.readFile(f, "utf8"));
  } catch {
    return vacio;
  }
}

async function guardarJson(f, v) {
  await fs.mkdir(path.dirname(f), { recursive: true });
  const tmp = `${f}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(v, null, 2), { mode: 0o600 });
  await fs.rename(tmp, f);
}

const indice = () => leerJson(path.join(dir, "indice.json"), []);
const guardarIndice = (v) => guardarJson(path.join(dir, "indice.json"), v);

export async function contextoMibo() {
  return leerJson(archivoContexto, { recibido: "", proyectos: [], diario: [] });
}

export async function imagenesMibo({ proyecto = "", max = 40 } = {}) {
  const lista = await indice();
  const p = proyecto.toLowerCase();
  return lista.filter((i) => !p || String(i.proyecto || "").toLowerCase() === p).slice(0, max);
}

export function rutaImagen(id) {
  if (!/^[a-f0-9]{40}\.(jpg|png|webp)$/.test(id)) return "";
  return path.join(dir, id);
}

// Resumen corto para meter en un prompt: qué lleva entre manos y qué ha hecho últimamente.
export async function resumenParaEscribir({ proyecto = "", maxProyectos = 14 } = {}) {
  const c = await contextoMibo();
  if (!c.proyectos?.length) return "";
  const elegidos = proyecto
    ? c.proyectos.filter((p) => p.nombre.toLowerCase().includes(proyecto.toLowerCase()) || proyecto.toLowerCase().includes(p.nombre.toLowerCase()))
    : c.proyectos.filter((p) => !/parado|cerrado|descartado|aparcado/i.test(p.estado || "")).slice(0, maxProyectos);
  if (!elegidos.length) return "";
  const lineas = elegidos.map((p) => [
    `· ${p.nombre}${p.estado ? ` (${p.estado})` : ""}`,
    p.que ? `  Qué es: ${p.que}` : "",
    p.objetivo ? `  Objetivo: ${p.objetivo}` : "",
    p.siguiente ? `  Siguiente paso: ${p.siguiente}` : "",
    ...(p.notas || []).slice(0, 4).map((n) => `  - ${n}`),
  ].filter(Boolean).join("\n"));
  return `Lo que Roberto lleva entre manos según MiBØ (actualizado ${String(c.recibido).slice(0, 10)}). Son datos reales: úsalos, no los adornes:\n${lineas.join("\n")}`;
}

function autorizado(req) {
  const esperada = String(process.env.MIBO_FLOW_TOKEN || "").trim();
  const llega = String(req.get("X-MiBO-Token") || "").trim();
  if (!esperada || !llega) return false;
  const a = Buffer.from(esperada);
  const b = Buffer.from(llega);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function limpiarProyecto(p) {
  return {
    nombre: texto(p?.nombre, 120),
    estado: texto(p?.estado, 120),
    que: texto(p?.que, 400),
    objetivo: texto(p?.objetivo, 400),
    siguiente: texto(p?.siguiente, 400),
    notas: (Array.isArray(p?.notas) ? p.notas : []).map((n) => texto(n, 500)).filter(Boolean).slice(0, 8),
  };
}

export function montarDesdeMibo(app, dependencias) {
  d = dependencias;
  dir = path.join(d.dataDirectory, "mibo-imagenes");
  archivoContexto = path.join(d.dataDirectory, "mibo-contexto.json");
  const { requireAuth } = d;

  // ── Entradas de MiBØ (sin sesión: entra con su clave) ──
  app.post("/api/mibo/contexto", async (req, res) => {
    if (!autorizado(req)) return res.status(401).json({ error: "Clave de MiBØ incorrecta" });
    const proyectos = (Array.isArray(req.body?.proyectos) ? req.body.proyectos : []).map(limpiarProyecto).filter((p) => p.nombre).slice(0, 60);
    const diario = (Array.isArray(req.body?.diario) ? req.body.diario : [])
      .map((x) => ({ dia: texto(x?.dia, 10), texto: texto(x?.texto, 1500) })).filter((x) => x.texto).slice(0, 14);
    await guardarJson(archivoContexto, { recibido: new Date().toISOString(), proyectos, diario });
    res.json({ ok: true, proyectos: proyectos.length, diario: diario.length });
  });

  app.post("/api/mibo/imagen", async (req, res) => {
    if (!autorizado(req)) return res.status(401).json({ error: "Clave de MiBØ incorrecta" });
    try {
      const ext = TIPOS[String(req.body?.tipo || "")];
      if (!ext) throw new Error("Solo JPG, PNG o WebP.");
      const datos = Buffer.from(String(req.body?.base64 || ""), "base64");
      if (!datos.length || datos.length > MAX_BYTES) throw new Error("Imagen vacía o demasiado grande.");
      const hash = crypto.createHash("sha1").update(datos).digest("hex");
      const id = `${hash}.${ext}`;
      const lista = await indice();
      if (!lista.some((i) => i.id === id)) {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, id), datos, { mode: 0o600 });
        lista.unshift({
          id,
          proyecto: texto(req.body?.proyecto, 120),
          nombre: texto(req.body?.nombre, 200),
          fecha: texto(req.body?.fecha, 30) || new Date().toISOString(),
          recibida: new Date().toISOString(),
        });
        for (const vieja of lista.splice(MAX_IMAGENES)) await fs.rm(path.join(dir, vieja.id), { force: true });
        await guardarIndice(lista);
      }
      res.json({ ok: true, id, nueva: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // MiBØ pregunta qué hay de nuevo en Flow: avisos sin atender, lo publicado desde «desde»
  // y cuántos borradores esperan. Así lo apunta en sus proyectos y lo cuenta en el plan del día.
  app.get("/api/mibo/novedades", async (req, res) => {
    if (!autorizado(req)) return res.status(401).json({ error: "Clave de MiBØ incorrecta" });
    const desde = Date.parse(String(req.query.desde || "")) || Date.now() - 7 * 24 * 3600 * 1000;
    const avisos = (await leerJson(path.join(d.dataDirectory, "avisos-flow.json"), { avisos: [] })).avisos
      .filter((a) => a.estado === "nuevo")
      .map(({ id, tipo, titulo, texto: t, url, fecha, producto }) => ({ id, tipo, titulo, texto: String(t || "").split("\n")[0], url, fecha, producto }));
    const vis = await leerJson(path.join(d.dataDirectory, "visibilidad.json"), { borradores: [] });
    const articulos = (vis.borradores || [])
      .filter((b) => b.estado === "publicado" && Date.parse(b.publicado) > desde)
      .map((b) => ({ id: `art-${b.id}`, canal: "Blog", titulo: b.titulo, url: b.url || "", fecha: b.publicado, proyecto: b.proyectoMibo || "", producto: b.producto || "" }));
    const posts = d.readPublicationPosts ? await d.readPublicationPosts().catch(() => []) : [];
    const publicaciones = posts
      .filter((p) => /^published/.test(String(p.status || "")) && Date.parse(p.publishedAt || p.updatedAt) > desde && (p.target?.id || p.targetId) !== "blog")
      .map((p) => ({
        id: `pub-${p.id}`,
        canal: p.target?.name || p.targetId || "Red",
        titulo: String(p.caption || "").split("\n")[0].slice(0, 140),
        url: p.publicUrl || "",
        fecha: p.publishedAt || p.updatedAt,
      }));
    const newsletters = (await numerosEnviados(desde).catch(() => [])).map((n) => ({ id: `news-${n.id}`, canal: "Newsletter", titulo: n.asunto, url: "", fecha: n.enviado }));
    const esperando = (vis.borradores || []).filter((b) => b.estado === "borrador").map((b) => b.titulo).slice(0, 10);
    res.json({ ahora: new Date().toISOString(), avisos, publicado: [...articulos, ...publicaciones, ...newsletters], borradores: esperando, ideas: (vis.ideas?.lista || []).length, flow: process.env.PUBLIC_ORIGIN || "" });
  });

  // ── Para la pantalla de Flow (con sesión) ──
  app.get("/api/mibo", requireAuth, async (_, res) => {
    res.json({ contexto: await contextoMibo(), imagenes: await imagenesMibo({ max: MAX_IMAGENES }), conectado: Boolean(process.env.MIBO_FLOW_TOKEN) });
  });

  app.get("/api/mibo/imagenes/:id", requireAuth, (req, res) => {
    const ruta = rutaImagen(String(req.params.id || ""));
    if (!ruta) return res.status(404).send("No encontrada");
    res.sendFile(ruta, (error) => {
      if (error && !res.headersSent) res.status(404).send("No encontrada");
    });
  });

  app.delete("/api/mibo/imagenes/:id", requireAuth, async (req, res) => {
    const ruta = rutaImagen(String(req.params.id || ""));
    if (!ruta) return res.status(404).json({ error: "No encontrada" });
    await fs.rm(ruta, { force: true });
    await guardarIndice((await indice()).filter((i) => i.id !== req.params.id));
    res.json({ ok: true });
  });
}
