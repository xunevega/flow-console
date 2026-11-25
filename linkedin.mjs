// Publicación en LinkedIn por la API oficial (productos "Share on LinkedIn" y
// "Sign In with LinkedIn using OpenID Connect" de una app de LinkedIn Developers).
//
// - Roberto autoriza una vez desde Flow Console (/oauth/linkedin/start).
// - El token se guarda en el volumen de datos (linkedin-oauth.json), no en el chat ni en Railway.
// - LinkedIn da tokens de 60 días; si la app tiene refresh token se renueva sola,
//   si no, Flow avisa unos días antes para volver a pulsar "Conectar LinkedIn".
// - La API solo publica posts (máx. 3.000 caracteres); artículos y textos largos van a mano.

import fs from "node:fs/promises";
import path from "node:path";

export const LINKEDIN_POST_MAX = 3000;
const SCOPES = "openid profile w_member_social";

// La API no publica artículos ni posts de más de 3.000 caracteres: esos van a mano.
export function linkedinVaAMano(payload) {
  return payload?.options?.linkedinMode === "article"
    || String(payload?.caption || "").trim().length > LINKEDIN_POST_MAX;
}

export function createLinkedIn({ dataDirectory, publicOrigin, makeState, checkState, readMedia }) {
  const tokenFile = path.join(dataDirectory, "linkedin-oauth.json");

  function config() {
    return {
      clientId: String(process.env.LINKEDIN_CLIENT_ID || "").trim(),
      clientSecret: String(process.env.LINKEDIN_CLIENT_SECRET || "").trim(),
    };
  }

  function appConfigured() {
    const { clientId, clientSecret } = config();
    return Boolean(clientId && clientSecret);
  }

  function redirectUri(req) {
    const configured = String(process.env.LINKEDIN_REDIRECT_URI || "").trim();
    return configured || `${publicOrigin(req)}/oauth/linkedin/callback`;
  }

  async function readToken() {
    try {
      return JSON.parse(await fs.readFile(tokenFile, "utf8"));
    } catch {
      return null;
    }
  }

  async function writeToken(token) {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temp = `${tokenFile}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(token, null, 2), { mode: 0o600 });
    await fs.rename(temp, tokenFile);
  }

  function authUrl(req) {
    const { clientId } = config();
    if (!appConfigured()) throw new Error("Faltan LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET en las variables de Railway");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri(req),
      scope: SCOPES,
      state: makeState("linkedin-oauth"),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  async function tokenRequest(body) {
    const { clientId, clientSecret } = config();
    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.access_token) {
      throw new Error(result.error_description || result.error || `LinkedIn OAuth respondió ${response.status}`);
    }
    return result;
  }

  function tokenRecord(result, previous = {}) {
    const now = Date.now();
    return {
      ...previous,
      accessToken: result.access_token,
      expiresAt: now + Number(result.expires_in || 0) * 1000,
      refreshToken: result.refresh_token || previous.refreshToken || "",
      refreshExpiresAt: result.refresh_token_expires_in
        ? now + Number(result.refresh_token_expires_in) * 1000
        : previous.refreshExpiresAt || 0,
      scope: result.scope || previous.scope || "",
      updatedAt: new Date(now).toISOString(),
    };
  }

  async function handleCallback(req) {
    if (!checkState(req.query?.state, "linkedin-oauth")) {
      const error = new Error("Autorización caducada. Vuelve a pulsar Conectar LinkedIn en Flow Console.");
      error.status = 401;
      throw error;
    }
    if (req.query?.error) throw new Error(String(req.query.error_description || req.query.error));
    const code = String(req.query?.code || "").trim();
    if (!code) throw new Error("LinkedIn no devolvió código de autorización.");
    const result = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(req) });
    const me = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${result.access_token}` },
      signal: AbortSignal.timeout(30000),
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.sub) throw new Error(body.message || `LinkedIn userinfo respondió ${response.status}`);
      return body;
    });
    const token = tokenRecord(result, { personUrn: `urn:li:person:${me.sub}`, name: me.name || "" });
    await writeToken(token);
    return { name: token.name, expiresAt: token.expiresAt };
  }

  async function accessToken() {
    const token = await readToken();
    if (!token?.accessToken) throw new Error("LinkedIn no está conectado: pulsa CONECTAR LINKEDIN en Flow Console");
    if (token.expiresAt > Date.now() + 60 * 1000) return token;
    if (token.refreshToken && (!token.refreshExpiresAt || token.refreshExpiresAt > Date.now())) {
      const refreshed = tokenRecord(await tokenRequest({ grant_type: "refresh_token", refresh_token: token.refreshToken }), token);
      await writeToken(refreshed);
      return refreshed;
    }
    throw new Error("La conexión con LinkedIn ha caducado: pulsa CONECTAR LINKEDIN en Flow Console");
  }

  async function status() {
    const token = await readToken();
    const now = Date.now();
    const canRefresh = Boolean(token?.refreshToken && (!token.refreshExpiresAt || token.refreshExpiresAt > now));
    const connected = Boolean(token?.accessToken && (token.expiresAt > now || canRefresh));
    const until = canRefresh ? (token.refreshExpiresAt || 0) : (token?.expiresAt || 0);
    return {
      appConfigured: appConfigured(),
      connected,
      name: token?.name || "",
      expiresAt: until ? new Date(until).toISOString() : null,
      daysLeft: until ? Math.floor((until - now) / 86400000) : null,
    };
  }

  // LinkedIn interpreta el texto como "little text": estos caracteres hay que escaparlos
  // o corta el post. Los #hashtags se convierten a su plantilla para que sigan siendo enlaces.
  function littleText(text) {
    const reserved = /[\\|{}@[\]()<>#*_~]/g;
    const parts = [];
    let last = 0;
    const hashtag = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;
    for (const match of String(text).matchAll(hashtag)) {
      const start = match.index + match[1].length;
      parts.push(String(text).slice(last, start).replace(reserved, "\\$&"));
      parts.push(`{hashtag|\\#|${match[2]}}`);
      last = start + 1 + match[2].length;
    }
    parts.push(String(text).slice(last).replace(reserved, "\\$&"));
    return parts.join("");
  }

  function apiVersions() {
    const fixed = String(process.env.LINKEDIN_API_VERSION || "").trim();
    if (fixed) return [fixed];
    const versions = [];
    const date = new Date();
    for (let back = 1; back <= 4; back += 1) {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - back, 1));
      versions.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return versions;
  }

  // Llama a la API REST probando versiones recientes: LinkedIn no publica una cada mes.
  async function rest(token, pathAndQuery, body) {
    let lastError = null;
    for (const version of apiVersions()) {
      const response = await fetch(`https://api.linkedin.com/rest${pathAndQuery}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": version,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      const text = await response.text();
      let result = {};
      try { result = text ? JSON.parse(text) : {}; } catch { result = { message: text }; }
      if (response.ok) return { response, result };
      const message = result.message || `LinkedIn respondió ${response.status}`;
      lastError = new Error(`LinkedIn: ${message}`);
      lastError.status = response.status;
      if (!(response.status === 426 || /NONEXISTENT_VERSION|version/i.test(String(result.code || message)))) break;
    }
    throw lastError;
  }

  async function uploadImage(token, imageUrl) {
    const { bytes, mimeType } = await readMedia(imageUrl);
    if (!/^image\/(jpeg|png|gif)$/.test(mimeType)) {
      throw new Error("LinkedIn solo acepta imágenes JPG, PNG o GIF");
    }
    const { result } = await rest(token, "/images?action=initializeUpload", {
      initializeUploadRequest: { owner: token.personUrn },
    });
    const uploadUrl = result?.value?.uploadUrl;
    const image = result?.value?.image;
    if (!uploadUrl || !image) throw new Error("LinkedIn no devolvió dónde subir la imagen");
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": mimeType },
      body: bytes,
      signal: AbortSignal.timeout(120000),
    });
    if (!put.ok) throw new Error(`LinkedIn no aceptó la imagen (${put.status})`);
    return image;
  }

  async function publish(payload) {
    const caption = String(payload?.caption || "").trim();
    if (!caption) throw new Error("Falta el texto del post");
    if (payload?.options?.linkedinMode === "article") {
      throw new Error("La API oficial de LinkedIn no publica artículos. Cambia a Post o publícalo a mano desde LinkedIn");
    }
    if (caption.length > LINKEDIN_POST_MAX) {
      throw new Error(`El post tiene ${caption.length} caracteres y LinkedIn admite ${LINKEDIN_POST_MAX}. Acórtalo o publícalo a mano como artículo`);
    }
    const token = await accessToken();
    const body = {
      author: token.personUrn,
      commentary: littleText(caption),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (payload.imageUrl) {
      body.content = { media: { id: await uploadImage(token, payload.imageUrl) } };
    }
    const { response, result } = await rest(token, "/posts", body);
    const postUrn = response.headers.get("x-restli-id") || result?.id || "";
    return {
      ok: true,
      status: "published_on_linkedin",
      deliveryMode: "linkedin_api",
      postUrn,
      url: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}/` : "",
      publishedAt: new Date().toISOString(),
    };
  }

  return { appConfigured, authUrl, handleCallback, status, publish, littleText };
}
