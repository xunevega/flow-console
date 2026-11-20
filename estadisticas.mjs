// Estadísticas de Flow: junta en una sola respuesta lo que dicen GA4, Search Console,
// Pinterest, YouTube, el blog, Bing, Umami y lo que Roberto sube a mano (LinkedIn por Excel,
// Instagram por captura). Cada fuente va por separado: si una falla, las demás siguen.
//
// Guarda en DATA_DIRECTORY:
//   estadisticas-meses.json    resumen de cada mes y fuente (para meses que las APIs ya no dan)
//   estadisticas-manual.json   publicaciones de Instagram/LinkedIn con sus números
//   estadisticas-tokens.json   tokens que Flow renueva solo (Pinterest, YouTube)

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

let d = null; // dependencias que pasa server.mjs
let archivos = {};
let tokens = {};

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

// ───────────────────────── utilidades ─────────────────────────

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r0 = (v) => Math.round(num(v));
const pad = (n) => String(n).padStart(2, "0");
const isoDia = (date) => date.toISOString().slice(0, 10);

function rangoMes(year, month) {
  const inicio = new Date(Date.UTC(year, month - 1, 1));
  const fin = new Date(Date.UTC(year, month, 0));
  const hoy = new Date();
  const hasta = fin > hoy ? new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) : fin;
  return { desde: isoDia(inicio), hasta: isoDia(hasta), finMes: isoDia(fin), inicio, fin: hasta };
}

function mesAnterior(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

async function leerJson(archivo, vacio) {
  try {
    return JSON.parse(await fs.readFile(archivo, "utf8"));
  } catch {
    return vacio;
  }
}

async function guardarJson(archivo, valor) {
  await fs.mkdir(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(valor, null, 2), { mode: 0o600 });
  await fs.rename(tmp, archivo);
}

async function pedir(url, opciones = {}, nombre = "API") {
  const respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(opciones.timeout || 45000) });
  const texto = await respuesta.text();
  let cuerpo = {};
  try {
    cuerpo = texto ? JSON.parse(texto) : {};
  } catch {
    cuerpo = { message: texto.slice(0, 200) };
  }
  if (!respuesta.ok) {
    const mensaje = cuerpo?.error?.message || cuerpo?.error_description || cuerpo?.message
      || (typeof cuerpo?.error === "string" ? cuerpo.error : "") || `${nombre} respondió ${respuesta.status}`;
    const error = new Error(String(mensaje).slice(0, 300));
    error.status = respuesta.status;
    throw error;
  }
  return cuerpo;
}

async function fuente(nombre, fn) {
  try {
    const datos = await fn();
    if (datos && datos.estado === "sin_conectar") return datos;
    return { estado: "ok", ...datos };
  } catch (error) {
    return { estado: "error", detalle: error.message };
  }
}

// ───────────────────────── tokens que Flow renueva solo ─────────────────────────

export function tokenPinterest() {
  return tokens.pinterest?.access_token || String(process.env.PINTEREST_ACCESS_TOKEN || "").trim();
}

export function refreshTokenYoutube() {
  return tokens.youtube?.refresh_token || String(process.env.YOUTUBE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN || "").trim();
}

async function guardarTokens() {
  await guardarJson(archivos.tokens, tokens);
}

function pinterestApp() {
  return {
    id: String(process.env.PINTEREST_APP_ID || "").trim(),
    secreto: String(process.env.PINTEREST_APP_SECRET || "").trim(),
  };
}

async function renovarPinterestSiToca() {
  const t = tokens.pinterest;
  const { id, secreto } = pinterestApp();
  if (!t?.refresh_token || !id || !secreto) return;
  const edad = Date.now() - Date.parse(t.renovadoEn || 0);
  if (edad < 7 * 864e5) return;
  const cuerpo = await pedir("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secreto}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token, continuous_refresh: "true" }),
  }, "Pinterest");
  tokens.pinterest = {
    access_token: cuerpo.access_token,
    refresh_token: cuerpo.refresh_token || t.refresh_token,
    scope: cuerpo.scope || t.scope,
    renovadoEn: new Date().toISOString(),
  };
  await guardarTokens();
}

// ───────────────────────── GA4 ─────────────────────────

function canalDeOrigen(source, medium) {
  const s = String(source || "").toLowerCase();
  const m = String(medium || "").toLowerCase();
  if (/pinterest|pin\.it/.test(s)) return "Pinterest";
  if (/instagram|^ig$|l\.instagram/.test(s)) return "Instagram";
  if (/linkedin|lnkd/.test(s)) return "LinkedIn";
  if (/youtube|youtu\.be/.test(s)) return "YouTube";
  if (/facebook|fb\.|^fb$/.test(s)) return "Facebook";
  if (/tiktok/.test(s)) return "TikTok";
  if (/^t\.co$|twitter|^x$/.test(s)) return "X";
  if (/chatgpt|openai|perplexity|claude|gemini|copilot/.test(s)) return "Asistentes IA";
  if (/google/.test(s) && /organic/.test(m)) return "Google";
  if (/bing/.test(s)) return "Bing";
  if (/duckduckgo|ecosia|yahoo|brave/.test(s)) return "Otros buscadores";
  if (/google/.test(s)) return "Google";
  if (/email|newsletter|mail/.test(s) || /email/.test(m)) return "Email";
  if (s === "(direct)" || s === "" || m === "(none)") return "Directo";
  if (/aeternal-flow/.test(s)) return "Directo";
  return "Otras webs";
}

async function ga4(year, month) {
  const { propertyId, refreshToken } = d.ga4OAuthConfig();
  if (!propertyId || !refreshToken) return { estado: "sin_conectar", detalle: "Falta autorizar GA4." };
  const token = await d.ga4AccessToken();
  const correr = (body) => d.ga4RunReport({ propertyId, accessToken: token, body });
  const actual = rangoMes(year, month);
  const ant = mesAnterior(year, month);
  const anterior = rangoMes(ant.year, ant.month);
  const metricas = [{ name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" }, { name: "engagedSessions" }];
  const rango = [{ startDate: actual.desde, endDate: actual.hasta }];
  const [totales, origenes, paginas, campanas, diario, anio] = await Promise.all([
    correr({ dateRanges: [{ startDate: actual.desde, endDate: actual.hasta, name: "actual" }, { startDate: anterior.desde, endDate: anterior.finMes, name: "anterior" }], metrics: metricas }),
    correr({ dateRanges: rango, dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }], metrics: [{ name: "sessions" }, { name: "activeUsers" }], limit: 200 }),
    correr({ dateRanges: rango, dimensions: [{ name: "pagePathPlusQueryString" }, { name: "pageTitle" }], metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 100 }),
    correr({ dateRanges: rango, dimensions: [{ name: "sessionCampaignName" }, { name: "sessionManualAdContent" }, { name: "sessionSource" }], metrics: [{ name: "sessions" }], limit: 200 }).catch(() => ({ rows: [] })),
    correr({ dateRanges: rango, dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 40 }),
    correr({ dateRanges: [{ startDate: `${year}-01-01`, endDate: rangoMes(year, 12).hasta }], dimensions: [{ name: "month" }], metrics: [{ name: "sessions" }, { name: "activeUsers" }], limit: 12 }).catch(() => ({ rows: [] })),
  ]);
  const fila = (nombre) => {
    const row = (totales.rows || []).find((r) => (r.dimensionValues || []).some((v) => v.value === nombre)) || null;
    const v = row?.metricValues || [];
    return { visitas: r0(v[0]?.value), personas: r0(v[1]?.value), vistas: r0(v[2]?.value), conInteres: r0(v[3]?.value) };
  };
  const porCanal = new Map();
  for (const row of origenes.rows || []) {
    const [s, m] = (row.dimensionValues || []).map((v) => v.value);
    const canal = canalDeOrigen(s, m);
    const actualCanal = porCanal.get(canal) || { canal, visitas: 0, personas: 0 };
    actualCanal.visitas += r0(row.metricValues?.[0]?.value);
    actualCanal.personas += r0(row.metricValues?.[1]?.value);
    porCanal.set(canal, actualCanal);
  }
  const marcas = {};
  for (const row of campanas.rows || []) {
    const [campana, contenido] = (row.dimensionValues || []).map((v) => v.value);
    if (String(campana).toLowerCase() !== "flow" || !contenido || contenido.startsWith("(")) continue;
    marcas[contenido] = (marcas[contenido] || 0) + r0(row.metricValues?.[0]?.value);
  }
  return {
    ...fila("actual"),
    anterior: fila("anterior"),
    canales: [...porCanal.values()].filter((c) => c.visitas > 0).sort((a, b) => b.visitas - a.visitas),
    paginas: (paginas.rows || []).map((row) => ({
      ruta: row.dimensionValues?.[0]?.value || "/",
      titulo: row.dimensionValues?.[1]?.value || "",
      vistas: r0(row.metricValues?.[0]?.value),
      personas: r0(row.metricValues?.[1]?.value),
    })),
    marcas,
    diario: (diario.rows || []).map((row) => {
      const f = row.dimensionValues?.[0]?.value || "";
      return { fecha: `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`, visitas: r0(row.metricValues?.[0]?.value) };
    }),
    anio: (anio.rows || []).map((row) => ({
      mes: Number(row.dimensionValues?.[0]?.value),
      visitas: r0(row.metricValues?.[0]?.value),
      personas: r0(row.metricValues?.[1]?.value),
    })),
  };
}

