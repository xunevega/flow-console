// Cola de artículos de LinkedIn para el robot del Mac (robot-redes/robot.mjs --publicar).
//
// La API oficial de LinkedIn no publica artículos ni posts de más de 3.000 caracteres.
// Flow los deja en cola ("robot_queued"); el robot del Mac, con el Chrome y la sesión de
// Roberto, los recoge, los publica en «Escribir artículo» y avisa aquí del resultado.
// Flow no puede llamar al Mac: es el robot quien pregunta, con ESTADISTICAS_ROBOT_TOKEN.
// Si el robot falla, el artículo vuelve a "pendiente de confirmar" para hacerlo a mano.

import crypto from "node:crypto";

export const ROBOT_QUEUED = "robot_queued";
const ROBOT_WORKING = "robot_publishing";
const ROBOT_DONE = "published_by_mac_robot";
const REINTENTO_MS = 30 * 60 * 1000;

function robotAutorizado(req) {
  const esperado = String(process.env.ESTADISTICAS_ROBOT_TOKEN || "");
  const recibido = String(req.get("x-robot-token") || "");
  if (esperado.length < 24 || recibido.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
}

// Título: la primera línea; si es muy larga, su primera frase.
export function tituloYCuerpo(caption) {
  const texto = String(caption || "").replace(/\r/g, "").trim();
  const lineas = texto.split("\n");
  let titulo = (lineas.shift() || "").trim();
  let resto = lineas.join("\n").trim();
  if (titulo.length > 150) {
    const frase = titulo.match(/^(.{10,150}?[.?!])\s/);
    const corte = frase ? frase[1] : titulo.slice(0, 150).replace(/\s+\S*$/, "");
    resto = `${titulo.slice(corte.length).trim()}${resto ? `\n${resto}` : ""}`;
    titulo = corte.trim();
  }
  return { titulo, cuerpo: resto };
}

function sinImagenesIncrustadas(html) {
  return String(html || "").replace(/<img[^>]+src=["']data:[^>]*>/gi, "");
}

const textoPlano = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// El título va en su campo: se quita del HTML el bloque (de los 3 primeros) donde empieza.
export function htmlSinTitulo(html, titulo) {
  const limpio = sinImagenesIncrustadas(html);
  const t = textoPlano(titulo);
  if (!limpio || !t) return limpio;
  const bloques = /<(p|h[1-6]|div)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (let i = 0, m; i < 3 && (m = bloques.exec(limpio)); i += 1) {
    const texto = textoPlano(m[2]);
    if (!texto) { i -= 1; continue; }
    if (!texto.startsWith(t)) continue;
    const resto = texto.slice(t.length).trim();
    return limpio.slice(0, m.index) + (resto ? `<p>${resto.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : "") + limpio.slice(m.index + m[0].length);
  }
  return limpio;
}

export function montarRobotLinkedin(app, { readPublicationPosts, writePublicationPosts, alPublicar, publicOrigin }) {
  // El robot pregunta qué hay pendiente. También devuelve los que se quedaron a medias hace rato.
  app.get("/api/publications/posts-robot/linkedin", async (req, res) => {
    if (!robotAutorizado(req)) return res.status(401).json({ error: "No autorizado" });
    try {
      const ahora = Date.now();
      const posts = await readPublicationPosts();
      const pendientes = posts.filter((post) => (post.target?.id || post.targetId) === "linkedin" && (
        post.status === ROBOT_QUEUED
        || (post.status === ROBOT_WORKING && ahora - new Date(post.updatedAt || 0).getTime() > REINTENTO_MS)
      ));
      res.json({
        ok: true,
        articulos: pendientes.map((post) => {
          const { titulo, cuerpo } = tituloYCuerpo(post.caption);
          let imagen = String(post.imageUrl || "");
          if (imagen.startsWith("/")) imagen = `${publicOrigin(req)}${imagen}`;
          return {
            id: post.id,
            titulo,
            cuerpo,
            html: htmlSinTitulo(post.captionHtml, titulo),
            imagen,
            intentos: Number(post.robotIntentos || 0),
          };
        }),
      });
    } catch (error) {
      res.status(500).json({ error: `No se pudo leer la cola: ${error.message}` });
    }
  });

  // El robot cuenta cómo le ha ido: publicando | publicado (con url) | fallo (con error).
  app.post("/api/publications/posts-robot/linkedin/:id", async (req, res) => {
    if (!robotAutorizado(req)) return res.status(401).json({ error: "No autorizado" });
    try {
      const posts = await readPublicationPosts();
      const index = posts.findIndex((post) => post.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: "Publicación no encontrada" });
      const estado = String(req.body?.estado || "");
      const now = new Date().toISOString();
      const post = { ...posts[index], updatedAt: now };
      if (estado === "publicando") {
        post.status = ROBOT_WORKING;
        post.robotIntentos = Number(post.robotIntentos || 0) + 1;
      } else if (estado === "publicado") {
        const url = /^https:\/\/www\.linkedin\.com\//.test(String(req.body?.url || "")) ? String(req.body.url) : "";
        Object.assign(post, {
          action: "publish",
          status: ROBOT_DONE,
          publishedAt: now,
          finalUrl: url,
          publicUrl: url,
          lastError: null,
          result: { ...(post.result || {}), ok: true, status: ROBOT_DONE, deliveryMode: "robot_mac", url, publicUrl: url },
        });
      } else if (estado === "fallo") {
        Object.assign(post, {
          status: "pending_confirmation",
          deliveryMode: "a mano",
          lastError: `El robot del Mac no pudo publicarlo (${String(req.body?.error || "sin detalle").slice(0, 300)}). Publícalo a mano y confírmalo aquí.`,
        });
      } else {
        return res.status(400).json({ error: "Estado no válido" });
      }
      posts[index] = post;
      await writePublicationPosts(posts);
      if (estado === "publicado") await alPublicar(post).catch(() => {});
      res.json({ ok: true, status: post.status });
    } catch (error) {
      res.status(500).json({ error: `No se pudo guardar: ${error.message}` });
    }
  });
}
