// Publica en Instagram con la API oficial (Instagram API with Instagram Login).
// Sustituye al antiguo worker de navegador. Flow lo llama directamente, sin pasar por n8n,
// igual que YouTube, Pinterest y el blog.
//
// Variables:
//   INSTAGRAM_ACCESS_TOKEN  token de larga duración (empieza por IGAA…), dura 60 días
//   DATA_DIRECTORY          aquí se guarda el token renovado (instagram-token.json)

import fs from "node:fs/promises";
import path from "node:path";

const API = "https://graph.instagram.com/v23.0";
const RENOVAR_CADA_MS = 7 * 24 * 60 * 60 * 1000;

function archivoToken(dataDirectory) {
  return path.join(dataDirectory, "instagram-token.json");
}

async function leerTokenGuardado(dataDirectory) {
  try {
    const guardado = JSON.parse(await fs.readFile(archivoToken(dataDirectory), "utf8"));
    return guardado?.token ? guardado : null;
  } catch {
    return null;
  }
}

async function guardarToken(dataDirectory, token, expiresIn) {
  const datos = {
    token,
    renovadoEn: new Date().toISOString(),
    caducaEn: expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString() : null,
  };
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(archivoToken(dataDirectory), JSON.stringify(datos, null, 2), { mode: 0o600 });
}

// El token del archivo manda sobre el de la variable, salvo que la variable sea más nueva
// (Roberto ha pegado uno nuevo): entonces se usa la variable y se olvida el archivo.
async function tokenActual(dataDirectory) {
  const deVariable = String(process.env.INSTAGRAM_ACCESS_TOKEN || "").trim();
  const guardado = await leerTokenGuardado(dataDirectory);
  if (guardado && deVariable && guardado.origen !== deVariable.slice(-12)) {
    return { token: deVariable, renovadoEn: null, origen: deVariable.slice(-12) };
  }
  if (guardado) return guardado;
  return deVariable ? { token: deVariable, renovadoEn: null, origen: deVariable.slice(-12) } : null;
}

async function llamar(metodo, ruta, parametros = {}) {
  const url = new URL(`${API}${ruta}`);
  const opciones = { method: metodo, signal: AbortSignal.timeout(60000) };
  if (metodo === "GET") {
    for (const [k, v] of Object.entries(parametros)) url.searchParams.set(k, v);
  } else {
    opciones.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    opciones.body = new URLSearchParams(parametros).toString();
  }
  const respuesta = await fetch(url, opciones);
  const texto = await respuesta.text();
  let cuerpo = {};
  try {
    cuerpo = texto ? JSON.parse(texto) : {};
  } catch {
    cuerpo = { error: { message: texto.slice(0, 300) } };
  }
  if (!respuesta.ok || cuerpo.error) {
    const e = cuerpo.error || {};
    const error = new Error(`Instagram respondió ${respuesta.status}: ${e.message || "error desconocido"}`);
    error.instagram = { status: respuesta.status, code: e.code, subcode: e.error_subcode, type: e.type };
    throw error;
  }
  return cuerpo;
}

// Renueva el token si tiene más de 7 días. Instagram solo deja renovarlo a partir de 24 h.
async function tokenRenovado(dataDirectory) {
  const actual = await tokenActual(dataDirectory);
  if (!actual?.token) throw new Error("Falta INSTAGRAM_ACCESS_TOKEN: pega el token de Instagram con poner-clave.command.");
  const edad = actual.renovadoEn ? Date.now() - Date.parse(actual.renovadoEn) : Infinity;
  if (edad < RENOVAR_CADA_MS) return actual.token;
  try {
    const nuevo = await llamar("GET", "/refresh_access_token", {
      grant_type: "ig_refresh_token",
      access_token: actual.token,
    });
    if (nuevo.access_token) {
      await guardarToken(dataDirectory, nuevo.access_token, nuevo.expires_in);
      const guardado = await leerTokenGuardado(dataDirectory);
      guardado.origen = actual.origen;
      await fs.writeFile(archivoToken(dataDirectory), JSON.stringify(guardado, null, 2), { mode: 0o600 });
      return nuevo.access_token;
    }
  } catch {
    // Si no se puede renovar (p. ej. tiene menos de 24 h) se sigue con el actual.
  }
  return actual.token;
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function esperarContenedor(id, token, maxMs) {
  const inicio = Date.now();
  while (Date.now() - inicio < maxMs) {
    const estado = await llamar("GET", `/${id}`, { fields: "status_code,status", access_token: token });
    if (estado.status_code === "FINISHED") return;
    if (estado.status_code === "ERROR" || estado.status_code === "EXPIRED") {
      throw new Error(`Instagram no pudo procesar el archivo (${estado.status_code})${estado.status ? `: ${estado.status}` : ""}.`);
    }
    await esperar(4000);
  }
  throw new Error("Instagram tarda demasiado en procesar el archivo; prueba otra vez en unos minutos.");
}

function urlPublica(valor) {
  try {
    const url = new URL(String(valor || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export async function publicarEnInstagram(payload, { dataDirectory }) {
  const imagen = urlPublica(payload?.imageUrl);
  const video = urlPublica(payload?.videoUrl);
  if (!imagen && !video) {
    throw new Error("Instagram necesita una imagen o un vídeo con dirección https pública.");
  }
  const caption = String(payload?.caption || "").slice(0, 2200);
  const token = await tokenRenovado(dataDirectory);

  const contenedor = await llamar("POST", "/me/media", video
    ? { media_type: "REELS", video_url: video, caption, access_token: token }
    : { image_url: imagen, caption, access_token: token });

  await esperarContenedor(contenedor.id, token, video ? 150000 : 60000);

  const publicado = await llamar("POST", "/me/media_publish", { creation_id: contenedor.id, access_token: token });
  let permalink = "";
  try {
    const datos = await llamar("GET", `/${publicado.id}`, { fields: "permalink", access_token: token });
    permalink = datos.permalink || "";
  } catch {
    // El enlace es un extra; si falla, la publicación ya está hecha.
  }
  return {
    ok: true,
    status: "published_to_instagram",
    deliveryMode: "instagram_api",
    mediaId: publicado.id,
    publicUrl: permalink,
    publishedAt: new Date().toISOString(),
  };
}

// Comprobación sin publicar nada: cuenta y tipo.
export async function cuentaInstagram({ dataDirectory }) {
  const token = await tokenRenovado(dataDirectory);
  return llamar("GET", "/me", { fields: "user_id,username,account_type", access_token: token });
}

export function instagramApiConfigurada() {
  return Boolean(String(process.env.INSTAGRAM_ACCESS_TOKEN || "").trim());
}