// ───────────────────────── Search Console ─────────────────────────

async function searchConsole(year, month) {
  const { siteUrl, refreshToken } = d.searchConsoleOAuthConfig();
  if (!siteUrl || !refreshToken) return { estado: "sin_conectar", detalle: "Falta autorizar Search Console." };
  const token = await d.searchConsoleAccessToken();
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const consulta = (body) => pedir(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, "Search Console");
  const actual = rangoMes(year, month);
  const ant = mesAnterior(year, month);
  const anterior = rangoMes(ant.year, ant.month);
  const [tot, totAnt, consultas, paginas] = await Promise.all([
    consulta({ startDate: actual.desde, endDate: actual.finMes }),
    consulta({ startDate: anterior.desde, endDate: anterior.finMes }),
    consulta({ startDate: actual.desde, endDate: actual.finMes, dimensions: ["query"], rowLimit: 15 }),
    consulta({ startDate: actual.desde, endDate: actual.finMes, dimensions: ["page"], rowLimit: 50 }),
  ]);
  const resumen = (r) => {
    const row = r.rows?.[0] || {};
    return { clics: r0(row.clicks), impresiones: r0(row.impressions), ctr: num(row.ctr), posicion: num(row.position) };
  };
  return {
    ...resumen(tot),
    anterior: resumen(totAnt),
    consultas: (consultas.rows || []).map((row) => ({
      texto: row.keys?.[0] || "", clics: r0(row.clicks), impresiones: r0(row.impressions), posicion: Math.round(num(row.position) * 10) / 10,
    })),
    paginas: (paginas.rows || []).map((row) => ({ url: row.keys?.[0] || "", clics: r0(row.clicks), impresiones: r0(row.impressions) })),
  };
}

// ───────────────────────── Bing ─────────────────────────

function fechaBing(valor) {
  const m = String(valor || "").match(/\d{10,}/);
  return m ? isoDia(new Date(Number(m[0]))) : "";
}

async function bing(year, month) {
  const clave = String(process.env.BING_WEBMASTER_API_KEY || "").trim();
  const sitio = String(process.env.BING_SITE_URL || process.env.SEARCH_CONSOLE_SITE_URL || "https://aeternal-flow.es/").trim();
  if (!clave) return { estado: "sin_conectar", detalle: "Falta la clave de Bing Webmaster." };
  const base = "https://ssl.bing.com/webmaster/api.svc/json";
  const q = `siteUrl=${encodeURIComponent(sitio)}&apikey=${encodeURIComponent(clave)}`;
  const [trafico, consultas] = await Promise.all([
    pedir(`${base}/GetRankAndTrafficStats?${q}`, {}, "Bing"),
    pedir(`${base}/GetQueryStats?${q}`, {}, "Bing").catch(() => ({ d: [] })),
  ]);
  const prefijo = `${year}-${pad(month)}`;
  const ant = mesAnterior(year, month);
  const prefijoAnt = `${ant.year}-${pad(ant.month)}`;
  const suma = (pre) => (trafico.d || []).filter((x) => fechaBing(x.Date).startsWith(pre))
    .reduce((acc, x) => ({ clics: acc.clics + r0(x.Clicks), impresiones: acc.impresiones + r0(x.Impressions) }), { clics: 0, impresiones: 0 });
  return {
    ...suma(prefijo),
    anterior: suma(prefijoAnt),
    consultas: (consultas.d || [])
      .map((x) => ({ texto: x.Query, clics: r0(x.Clicks), impresiones: r0(x.Impressions), posicion: Math.round(num(x.AvgImpressionPosition) * 10) / 10 }))
      .sort((a, b) => b.clics - a.clics || b.impresiones - a.impresiones)
      .slice(0, 10),
  };
}

// ───────────────────────── Umami ─────────────────────────

let umamiSesion = { token: "", hasta: 0 };

function umamiConfig() {
  return {
    url: String(process.env.UMAMI_URL || "").trim().replace(/\/$/, ""),
    usuario: String(process.env.UMAMI_USERNAME || "").trim(),
    clave: String(process.env.UMAMI_PASSWORD || "").trim(),
    web: String(process.env.UMAMI_WEBSITE_ID || "").trim(),
  };
}

async function umamiToken() {
  const c = umamiConfig();
  if (umamiSesion.token && umamiSesion.hasta > Date.now()) return umamiSesion.token;
  const r = await pedir(`${c.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: c.usuario, password: c.clave }),
  }, "Umami");
  umamiSesion = { token: r.token, hasta: Date.now() + 6 * 3600 * 1000 };
  return r.token;
}

const valorUmami = (v) => (v && typeof v === "object" ? num(v.value) : num(v));

async function umami(year, month) {
  const c = umamiConfig();
  if (!c.url || !c.usuario || !c.clave || !c.web) return { estado: "sin_conectar", detalle: "Umami aún no está montado." };
  const token = await umamiToken();
  const get = (ruta, params) => pedir(`${c.url}/api/websites/${c.web}${ruta}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
  }, "Umami");
  const actual = rangoMes(year, month);
  const ant = mesAnterior(year, month);
  const anterior = rangoMes(ant.year, ant.month);
  const desde = Date.parse(`${actual.desde}T00:00:00Z`);
  const hasta = Date.parse(`${actual.hasta}T23:59:59Z`);
  const zona = { timezone: "Europe/Madrid" };
  const [stats, statsAnt, referentes, paginas, titulos, serie, anio] = await Promise.all([
    get("/stats", { startAt: desde, endAt: hasta }),
    get("/stats", { startAt: Date.parse(`${anterior.desde}T00:00:00Z`), endAt: Date.parse(`${anterior.finMes}T23:59:59Z`) }),
    get("/metrics", { startAt: desde, endAt: hasta, type: "referrer", limit: 50 }).catch(() => []),
    get("/metrics", { startAt: desde, endAt: hasta, type: "path", limit: 50 }).catch(() => get("/metrics", { startAt: desde, endAt: hasta, type: "url", limit: 50 }).catch(() => [])),
    get("/metrics", { startAt: desde, endAt: hasta, type: "title", limit: 100 }).catch(() => []),
    get("/pageviews", { startAt: desde, endAt: hasta, unit: "day", ...zona }).catch(() => ({})),
    get("/pageviews", { startAt: Date.parse(`${year}-01-01T00:00:00Z`), endAt: Math.min(Date.now(), Date.parse(`${year}-12-31T23:59:59Z`)), unit: "month", ...zona }).catch(() => ({})),
  ]);
  const resumen = (s) => ({
    visitas: r0(valorUmami(s.visits) || valorUmami(s.sessions)),
    personas: r0(valorUmami(s.visitors)),
    vistas: r0(valorUmami(s.pageviews)),
  });
  const lista = (x) => (Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : []);
  const porCanal = new Map();
  for (const item of lista(referentes)) {
    const canal = item.x ? canalDeOrigen(item.x, "referral") : "Directo";
    porCanal.set(canal, (porCanal.get(canal) || 0) + r0(item.y));
  }
  const sesionesSerie = lista(serie.sessions).length ? lista(serie.sessions) : lista(serie.pageviews);
  const sesionesAnio = lista(anio.sessions).length ? lista(anio.sessions) : lista(anio.pageviews);
  return {
    ...resumen(stats),
    anterior: resumen(statsAnt),
    canales: [...porCanal.entries()].map(([canal, visitas]) => ({ canal, visitas })).sort((a, b) => b.visitas - a.visitas),
    paginas: lista(paginas).map((p) => ({ ruta: p.x, vistas: r0(p.y) })),
    titulos: lista(titulos).map((p) => ({ titulo: p.x, vistas: r0(p.y) })),
    diario: sesionesSerie.map((p) => ({ fecha: String(p.x).slice(0, 10), visitas: r0(p.y) })),
    anio: sesionesAnio.map((p) => ({ mes: Number(String(p.x).slice(5, 7)), visitas: r0(p.y) })),
  };
}

// ───────────────────────── Pinterest ─────────────────────────

async function pinterest(year, month) {
  const token = tokenPinterest();
  if (!token) return { estado: "sin_conectar", detalle: "Falta el token de Pinterest." };
  await renovarPinterestSiToca().catch(() => {});
  const h = { headers: { Authorization: `Bearer ${tokenPinterest()}` } };
  const actual = rangoMes(year, month);
  const limite = isoDia(new Date(Date.now() - 89 * 864e5));
  const desde = actual.desde < limite ? limite : actual.desde;
  const fueraDeRango = actual.hasta < limite;
  const metricas = "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,ENGAGEMENT";

  const pines = [];
  let marcador = "";
  for (let i = 0; i < 4; i += 1) {
    const r = await pedir(`https://api.pinterest.com/v5/pins?page_size=100${marcador ? `&bookmark=${encodeURIComponent(marcador)}` : ""}`, h, "Pinterest");
    pines.push(...(r.items || []));
    marcador = r.bookmark;
    if (!marcador) break;
  }
  let cuenta = null;
  let top = [];
  if (!fueraDeRango) {
    const [c, t] = await Promise.all([
      pedir(`https://api.pinterest.com/v5/user_account/analytics?start_date=${desde}&end_date=${actual.hasta}&metric_types=${metricas}`, h, "Pinterest"),
      pedir(`https://api.pinterest.com/v5/user_account/analytics/top_pins?start_date=${desde}&end_date=${actual.hasta}&sort_by=IMPRESSION&num_of_pins=50&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`, h, "Pinterest").catch(() => ({ pins: [] })),
    ]);
    cuenta = c.all?.summary_metrics || {};
    top = c && t.pins ? t.pins : [];
  }
  const metricasPorPin = new Map(top.map((p) => [String(p.pin_id), p.metrics || {}]));
  const imagen = (pin) => pin.media?.images?.["400x300"]?.url || pin.media?.images?.["150x150"]?.url || pin.media?.images?.["600x"]?.url || "";
  // Solo lo tuyo: pines propios o que enlazan a la web / llevan tu marca. Los que guardas de otros no.
  const esTuyo = (pin) => !pin.parent_pin_id || /aeternal/i.test(`${pin.title || ""} ${pin.description || ""} ${pin.link || ""}`);
  const contenido = pines
    .filter(esTuyo)
    .filter((pin) => String(pin.created_at || "").slice(0, 7) === `${year}-${pad(month)}` || metricasPorPin.has(String(pin.id)))
    .map((pin) => {
      const m = metricasPorPin.get(String(pin.id)) || {};
      return {
        canal: "Pinterest",
        id: String(pin.id),
        fecha: String(pin.created_at || "").slice(0, 10),
        titulo: String(pin.title || "").trim() || String(pin.description || "").trim().slice(0, 80) || "Pin sin título",
        url: `https://www.pinterest.com/pin/${pin.id}/`,
        enlace: pin.link || "",
        imagen: imagen(pin),
        metricas: {
          impresiones: r0(m.IMPRESSION),
          guardados: r0(m.SAVE),
          clics: r0(m.PIN_CLICK),
          clicsWeb: r0(m.OUTBOUND_CLICK),
        },
        sinDatos: !metricasPorPin.has(String(pin.id)),
      };
    });
  return {
    impresiones: r0(cuenta?.IMPRESSION),
    guardados: r0(cuenta?.SAVE),
    clics: r0(cuenta?.PIN_CLICK),
    clicsWeb: r0(cuenta?.OUTBOUND_CLICK),
    totalPines: pines.length,
    parcial: desde !== actual.desde,
    fueraDeRango,
    contenido,
  };
}

// ───────────────────────── YouTube ─────────────────────────

async function youtubeToken() {
  const { clientId, clientSecret } = d.youtubeOAuthConfig();
  const r = await pedir("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshTokenYoutube(), grant_type: "refresh_token" }),
  }, "Google");
  return r;
}

async function youtube(year, month) {
  if (!refreshTokenYoutube()) return { estado: "sin_conectar", detalle: "Falta autorizar YouTube." };
  const t = await youtubeToken();
  const alcance = String(t.scope || "");
  if (!/youtube\.readonly|yt-analytics/.test(alcance)) {
    return { estado: "sin_conectar", detalle: "YouTube solo tiene permiso para subir vídeos. Pulsa «Conectar YouTube» para dar también permiso de lectura." };
  }
  const h = { headers: { Authorization: `Bearer ${t.access_token}` } };
  const canal = await pedir("https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails,snippet&mine=true", h, "YouTube");
  const c = canal.items?.[0];
  if (!c) return { estado: "error", detalle: "La cuenta autorizada no tiene canal de YouTube." };
  const subidas = c.contentDetails?.relatedPlaylists?.uploads;
  const lista = subidas
    ? await pedir(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails,snippet&maxResults=50&playlistId=${subidas}`, h, "YouTube")
    : { items: [] };
  const ids = (lista.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  const videos = ids.length
    ? await pedir(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids.join(",")}`, h, "YouTube")
    : { items: [] };
  const actual = rangoMes(year, month);
  const ant = mesAnterior(year, month);
  const anterior = rangoMes(ant.year, ant.month);
  let analitica = null;
  let analiticaAnt = null;
  let porVideo = new Map();
  if (/yt-analytics/.test(alcance)) {
    const informe = (desde, hasta, extra = {}) => pedir(`https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({
      ids: "channel==MINE", startDate: desde, endDate: hasta,
      metrics: "views,estimatedMinutesWatched,likes,subscribersGained", ...extra,
    })}`, h, "YouTube Analytics");
    const [a, b, v] = await Promise.all([
      informe(actual.desde, actual.hasta),
      informe(anterior.desde, anterior.finMes),
      informe(actual.desde, actual.hasta, { dimensions: "video", sort: "-views", maxResults: "50" }).catch(() => ({ rows: [] })),
    ]);
    const fila = (r) => {
      const x = r.rows?.[0] || [];
      return { visualizaciones: r0(x[0]), minutos: r0(x[1]), likes: r0(x[2]), suscriptores: r0(x[3]) };
    };
    analitica = fila(a);
    analiticaAnt = fila(b);
    porVideo = new Map((v.rows || []).map((x) => [x[0], { visualizacionesMes: r0(x[1]), minutosMes: r0(x[2]) }]));
  }
  const contenido = (videos.items || [])
    .map((v) => ({
      canal: "YouTube",
      id: v.id,
      fecha: String(v.snippet?.publishedAt || "").slice(0, 10),
      titulo: v.snippet?.title || "Vídeo",
      url: `https://www.youtube.com/watch?v=${v.id}`,
      imagen: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || "",
      metricas: {
        visualizaciones: r0(v.statistics?.viewCount),
        likes: r0(v.statistics?.likeCount),
        comentarios: r0(v.statistics?.commentCount),
        ...(porVideo.get(v.id) || {}),
      },
    }))
    .filter((v) => v.fecha.slice(0, 7) === `${year}-${pad(month)}` || porVideo.has(v.id));
  return {
    canal: c.snippet?.title || "",
    suscriptoresTotales: r0(c.statistics?.subscriberCount),
    visualizacionesTotales: r0(c.statistics?.viewCount),
    ...(analitica || {}),
    anterior: analiticaAnt,
    sinAnalitica: !analitica,
    contenido,
  };
}

// ───────────────────────── Blog ─────────────────────────

async function blog(year, month, paginasWeb = []) {
  const r = await d.requestAeternalBlogArticles("");
  const articulos = Array.isArray(r.articles) ? r.articles : [];
  const limpio = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  // Se busca por la dirección (blog.php?post=slug) y, si no la hay (Umami), por el título.
  const vistasDe = (slug, titulo) => paginasWeb
    .filter((p) => (slug && String(p.ruta || "").includes(`post=${slug}`))
      || (!p.ruta && titulo && limpio(p.titulo).includes(limpio(titulo))))
    .reduce((acc, p) => acc + r0(p.vistas), 0);
  const contenido = articulos
    .map((a) => ({
      canal: "Blog",
      id: String(a.id || a.slug),
      fecha: String(a.created_at || "").slice(0, 10),
      titulo: a.title || a.slug,
      url: `https://aeternal-flow.es/blog.php?post=${encodeURIComponent(a.slug)}`,
      imagen: a.image_url || "",
      metricas: { lecturas: vistasDe(a.slug, a.title) },
      publicado: a.published !== false && a.published !== 0 && a.published !== "0",
    }))
    .filter((a) => a.publicado && (a.fecha.slice(0, 7) === `${year}-${pad(month)}` || a.metricas.lecturas > 0));
  return { articulos: articulos.length, contenido };
}

// ───────────────────────── Instagram y LinkedIn (a mano) ─────────────────────────

async function leerManual() {
  const v = await leerJson(archivos.manual, { entradas: [] });
  return Array.isArray(v.entradas) ? v.entradas : [];
}

const METRICAS_MANUALES = ["alcance", "impresiones", "visualizaciones", "me_gusta", "comentarios", "compartidos", "guardados", "interacciones", "clics", "visitas_perfil", "seguidores"];

function limpiarEntrada(e, previa = {}) {
  const canal = /linkedin/i.test(e.canal || previa.canal) ? "LinkedIn" : "Instagram";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(e.fecha || "")) ? e.fecha : (previa.fecha || isoDia(new Date()));
  const metricas = {};
  for (const k of METRICAS_MANUALES) {
    const v = e.metricas?.[k] ?? previa.metricas?.[k];
    if (v !== undefined && v !== null && v !== "") metricas[k] = r0(v);
  }
  return {
    id: previa.id || e.id || crypto.randomUUID(),
    canal,
    tipo: e.tipo === "mes" ? "mes" : "publicacion",
    fecha,
    titulo: String(e.titulo ?? previa.titulo ?? "").trim().slice(0, 160),
    url: String(e.url ?? previa.url ?? "").trim().slice(0, 500),
    metricas,
    origen: String(e.origen || previa.origen || "a mano").slice(0, 20),
    actualizado: new Date().toISOString(),
  };
}

function manualDelMes(entradas, year, month) {
  const pre = `${year}-${pad(month)}`;
  const delMes = entradas.filter((e) => e.fecha.startsWith(pre));
  const contenido = delMes.filter((e) => e.tipo !== "mes").map((e) => ({
    canal: e.canal, id: e.id, fecha: e.fecha, titulo: e.titulo || `${e.canal} ${e.fecha}`, url: e.url, metricas: e.metricas, manual: true, origen: e.origen,
  }));
  const resumenDe = (canal) => {
    const meses = delMes.filter((e) => e.canal === canal && e.tipo === "mes");
    const pubs = delMes.filter((e) => e.canal === canal && e.tipo !== "mes");
    const base = meses.length ? meses : pubs;
    const total = {};
    for (const e of base) for (const [k, v] of Object.entries(e.metricas || {})) total[k] = (total[k] || 0) + v;
    return { publicaciones: pubs.length, ...total, hayDatos: base.length > 0 };
  };
  return { contenido, instagram: resumenDe("Instagram"), linkedin: resumenDe("LinkedIn") };
}

// Lector mínimo de .xlsx (es un zip con XML dentro). Sin dependencias.
function leerZip(buffer) {
  let fin = buffer.length - 22;
  while (fin >= 0 && buffer.readUInt32LE(fin) !== 0x06054b50) fin -= 1;
  if (fin < 0) throw new Error("El archivo no parece un Excel (.xlsx).");
  const total = buffer.readUInt16LE(fin + 10);
  let p = buffer.readUInt32LE(fin + 16);
  const salida = {};
  for (let i = 0; i < total; i += 1) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buffer.readUInt16LE(p + 10);
    const tam = buffer.readUInt32LE(p + 20);
    const lnom = buffer.readUInt16LE(p + 28);
    const lext = buffer.readUInt16LE(p + 30);
    const lcom = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const nombre = buffer.slice(p + 46, p + 46 + lnom).toString("utf8");
    const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const datos = buffer.slice(inicio, inicio + tam);
    salida[nombre] = metodo === 8 ? zlib.inflateRawSync(datos) : datos;
    p += 46 + lnom + lext + lcom;
  }
  return salida;
}

const desXml = (t) => String(t).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function leerXlsx(buffer) {
  const zip = leerZip(buffer);
  const texto = (n) => (zip[n] ? zip[n].toString("utf8") : "");
  const compartidas = [...texto("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => desXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
  const libro = texto("xl/workbook.xml");
  const rels = texto("xl/_rels/workbook.xml.rels");
  const hojas = [...libro.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(([, nombre, rid]) => {
    const destino = (rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`)) || [])[1] || "";
    const ruta = destino.startsWith("/") ? destino.slice(1) : `xl/${destino.replace(/^\.\.\//, "")}`;
    const filas = [];
    for (const fila of texto(ruta).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const celdas = [];
      for (const c of fila[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (c[1].match(/r="([A-Z]+)\d+"/) || [])[1] || "";
        const tipo = (c[1].match(/t="([^"]+)"/) || [])[1] || "";
        const v = ((c[2] || "").match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        const enLinea = ((c[2] || "").match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
        let valor = tipo === "s" ? compartidas[Number(v)] : tipo === "inlineStr" ? desXml(enLinea || "") : v !== undefined ? desXml(v) : "";
        if (tipo !== "s" && tipo !== "inlineStr" && tipo !== "str" && valor !== "" && !Number.isNaN(Number(valor))) valor = Number(valor);
        let col = 0;
        for (const ch of ref) col = col * 26 + (ch.charCodeAt(0) - 64);
        celdas[col - 1] = valor;
      }
      filas.push(celdas);
    }
    return { nombre, filas };
  });
  return hojas;
}

function fechaExcel(valor, espanol) {
  if (typeof valor === "number" && valor > 20000 && valor < 80000) return isoDia(new Date(Date.UTC(1899, 11, 30) + valor * 864e5));
  const t = String(valor || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  let [a, b] = [Number(m[1]), Number(m[2])];
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  let dia;
  let mes;
  if (a > 12) [dia, mes] = [a, b];
  else if (b > 12) [mes, dia] = [a, b];
  else if (espanol) [dia, mes] = [a, b];
  else [mes, dia] = [a, b];
  return `${y}-${pad(mes)}-${pad(dia)}`;
}

function importarLinkedin(buffer) {
  const hojas = leerXlsx(buffer);
  const norm = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const esp = hojas.some((h) => h.filas.some((f) => f.some((c) => /impresiones|interacciones|fecha/.test(norm(c)))));
  const diario = {};
  const posts = new Map();
  for (const hoja of hojas) {
    for (let i = 0; i < hoja.filas.length; i += 1) {
      const cab = (hoja.filas[i] || []).map(norm);
      const col = (re, desde = 0) => cab.findIndex((c, k) => k >= desde && re.test(c));
      const urlCols = cab.map((c, k) => (/url|enlace|link/.test(c) ? k : -1)).filter((k) => k >= 0);
      if (urlCols.length) {
        // Tablas de publicaciones (a veces dos, una al lado de otra).
        for (const u of urlCols) {
          const fin = urlCols.find((k) => k > u) ?? cab.length;
          const fCol = col(/fecha|date/, u);
          const iCol = col(/impres/, u);
          const eCol = col(/interac|engagement/, u);
          for (let j = i + 1; j < hoja.filas.length; j += 1) {
            const f = hoja.filas[j] || [];
            const url = String(f[u] || "").trim();
            if (!/^https?:\/\//.test(url)) continue;
            const p = posts.get(url) || { url, fecha: "", metricas: {} };
            if (fCol >= 0 && fCol < fin && f[fCol]) p.fecha = fechaExcel(f[fCol], esp) || p.fecha;
            if (iCol >= 0 && iCol < fin && f[iCol] !== undefined) p.metricas.impresiones = Math.max(p.metricas.impresiones || 0, r0(f[iCol]));
            if (eCol >= 0 && eCol < fin && f[eCol] !== undefined) p.metricas.interacciones = Math.max(p.metricas.interacciones || 0, r0(f[eCol]));
            posts.set(url, p);
          }
        }
        break;
      }
      const fCol = col(/^(fecha|date)$/);
      const iCol = col(/impres/);
      if (fCol >= 0 && iCol >= 0) {
        const eCol = col(/interac|engagement/);
        for (let j = i + 1; j < hoja.filas.length; j += 1) {
          const f = hoja.filas[j] || [];
          const fecha = fechaExcel(f[fCol], esp);
          if (!fecha) continue;
          diario[fecha] = { impresiones: r0(f[iCol]), interacciones: eCol >= 0 ? r0(f[eCol]) : 0 };
        }
        break;
      }
    }
  }
  if (!Object.keys(diario).length && !posts.size) throw new Error("No he encontrado datos de LinkedIn en el Excel. ¿Es el de Analíticas → Contenido → Exportar?");
  return { diario, posts: [...posts.values()].filter((p) => p.fecha) };
}

async function guardarLinkedin({ diario, posts }) {
  const entradas = await leerManual();
  let nuevas = 0;
  // Totales por mes a partir del diario.
  const meses = {};
  for (const [fecha, v] of Object.entries(diario)) {
    const k = fecha.slice(0, 7);
    meses[k] = meses[k] || { impresiones: 0, interacciones: 0 };
    meses[k].impresiones += v.impresiones;
    meses[k].interacciones += v.interacciones;
  }
  for (const [k, v] of Object.entries(meses)) {
    const i = entradas.findIndex((e) => e.canal === "LinkedIn" && e.tipo === "mes" && e.fecha.startsWith(k));
    const e = limpiarEntrada({ canal: "LinkedIn", tipo: "mes", fecha: `${k}-01`, titulo: `LinkedIn ${k}`, metricas: v, origen: "excel" }, i >= 0 ? entradas[i] : {});
    if (i >= 0) entradas[i] = e; else { entradas.push(e); nuevas += 1; }
  }
  for (const p of posts) {
    const i = entradas.findIndex((e) => e.canal === "LinkedIn" && e.url === p.url);
    const titulo = i >= 0 ? entradas[i].titulo : `Publicación de LinkedIn del ${p.fecha}`;
    const e = limpiarEntrada({ canal: "LinkedIn", fecha: p.fecha, url: p.url, titulo, metricas: p.metricas, origen: "excel" }, i >= 0 ? entradas[i] : {});
    if (i >= 0) entradas[i] = e; else { entradas.push(e); nuevas += 1; }
  }
  await guardarJson(archivos.manual, { entradas });
  cache.clear();
  return { meses: Object.keys(meses).length, publicaciones: posts.length, nuevas };
}

// Captura con varias publicaciones (p. ej. la actividad de LinkedIn): devuelve una lista.
async function leerCapturaLista(imagenBase64, canal) {
  const datos = String(imagenBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!datos) throw new Error("No ha llegado ninguna imagen.");
  const respuesta = await d.openaiChat({
    model: d.openaiVisionModel,
    json: true,
    temperature: 0,
    maxTokens: 1500,
    messages: [
      { role: "system", content: "Lees capturas de pantalla de redes sociales y devuelves solo JSON. No inventes números: si un dato no aparece, déjalo fuera." },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Esta captura es de ${canal} y puede tener varias publicaciones del propio autor. Para cada publicación visible devuelve sus números.
JSON: {"publicaciones":[{"titulo":"primeras 8-12 palabras del texto","fecha":"YYYY-MM-DD aproximada o vacío","metricas":{"impresiones":n,"me_gusta":n,"comentarios":n,"compartidos":n,"interacciones":n}}]}
Las reacciones cuentan como "me_gusta"; "veces compartido"/"reposts" como "compartidos". Si pone "hace 2 sem" o "2 sem", calcula la fecha desde hoy (${isoDia(new Date())}).
Ignora publicaciones cortadas sin texto legible y las que no son del autor (anuncios, sugerencias).`,
          },
          { type: "image_url", image_url: { url: `data:image/png;base64,${datos}` } },
        ],
      },
    ],
  });
  let leido = {};
  try {
    leido = JSON.parse(respuesta.text);
  } catch {
    return [];
  }
  return (Array.isArray(leido.publicaciones) ? leido.publicaciones : [])
    .map((x) => {
      const metricas = {};
      for (const k of METRICAS_MANUALES) if (x?.metricas?.[k] !== undefined && x?.metricas?.[k] !== null) metricas[k] = r0(x.metricas[k]);
      return {
        titulo: String(x?.titulo || "").trim().slice(0, 160),
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(x?.fecha || "") ? x.fecha : "",
        metricas,
      };
    })
    .filter((x) => x.titulo && Object.keys(x.metricas).length);
}

async function leerCapturaInstagram(imagenBase64, tipoImagen) {
  const datos = String(imagenBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!datos) throw new Error("No ha llegado ninguna imagen.");
  if (datos.length > 14_000_000) throw new Error("La imagen es demasiado grande.");
  const respuesta = await d.openaiChat({
    model: d.openaiVisionModel,
    json: true,
    temperature: 0,
    maxTokens: 700,
    messages: [
      {
        role: "system",
        content: "Lees capturas de pantalla de las estadísticas de Instagram (o LinkedIn) y devuelves solo JSON. No inventes números: si un dato no aparece, déjalo fuera.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extrae los números de esta captura. Devuelve JSON con:
{"canal":"Instagram"|"LinkedIn","tipo":"publicacion"|"mes","fecha":"YYYY-MM-DD o vacío","titulo":"primeras palabras del texto de la publicación o vacío",
"metricas":{"alcance":n,"impresiones":n,"visualizaciones":n,"me_gusta":n,"comentarios":n,"compartidos":n,"guardados":n,"interacciones":n,"clics":n,"visitas_perfil":n,"seguidores":n}}
"tipo":"mes" si la captura es un resumen de un periodo (últimos 30 días, etc.) y no de una publicación concreta.
Usa la etiqueta que se ve: "Impresiones"/"Visualizaciones" → impresiones o visualizaciones; "Cuentas alcanzadas"/"Miembros alcanzados"/"Alcance" → alcance; "Reacciones"/"Me gusta" → me_gusta; "Nuevos seguidores"/"Seguidores" → seguidores. Si hay varios números, devuélvelos todos.
Convierte "1,2 mil" o "1.2K" a 1200. Hoy es ${isoDia(new Date())}.`,
          },
          { type: "image_url", image_url: { url: `data:${tipoImagen || "image/png"};base64,${datos}` } },
        ],
      },
    ],
  });
  let leido = {};
  try {
    leido = JSON.parse(respuesta.text);
  } catch {
    throw new Error("No he podido leer los números de la captura.");
  }
  const metricas = {};
  for (const k of METRICAS_MANUALES) if (leido.metricas?.[k] !== undefined && leido.metricas?.[k] !== null) metricas[k] = r0(leido.metricas[k]);
  return {
    canal: /linkedin/i.test(leido.canal) ? "LinkedIn" : "Instagram",
    tipo: leido.tipo === "mes" ? "mes" : "publicacion",
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(leido.fecha || "") ? leido.fecha : isoDia(new Date()),
    titulo: String(leido.titulo || "").slice(0, 160),
    metricas,
  };
}

// ───────────────────────── resumen del mes ─────────────────────────

async function guardarMes(year, month, fuentes) {
  const v = await leerJson(archivos.meses, { meses: {} });
  const clave = `${year}-${pad(month)}`;
  const previo = v.meses[clave] || {};
  const compacto = {};
  for (const [nombre, f] of Object.entries(fuentes)) {
    if (f?.estado !== "ok") continue;
    const { contenido, paginas, titulos, consultas, diario, anio, marcas, canales, ...resto } = f;
    compacto[nombre] = { ...resto, canales, guardado: new Date().toISOString() };
    if (nombre === "pinterest" && (f.fueraDeRango || (f.parcial && previo.pinterest && !previo.pinterest.parcial))) delete compacto[nombre];
  }
  v.meses[clave] = { ...previo, ...compacto };
  await guardarJson(archivos.meses, v);
  return v.meses;
}

function frase({ web, contenido, mesNombre }) {
  const partes = [];
  if (web) {
    const dif = web.anterior?.visitas ? Math.round(((web.visitas - web.anterior.visitas) / web.anterior.visitas) * 100) : null;
    partes.push(`En ${mesNombre} llegaron ${web.visitas} ${web.visitas === 1 ? "visita" : "visitas"} a la web${dif !== null ? ` (${dif >= 0 ? "+" : ""}${dif} % que el mes anterior)` : ""}.`);
    const canal = (web.canales || []).find((c) => c.canal !== "Directo");
    if (canal) partes.push(`Fuera de las visitas directas, lo que más trajo fue ${canal.canal} (${canal.visitas}).`);
  }
  const mejor = [...contenido].sort((a, b) => peso(b) - peso(a))[0];
  if (mejor && peso(mejor) > 0) partes.push(`La publicación que más se vio: «${mejor.titulo.slice(0, 60)}» en ${mejor.canal}.`);
  if (!partes.length) partes.push(`Todavía no hay datos de ${mesNombre}.`);
  return partes.join(" ");
}

function peso(c) {
  const m = c.metricas || {};
  return num(m.impresiones) + num(m.visualizaciones) + num(m.alcance) + num(m.lecturas) * 5 + num(c.visitasWeb) * 10;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

async function resumen(year, month) {
  const clave = `${year}-${pad(month)}`;
  const enCache = cache.get(clave);
  if (enCache && enCache.hasta > Date.now()) return enCache.valor;

  const [g, sc, pin, yt, bi, um, manual] = await Promise.all([
    fuente("ga4", () => ga4(year, month)),
    fuente("searchConsole", () => searchConsole(year, month)),
    fuente("pinterest", () => pinterest(year, month)),
    fuente("youtube", () => youtube(year, month)),
    fuente("bing", () => bing(year, month)),
    fuente("umami", () => umami(year, month)),
    leerManual(),
  ]);
  const paginasBlog = um.estado === "ok" && um.visitas > 0
    ? [...(um.paginas || []), ...(um.titulos || [])]
    : g.paginas || [];
  const bl = await fuente("blog", () => blog(year, month, paginasBlog));
  const man = manualDelMes(manual, year, month);
  const meses = await guardarMes(year, month, { ga4: g, searchConsole: sc, pinterest: pin, youtube: yt, bing: bi, umami: um }).catch(() => ({}));
  const guardado = meses[clave] || {};

  // La web: Umami manda si está montado (cuenta también a quien rechaza cookies); si no, GA4.
  const webFuente = um.estado === "ok" && (um.visitas > 0 || g.estado !== "ok") ? um : g.estado === "ok" ? g : null;
  const web = webFuente ? {
    origen: webFuente === um ? "Umami" : "GA4",
    visitas: webFuente.visitas,
    personas: webFuente.personas,
    vistas: webFuente.vistas,
    anterior: webFuente.anterior,
    canales: webFuente.canales,
    paginas: (webFuente.paginas || []).slice(0, 10).map((p) => ({ ...p, titulo: p.titulo || (g.paginas || []).find((x) => x.ruta === p.ruta)?.titulo || "" })),
    diario: webFuente.diario,
    ga4: g.estado === "ok" ? { visitas: g.visitas, personas: g.personas } : null,
    umami: um.estado === "ok" ? { visitas: um.visitas, personas: um.personas } : null,
  } : null;

  // Visitas que trajo cada publicación de Flow (marca utm_content).
  const marcas = g.marcas || {};
  const posts = await d.readPublicationPosts().catch(() => []);
  const flowContenido = posts
    .filter((p) => p.marcaFlow && String(p.publishedAt || "").startsWith(clave))
    .map((p) => ({ marca: p.marcaFlow, visitasWeb: marcas[p.marcaFlow] || 0, canal: p.target?.name || p.targetId, fecha: String(p.publishedAt).slice(0, 10) }));

  const contenido = [
    ...(pin.contenido || []),
    ...(yt.contenido || []),
    ...(bl.contenido || []),
    ...man.contenido,
  ].map((c) => {
    const f = flowContenido.find((x) => x.canal && c.canal && x.canal.toLowerCase().includes(c.canal.toLowerCase()) && x.fecha === c.fecha);
    return f ? { ...c, visitasWeb: f.visitasWeb } : c;
  }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  // Año: visitas por mes (Umami o GA4) completadas con lo guardado.
  const anioFuente = (webFuente?.anio || []);
  const todos = await leerJson(archivos.meses, { meses: {} });
  const anio = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const vivo = anioFuente.find((x) => x.mes === m);
    const g2 = todos.meses?.[`${year}-${pad(m)}`] || {};
    const pinMes = g2.pinterest?.impresiones || 0;
    return {
      mes: m,
      visitas: vivo ? vivo.visitas : (g2.umami?.visitas ?? g2.ga4?.visitas ?? 0),
      pinterest: m === month && pin.estado === "ok" ? pin.impresiones : pinMes,
    };
  });

  const pinterestResumen = pin.estado === "ok" && !pin.fueraDeRango ? pin : guardado.pinterest ? { ...guardado.pinterest, deMemoria: true } : null;
  const valor = {
    periodo: { year, month, ...rangoMes(year, month) },
    frase: frase({ web, contenido, mesNombre: MESES[month - 1] }),
    web,
    google: sc.estado === "ok" ? { clics: sc.clics, impresiones: sc.impresiones, ctr: sc.ctr, posicion: sc.posicion, anterior: sc.anterior, consultas: sc.consultas } : null,
    bing: bi.estado === "ok" ? { clics: bi.clics, impresiones: bi.impresiones, anterior: bi.anterior, consultas: bi.consultas } : null,
    redes: {
      pinterest: pinterestResumen && {
        impresiones: pinterestResumen.impresiones, guardados: pinterestResumen.guardados, clics: pinterestResumen.clics,
        clicsWeb: pinterestResumen.clicsWeb, parcial: pinterestResumen.parcial, deMemoria: pinterestResumen.deMemoria,
      },
      youtube: yt.estado === "ok" ? {
        visualizaciones: yt.visualizaciones, minutos: yt.minutos, likes: yt.likes, suscriptores: yt.suscriptores,
        suscriptoresTotales: yt.suscriptoresTotales, sinAnalitica: yt.sinAnalitica, anterior: yt.anterior,
      } : null,
      instagram: man.instagram.hayDatos ? man.instagram : null,
      linkedin: man.linkedin.hayDatos ? man.linkedin : null,
    },
    publicaciones: contenido.filter((c) => String(c.fecha).startsWith(clave)).length,
    contenido,
    anio,
    fuentes: Object.fromEntries(Object.entries({
      ga4: g, searchConsole: sc, pinterest: pin, youtube: yt, blog: bl, bing: bi, umami: um,
    }).map(([k, f]) => [k, { estado: f.estado, detalle: f.detalle || "" }])),
    manual: {
      instagram: manual.filter((e) => e.canal === "Instagram").length,
      linkedin: manual.filter((e) => e.canal === "LinkedIn").length,
      ultimoLinkedin: manual.filter((e) => e.canal === "LinkedIn" && e.origen === "excel").map((e) => e.actualizado).sort().pop() || null,
    },
    pinterestRenovable: Boolean(tokens.pinterest?.refresh_token),
    generado: new Date().toISOString(),
  };
  cache.set(clave, { hasta: Date.now() + CACHE_MS, valor });
  return valor;
}

// ───────────────────────── marca de seguimiento en enlaces ─────────────────────────

const FUENTE_UTM = { pinterest: "pinterest", linkedin: "linkedin", youtube: "youtube", instagram: "instagram", tiktok: "tiktok", blog: "blog" };

export function marcaParaPublicacion(payload) {
  if (payload.marcaFlow) return payload.marcaFlow;
  const canal = String(payload?.target?.id || "web").toLowerCase();
  const huella = crypto.createHash("sha1").update(`${payload.caption || ""}|${payload.imageUrl || ""}|${payload.videoUrl || ""}`).digest("hex").slice(0, 6);
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${canal}-${fecha}-${huella}`;
}

export function conMarca(url, canal, marca) {
  try {
    const u = new URL(url);
    if (!/(^|\.)aeternal-flow\.es$/i.test(u.hostname)) return url;
    if (u.searchParams.has("utm_source")) return url;
    u.searchParams.set("utm_source", FUENTE_UTM[canal] || canal);
    u.searchParams.set("utm_medium", "social");
    u.searchParams.set("utm_campaign", "flow");
    u.searchParams.set("utm_content", marca);
    return u.toString();
  } catch {
    return url;
  }
}

// Pone la marca en los enlaces a aeternal-flow.es antes de publicar. Instagram no tiene
// enlaces pulsables en el texto y el blog es la propia web, así que esos no se tocan.
export function marcarEnlaces(payload) {
  const canal = String(payload?.target?.id || "").toLowerCase();
  if (!payload || !canal || canal === "blog" || canal === "instagram") return payload;
  const marca = marcaParaPublicacion(payload);
  payload.marcaFlow = marca;
  if (typeof payload.caption === "string") {
    payload.caption = payload.caption.replace(/https?:\/\/(?:www\.)?aeternal-flow\.es[^\s)"'<>]*/gi, (u) => conMarca(u, canal, marca));
  }
  return payload;
}

// ───────────────────────── rutas ─────────────────────────

function paginaOauth(titulo, cuerpo, ok = true) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f6f1e8;color:#241f19;margin:0;padding:40px;line-height:1.5}main{max-width:640px;margin:auto}a{color:#4a7ab5}.mal{color:#7a3d18}</style>
<main><h1${ok ? "" : " class=\"mal\""}>${titulo}</h1>${cuerpo}<p><a href="/">Volver a Flow</a></p></main>`;
}

export function montarEstadisticas(app, dependencias) {
  d = dependencias;
  archivos = {
    meses: path.join(d.dataDirectory, "estadisticas-meses.json"),
    manual: path.join(d.dataDirectory, "estadisticas-manual.json"),
    tokens: path.join(d.dataDirectory, "estadisticas-tokens.json"),
  };
  try {
    tokens = JSON.parse(fsSync.readFileSync(archivos.tokens, "utf8")) || {};
  } catch {
    tokens = {};
  }
  const { requireAuth } = d;
  const fechaValida = (req) => {
    const hoy = new Date();
    const year = Number(req.query.year || hoy.getFullYear());
    const month = Number(req.query.month || hoy.getMonth() + 1);
    if (!(year >= 2020 && year <= 2100 && month >= 1 && month <= 12)) throw new Error("Mes inválido");
    return { year, month };
  };

  app.get("/api/estadisticas", requireAuth, async (req, res) => {
    try {
      const { year, month } = fechaValida(req);
      if (req.query.fresco) cache.delete(`${year}-${pad(month)}`);
      res.json(await resumen(year, month));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/estadisticas/manual", requireAuth, async (_, res) => {
    res.json({ entradas: (await leerManual()).sort((a, b) => b.fecha.localeCompare(a.fecha)) });
  });

  app.post("/api/estadisticas/manual", requireAuth, async (req, res) => {
    try {
      const entradas = await leerManual();
      const i = req.body?.id ? entradas.findIndex((e) => e.id === req.body.id) : -1;
      const entrada = limpiarEntrada(req.body || {}, i >= 0 ? entradas[i] : {});
      if (!Object.keys(entrada.metricas).length) throw new Error("Pon al menos un número.");
      if (i >= 0) entradas[i] = entrada; else entradas.push(entrada);
      await guardarJson(archivos.manual, { entradas });
      cache.clear();
      res.json({ ok: true, entrada });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/estadisticas/manual/:id", requireAuth, async (req, res) => {
    const entradas = await leerManual();
    const resto = entradas.filter((e) => e.id !== req.params.id);
    if (resto.length === entradas.length) return res.status(404).json({ error: "No encontrada" });
    await guardarJson(archivos.manual, { entradas: resto });
    cache.clear();
    res.json({ ok: true });
  });

  // Robot del Mac (robot-redes/): Roberto inicia sesión en su Chrome y el robot manda aquí
  // el Excel de LinkedIn o capturas de Instagram. Entra con ESTADISTICAS_ROBOT_TOKEN, no con la sesión.
  const robotAutorizado = (req) => {
    const esperado = String(process.env.ESTADISTICAS_ROBOT_TOKEN || "");
    const recibido = String(req.get("x-robot-token") || "");
    if (esperado.length < 24 || recibido.length !== esperado.length) return false;
    return crypto.timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
  };

  app.post("/api/estadisticas/robot", async (req, res) => {
    if (!robotAutorizado(req)) return res.status(401).json({ error: "No autorizado" });
    try {
      const tipo = String(req.body?.tipo || "");
      if (tipo === "linkedin-excel") {
        const datos = String(req.body?.archivo || "").replace(/^data:[^;]+;base64,/, "");
        const resultado = await guardarLinkedin(importarLinkedin(Buffer.from(datos, "base64")));
        return res.json({ ok: true, ...resultado });
      }
      if (tipo === "linkedin-resumen") {
        const leido = await leerCapturaInstagram(req.body?.imagen, "image/png");
        const entradas = await leerManual();
        const mes = isoDia(new Date()).slice(0, 7);
        const i = entradas.findIndex((e) => e.canal === "LinkedIn" && e.tipo === "mes" && e.origen === "robot" && e.fecha.startsWith(mes));
        const entrada = limpiarEntrada({ canal: "LinkedIn", tipo: "mes", fecha: `${mes}-01`, titulo: `LinkedIn ${mes} (últimos 28 días)`, metricas: leido.metricas, origen: "robot" }, i >= 0 ? entradas[i] : {});
        if (!Object.keys(entrada.metricas).length) return res.json({ ok: true, guardado: false, motivo: "La captura no tenía números." });
        if (i >= 0) entradas[i] = entrada; else entradas.push(entrada);
        await guardarJson(archivos.manual, { entradas });
        cache.clear();
        return res.json({ ok: true, guardado: true, metricas: entrada.metricas });
      }
      if (tipo === "linkedin-publicaciones") {
        const lista = await leerCapturaLista(req.body?.imagen, "LinkedIn");
        const entradas = await leerManual();
        const clave = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 6).join(" ");
        let nuevas = 0;
        for (const x of lista) {
          const i = entradas.findIndex((e) => e.canal === "LinkedIn" && e.tipo !== "mes" && clave(e.titulo) === clave(x.titulo));
          const previa = i >= 0 ? entradas[i] : {};
          const entrada = limpiarEntrada({
            canal: "LinkedIn", fecha: previa.fecha || x.fecha || isoDia(new Date()), titulo: x.titulo, metricas: x.metricas, origen: "robot",
          }, previa);
          if (i >= 0) entradas[i] = entrada; else { entradas.push(entrada); nuevas += 1; }
        }
        await guardarJson(archivos.manual, { entradas });
        cache.clear();
        return res.json({ ok: true, leidas: lista.length, nuevas });
      }
      if (tipo === "instagram-captura" || tipo === "instagram-cuenta") {
        const leido = await leerCapturaInstagram(req.body?.imagen, "image/png");
        const entradas = await leerManual();
        const url = String(req.body?.url || "").slice(0, 500);
        const cuenta = tipo === "instagram-cuenta";
        const mes = String(req.body?.fecha || isoDia(new Date())).slice(0, 7);
        const i = cuenta
          ? entradas.findIndex((e) => e.canal === "Instagram" && e.tipo === "mes" && e.origen === "robot" && e.fecha.startsWith(mes))
          : entradas.findIndex((e) => e.canal === "Instagram" && url && e.url === url);
        const entrada = limpiarEntrada({
          canal: "Instagram",
          tipo: cuenta ? "mes" : "publicacion",
          fecha: cuenta ? `${mes}-01` : (req.body?.fecha || leido.fecha),
          titulo: cuenta ? `Instagram ${mes}` : (req.body?.titulo || leido.titulo),
          url,
          metricas: leido.metricas,
          origen: "robot",
        }, i >= 0 ? entradas[i] : {});
        if (!Object.keys(entrada.metricas).length) return res.json({ ok: true, guardado: false, motivo: "La captura no tenía números." });
        if (i >= 0) entradas[i] = entrada; else entradas.push(entrada);
        await guardarJson(archivos.manual, { entradas });
        cache.clear();
        return res.json({ ok: true, guardado: true, metricas: entrada.metricas });
      }
      res.status(400).json({ error: "Tipo desconocido" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/estadisticas/linkedin", requireAuth, async (req, res) => {
    try {
      const datos = String(req.body?.archivo || "").replace(/^data:[^;]+;base64,/, "");
      if (!datos) throw new Error("No ha llegado el Excel.");
      const resultado = await guardarLinkedin(importarLinkedin(Buffer.from(datos, "base64")));
      res.json({ ok: true, ...resultado });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/estadisticas/captura", requireAuth, async (req, res) => {
    try {
      res.json({ ok: true, leido: await leerCapturaInstagram(req.body?.imagen, req.body?.tipo) });
    } catch (error) {
      res.status(error.status === 503 ? 503 : 400).json({ error: error.message });
    }
  });

  // Pinterest: autorizar una vez para que el token se renueve solo.
  const pinterestRedireccion = (req) => String(process.env.PINTEREST_REDIRECT_URI || `${d.publicOrigin(req)}/oauth/pinterest/callback`).trim();

  app.get("/oauth/pinterest/start", requireAuth, (req, res) => {
    const { id, secreto } = pinterestApp();
    if (!id || !secreto) {
      return res.status(400).type("html").send(paginaOauth("Falta un paso", `<p>Para que Pinterest se renueve solo, Flow necesita el <b>ID de la app</b> y su <b>clave secreta</b> (developers.pinterest.com → tu app). Pégalos con <code>poner-clave.command</code> como <code>PINTEREST_APP_ID=…</code> y <code>PINTEREST_APP_SECRET=…</code>.</p>`, false));
    }
    const params = new URLSearchParams({
      client_id: id,
      redirect_uri: pinterestRedireccion(req),
      response_type: "code",
      scope: "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
      state: d.oauthState(),
    });
    res.redirect(`https://www.pinterest.com/oauth/?${params}`);
  });

  app.get("/oauth/pinterest/callback", async (req, res) => {
    try {
      if (!d.validOauthState(req.query?.state)) throw new Error("La autorización ha caducado. Vuelve a empezar desde Flow.");
      if (req.query?.error) throw new Error(String(req.query.error_description || req.query.error));
      const { id, secreto } = pinterestApp();
      const cuerpo = await pedir("https://api.pinterest.com/v5/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${id}:${secreto}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: String(req.query?.code || ""),
          redirect_uri: pinterestRedireccion(req),
          continuous_refresh: "true",
        }),
      }, "Pinterest");
      tokens.pinterest = { access_token: cuerpo.access_token, refresh_token: cuerpo.refresh_token, scope: cuerpo.scope, renovadoEn: new Date().toISOString() };
      await guardarTokens();
      cache.clear();
      res.type("html").send(paginaOauth("Pinterest conectado", "<p>Listo. Flow renovará el token de Pinterest él solo; ya no hace falta pegarlo cada mes.</p>"));
    } catch (error) {
      res.status(400).type("html").send(paginaOauth("No se pudo conectar Pinterest", `<pre>${d.escapeHtml(error.message)}</pre>`, false));
    }
  });

  // Foto diaria: recalcula el mes actual y el anterior para que quede guardado.
  const foto = async () => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = hoy.getMonth() + 1;
    const a = mesAnterior(y, m);
    cache.clear();
    await resumen(y, m).catch(() => {});
    await resumen(a.year, a.month).catch(() => {});
  };
  setTimeout(() => foto(), 60 * 1000).unref?.();
  setInterval(() => foto(), 12 * 3600 * 1000).unref?.();
}

export function guardarRefreshYoutube(refreshToken, scope) {
  tokens.youtube = { refresh_token: refreshToken, scope, guardadoEn: new Date().toISOString() };
  cache.clear();
  return guardarTokens();
}

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

// Para pruebas
export const _interno = { importarLinkedin, leerXlsx, canalDeOrigen, conMarca, fechaExcel };
