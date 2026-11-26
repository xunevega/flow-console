import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import * as ftp from "basic-ftp";
import express from "express";
import pg from "pg";
import { PDFParse } from "pdf-parse";

const app = express();
const { Pool } = pg;
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const n8nUrl = String(process.env.N8N_URL || "").replace(/\/+$/, "");
const n8nApiKey = process.env.N8N_API_KEY || "";
const consolePassword = process.env.CONSOLE_PASSWORD || "";
const sessionSecret = process.env.SESSION_SECRET || "";
const publicationExternalWorkerUrl = String(process.env.PUBLICATION_EXTERNAL_WORKER_URL || "").replace(/\/+$/, "");
const publicationExternalWorkerToken = process.env.PUBLICATION_EXTERNAL_WORKER_TOKEN || "";
const dataDirectory = process.env.DATA_DIRECTORY || path.join(root, "data");
const groupsFile = path.join(dataDirectory, "groups.json");
const noticesFile = path.join(dataDirectory, "notices.json");
const calendarTasksFile = path.join(dataDirectory, "calendar-tasks.json");
const calendarSignalsFile = path.join(dataDirectory, "calendar-signals.json");
const calendarNotesFile = path.join(dataDirectory, "calendar-notes.json");
const calendarNoteMediaDirectory = path.join(dataDirectory, "calendar-note-media");
const publicationPostsFile = path.join(dataDirectory, "instagram-posts.json");
const publicationMediaDirectory = path.join(dataDirectory, "instagram-media");
const publicationLibraryDirectory = path.join(dataDirectory, "publication-library");
const publicationTargetsFile = path.join(dataDirectory, "publication-targets.json");
const forumConfigFile = path.join(dataDirectory, "forum-config.json");
const monthlyStatsFile = path.join(dataDirectory, "monthly-stats.json");
const editorialMastersFile = path.join(dataDirectory, "editorial-masters.json");
const editorialMetricsFile = path.join(dataDirectory, "editorial-metrics.json");
const campaignUrlsFile = path.join(dataDirectory, "campaign-urls.json");
const visualAnalysisCacheFile = path.join(dataDirectory, "visual-analysis-cache.json");
const production = process.env.NODE_ENV === "production";
const configuredPublicOrigin = normalizePublicOrigin(
  process.env.FLOW_CONSOLE_PUBLIC_URL
  || process.env.PUBLIC_BASE_URL
  || process.env.RAILWAY_PUBLIC_DOMAIN
  || ""
);
const aeternalBlogApiUrl = String(process.env.AETERNAL_BLOG_API_URL || "https://aeternal-flow.es/api/publicar.php").trim();
const aeternalBlogApiToken = String(process.env.AETERNAL_BLOG_API_TOKEN || process.env.BLOG_API_TOKEN || "").trim();
const aeternalBlogArticlesApiUrl = String(process.env.AETERNAL_BLOG_ARTICLES_API_URL || deriveBlogArticlesApiUrl(aeternalBlogApiUrl)).trim();
const youtubePrivacyStatus = ["private", "unlisted", "public"].includes(process.env.YOUTUBE_PRIVACY_STATUS)
  ? process.env.YOUTUBE_PRIVACY_STATUS
  : "public";
const youtubeCategoryId = String(process.env.YOUTUBE_CATEGORY_ID || "22").trim();
const pinterestAccessToken = String(process.env.PINTEREST_ACCESS_TOKEN || "").trim();
const pinterestBoardId = String(process.env.PINTEREST_BOARD_ID || "").trim();
const pinterestLinkUrl = safeUrl(process.env.PINTEREST_LINK_URL) || safeUrl(process.env.FLOW_CONSOLE_PUBLIC_URL) || "";
const googleAdsConfig = {
  clientId: String(process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim(),
  clientSecret: String(process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim(),
  developerToken: String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim(),
  refreshToken: String(process.env.GOOGLE_ADS_REFRESH_TOKEN || "").trim(),
  customerId: String(process.env.GOOGLE_ADS_CUSTOMER_ID || "").trim(),
  loginCustomerId: String(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").trim(),
};
const googleMapsApiKey = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
const ftpHost = String(process.env.FTP_HOST || "").trim();
const ftpPort = Number(process.env.FTP_PORT || 21);
const ftpUser = String(process.env.FTP_USER || "").trim();
const ftpPassword = String(process.env.FTP_PASSWORD || "").trim();
const ftpSecure = String(process.env.FTP_SECURE || "true").toLowerCase() !== "false";
const ftpRemoteDir = String(process.env.FTP_REMOTE_DIR || "/httpdocs/flow-publicaciones/instagram/imagen").trim();
const instagramImageBaseUrl = String(process.env.INSTAGRAM_IMAGE_BASE_URL || "https://aeternal-flow.es/flow-publicaciones/instagram/imagen/").replace(/\/+$/, "") + "/";
const ragValorarWebhook = process.env.RAG_VALORAR_WEBHOOK || "/webhook/rag/valorar";
const ragIngestarWebhook = process.env.RAG_INGESTAR_WEBHOOK || "/webhook/rag/ingestar";
const ragInternalToken = process.env.RAG_INTERNAL_TOKEN || sessionSecret;
const editorialBrainUrl = String(process.env.EDITORIAL_BRAIN_URL || "").replace(/\/+$/, "");
const editorialBrainToken = String(process.env.EDITORIAL_BRAIN_API_TOKEN || "").trim();
const geminiApiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "").trim();
const geminiVisionModel = String(process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash-lite").trim();
const databaseUrl = process.env.DATABASE_URL || "";
let pgPool;
let ragSchemaReady = false;
const runnableWorkflows = {
  indieHackersRadar: "flow-console-run-indie-hackers",
  hnDataImporterMonitor: "flow-console-run-hn-monitor",
  hnOwnContentDraft: "flow-console-run-hn-content",
  indieHackersCheckin: "flow-console-run-checkin",
  vK6YJAOFEzbHCq0e: "flow-console-run-linkedin",
};
const defaultGroups = {
  groups: [
    { id: "reputation", name: "Reputación y comunidad", color: "#4a7ab5" },
    { id: "content", name: "Contenido propio", color: "#7a60a8" },
    { id: "other", name: "Otros workflows", color: "#8c8277" },
  ],
  assignments: {},
};
const disabledPublicationTargetIds = new Set([
  "blue" + "sky",
  "masto" + "don",
  String.fromCharCode(120),
  "face" + "book",
  "news" + "letter",
]);
const manualEditorialTargets = [
  { id: "substack", name: "Substack", kind: "newsletter", url: "https://substack.com/" },
  { id: "substack-notes", name: "Substack Notes", kind: "publicación breve", url: "https://substack.com/notes" },
  { id: "linkedin-newsletter", name: "LinkedIn Newsletter", kind: "newsletter", url: "https://www.linkedin.com/" },
  { id: "medium", name: "Medium", kind: "artículo", url: "https://medium.com/new-story" },
  { id: "reddit", name: "Reddit", kind: "comunidad", url: "https://www.reddit.com/" },
];
const manualEditorialTargetIds = new Set(manualEditorialTargets.map(target => target.id));
const defaultPublicationTargets = [
  ...manualEditorialTargets.map(target => ({ ...target, handle: target.url, color: "#4a7ab5", icon: "✎", webhookPath: "", builtIn: true })),
  {
    id: "instagram",
    name: "Instagram",
    handle: "",
    kind: "red social",
    color: "#c47a3a",
    webhookPath: "/webhook/publicar-instagram",
    icon: "◎",
    builtIn: true,
  },
  {
    id: "youtube",
    name: "YouTube",
    handle: "",
    kind: "vídeo",
    color: "#c45050",
    webhookPath: "/webhook/publicar-youtube",
    icon: "▶",
    builtIn: true,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    handle: "",
    kind: "red profesional",
    color: "#4a7ab5",
    webhookPath: "/webhook/publicar-linkedin",
    icon: "in",
    builtIn: true,
  },
  {
    id: "tiktok",
    name: "TikTok",
    handle: "",
    kind: "vídeo corto",
    color: "#7a60a8",
    webhookPath: "/webhook/publicar-tiktok",
    icon: "♪",
    builtIn: true,
  },
  {
    id: "pinterest",
    name: "Pinterest",
    handle: "",
    kind: "visual",
    color: "#c45050",
    webhookPath: "/webhook/publicar-pinterest",
    icon: "P",
    builtIn: true,
  },
  {
    id: "blog",
    name: "Blog",
    handle: "",
    kind: "web",
    color: "#4a9e7a",
    webhookPath: "/webhook/publicar-blog",
    icon: "✎",
    builtIn: true,
  },
];
const defaultStatsChannels = ["GA4 Web", "YouTube", "Pinterest", "LinkedIn"];
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "140mb" }));
app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});

function configured() {
  return Boolean(n8nUrl && n8nApiKey && consolePassword && sessionSecret);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSession() {
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
  );
}

function validSession(req) {
  if (!configured()) return false;
  const token = readCookies(req).flow_console_session;
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).expiresAt > Date.now();
  } catch {
    return false;
  }
}

function requireAuth(req, res, next) {
  if (!validSession(req)) return res.status(401).json({ error: "No autorizado" });
  next();
}

function requireInternalRag(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!ragInternalToken || !safeEqual(token, ragInternalToken)) {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
}

function parseDurationSeconds(value) {
  const match = String(value || "").match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : 0;
}

function routeWaypointFromInput(value) {
  const text = String(value || "").trim();
  const latLngMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (latLngMatch) {
    return {
      location: {
        latLng: {
          latitude: Number(latLngMatch[1]),
          longitude: Number(latLngMatch[2]),
        },
      },
    };
  }
  if (/^place_id:/i.test(text)) return { placeId: text.replace(/^place_id:/i, "").trim() };
  return { address: text };
}

function tollAmountFromRoute(route) {
  const prices = Array.isArray(route?.travelAdvisory?.tollInfo?.estimatedPrice)
    ? route.travelAdvisory.tollInfo.estimatedPrice
    : [];
  const first = prices[0];
  if (!first) return { tollAmount: 0, tollCurrency: "EUR" };
  const units = Number(first.units || 0);
  const nanos = Number(first.nanos || 0);
  return {
    tollAmount: units + (nanos / 1_000_000_000),
    tollCurrency: String(first.currencyCode || "EUR"),
  };
}

function oauthState() {
  const payload = Buffer.from(JSON.stringify({
    purpose: "youtube-oauth",
    nonce: crypto.randomUUID(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function validOauthState(value) {
  const [payload, signature] = String(value || "").split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    return parsed?.purpose === "youtube-oauth" && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function youtubeOAuthRedirectUri(req) {
  const configuredRedirectUri = String(process.env.YOUTUBE_REDIRECT_URI || "").trim();
  return configuredRedirectUri || `${publicOrigin(req)}/oauth/youtube/callback`;
}

function searchConsoleOAuthRedirectUri(req) {
  const configuredRedirectUri = String(process.env.SEARCH_CONSOLE_REDIRECT_URI || process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI || "").trim();
  return configuredRedirectUri || `${publicOrigin(req)}/oauth/search-console/callback`;
}

function ga4OAuthRedirectUri(req) {
  const configuredRedirectUri = String(process.env.GA4_REDIRECT_URI || process.env.GOOGLE_ANALYTICS_REDIRECT_URI || "").trim();
  return configuredRedirectUri || `${publicOrigin(req)}/oauth/ga4/callback`;
}

function youtubeOAuthConfig() {
  return {
    clientId: String(process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    refreshToken: String(process.env.YOUTUBE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN || "").trim(),
  };
}

function ga4OAuthConfig() {
  return {
    clientId: String(process.env.GA4_CLIENT_ID || process.env.GOOGLE_ANALYTICS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.GA4_CLIENT_SECRET || process.env.GOOGLE_ANALYTICS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    refreshToken: String(process.env.GA4_REFRESH_TOKEN || process.env.GOOGLE_ANALYTICS_REFRESH_TOKEN || "").trim(),
    propertyId: String(process.env.GA4_PROPERTY_ID || process.env.GOOGLE_ANALYTICS_PROPERTY_ID || "").replace(/^properties\//, "").trim(),
  };
}

function searchConsoleOAuthConfig() {
  return {
    clientId: String(process.env.SEARCH_CONSOLE_CLIENT_ID || process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.SEARCH_CONSOLE_CLIENT_SECRET || process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET || "").trim(),
    refreshToken: String(process.env.SEARCH_CONSOLE_REFRESH_TOKEN || process.env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN || "").trim(),
    siteUrl: String(process.env.SEARCH_CONSOLE_SITE_URL || process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || "").trim(),
  };
}

function ga4OAuthUrl(req) {
  const { clientId, clientSecret } = ga4OAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Faltan GA4_CLIENT_ID y GA4_CLIENT_SECRET, o GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ga4OAuthRedirectUri(req),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    access_type: "offline",
    prompt: "consent",
    state: oauthState(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function youtubeOAuthUrl(req) {
  const { clientId, clientSecret } = youtubeOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Faltan YOUTUBE_CLIENT_ID y YOUTUBE_CLIENT_SECRET");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: youtubeOAuthRedirectUri(req),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload",
    access_type: "offline",
    prompt: "consent",
    state: oauthState(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function searchConsoleOAuthUrl(req) {
  const { clientId, clientSecret } = searchConsoleOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Faltan SEARCH_CONSOLE_CLIENT_ID y SEARCH_CONSOLE_CLIENT_SECRET, o GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: searchConsoleOAuthRedirectUri(req),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    access_type: "offline",
    prompt: "consent",
    state: oauthState(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeGa4OAuthCode(req, code) {
  const { clientId, clientSecret } = ga4OAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Faltan credenciales OAuth de Google para GA4");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: ga4OAuthRedirectUri(req),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error_description || result.error || `Google OAuth respondió ${response.status}`);
  }
  return result;
}

async function exchangeYouTubeOAuthCode(req, code) {
  const { clientId, clientSecret } = youtubeOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Faltan YOUTUBE_CLIENT_ID y YOUTUBE_CLIENT_SECRET");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: youtubeOAuthRedirectUri(req),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error_description || result.error || `Google OAuth respondió ${response.status}`);
  }
  return result;
}

async function exchangeSearchConsoleOAuthCode(req, code) {
  const { clientId, clientSecret } = searchConsoleOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Faltan credenciales OAuth de Google para Search Console");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: searchConsoleOAuthRedirectUri(req),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error_description || result.error || `Google OAuth respondió ${response.status}`);
  }
  return result;
}

function getPgPool() {
  if (!databaseUrl) throw new Error("DATABASE_URL no configurada");
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
      max: 4,
    });
  }
  return pgPool;
}

async function ensureRagSchema(client) {
  if (ragSchemaReady) return;
  await client.query(`
    create extension if not exists vector;
    create extension if not exists pgcrypto;

    create table if not exists documents (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      type text not null default 'nota',
      project text not null default 'otro',
      source text not null default 'manual',
      tags jsonb not null default '[]'::jsonb,
      status text not null default 'validado',
      author text,
      metadata jsonb not null default '{}'::jsonb,
      archived_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table if not exists document_chunks (
      id uuid primary key default gen_random_uuid(),
      document_id uuid not null references documents(id) on delete cascade,
      chunk_index integer not null default 0,
      content text not null,
      embedding vector(1024) not null,
      metadata jsonb not null default '{}'::jsonb,
      retrieval_count integer not null default 0,
      created_at timestamptz not null default now()
    );

    create unique index if not exists document_chunks_document_idx_unique
      on document_chunks (document_id, chunk_index);
    create index if not exists documents_project_idx on documents (project);
    create index if not exists documents_type_idx on documents (type);
    create index if not exists document_chunks_embedding_hnsw_idx
      on document_chunks using hnsw (embedding vector_cosine_ops);

    create table if not exists app_state (
      key text primary key,
      value jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
  `);
  ragSchemaReady = true;
}

function vectorLiteral(value) {
  const vector = Array.isArray(value) ? value : [];
  if (vector.length !== 1024) {
    throw new Error(`Embedding inválido: se esperaban 1024 dimensiones y llegaron ${vector.length}`);
  }
  return `[${vector.map((number) => {
    const value = Number(number);
    return Number.isFinite(value) ? value.toFixed(8) : "0";
  }).join(",")}]`;
}

function splitTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  return String(value || "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function uniqueStrings(values, limit = 80) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, limit);
}

function canonicalMemoryText(value) {
  return String(value || "")
    .replace(/^(?:\s*refuerzo\s*:\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalMemoryKey(value) {
  return canonicalMemoryText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[()"'“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueMemoryStrings(values, category = "", limit = 80) {
  const seen = new Map();
  for (const value of values || []) {
    const normalized = normalizeMemoryVariable(value, category);
    if (!normalized || isOperationalMemoryNoise(normalized, category)) continue;
    const key = canonicalMemoryKey(normalized);
    if (!key || seen.has(key)) continue;
    seen.set(key, normalized);
  }
  return [...seen.values()].slice(0, limit);
}

function weightedItems(values, limit = 24) {
  const counts = new Map();
  const labels = new Map();
  for (const value of values.map((item) => canonicalMemoryText(item)).filter(Boolean)) {
    const key = canonicalMemoryKey(value);
    if (!key) continue;
    labels.set(key, labels.get(key) || value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const maxCount = Math.max(1, ...counts.values());
  return [...counts.entries()]
    .map(([key, count]) => ({
      label: labels.get(key) || key,
      tag: labels.get(key) || key,
      count,
      score: Math.round((count / maxCount) * 100),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function normalizeMemoryVariable(value, category = "") {
  const original = canonicalMemoryText(value);
  const normalized = original
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[()"'“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (/(^|\s)(taiwanes estadounidense|los angeles|new york|nueva york|society of illustrators|harvey awards|eisner awards|gold medals?|el mundo|voz populi|abc|the objective)(\s|$)/i.test(normalized)) return "";
  if (/^(literario comunicativo|comunicativo literario|literario y comunicativo|comunicativo y literario)$/.test(normalized)) return "Literario-comunicativo";
  if (/^literari[oa]$/.test(normalized)) return "Literario";
  if (/^comunicativ[oa]$/.test(normalized)) return "Comunicativo";
  if (/^automation$|^automatizacion$|^automatizar\b|^automatizaci[oó]n\b/.test(normalized)) return "Automatización";

  if (category === "frameworks") {
    if (/liberalismo economico|liberalismo clasico|liberalismo|libertarianismo|libertario|perspectiva libertaria|pensamiento libertario|economista libertario|anarcocapital|minarquismo|rothbard|derechos propiedad absolutos/.test(normalized)) return "Liberalismo económico";
    if (/escuela austriaca|economia austriaca|austriaco economico|pensamiento austriaco|teoria economica austriaca|autores clasicos.*austriac|hayek|mises|juan ramon rallo|rallo/.test(normalized)) return "Liberalismo económico";
    if (/estoic/.test(normalized)) return "Estoicismo";
    if (/keynes/.test(normalized)) return "Keynesianismo";
    if (/marx/.test(normalized)) return "Marxismo";
  }

  if (category === "positions") {
    if (/libre mercado|mercado libre/.test(normalized)) return "Libre mercado";
    if (/antiestat|anti estatista|anti intervencion|intervencionismo|critico.*intervencion|critica.*intervencion|regulacion excesiva|critico regulacion|estado minimo|desconfiar de planificacion central|planificacion central/.test(normalized)) return "Antiestatismo";
    if (/privacidad/.test(normalized)) return "Privacidad";
    if (/propiedad privada/.test(normalized)) return "Propiedad privada";
    if (/descentraliz/.test(normalized)) return "Descentralización";
    if (/formalismo/.test(normalized)) return "Formalismo";
    if (/libertad creativa|creatividad/.test(normalized)) return "Libertad creativa";
    if (/innovacion tecnologica|tecnologia/.test(normalized)) return "Innovación tecnológica";
    if (/meritocracia/.test(normalized)) return "Meritocracia";
    if (/liberalismo economico|libertarianismo|libertario|anarcocapital|minarquismo|rothbard|austriaco economico|escuela austriaca/.test(normalized)) return "Libre mercado";
  }

  if (category === "influences") {
    if (/bastos|miguel anxo/.test(normalized)) return "Miguel Anxo Bastos";
    if (/rallo|juan ramon/.test(normalized)) return "Juan Ramón Rallo";
    if (/taleb/.test(normalized)) return "Nassim Taleb";
    if (/hayek|hayes/.test(normalized)) return "Hayek";
    if (/mises/.test(normalized)) return "Mises";
    if (/borges/.test(normalized)) return "Borges";
    if (/krishnamurti/.test(normalized)) return "Krishnamurti";
    if (/facundo cabral|cabral/.test(normalized)) return "Facundo Cabral";
    if (/autores clasicos.*austriac|referencias a autores clasicos/.test(normalized)) return "Autores clásicos austriacos";
  }

  return original;
}

function normalizedMemoryKey(value) {
  return canonicalMemoryKey(value);
}

const visualStyleNoise = new Set([
  "abstract figuration",
  "baroque influenced",
  "gestualidad suelta",
  "narrativa sin limite",
  "narrativa sin limite espacial",
  "narrativa sin limite temporal",
  "narrativa sin limite temporal espacial",
  "narrativa onirica",
  "sin limite espacial",
  "sin limite temporal",
  "sin limite temporal espacial",
  "pintura abstracta figurativa",
  "pintura abstracta",
  "pintura figurativa",
  "tradicion",
  "tradicion barroca",
]);

const semanticMemoryNouns = new Set([
  "analisis",
  "automatizacion",
  "criterio",
  "divulgacion",
  "ensayo",
  "estilo",
  "formalismo",
  "keynesianismo",
  "liberalismo",
  "marxismo",
  "mercado",
  "meritocracia",
  "narrativa",
  "privacidad",
  "realismo",
  "tecnologia",
]);

const semanticMemoryModifiers = new Set([
  "analitico",
  "claro",
  "clasico",
  "comunicativo",
  "creativa",
  "digital",
  "economico",
  "economica",
  "literario",
  "magico",
  "operativa",
  "ortodoxo",
  "humanista",
  "politica",
  "practica",
  "social",
  "sobrio",
  "tecnologica",
]);

const semanticSuspiciousModifiers = new Set([
  "barroca",
  "espacial",
  "figurativa",
  "gestual",
  "onirica",
  "temporal",
]);

const acceptedSemanticCollocations = [
  /^criterio economico$/,
  /^criterios economicos$/,
  /^escuela austriaca$/,
  /^keynesianismo clasico$/,
  /^liberalismo clasico$/,
  /^liberalismo economico$/,
  /^marxismo clasico$/,
  /^marxismo cultural$/,
  /^marxismo humanista$/,
  /^marxismo ortodoxo$/,
  /^narrativa clasica$/,
  /^narrativa economica$/,
  /^narrativa politica$/,
  /^narrativa social$/,
  /^realismo magico$/,
];

function isSemanticallyCoherentMemory(value, category = "") {
  const normalized = normalizedMemoryKey(value);
  const categoryKey = normalizedMemoryKey(category);
  if (!["frameworks", "positions", "influences", "style"].includes(categoryKey)) return true;
  if (acceptedSemanticCollocations.some((pattern) => pattern.test(normalized))) return true;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 2) return true;
  if (words.some((word) => semanticSuspiciousModifiers.has(word))) return false;
  if (words.length > 4 && !/^(libertad creativa|inteligencia artificial|liberalismo economico)/.test(normalized)) return false;
  if (strategicMemoryDictionary[categoryKey]?.some((pattern) => pattern.test(normalized))) return true;
  const [noun, ...modifiers] = words;
  if (!semanticMemoryNouns.has(noun)) return false;
  return modifiers.every((word) =>
    semanticMemoryNouns.has(word)
    || semanticMemoryModifiers.has(word)
    || /^(de|del|para|y|sobre)$/.test(word),
  );
}

const strategicMemoryDictionary = {
  frameworks: [
    /automatizacion|automatizar|automation/,
    /liberalismo economico|liberalismo clasico|liberalismo|libertarianismo|libertario|anarcocapital|minarquismo/,
    /escuela austriaca|economia austriaca|hayek|mises|rallo/,
    /estoicismo|keynesianismo|keynesianismo clasico|marxismo|marxismo clasico|marxismo cultural|marxismo humanista|marxismo ortodoxo/,
    /realismo magico/,
    /innovacion|tecnologia|ia aplicada|inteligencia artificial/,
    /privacidad|descentralizacion|propiedad privada/,
  ],
  positions: [
    /automatizacion|automatizar|automation/,
    /criterio economico|criterios economicos|economico|economica/,
    /libre mercado|mercado libre/,
    /antiestatismo|antiestat|anti intervencion|intervencionismo|estado minimo|planificacion central|regulacion excesiva/,
    /privacidad|descentralizacion|propiedad privada|meritocracia/,
    /innovacion tecnologica|libertad creativa|formalismo/,
  ],
  influences: [
    /literario comunicativo|literario|comunicativo/,
    /realismo magico/,
    /narrativa clasica|narrativa politica|narrativa economica|narrativa social/,
    /miguel anxo bastos|juan ramon rallo|nassim taleb|hayek|mises|borges|krishnamurti|facundo cabral/,
    /ensayo|divulgacion|narrativo|analitico|claro|sobrio/,
  ],
};

function isDictionaryAllowedMemory(value, category = "") {
  const normalized = normalizedMemoryKey(value);
  const categoryKey = normalizedMemoryKey(category);
  if (!normalized || visualStyleNoise.has(normalized)) return false;
  if (!isSemanticallyCoherentMemory(normalized, categoryKey)) return false;
  const dictionary = strategicMemoryDictionary[categoryKey];
  if (!dictionary) return true;
  return dictionary.some((pattern) => pattern.test(normalized));
}

function isOperationalMemoryNoise(value, category = "") {
  const normalized = normalizedMemoryKey(value);
  if (!normalized) return true;
  const raw = String(value || "").trim();
  if (/^feedback del usuario:\s*si una generaci[oó]n parecida dice/i.test(raw)) return true;
  if (/^preferir esta postura\/redacci[oó]n cuando el contexto sea similar:/i.test(raw)) return true;
  if (/^evitar este patr[oó]n de respuesta:/i.test(raw)) return true;
  if (/^contexto donde aplica:/i.test(raw)) return true;
  const categoryKey = normalizedMemoryKey(category);
  const platformNoise = ["instagram", "linkedin", "youtube", "pinterest", "tiktok", "facebook", "quora", "blog", "twitter", "x"];
  if (platformNoise.includes(normalized)) return true;
  return visualStyleNoise.has(normalized) || [
    "publicaciones",
    "publicacion real",
    "con imagen",
    "con video",
    "con url",
    "con url final",
    "con archivo",
    "delivery manual",
    "manual",
    "draft",
    "published",
    "publish",
    "received by external workflow",
    "received by workflow",
    "success",
    "done",
    "copy largo",
  ].includes(normalized)
    || /narrativa.*sin limite/.test(normalized)
    || /sin limite.*(?:temporal|espacial)/.test(normalized)
    || /^con\s+(imagen|video|url|url final|archivo|pdf)$/i.test(normalized)
    || /^chunking preferido\b/i.test(normalized)
    || /^formato:\s*/i.test(String(value || ""))
    || /^resultado:\s*/i.test(String(value || ""));
}

function weightedStrategicItems(values, category, limit = 24) {
  return weightedItems(
    values
      .map((value) => normalizeMemoryVariable(value, category))
      .filter((value) => value && !isOperationalMemoryNoise(value, category) && isDictionaryAllowedMemory(value, category)),
    limit,
  );
}

function normalizeSuppressedMemory(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, values]) => {
        const category = canonicalMemoryKey(key) || key;
        return [category, uniqueMemoryStrings(Array.isArray(values) ? values : [], category)];
      })
      .filter(([, values]) => values.length),
  );
}

function isSuppressedMemoryValue(value, category, suppressed = {}) {
  const normalized = normalizeMemoryVariable(value, category);
  if (!normalized || isOperationalMemoryNoise(normalized, category)) return true;
  const categoryKey = canonicalMemoryKey(category) || category;
  return uniqueStrings(suppressed[categoryKey] || [])
    .some((item) => normalizeMemoryVariable(item, categoryKey) === normalized);
}

function topicCategorySummary(memory) {
  const documents = memory.documents || [];
  const usage = memory.usage || {};
  const suppressed = normalizeSuppressedMemory(memory.suppressed);
  const isSuppressed = (value, category) => isSuppressedMemoryValue(value, category, suppressed);
  const visible = (values, category) => values.filter((value) => !isSuppressed(value, category));
  const weightedUsageValues = (buckets, category) => buckets.flatMap((bucket) =>
    Object.entries(usage[bucket] || {}).flatMap(([value, count]) => {
      const normalized = normalizeMemoryVariable(value, category);
      if (isSuppressed(normalized, category)) return [];
      const weight = Math.max(0, Math.min(20, Math.round(Number(count) || 0)));
      return Array.from({ length: weight }, () => normalized).filter(Boolean);
    }),
  );
  const fieldValues = (document) => [
    ...(document.tags || []),
    ...(document.topics || []),
    ...(document.stanceTags || []),
    ...(document.styles || []),
  ];
  const allValues = [
    ...documents.flatMap(fieldValues),
    ...memory.tags,
    ...memory.topics,
    ...memory.textPreferences,
    ...memory.styleTags,
    ...memory.promptHints,
  ];
  const matching = (values, pattern) => values.filter((value) => pattern.test(String(value || "")));
  const frameworkPattern = /escuela austr[ií]aca|austr[ií]ac|keynes|marx|liberalismo cl[aá]sico|liberalismo|conservadur|utilitar|estoic|anarcocapital|libertar|minarquismo|rothbard|institucionalismo|monetarismo|hayek|mises|rallo|automatizaci[oó]n|automatizar|automation/i;
  const positionPattern = /antiestat|anti.?intervencion|libre mercado|descentraliz|privacidad|innovaci[oó]n|propiedad privada|meritocracia|mercado|estado m[ií]nimo|planificaci[oó]n central|intervencionismo|regulaci[oó]n excesiva|impuesto|regulaci[oó]n|soberan[ií]a|libertad creativa|formalismo|automatizaci[oó]n|automatizar|automation/i;
  const influencePattern = /bastos|rallo|hayek|mises|taleb|borges|krishnamurti|facundo|cabral|autor|perfil|canal|fuente|youtube|@/i;
  const frameworks = [
    ...visible(matching(allValues, frameworkPattern), "frameworks"),
    ...weightedUsageValues(["topics", "tags"], "frameworks"),
    ...documents.flatMap((document) => visible(matching([document.title, document.summary], frameworkPattern), "frameworks")),
  ];
  const positions = [
    ...documents.flatMap((document) => visible(document.stanceTags || [], "positions")),
    ...visible(matching(allValues, positionPattern), "positions"),
    ...weightedUsageValues(["topics", "tags"], "positions"),
  ];
  const influences = [
    ...visible(matching(allValues, influencePattern), "influences"),
    ...weightedUsageValues(["prompts", "tags", "styles"], "influences"),
    ...documents.flatMap((document) => visible(matching([document.title, document.source, document.author], influencePattern), "influences")),
  ];
  const categories = [
    {
      id: "frameworks",
      title: "Temas y conceptos",
      description: "Ideas, escuelas y modelos que conviene recordar al generar contenido.",
      items: weightedStrategicItems(frameworks, "frameworks"),
    },
    {
      id: "positions",
      title: "Criterios y postura",
      description: "Preferencias de enfoque: qué tesis, límites o criterios pesan más.",
      items: weightedStrategicItems(positions, "positions"),
    },
    {
      id: "influences",
      title: "Estilo y fuentes",
      description: "Autores, canales, estructuras y rasgos de comunicación reutilizables.",
      items: weightedStrategicItems(influences, "influences", 18),
    },
  ];
  return categories.filter((category) => category.items.length);
}

function inferRagMemoryKind(document) {
  const text = `${document?.tipo || ""} ${document?.type || ""} ${(document?.tags || []).join(" ")} ${document?.title || ""} ${document?.content || ""}`.toLowerCase();
  if (/prompt/.test(text)) return "prompt";
  if (/estilo|style|tono|voz|copy|frase|cta|superlativo|jerga/.test(text)) return "style";
  if (/tema|topic|idea|industria|mercado|tecnolog|econom|ia|app/.test(text)) return "topic";
  return "knowledge";
}

function emptyRagMemory() {
  return {
    version: 1,
    updatedAt: null,
    documents: [],
    tags: [],
    topics: [],
    textPreferences: [],
    styleTags: [],
    promptHints: [],
    suppressed: {},
    usage: { tags: {}, topics: {}, styles: {}, prompts: {}, documents: {} },
  };
}

function ragDocumentDedupKey(document) {
  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return [
    normalize(document?.title || document?.nombre),
    normalize(document?.type || document?.tipo),
    normalize(document?.project || document?.proyecto),
  ].join("|");
}

function dedupeRagDocuments(documents) {
  const seen = new Map();
  for (const document of Array.isArray(documents) ? documents : []) {
    const key = ragDocumentDedupKey(document);
    if (!key.replace(/\|/g, "")) continue;
    if (!seen.has(key)) {
      seen.set(key, { ...document });
      continue;
    }
    const current = seen.get(key);
    seen.set(key, {
      ...current,
      tags: uniqueStrings([...(current.tags || []), ...(document.tags || [])], 40),
      topics: uniqueStrings([...(current.topics || []), ...(document.topics || [])], 40),
      stanceTags: uniqueStrings([...(current.stanceTags || []), ...(document.stanceTags || [])], 40),
      styles: uniqueStrings([...(current.styles || []), ...(document.styles || [])], 40),
      rememberedAt: current.rememberedAt || document.rememberedAt,
    });
  }
  return Array.from(seen.values());
}

function ragDocumentUtilityScore(document) {
  const utility = normalizedMemoryKey(document?.utility || document?.utilidad_rag || "");
  if (utility === "alta" || utility === "alto" || utility === "high") return 100;
  if (utility === "media" || utility === "medio" || utility === "medium") return 55;
  if (utility === "baja" || utility === "bajo" || utility === "low") return 15;
  return 35;
}

function ragDocumentRecencyScore(document) {
  const time = new Date(document?.rememberedAt || document?.updatedAt || document?.createdAt || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return 0;
  const ageDays = Math.max(0, (Date.now() - time) / 86400000);
  return Math.max(0, 45 - Math.min(45, ageDays / 2));
}

function rankRagDocument(document, usageDocuments = {}, protectedId = "") {
  const usageCount = Number(usageDocuments?.[document?.id] || 0);
  const usageScore = Math.min(120, usageCount * 24);
  const kindScore = document?.kind === "prompt" || document?.kind === "style" ? 12 : 0;
  const protectedScore = protectedId && document?.id === protectedId ? 35 : 0;
  return ragDocumentUtilityScore(document)
    + usageScore
    + ragDocumentRecencyScore(document)
    + kindScore
    + protectedScore;
}

function pruneRagDocuments(documents, usageDocuments = {}, limit = 80, protectedId = "") {
  return dedupeRagDocuments(documents)
    .map((document, index) => ({
      document,
      index,
      score: rankRagDocument(document, usageDocuments, protectedId),
      rememberedAt: new Date(document?.rememberedAt || document?.updatedAt || 0).getTime() || 0,
    }))
    .sort((left, right) =>
      right.score - left.score
      || right.rememberedAt - left.rememberedAt
      || left.index - right.index,
    )
    .slice(0, limit)
    .map((item) => item.document);
}

function normalizeRagMemory(value) {
  const memory = value && typeof value === "object" ? value : {};
  const usage = memory.usage && typeof memory.usage === "object" ? memory.usage : {};
  const suppressed = normalizeSuppressedMemory(memory.suppressed);
  const cleanValues = (values, category = "", limit = 80) =>
    uniqueMemoryStrings(values || [], category, limit)
      .filter((item) => !isSuppressedMemoryValue(item, category, suppressed));
  const cleanUsage = (bucket, category = "") => {
    const merged = new Map();
    const labels = new Map();
    for (const [key, count] of Object.entries(bucket && typeof bucket === "object" ? bucket : {})) {
      const normalized = normalizeMemoryVariable(key, category);
      if (!normalized || isSuppressedMemoryValue(normalized, category, suppressed) || Number(count) <= 0) continue;
      const memoryKey = canonicalMemoryKey(normalized);
      if (!memoryKey) continue;
      labels.set(memoryKey, labels.get(memoryKey) || normalized);
      merged.set(memoryKey, (Number(merged.get(memoryKey)) || 0) + Number(count));
    }
    return Object.fromEntries([...merged.entries()].map(([key, count]) => [labels.get(key) || key, count]));
  };
  const documents = pruneRagDocuments(memory.documents, usage.documents, 80).map((document) => ({
    ...document,
    tags: cleanValues(document.tags, "tags"),
    topics: cleanValues(document.topics, "topics"),
    stanceTags: cleanValues(document.stanceTags, "positions"),
    styles: cleanValues(document.styles, "style"),
    title: canonicalMemoryText(document.title || ""),
  })).filter((document) => {
    const title = normalizedMemoryKey(document.title);
    return title && !isOperationalMemoryNoise(title);
  });
  const preferredText = ["Literario-comunicativo", "Literario", "Comunicativo"];
  return {
    version: 1,
    updatedAt: memory.updatedAt || null,
    documents,
    tags: cleanValues(memory.tags, "tags"),
    topics: cleanValues(memory.topics, "topics"),
    textPreferences: cleanValues([...preferredText, ...(memory.textPreferences || [])], "style"),
    styleTags: cleanValues([...preferredText, ...(memory.styleTags || [])], "style"),
    promptHints: cleanValues(memory.promptHints, "influences"),
    suppressed,
    usage: {
      tags: cleanUsage(usage.tags, "tags"),
      topics: cleanUsage(usage.topics, "topics"),
      styles: cleanUsage(usage.styles, "style"),
      prompts: cleanUsage(usage.prompts, "influences"),
      documents: usage.documents && typeof usage.documents === "object" ? usage.documents : {},
    },
  };
}

async function readRagMemory(client = null) {
  const ownClient = client ? null : await getPgPool().connect();
  const db = client || ownClient;
  try {
    await ensureRagSchema(db);
    const result = await db.query("select value from app_state where key = 'rag_memory'");
    return normalizeRagMemory(result.rows[0]?.value || emptyRagMemory());
  } finally {
    ownClient?.release();
  }
}

async function readLockedRagMemory(client) {
  await ensureRagSchema(client);
  await client.query(
    `insert into app_state (key, value, updated_at)
     values ('rag_memory', $1::jsonb, now())
     on conflict (key) do nothing`,
    [JSON.stringify(emptyRagMemory())],
  );
  const result = await client.query("select value from app_state where key = 'rag_memory' for update");
  return normalizeRagMemory(result.rows[0]?.value || emptyRagMemory());
}

async function writeRagMemory(value, client = null) {
  const ownClient = client ? null : await getPgPool().connect();
  const db = client || ownClient;
  try {
    await ensureRagSchema(db);
    await db.query(
      `insert into app_state (key, value, updated_at)
       values ('rag_memory', $1::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [JSON.stringify(normalizeRagMemory(value))],
    );
  } finally {
    ownClient?.release();
  }
}

async function withRagMemoryUpdate(mutator) {
  const client = await getPgPool().connect();
  try {
    await client.query("begin");
    const memory = await readLockedRagMemory(client);
    const result = await mutator(memory, client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function buildRememberedRagDocumentMemory(memory, document, assessment, client) {
  const tags = splitTags(document.tags);
  const kind = inferRagMemoryKind(document);
  const summary = String(assessment?.resumen || document.title || document.nombre || "").trim();
  const record = {
    id: document.id || crypto.randomUUID(),
    title: String(document.title || document.nombre || "Documento RAG").slice(0, 180),
    project: document.project || document.proyecto || assessment?.proyecto || "otro",
    type: document.type || document.tipo || assessment?.tipo || "nota",
    kind,
    tags,
    topics: uniqueStrings(assessment?.topics || assessment?.temas || [], 20),
    stanceTags: uniqueStrings(assessment?.stanceTags || assessment?.stance_tags || [], 20),
    styles: uniqueStrings([
      ...(assessment?.textPreferences || assessment?.preferencias_texto || []),
      ...(assessment?.styleTags || assessment?.estilos || []),
    ], 20),
    summary,
    utility: assessment?.utilidad_rag || "",
    chunking: assessment?.sugerencia_chunking || "",
    rememberedAt: new Date().toISOString(),
  };
  const recordKey = ragDocumentDedupKey(record);
  const nextDocuments = pruneRagDocuments([
    record,
    ...memory.documents.filter((item) => item.id !== record.id && ragDocumentDedupKey(item) !== recordKey),
  ], memory.usage?.documents, 80, record.id);
  const topics = uniqueStrings([
    ...(assessment?.topics || assessment?.temas || []),
    ...(assessment?.stanceTags || assessment?.stance_tags || []),
    ...tags.filter(tagLooksLikeTopic),
  ]);
  const styles = uniqueStrings([
    ...(assessment?.textPreferences || assessment?.preferencias_texto || []),
    ...(assessment?.styleTags || assessment?.estilos || []),
    ...tags.filter((tag) => /estilo|style|tono|voz|directo|humor|pol[eé]mic|frase|cta|jerga|copy/i.test(tag)),
  ]);
  const hints = [
    ...(assessment?.promptHints || assessment?.prompt_hints || []),
    assessment?.authorProfile ? `Perfil/autor: ${assessment.authorProfile}` : "",
    assessment?.evidenceNotes?.length ? `Evidencias perfil: ${assessment.evidenceNotes.join("; ")}` : "",
    assessment?.confidence ? `Confianza perfil: ${assessment.confidence}` : "",
    kind === "prompt" ? summary : "",
    assessment?.aviso && assessment.aviso !== "null" ? `Aviso: ${assessment.aviso}` : "",
  ];
  const next = {
    ...memory,
    updatedAt: record.rememberedAt,
    documents: nextDocuments,
    tags: uniqueStrings([...tags, ...memory.tags]),
    topics: uniqueStrings([...topics, record.project, ...memory.topics]),
    textPreferences: uniqueStrings([...styles, ...memory.textPreferences]),
    styleTags: uniqueStrings([...styles, ...memory.styleTags]),
    promptHints: uniqueStrings([...hints, ...memory.promptHints], 40),
  };
  await writeRagMemory(next, client);
  return next;
}

async function rememberRagDocument(document, assessment, client = null) {
  if (client) {
    const memory = await readLockedRagMemory(client);
    return buildRememberedRagDocumentMemory(memory, document, assessment, client);
  }
  return withRagMemoryUpdate((memory, lockedClient) =>
    buildRememberedRagDocumentMemory(memory, document, assessment, lockedClient),
  );
}

function generatorMemoryPayload(memory) {
  const clean = normalizeRagMemory(memory);
  const visibleValues = (values) => uniqueStrings(values || []).filter((value) => !isOperationalMemoryNoise(value));
  const visibleDocuments = dedupeRagDocuments(clean.documents || []).map((document) => ({
    ...document,
    tags: visibleValues(document.tags),
    topics: visibleValues(document.topics),
    stanceTags: visibleValues(document.stanceTags),
    styles: visibleValues(document.styles),
  }));
  const tagSummary = weightedItems(visibleDocuments.flatMap((document) => uniqueStrings(document.tags || [])))
    .map((item) => ({ tag: item.tag, count: item.count, score: item.score }));
  const usageSummary = Object.entries(clean.usage?.tags || {})
    .map(([tag, count]) => ({ tag, count: Number(count) || 0 }))
    .filter((item) => item.count > 0 && !isOperationalMemoryNoise(item.tag))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 20);
  return {
    tags: visibleValues(clean.tags).slice(0, 24),
    tagSummary,
    usageSummary,
    topicSummary: topicCategorySummary(clean),
    documentCount: visibleDocuments.length,
    topics: visibleValues(clean.topics).slice(0, 16),
    textPreferences: visibleValues(clean.textPreferences).slice(0, 16),
    styleTags: visibleValues(clean.styleTags).slice(0, 16),
    promptHints: visibleValues(clean.promptHints).slice(0, 12),
    recentDocuments: visibleDocuments.slice(0, 8),
    updatedAt: clean.updatedAt,
  };
}

function tagLooksLikeTopic(value) {
  const text = normalizedMemoryKey(value);
  if (!text) return false;
  if (text === "x" || text === "twitter") return true;
  return /\b(?:tema|topic|instagram|linkedin|violet|facturae|ia|app|econom\w*|tecnolog\w*|mercado\w*|copy)\b/iu.test(text);
}

async function markRagMemoryUsed(memory, memoryPayload, client = null) {
  const next = normalizeRagMemory(memory);
  const bump = (bucket, values) => {
    const target = next.usage[bucket] || {};
    for (const value of uniqueStrings(values || []).slice(0, 16)) {
      target[value] = (Number(target[value]) || 0) + 1;
    }
    next.usage[bucket] = target;
  };
  bump("tags", memoryPayload.tags);
  bump("topics", memoryPayload.topics);
  bump("styles", [...(memoryPayload.textPreferences || []), ...(memoryPayload.styleTags || [])]);
  bump("prompts", memoryPayload.promptHints);
  const documents = next.usage.documents || {};
  for (const document of (memoryPayload.recentDocuments || []).slice(0, 5)) {
    if (!document?.id) continue;
    documents[document.id] = (Number(documents[document.id]) || 0) + 1;
  }
  next.usage.documents = documents;
  await writeRagMemory(next, client);
  return next;
}

async function markCurrentRagMemoryUsed(memoryPayload) {
  return withRagMemoryUpdate((memory, lockedClient) => markRagMemoryUsed(memory, memoryPayload, lockedClient));
}

function generatorMemoryInstruction(memoryPayload) {
  const rules = (memoryPayload?.ruleEntities || [])
    .slice(0, 8)
    .map((rule) => `- ${rule.text || rule.title}`)
    .filter(Boolean);
  const ideas = (memoryPayload?.ideaEntities || [])
    .slice(0, 8)
    .map((idea) => `${idea.title}${idea.importance ? ` (${idea.importance}%)` : ""}`)
    .filter(Boolean);
  const lines = [
    "Memoria RAG para el generador:",
    rules.length ? `Reglas aplicables:\n${rules.join("\n")}` : "",
    ideas.length ? `Ideas de contexto, no instrucciones: ${ideas.join(", ")}` : "",
    memoryPayload?.textPreferences?.length ? `Preferencias de texto/voz: ${memoryPayload.textPreferences.join(", ")}` : "",
    memoryPayload?.styleTags?.length ? `Rasgos de estilo guardados: ${memoryPayload.styleTags.join(", ")}` : "",
    memoryPayload?.promptHints?.length ? `Pistas de prompt guardadas: ${memoryPayload.promptHints.join(" | ")}` : "",
    memoryPayload?.topics?.length ? `Temas de apoyo: ${memoryPayload.topics.join(", ")}` : "",
    memoryPayload?.tags?.length ? `Tags de apoyo: ${memoryPayload.tags.join(", ")}` : "",
    "",
    "No conviertas canales, estados de publicacion o nombres de workflows en criterio editorial.",
    "Usa esta memoria solo cuando ayude al material actual; no la fuerces si no encaja.",
    "Si el usuario o la memoria usan atajos de estilo visual como Disney, Pixar, Ghibli, Marvel, James Jean u otro estudio/artista/marca, no te quedes en esa etiqueta.",
    "Traduce el atajo a lenguaje generativo concreto: medio, composición, paleta, iluminación, nivel de detalle, formas, expresividad, textura, atmósfera, cámara/encuadre y restricciones.",
    "Puedes conservar la referencia corta solo como contexto si el usuario la escribió, pero el prompt final debe entenderse por sus rasgos visuales, no por copiar una firma o marca.",
  ].filter(Boolean);
  return lines.join("\n");
}

function generatorIntentInstruction(value) {
  const intent = String(value || "Crear").trim();
  const instructions = {
    Analizar: "Intención del usuario: Analizar. No devuelvas un esquema genérico. Da una lectura con tesis fuerte, hallazgos concretos del material, ángulo editorial aprovechable y una propuesta de pieza o borrador accionable. Si el material ya es un borrador publicable, analiza lo mínimo necesario y devuelve una versión editada útil, no un informe escolar. Si hay imagen o foto, usa detalles visuales específicos como evidencia.",
    Crear: "Intención del usuario: Crear. Produce un entregable listo para usar, con el formato pedido y sin explicar de más. Si el material ya contiene una tesis o borrador, conserva sus ideas y desarrolla una versión mejor redactada.",
    Publicar: "Intención del usuario: Publicar. Produce contenido listo para publicación, con CTA, canal, tono y revisión práctica antes de usar. Si el material ya contiene una tesis o borrador, conserva su intención y amplía lo necesario para que funcione mejor.",
    Planificar: "Intención del usuario: Planificar. Devuelve pasos ordenados, prioridades, dependencias, fechas sugeridas y decisiones pendientes.",
    Aprender: "Intención del usuario: Aprender. Extrae conocimiento reutilizable: tags, temas, criterios, estilo, límites y qué conviene guardar.",
  };
  return instructions[intent] || instructions.Crear;
}

function generatorSourceMaterialInstruction(body = {}) {
  const material = String(body?.material || "").trim();
  const instructions = String(body?.instrucciones || "").trim();
  const wordCount = material.split(/\s+/).filter(Boolean).length;
  const paragraphCount = material.split(/\n{2,}/).filter((part) => part.trim()).length;
  const looksLikeDraft = wordCount >= 90 || paragraphCount >= 3 || /(^|\n)\s*(#{1,3}|\*\*|\d+\.|-)\s+/m.test(material);
  if (!looksLikeDraft) {
    return [
      "Material fuente:",
      "Usa el material del usuario como punto de partida principal.",
      "No añadas ejemplos, tesis ni referencias externas que no salgan del material, de la memoria aplicable o de instrucciones explícitas.",
    ].join("\n");
  }
  return [
    "CONTRATO DE DESARROLLO DE BORRADOR:",
    "Trata el material del usuario como mapa de ideas, no como texto literal que haya que conservar frase por frase.",
    "Primero extrae la tesis, postura, conflicto, ejemplos importantes, referencias implicitas y pregunta final si existe.",
    "Despues desarrolla esas ideas con referencias similares, analogias pertinentes, contrastes y contexto que refuercen el nucleo.",
    "Puedes reorganizar, ampliar, matizar y redactar una pieza nueva siempre que respete el nucleo intelectual del usuario.",
    "Antes de redactar, busca una bibliografia amplia en la que basarte: autores, libros, articulos, ensayos, estudios, conceptos, casos historicos, debates tecnicos o referencias culturales cercanas al tema.",
    "Usa esa bibliografia como andamiaje intelectual, no como lista ornamental. Integra referencias solo cuando ayuden a precisar, contrastar o ampliar la tesis.",
    "Si el flujo tiene herramientas de busqueda o RAG externo, usalas para enriquecer la base. Si no las tiene, apoya la pieza en Cerebro/memoria y en conocimiento ya disponible sin inventar citas concretas.",
    "Busca apoyo en la memoria/cerebro y en el contexto disponible para encontrar paralelos cercanos, no adornos aleatorios.",
    "Si añades ejemplos, datos, autores o referencias nuevas, deben reforzar directamente la tesis del usuario y no desplazarla.",
    "Devuelve una pieza final redactada, no un resumen, no un análisis, no una lista de ideas y no una explicación de lo que el texto dice.",
    "Mantén la voz del usuario: crítica, directa, con tensión argumental. No la conviertas en tono motivacional, escolar o de consultor.",
    "Evita clichés de relleno y frases prefabricadas. Cada ampliación debe aportar una idea, contraste, evidencia o mejor formulación.",
    "Si el texto original tiene secciones, puedes mejorarlas, fusionarlas o reordenarlas, pero el lector debe reconocer el núcleo del borrador.",
    instructions ? "Prioriza las instrucciones adicionales del usuario, pero sin traicionar el material base." : "",
  ].filter(Boolean).join("\n");
}

function generatorEditingMode(body = {}) {
  const material = String(body?.material || "").trim();
  const wordCount = material.split(/\s+/).filter(Boolean).length;
  const paragraphCount = material.split(/\n{2,}/).filter((part) => part.trim()).length;
  const hasDraftStructure = paragraphCount >= 3 || /(^|\n)\s*(#{1,3}|\*\*|\d+\.|-)\s+/m.test(material);
  return wordCount >= 90 || hasDraftStructure ? "develop_source_ideas" : "create_from_material";
}

async function rememberRagDocumentSoft(document, assessment, client = null) {
  try {
    return await rememberRagDocument(document, assessment, client);
  } catch {
    return null;
  }
}

function countPatternMatches(text, pattern) {
  return Array.from(String(text || "").matchAll(pattern)).length;
}

function generatorFeedbackTextStats(text) {
  const source = String(text || "").trim();
  const lines = source.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return {
    chars: source.length,
    words: source ? source.split(/\s+/).filter(Boolean).length : 0,
    lines: lines.length,
    paragraphs: source ? source.split(/\n{2,}/).filter((line) => line.trim()).length : 0,
    bullets: countPatternMatches(source, /(^|\n)\s*(?:[-*•]|\d+[.)])\s+/g),
    links: countPatternMatches(source, /https?:\/\/\S+/g),
    hashtags: countPatternMatches(source, /#[\p{L}\p{N}_-]{2,40}/gu),
    questions: countPatternMatches(source, /[?¿]/g),
    boldMarkers: countPatternMatches(source, /\*\*[^*]+\*\*/g),
    ctas: /\b(comenta|escr[ií]beme|prueba|descubre|entra|reserva|contacta|guarda|comparte|lee|publica|abre|compra|contrata|haz clic)\b/i.test(source),
    exclamations: countPatternMatches(source, /[!¡]/g),
    quotes: countPatternMatches(source, /[«»"]/g),
  };
}

function generatorFeedbackLearningSignals(original, edited, context = {}) {
  const before = generatorFeedbackTextStats(original);
  const after = generatorFeedbackTextStats(edited);
  const signals = [];
  if (before.chars && after.chars < before.chars * 0.75) signals.push("preferir versiones más sintéticas");
  if (before.chars && after.chars > before.chars * 1.25) signals.push("desarrollar más contexto cuando el material lo pida");
  if (after.paragraphs > before.paragraphs) signals.push("separar ideas en bloques claros");
  if (before.paragraphs > after.paragraphs) signals.push("compactar estructura cuando demasiados cortes fragmentan la lectura");
  if (after.bullets > before.bullets) signals.push("usar listas cuando ordenen mejor la idea");
  if (after.bullets < before.bullets) signals.push("evitar listas mecánicas cuando la prosa sea más natural");
  if (before.links > after.links) signals.push("evitar enlaces innecesarios");
  if (after.links > before.links) signals.push("conservar enlaces útiles cuando sean parte de la acción");
  if (before.hashtags > after.hashtags) signals.push("reducir hashtags si no aportan difusión");
  if (after.hashtags > before.hashtags) signals.push("añadir hashtags amplios y relevantes para difusión");
  if (after.questions > before.questions) signals.push("usar preguntas cuando abran mejor el argumento");
  if (before.boldMarkers > after.boldMarkers) signals.push("evitar énfasis visual excesivo");
  if (before.ctas && !after.ctas) signals.push("reducir presión comercial y CTA agresivo");
  if (before.exclamations > after.exclamations) signals.push("rebajar énfasis emocional o promocional");
  if (after.quotes > before.quotes) signals.push("añadir citas o referencias cuando precisen la afirmación");
  if (/ficci[oó]n|inventad|pel[ií]cula|real/i.test(edited) && !/ficci[oó]n|inventad|pel[ií]cula|real/i.test(original)) {
    signals.push("distinguir hecho, interpretación y ficción cuando el tema mezcle referencias culturales");
  }
  if (/matiz|exact|precis|no es|sí es|depende/i.test(edited) && !/matiz|exact|precis|no es|sí es|depende/i.test(original)) {
    signals.push("corregir hacia más precisión y matiz conceptual");
  }
  if (/ejemplo|caso|por ejemplo/i.test(edited) && !/ejemplo|caso|por ejemplo/i.test(original)) {
    signals.push("priorizar ejemplos concretos cuando una idea quede abstracta");
  }
  const tone = String(context.tono || context.tone || "").trim();
  if (tone) signals.push(`mantener tono ${tone}`);
  return uniqueStrings(signals, 12);
}

function generatorFeedbackScope(context = {}) {
  return uniqueStrings([
    context.formato || context.format || "contenido",
    context.intencion || context.intent || "",
    context.objetivo || context.goal || "",
    context.tono || context.tone || "",
  ].map((value) => String(value || "").trim()).filter(Boolean), 6).join(" / ");
}

async function rememberGeneratorFeedback(feedback) {
  const original = String(feedback?.original || "").trim().slice(0, 8000);
  const edited = String(feedback?.edited || "").trim().slice(0, 8000);
  if (!edited) throw new Error("Edita el texto final antes de enseñar al generador");
  if (original && original === edited) throw new Error("No hay cambios que aprender");
  const context = feedback?.context && typeof feedback.context === "object" ? feedback.context : {};
  const material = String(context.material || "").trim().slice(0, 1200);
  const format = String(context.formato || context.format || "contenido").trim().slice(0, 80);
  const intent = String(context.intencion || context.intent || "Crear").trim().slice(0, 80);
  const goal = String(context.objetivo || context.goal || "").trim().slice(0, 80);
  const tone = String(context.tono || context.tone || "").trim().slice(0, 80);
  const now = new Date().toISOString();
  const changedTerms = [
    /impuestos?.{0,30}buen/i.test(original) && /impuestos?.{0,30}mal/i.test(edited) ? "preferencia ideológica: impuestos malos" : "",
    /impuestos?.{0,30}mal/i.test(original) && /impuestos?.{0,30}buen/i.test(edited) ? "preferencia ideológica: impuestos buenos" : "",
    /estado|gobierno|regulaci[oó]n|impuesto/i.test(`${original} ${edited}`) ? "criterio político/económico corregido" : "",
  ].filter(Boolean);
  const learningSignals = generatorFeedbackLearningSignals(original, edited, context);
  const feedbackScope = generatorFeedbackScope(context);
  const tags = uniqueStrings([
    "feedback-generador",
    "edicion-aceptada",
    format,
    intent,
    goal,
    tone,
    ...changedTerms,
  ].filter(Boolean), 24);
  const summary = [
    `Edición aceptada para ${format}.`,
    material ? `Material: ${material}` : "",
    original ? `Original rechazado: ${original.slice(0, 700)}` : "",
    `Versión preferida: ${edited.slice(0, 900)}`,
  ].filter(Boolean).join("\n");
  return rememberRagDocumentSoft({
    id: `generator-feedback-${crypto.createHash("sha1").update(`${original}:${edited}:${now}`).digest("hex").slice(0, 16)}`,
    title: `Feedback generador ${format} ${now.slice(0, 10)}`,
    type: "feedback_generador",
    project: "generador-contenido",
    tags,
    content: summary,
  }, {
    resumen: `Corrección del generador: preferir la versión editada frente a la respuesta inicial.`,
    topics: uniqueStrings([format, goal, ...changedTerms].filter(Boolean), 12),
    textPreferences: uniqueStrings([
      ...learningSignals,
      ...changedTerms,
    ].filter(Boolean), 12),
    styleTags: uniqueStrings([tone, "aprendido desde edición manual"].filter(Boolean), 12),
    promptHints: uniqueStrings([
      learningSignals.length ? `Feedback de edición${feedbackScope ? ` (${feedbackScope})` : ""}: ${learningSignals.join("; ")}.` : "",
      ...changedTerms,
    ].filter(Boolean), 16),
    utilidad_rag: "alta",
    sugerencia_chunking: "documento completo",
  });
}

function publicationMemoryTags(post) {
  const caption = String(post?.caption || "");
  const mediaUrl = safeUrl(post?.imageUrl || post?.videoUrl || post?.mediaUrl);
  const hasVideo = Boolean(safeUrl(post?.videoUrl)) || /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl);
  const hashtagTags = Array.from(caption.matchAll(/#([\p{L}\p{N}_-]{2,40})/gu))
    .map((match) => match[1].toLowerCase());
  const inferred = [
    /facturae|factura|erp|contabilidad|aut[oó]nom|pyme/i.test(caption) ? "facturae" : "",
    /automatiz|n8n|workflow|proceso|integraci[oó]n/i.test(caption) ? "automatizacion" : "",
    /\bia\b|inteligencia artificial|claude|openai|rag|agente/i.test(caption) ? "ia" : "",
    /demo|producto|app|software|herramienta|plataforma/i.test(caption) ? "producto" : "",
    /venta|cliente|oferta|precio|contratar|servicio/i.test(caption) ? "venta" : "",
    /tutorial|gu[ií]a|aprende|paso a paso|c[oó]mo/i.test(caption) ? "educativo" : "",
    mediaUrl ? "visual" : "",
    mediaUrl ? (hasVideo ? "video" : "fotografia") : "",
  ];
  return uniqueStrings([
    ...hashtagTags,
    ...inferred,
  ].filter(Boolean), 24);
}

function publicationVisualMemory(post) {
  const imageUrl = safeUrl(post?.imageUrl);
  const videoUrl = safeUrl(post?.videoUrl);
  const mediaUrl = videoUrl || imageUrl || safeUrl(post?.mediaUrl);
  if (!mediaUrl) return null;
  const options = post?.options && typeof post.options === "object" ? post.options : {};
  const targetName = post?.target?.name || post?.targetId || "Publicaciones";
  const mediaKind = videoUrl || /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl) ? "video" : "imagen";
  const aspect = String(options.mediaAspect || "").trim();
  const fit = String(options.mediaFit || "").trim();
  const position = options.mediaPosition && typeof options.mediaPosition === "object"
    ? `x ${Number(options.mediaPosition.x || 0).toFixed(1)}, y ${Number(options.mediaPosition.y || 0).toFixed(1)}`
    : "";
  const details = [
    `Media visual publicado en ${targetName}.`,
    `Tipo: ${mediaKind}.`,
    aspect ? `Formato/recorte: ${aspect}.` : "",
    fit ? `Ajuste: ${fit}.` : "",
    position ? `Posicion de encuadre: ${position}.` : "",
    `URL visual: ${mediaUrl}`,
    "Aprendizaje visual pendiente de analisis por vision: describir tema, objetos, texto visible, composicion, paleta, atmosfera, estilo fotografico y significado cuando haya OCR/vision disponible.",
  ].filter(Boolean);
  return { mediaUrl, mediaKind, aspect, fit, position, text: details.join("\n") };
}

async function readVisualAnalysisCache() {
  try {
    const raw = await fs.readFile(visualAnalysisCacheFile, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { items: {} };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { items: {} };
  }
}

async function writeVisualAnalysisCache(cache) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${visualAnalysisCacheFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(cache, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, visualAnalysisCacheFile);
}

function mimeTypeFromMediaUrl(mediaUrl = "") {
  const clean = String(mediaUrl || "").split("?")[0].toLowerCase();
  if (/\.png$/.test(clean)) return "image/png";
  if (/\.webp$/.test(clean)) return "image/webp";
  if (/\.gif$/.test(clean)) return "image/gif";
  if (/\.jpe?g$/.test(clean)) return "image/jpeg";
  return "image/jpeg";
}

async function readImageForVision(mediaUrl) {
  const localPath = localPublicationMediaPath(mediaUrl);
  if (localPath) {
    const bytes = await fs.readFile(localPath);
    return { bytes, mimeType: mimeTypeFromMediaUrl(localPath) };
  }
  const response = await fetch(mediaUrl, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`No se pudo leer la imagen (${response.status})`);
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, mimeType: contentType.startsWith("image/") ? contentType : mimeTypeFromMediaUrl(mediaUrl) };
}

function visualAnalysisPrompt(post, visual) {
  return [
    "Analiza esta imagen como memoria editorial para futuras publicaciones.",
    "Devuelve solo JSON valido, sin markdown, con estas claves:",
    "summary, visibleText, subjects, composition, palette, style, mood, meaning, brandFit, warnings, reusableRules.",
    "reusableRules debe contener reglas breves en espanol, accionables, no frases copiadas.",
    "No inventes datos externos. Si algo no se ve, dilo.",
    "",
    `Canal: ${post?.target?.name || post?.targetId || "Publicaciones"}`,
    `Caption asociado: ${String(post?.caption || "").slice(0, 1400)}`,
    visual?.aspect ? `Formato/recorte elegido: ${visual.aspect}` : "",
    visual?.fit ? `Ajuste visual: ${visual.fit}` : "",
  ].filter(Boolean).join("\n");
}

function normalizeVisionText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || text).trim();
}

function visionList(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return String(value).split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

async function analyzePublicationImage(post, visual) {
  if (!geminiApiKey || !visual?.mediaUrl || visual.mediaKind !== "imagen") return null;
  const cacheKey = crypto.createHash("sha256").update(visual.mediaUrl).digest("hex");
  try {
    const cache = await readVisualAnalysisCache();
    const cached = cache.items?.[cacheKey];
    if (cached?.analysis) return { ...cached.analysis, cached: true };

    const { bytes, mimeType } = await readImageForVision(visual.mediaUrl);
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Imagen demasiado grande para analisis visual");
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(mimeType)) throw new Error(`Tipo visual no soportado: ${mimeType}`);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiVisionModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: visualAnalysisPrompt(post, visual) },
            { inline_data: { mime_type: mimeType, data: bytes.toString("base64") } },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 900,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(60000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.message || `Gemini respondio ${response.status}`);
    const raw = normalizeVisionText(body?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n"));
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { summary: raw };
    }
    const analysis = {
      model: geminiVisionModel,
      analyzedAt: new Date().toISOString(),
      summary: String(parsed.summary || "").slice(0, 1000),
      visibleText: String(parsed.visibleText || "").slice(0, 1000),
      subjects: uniqueStrings(visionList(parsed.subjects), 12),
      composition: String(parsed.composition || "").slice(0, 1000),
      palette: String(parsed.palette || "").slice(0, 600),
      style: String(parsed.style || "").slice(0, 800),
      mood: String(parsed.mood || "").slice(0, 600),
      meaning: String(parsed.meaning || "").slice(0, 1000),
      brandFit: String(parsed.brandFit || "").slice(0, 1000),
      warnings: uniqueStrings(visionList(parsed.warnings), 8),
      reusableRules: uniqueStrings(visionList(parsed.reusableRules), 12),
    };
    cache.items = {
      ...(cache.items || {}),
      [cacheKey]: { mediaUrl: visual.mediaUrl, analysis },
    };
    await writeVisualAnalysisCache(cache);
    return analysis;
  } catch (error) {
    console.warn(`No se pudo analizar imagen de publicacion: ${error.message}`);
    return { error: error.message };
  }
}

function visualAnalysisMemoryText(analysis) {
  if (!analysis || analysis.error) return "";
  return [
    "Analisis visual real:",
    analysis.summary ? `Resumen: ${analysis.summary}` : "",
    analysis.visibleText ? `Texto visible/OCR: ${analysis.visibleText}` : "",
    analysis.subjects?.length ? `Sujetos/objetos: ${analysis.subjects.join(", ")}` : "",
    analysis.composition ? `Composicion: ${analysis.composition}` : "",
    analysis.palette ? `Paleta: ${analysis.palette}` : "",
    analysis.style ? `Estilo visual: ${analysis.style}` : "",
    analysis.mood ? `Atmosfera: ${analysis.mood}` : "",
    analysis.meaning ? `Significado editorial: ${analysis.meaning}` : "",
    analysis.brandFit ? `Encaje con la marca: ${analysis.brandFit}` : "",
    analysis.warnings?.length ? `Avisos: ${analysis.warnings.join("; ")}` : "",
    analysis.reusableRules?.length ? `Reglas visuales reutilizables: ${analysis.reusableRules.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

function publicationMemoryAssessment(post, visualAnalysis = null) {
  const caption = String(post?.caption || "").trim();
  const targetName = post?.target?.name || "Publicaciones";
  const targetId = post?.target?.id || post?.targetId || "publicaciones";
  const action = post?.action || "draft";
  const status = post?.status || action;
  const visual = publicationVisualMemory(post);
  const visualRules = uniqueStrings(visualAnalysis?.reusableRules || [], 10, "style");
  const topics = publicationMemoryTags(post).filter((tag) =>
    !["Publicaciones", "publicacion-real", targetName, targetId, action, status].includes(tag)
      && !isOperationalMemoryNoise(tag),
  );
  const styles = uniqueStrings([
    caption.length <= 280 ? "copy breve" : "copy largo",
    /[?¿]/.test(caption) ? "usa preguntas" : "",
    /!|🚀|✨|👉|✅/.test(caption) ? "tono enfático" : "",
    /\b(comenta|escr[ií]beme|prueba|descubre|entra|reserva|contacta|guarda|comparte)\b/i.test(caption) ? "incluye CTA" : "",
    /\n/.test(caption) ? "estructura por bloques" : "estructura compacta",
    visual ? `usa ${visual.mediaKind}` : "",
    visual?.aspect ? `formato visual ${visual.aspect}` : "",
    ...visualRules,
  ].filter(Boolean), 12);
  return {
    resumen: `${visual ? "Publicación visual" : "Texto"} ${status} para ${targetName}: ${caption.slice(0, 220)}`,
    topics: uniqueStrings([...topics, ...(visualAnalysis?.subjects || [])], 24),
    textPreferences: styles,
    styleTags: styles,
    promptHints: [
      `Aprendizaje de publicación: reutilizar estructura, tono y CTA cuando el formato y objetivo sean similares.`,
      caption.length <= 280 ? "Aprendizaje de publicación: funcionan piezas breves cuando el objetivo es impacto rápido." : "",
      /\n/.test(caption) ? "Aprendizaje de publicación: conservar bloques si mejoran la lectura." : "",
      visual ? "Aprendizaje visual: cuando una publicacion incluye media, conservar relacion entre imagen/video, caption, canal y recorte." : "",
      ...visualRules.map((rule) => `Aprendizaje visual: ${rule}`),
    ].filter((item) => item && !isOperationalMemoryNoise(item)),
    utilidad_rag: action === "draft" ? "media" : "alta",
    sugerencia_chunking: "documento completo",
  };
}

async function rememberPublicationInTraining(post) {
  const tags = publicationMemoryTags(post);
  const visual = publicationVisualMemory(post);
  const visualAnalysis = await analyzePublicationImage(post, visual);
  const assessment = publicationMemoryAssessment(post, visualAnalysis);
  const content = [
    String(post.caption || "").trim(),
    visual?.text || "",
    visualAnalysisMemoryText(visualAnalysis),
  ].filter(Boolean).join("\n\n---\n\n");
  const document = {
    id: `publication-${post.id}`,
    title: `Publicación ${post.target?.name || "contenido"} ${String(post.createdAt || post.publishedAt || new Date().toISOString()).slice(0, 10)}`,
    type: visual ? "publicacion_visual" : "publicacion",
    project: post.target?.id || "publicaciones",
    tags,
    content,
  };
  if (editorialBrainEnabled()) {
    try {
      const result = await callEditorialBrain("/api/rag/ingestar", {
        method: "POST",
        body: JSON.stringify({
          input: {
            inputType: "text",
            project: document.project,
            text: content,
            description: [
              `Publicación confirmada en ${post.target?.name || post.target?.id || "canal"}.`,
              visual ? `Incluye ${visual.mediaKind}: ${visual.mediaUrl}` : "",
              post.publicUrl ? `URL final: ${post.publicUrl}` : "",
              post.publishedAt ? `Publicada: ${post.publishedAt}` : "",
            ].filter(Boolean).join(" "),
          },
          assessment: {
            ...assessment,
            tipo: visual ? "ejemplo_visual" : "ejemplo_copy",
            proyecto: "generador-contenido",
            utilidad_rag: post.action === "publish" || post.publishedAt ? "alta" : assessment.utilidad_rag,
          },
          title: document.title,
          tags,
        }),
      });
      return result.memory || null;
    } catch (error) {
      console.warn(`No se pudo enviar publicación al cerebro editorial: ${error.message}`);
    }
  }
  return rememberRagDocumentSoft(document, assessment);
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function runDesktopCommand(command, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
    if (input) child.stdin.end(input);
  });
}

function isInstagramTask(task) {
  const text = `${task?.title || ""} ${task?.project || ""}`.toLowerCase();
  return text.includes("instagram");
}

function dbDocumentType(value) {
  const type = String(value || "nota").trim();
  return {
    ejemplo_copy: "ejemplo",
    prompt_previo: "prompt",
  }[type] || type;
}

function dbDocumentSource(document) {
  const source = String(document?.source || document?.fuente || "manual").trim();
  if (source !== "file") return source || "manual";
  const fileType = String(document?.file?.type || "");
  const fileName = String(document?.file?.name || "");
  return fileType === "application/pdf" || /\.pdf$/i.test(fileName) ? "pdf" : "manual";
}

async function readGroups() {
  try {
    return JSON.parse(await fs.readFile(groupsFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return defaultGroups;
  }
}

async function writeGroups(value) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${groupsFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, groupsFile);
}

async function readNoticesState() {
  try {
    const value = JSON.parse(await fs.readFile(noticesFile, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {};
  }
}

async function writeNoticesState(value) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${noticesFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, noticesFile);
}

function cleanForumConfigItem(item = {}) {
  const workflowId = String(item.workflowId || "").trim();
  const realKarmaValue = item.realKarma === "" || item.realKarma === null || item.realKarma === undefined
    ? null
    : Math.max(0, Math.round(Number(item.realKarma) || 0));
  return {
    id: String(item.id || crypto.randomUUID()),
    name: String(item.name || "").trim().slice(0, 90),
    workflowId,
    realKarma: realKarmaValue,
    realKarmaLabel: String(item.realKarmaLabel || "real total").trim().slice(0, 60) || "real total",
    realKarmaNote: String(item.realKarmaNote || "").trim().slice(0, 500),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function forumConfigKey(forum = {}) {
  const workflowId = String(forum.workflowId || "").trim();
  if (workflowId) return `workflow:${workflowId}`;
  return `name:${String(forum.name || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function dedupeForumConfigItems(items = []) {
  const byKey = new Map();
  for (const item of items) {
    const forum = cleanForumConfigItem(item);
    if (!forum.name) continue;
    const key = forumConfigKey(forum);
    const current = byKey.get(key);
    if (!current || String(forum.updatedAt || "").localeCompare(String(current.updatedAt || "")) >= 0) {
      byKey.set(key, { ...current, ...forum, id: current?.id || forum.id });
    }
  }
  return [...byKey.values()];
}

async function readForumConfig() {
  try {
    const value = JSON.parse(await fs.readFile(forumConfigFile, "utf8"));
    return { forums: Array.isArray(value?.forums) ? dedupeForumConfigItems(value.forums) : [] };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { forums: [] };
  }
}

async function writeForumConfig(config) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${forumConfigFile}.${crypto.randomUUID()}.tmp`;
  const forums = Array.isArray(config?.forums) ? dedupeForumConfigItems(config.forums) : [];
  await fs.writeFile(temporaryFile, JSON.stringify({ forums }, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, forumConfigFile);
  return { forums };
}

async function readCalendarTasks() {
  try {
    const value = JSON.parse(await fs.readFile(calendarTasksFile, "utf8"));
    return Array.isArray(value?.tasks) ? value.tasks : [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
}

async function writeCalendarTasks(tasks) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${calendarTasksFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify({ tasks }, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, calendarTasksFile);
}

function cleanStatsMetric(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function statsChannelKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeStatsChannelLabel(value) {
  const source = String(value || "").trim();
  const text = source
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/instagram|instagr/.test(text)) return "Instagram";
  if (/pinterest/.test(text)) return "Pinterest";
  if (/linkedin/.test(text)) return "LinkedIn";
  if (/youtube|youtu/.test(text)) return "YouTube";
  if (/tiktok/.test(text)) return "TikTok";
  if (/facebook|fb\.com/.test(text)) return "Facebook";
  if (/ga4|google analytics|web/.test(text)) return "GA4 Web";
  return source;
}

function cleanMonthlyStatsRow(value, current = {}) {
  const year = cleanStatsMetric(value?.year ?? current.year ?? new Date().getFullYear());
  const month = cleanStatsMetric(value?.month ?? current.month ?? new Date().getMonth() + 1);
  const channel = normalizeStatsChannelLabel(value?.channel ?? current.channel ?? "").slice(0, 80);
  if (year < 2000 || year > 2100) throw new Error("Año de estadísticas inválido");
  if (month < 1 || month > 12) throw new Error("Mes de estadísticas inválido");
  if (!channel) throw new Error("Cada fila necesita canal");
  const now = new Date().toISOString();
  return {
    id: current.id || crypto.randomUUID(),
    year,
    month,
    channel,
    publications: cleanStatsMetric(value?.publications ?? current.publications),
    impressions: cleanStatsMetric(value?.impressions ?? current.impressions),
    interactions: cleanStatsMetric(value?.interactions ?? current.interactions),
    clicks: cleanStatsMetric(value?.clicks ?? current.clicks),
    createdAt: current.createdAt || now,
    updatedAt: now,
  };
}

function dedupeMonthlyStats(entries = []) {
  const byKey = new Map();
  for (const entry of entries) {
    if (isStatsImportedDimensionNoise(entry.channel)) continue;
    const key = `${entry.year}-${entry.month}-${statsChannelKey(entry.channel)}`;
    const current = byKey.get(key);
    if (!current || String(entry.updatedAt || "").localeCompare(String(current.updatedAt || "")) >= 0) {
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

function isStatsImportedDimensionNoise(value) {
  const text = String(value || "").trim();
  return /(?:^|·\s*)\((referral|organic|not set|direct|none)\)$/i.test(text);
}

async function readMonthlyStats() {
  try {
    const value = JSON.parse(await fs.readFile(monthlyStatsFile, "utf8"));
    return Array.isArray(value?.entries)
      ? dedupeMonthlyStats(value.entries.map((entry) => cleanMonthlyStatsRow(entry))).slice(0, 3000)
      : [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
}

async function writeMonthlyStats(entries) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${monthlyStatsFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify({ entries: dedupeMonthlyStats(entries) }, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, monthlyStatsFile);
}

function cleanCampaignUrl(value, current = {}) {
  const now = new Date().toISOString();
  const url = String(value?.url ?? current.url ?? "").trim().slice(0, 600);
  const source = String(value?.source ?? current.source ?? "").trim().toLowerCase().slice(0, 80);
  const medium = String(value?.medium ?? current.medium ?? "").trim().toLowerCase().slice(0, 80);
  const campaign = String(value?.campaign ?? current.campaign ?? "").trim().toLowerCase().slice(0, 120);
  if (!url) throw new Error("Añade una URL");
  try {
    new URL(url);
  } catch {
    throw new Error("La URL no es válida");
  }
  if (!source) throw new Error("Añade utm_source");
  if (!medium) throw new Error("Añade utm_medium");
  if (!campaign) throw new Error("Añade utm_campaign");
  return {
    id: current.id || String(value?.id || "").trim() || crypto.randomUUID(),
    name: String(value?.name ?? current.name ?? campaign).trim().slice(0, 120) || campaign,
    url,
    source,
    medium,
    campaign,
    content: String(value?.content ?? current.content ?? "").trim().toLowerCase().slice(0, 120),
    term: String(value?.term ?? current.term ?? "").trim().toLowerCase().slice(0, 120),
    createdAt: current.createdAt || now,
    updatedAt: now,
  };
}

function campaignUrlKey(value = {}) {
  return [
    comparableUrl(value.url),
    String(value.source || "").trim().toLowerCase(),
    String(value.medium || "").trim().toLowerCase(),
    String(value.campaign || "").trim().toLowerCase(),
    String(value.content || "").trim().toLowerCase(),
    String(value.term || "").trim().toLowerCase(),
  ].join("|");
}

function dedupeCampaignUrls(campaigns = []) {
  const byKey = new Map();
  for (const campaign of campaigns) {
    const key = campaignUrlKey(campaign);
    const current = byKey.get(key);
    if (!current || String(campaign.updatedAt || "").localeCompare(String(current.updatedAt || "")) >= 0) {
      byKey.set(key, {
        ...campaign,
        createdAt: current?.createdAt && String(current.createdAt).localeCompare(String(campaign.createdAt || "")) < 0
          ? current.createdAt
          : campaign.createdAt,
      });
    }
  }
  return [...byKey.values()];
}

async function readCampaignUrls() {
  try {
    const value = JSON.parse(await fs.readFile(campaignUrlsFile, "utf8"));
    return Array.isArray(value?.campaigns)
      ? dedupeCampaignUrls(value.campaigns.map((campaign) => cleanCampaignUrl(campaign))).slice(0, 500)
      : [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
}

async function writeCampaignUrls(campaigns) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${campaignUrlsFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify({ campaigns: dedupeCampaignUrls(campaigns) }, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, campaignUrlsFile);
}

async function readCalendarNotes() {
  try {
    const value = JSON.parse(await fs.readFile(calendarNotesFile, "utf8"));
    return Array.isArray(value?.notes) ? value.notes : [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
}

async function writeCalendarNotes(notes) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${calendarNotesFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify({ notes }, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, calendarNotesFile);
}

function cleanCalendarNote(value, current = {}) {
  const body = String(value?.body ?? current.body ?? "").trim().slice(0, 5000);
  const images = (Array.isArray(value?.images) ? value.images : current.images || [])
    .map((image) => ({
      id: String(image?.id || "").trim().slice(0, 80),
      fileName: String(image?.fileName || "").trim().slice(0, 140),
      url: safeUrl(image?.url) || "",
      mimeType: String(image?.mimeType || "").trim().slice(0, 80),
      size: Math.max(0, Number(image?.size) || 0),
    }))
    .filter((image) => image.id && image.fileName && image.url && /^image\/(?:jpeg|png|webp|gif)$/i.test(image.mimeType))
    .slice(0, 8);
  if (!body && !images.length) throw new Error("La nota está vacía");
  const now = new Date().toISOString();
  return {
    id: current.id || crypto.randomUUID(),
    body,
    images,
    createdAt: current.createdAt || now,
    updatedAt: now,
  };
}

async function readCalendarSignals() {
  try {
    const value = JSON.parse(await fs.readFile(calendarSignalsFile, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {};
  }
}

async function writeCalendarSignals(value) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${calendarSignalsFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, calendarSignalsFile);
}

function addCalendarDays(value, amount) {
  const date = new Date(`${dateKey(value)}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date;
}

function addCalendarMonths(value, amount) {
  const date = new Date(`${dateKey(value)}T12:00:00`);
  date.setMonth(date.getMonth() + amount);
  return date;
}

function cleanCalendarTask(value, current = {}) {
  const status = ["pending", "pending_confirmation", "done", "ignored", "blocked"].includes(value?.status) ? value.status : current.status || "pending";
  const dueDate = dateKey(value?.dueDate || value?.date || current.dueDate || new Date());
  if (!dueDate) throw new Error("Fecha inválida");
  const title = String(value?.title ?? current.title ?? "").trim().slice(0, 180);
  if (!title) throw new Error("La tarea necesita título");
  const time = String(value?.time ?? current.time ?? "").trim().slice(0, 5);
  return {
    id: current.id || crypto.randomUUID(),
    title,
    notes: String(value?.notes ?? current.notes ?? "").trim().slice(0, 1400),
    dueDate,
    time: /^\d{2}:\d{2}$/.test(time) ? time : "",
    status,
    project: String(value?.project ?? current.project ?? "").trim().slice(0, 80),
    recurrence: current.recurrence || null,
    createdAt: current.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function recurrenceSummary({ repeat, repeatUntil, repeatCount, firstTask, repeatWeekdays = [] }) {
  return {
    type: repeat,
    until: repeatUntil || "",
    count: repeatUntil ? null : repeatCount,
    startDate: firstTask.dueDate,
    time: firstTask.time || "",
    weekdays: repeat === "weekly" ? repeatWeekdays : [],
  };
}

function repeatedCalendarTasks(value) {
  const repeat = ["none", "weekly", "biweekly", "triweekly", "monthly"].includes(value?.repeat) ? value.repeat : "weekly";
  const firstTask = cleanCalendarTask(value);
  if (repeat === "none") return [firstTask];
  const repeatUntil = dateKey(value?.repeatUntil || "");
  const repeatCount = Math.min(Math.max(Number(value?.repeatCount) || (repeatUntil ? 366 : 12), 1), 366);
  const repeatWeekdays = [...new Set(Array.isArray(value?.repeatWeekdays) ? value.repeatWeekdays : [])]
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const series = recurrenceSummary({ repeat, repeatUntil, repeatCount, firstTask, repeatWeekdays });
  const tasks = [];
  if (repeat === "weekly" && repeatWeekdays.length) {
    const cursor = new Date(`${firstTask.dueDate}T12:00:00`);
    const hardStop = repeatUntil ? new Date(`${repeatUntil}T12:00:00`) : addCalendarDays(firstTask.dueDate, 365);
    while (tasks.length < repeatCount && cursor <= hardStop) {
      if (repeatWeekdays.includes(cursor.getDay())) {
        tasks.push({
          ...firstTask,
          id: crypto.randomUUID(),
          dueDate: dateKey(cursor),
          recurrence: {
            ...series,
            type: repeat,
            weekdays: repeatWeekdays,
            groupId: firstTask.id,
            index: tasks.length,
          },
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return tasks.length ? tasks : [firstTask];
  }
  for (let index = 0; index < repeatCount; index += 1) {
    const intervalDays = repeat === "triweekly" ? 21 : repeat === "biweekly" ? 14 : 7;
    const nextDate = repeat === "monthly"
        ? addCalendarMonths(firstTask.dueDate, index)
        : addCalendarDays(firstTask.dueDate, index * intervalDays);
    const nextKey = dateKey(nextDate);
    if (repeatUntil && nextKey > repeatUntil) break;
    tasks.push({
      ...firstTask,
      id: crypto.randomUUID(),
      dueDate: nextKey,
      recurrence: {
        ...series,
        type: repeat,
        groupId: firstTask.id,
        index,
      },
    });
  }
  return tasks;
}

async function readPublicationPosts() {
  try {
    const value = JSON.parse(await fs.readFile(publicationPostsFile, "utf8"));
    return Array.isArray(value?.posts) ? value.posts : [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
}

async function writePublicationPosts(posts) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${publicationPostsFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify({ posts }, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, publicationPostsFile);
}

function postTargetId(post) {
  return String(post?.targetId || post?.target?.id || "instagram").toLowerCase();
}

function findInstagramPostForTask(posts) {
  const preferredStatuses = new Set(["pending_publication", "ready_for_review", "draft", "pending_confirmation"]);
  const instagramPosts = posts
    .filter((post) => postTargetId(post) === "instagram")
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
  return instagramPosts.find((post) => preferredStatuses.has(post.status) || ["review", "draft"].includes(post.action)) || instagramPosts[0] || null;
}

function publicMediaUrl(req, post) {
  const directUrl = safeUrl(post?.imageUrl || post?.videoUrl || post?.mediaUrl);
  if (directUrl) return directUrl;
  const fileName = String(post?.fileName || post?.media?.fileName || "").trim();
  if (/^[a-f0-9-]+\.(jpg|png|webp|mp4|webm|mov)$/i.test(fileName)) {
    return `${publicOrigin(req)}/media/publications/${fileName}`;
  }
  return "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugifyBlogTitle(value) {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#[a-z0-9_-]+/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "entrada";
}

function blogPostSlug(post) {
  const id = String(post?.id || "").slice(0, 8);
  const title = String(post?.title || post?.caption || "entrada").split(/\n+/)[0];
  return `${slugifyBlogTitle(title)}-${id}`;
}

function blogPostUrl(req, post) {
  return `${publicOrigin(req)}/blog/${blogPostSlug(post)}`;
}

function renderBlogPost(post, req) {
  const title = String(post?.title || post?.caption || "Entrada").split(/\n+/)[0].slice(0, 140);
  const publishedAt = post?.publishedAt ? new Date(post.publishedAt) : new Date(post?.createdAt || Date.now());
  const mediaUrl = publicMediaUrl(req, post);
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl);
  const rawHtml = cleanPublicationHtml(post?.captionHtml);
  const body = rawHtml || escapeHtml(post?.caption || "").replace(/\n/g, "<br>");
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f1ea; color: #342f29; }
    main { width: min(900px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 72px; }
    a { color: #326fb0; font-weight: 800; text-decoration: none; }
    article { background: #fffdfa; border: 1px solid #ded7ca; border-radius: 18px; box-shadow: 0 18px 52px rgba(62, 52, 40, 0.12); overflow: hidden; }
    .content { padding: clamp(24px, 5vw, 48px); }
    .eyebrow { color: #7c7265; font-size: 0.82rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 12px 0 16px; font-size: clamp(2rem, 5vw, 4rem); line-height: 1; letter-spacing: 0; }
    .date { color: #7c7265; font-weight: 750; }
    .media { display: block; width: 100%; max-height: 560px; object-fit: cover; background: #ebe4d9; }
    .body { margin-top: 28px; font-size: 1.12rem; line-height: 1.72; overflow-wrap: anywhere; }
    .body p { margin: 0 0 1em; }
    .back { display: inline-block; margin-bottom: 18px; }
  </style>
</head>
<body>
  <main>
    <a class="back" href="/">← Flow Console</a>
    <article>
      ${mediaUrl ? (isVideo
        ? `<video class="media" src="${escapeHtml(mediaUrl)}" controls playsinline></video>`
        : `<img class="media" src="${escapeHtml(mediaUrl)}" alt="">`) : ""}
      <div class="content">
        <div class="eyebrow">Blog</div>
        <h1>${escapeHtml(title)}</h1>
        <div class="date">${escapeHtml(publishedAt.toLocaleString("es-ES"))}</div>
        <div class="body">${body}</div>
      </div>
    </article>
  </main>
</body>
</html>`;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimAtWord(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), maxLength * 0.72)).trim()}...`;
}

function plainTextToBlogHtml(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function blogMediaHtml(payload) {
  const imageUrl = safeUrl(payload?.imageUrl);
  if (imageUrl) {
    return `<figure class="af-generated-media"><img src="${escapeHtml(imageUrl)}" alt="" loading="lazy"></figure>`;
  }
  const videoUrl = safeUrl(payload?.videoUrl);
  if (videoUrl) {
    return `<figure class="af-generated-media"><video src="${escapeHtml(videoUrl)}" controls playsinline></video></figure>`;
  }
  return "";
}

function blogCategoryFromPayload(payload) {
  const text = `${payload?.tag || ""} ${payload?.caption || ""}`.toLowerCase();
  if (/factur|facturae|xml|fiscal|impuesto|tribut/i.test(text)) return { category: "Facturación", cat_class: "cat-amber" };
  if (/automat|n8n|workflow|flujo|proceso/i.test(text)) return { category: "Automatización", cat_class: "cat-blue" };
  if (/ia|inteligencia|modelo|llm|claude|openai|gener/i.test(text)) return { category: "IA aplicada", cat_class: "cat-blue" };
  return { category: "Datos", cat_class: "cat-teal" };
}

function aeternalBlogPayload(payload) {
  const plain = stripHtml(payload?.captionHtml) || String(payload?.caption || "").trim();
  const lines = plain.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] || "Nueva nota de taller";
  const firstSentence = firstLine.match(/^(.{35,}?[.!?])\s/)?.[1] || firstLine;
  const title = trimAtWord(firstSentence.replace(/^#+\s*/, ""), 110) || "Nueva nota de taller";
  const excerptSource = lines.slice(1).join(" ") || plain;
  const excerpt = trimAtWord(excerptSource, 220) || trimAtWord(plain, 220);
  const lede = trimAtWord(lines.find((line) => line !== firstLine) || plain, 300);
  const textBody = cleanPublicationHtml(payload?.captionHtml) || plainTextToBlogHtml(plain);
  const mediaBody = blogMediaHtml(payload);
  const imageUrl = safeUrl(payload?.imageUrl) || "";
  const videoUrl = safeUrl(payload?.videoUrl) || "";
  const mediaUrl = imageUrl || videoUrl;
  const body = mediaBody ? `${mediaBody}\n${textBody}` : textBody;
  const words = plain.split(/\s+/).filter(Boolean).length;
  const { category, cat_class } = blogCategoryFromPayload(payload);
  return {
    slug: `${slugifyBlogTitle(title)}-${publicationFingerprint(payload).slice(0, 8)}`,
    title,
    category,
    cat_class,
    minutes: Math.max(1, Math.min(99, Math.ceil(words / 190))),
    excerpt,
    lede,
    body,
    image_url: imageUrl,
    media_url: mediaUrl,
    cta_note: "",
    cta_text: "",
    cta_href: "contacto.php",
    published: 1,
  };
}

async function publishToAeternalBlog(payload) {
  if (!aeternalBlogApiToken) {
    throw new Error("BLOG_API_TOKEN no configurado para publicar en aeternal-flow.es. Define AETERNAL_BLOG_API_TOKEN en Railway con el token del endpoint /api/publicar.php.");
  }
  const response = await fetch(aeternalBlogApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${aeternalBlogApiToken}`,
      "X-Blog-Token": aeternalBlogApiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(aeternalBlogPayload(payload)),
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let result = null;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }
  if (!response.ok || result?.ok === false) {
    const error = new Error(result?.error || result?.message || `aeternal-flow.es respondió ${response.status}`);
    error.status = response.status || 502;
    throw error;
  }
  return {
    ...result,
    status: "published_to_aeternal_blog",
    deliveryMode: "aeternal_blog_api",
    publishedAt: new Date().toISOString(),
    publicUrl: result.url || "",
  };
}

async function requestAeternalBlogArticles(pathSuffix = "", options = {}) {
  if (!aeternalBlogApiToken) {
    throw new Error("AETERNAL_BLOG_API_TOKEN no configurado para gestionar el blog.");
  }
  const url = new URL(aeternalBlogArticlesApiUrl);
  if (pathSuffix) {
    const suffix = new URLSearchParams(pathSuffix.startsWith("?") ? pathSuffix.slice(1) : pathSuffix);
    suffix.forEach((value, key) => url.searchParams.set(key, value));
  }
  const headers = {
    Authorization: `Bearer ${aeternalBlogApiToken}`,
    "X-Blog-Token": aeternalBlogApiToken,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
  };
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let result = null;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }
  if (!response.ok || result?.ok === false) {
    const error = new Error(result?.error || result?.message || `aeternal-flow.es respondió ${response.status}`);
    error.status = response.status || 502;
    throw error;
  }
  return result;
}

async function prepareDesktopInstagram({ caption, instagramUrl, mediaUrl }) {
  if (process.platform !== "darwin") {
    return { desktopAvailable: false, actions: ["browser_fallback"] };
  }
  await runDesktopCommand("open", [instagramUrl]);
  if (mediaUrl) await runDesktopCommand("open", [mediaUrl]);
  if (caption) await runDesktopCommand("pbcopy", [], caption);
  return {
    desktopAvailable: true,
    actions: ["open_instagram", mediaUrl ? "open_media" : "skip_media", caption ? "copy_caption" : "skip_caption"],
  };
}

function cleanWebhookPath(value) {
  const pathValue = String(value || "").trim();
  if (!pathValue) return "";
  if (!/^\/webhook\/[a-z0-9/_-]+$/i.test(pathValue)) return "";
  return pathValue.slice(0, 180);
}

function targetIcon(name) {
  const words = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]+/gi) || [];
  return (words[0]?.[0] || "P").toUpperCase() + (words[1]?.[0] || words[0]?.[1] || "").toUpperCase();
}

function cleanPublicationTarget(value) {
  const name = String(value?.name || "").trim().slice(0, 48);
  const id = String(value?.id || name.toLowerCase().replace(/[^a-z0-9]+/gi, "-") || crypto.randomUUID())
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return {
    id: id || crypto.randomUUID(),
    name,
    handle: String(value?.handle || "").trim().slice(0, 80),
    kind: String(value?.kind || "publicación").trim().slice(0, 40),
    color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color : "#4a7ab5",
    webhookPath: cleanWebhookPath(value?.webhookPath),
    icon: String(value?.icon || targetIcon(name)).trim().slice(0, 3),
    builtIn: Boolean(value?.builtIn),
    createdAt: value?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mergeDefaultPublicationTargets(targets) {
  const saved = (Array.isArray(targets) ? targets : [])
    .filter((target) => !disabledPublicationTargetIds.has(String(target?.id || "").toLowerCase()));
  const byId = new Map(saved.map((target) => [target.id, target]));
  for (const target of defaultPublicationTargets) {
    const savedTarget = byId.get(target.id) || {};
    byId.set(target.id, {
      ...target,
      ...savedTarget,
      icon: target.icon,
      color: target.color,
      webhookPath: target.webhookPath,
      builtIn: true,
    });
  }
  return [...byId.values()].map(cleanPublicationTarget).filter((target) => target.name).slice(0, 40);
}

async function readPublicationTargets() {
  try {
    const value = JSON.parse(await fs.readFile(publicationTargetsFile, "utf8"));
    return mergeDefaultPublicationTargets(value?.targets);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return mergeDefaultPublicationTargets([]);
  }
}

async function writePublicationTargets(targets) {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${publicationTargetsFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify({ targets: mergeDefaultPublicationTargets(targets) }, null, 2), { mode: 0o600 });
  await fs.rename(temporaryFile, publicationTargetsFile);
}

function cleanPublicationHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/\son[a-z]+='[^']*'/gi, "")
    .trim();
}

function cleanPublicationPayload(value) {
  const action = ["draft", "review", "schedule", "publish"].includes(value?.action) ? value.action : "draft";
  const scheduledAt = ["review", "schedule"].includes(action) && value?.scheduledAt ? new Date(value.scheduledAt) : null;
  const imageUrl = safeUrl(value?.imageUrl);
  const target = cleanPublicationTarget({
    id: value?.target?.id || value?.targetId || "instagram",
    name: value?.target?.name || "Instagram",
    handle: value?.target?.handle || "",
    kind: value?.target?.kind || "red social",
    color: value?.target?.color || "#c47a3a",
    webhookPath: value?.target?.webhookPath || "",
    icon: value?.target?.icon || "",
    builtIn: value?.target?.builtIn,
  });
  const caption = String(value?.caption || "").trim();
  const captionHtml = cleanPublicationHtml(value?.captionHtml);
  const linkedinMode = value?.options?.linkedinMode === "article" || value?.linkedinMode === "article" ? "article" : "post";
  const tiktokMode = value?.options?.tiktokMode === "publish" || value?.tiktokMode === "publish" ? "publish" : "draft";
  const mediaAspect = ["original", "1-1", "4-5", "16-9"].includes(value?.options?.mediaAspect) ? value.options.mediaAspect : "";
  const mediaFit = ["cover", "contain"].includes(value?.options?.mediaFit) ? value.options.mediaFit : "";
  const rawMediaPosition = value?.options?.mediaPosition && typeof value.options.mediaPosition === "object" ? value.options.mediaPosition : null;
  const mediaPosition = rawMediaPosition
    ? {
        x: Math.max(-100, Math.min(100, Number(rawMediaPosition.x) || 0)),
        y: Math.max(-100, Math.min(100, Number(rawMediaPosition.y) || 0)),
      }
    : null;
  return {
    action,
    caption,
    captionHtml,
    imageUrl,
    videoUrl: safeUrl(value?.videoUrl || (["youtube", "tiktok"].includes(target.id) ? value?.imageUrl : "")),
    target,
    targetId: target.id,
    scheduledAt: scheduledAt && !Number.isNaN(scheduledAt.getTime()) ? scheduledAt.toISOString() : null,
    location: String(value?.location || "").trim().slice(0, 120),
    tag: String(value?.tag || "").trim().slice(0, 120),
    audience: ["public", "followers", "close"].includes(value?.audience) ? value.audience : "public",
    options: {
      hideLikes: Boolean(value?.options?.hideLikes),
      noComments: Boolean(value?.options?.noComments),
      shareThreads: Boolean(value?.options?.shareThreads),
      linkedinMode,
      tiktokMode,
      mediaAspect,
      mediaFit,
      mediaPosition,
    },
  };
}

function publicationFingerprint(value = {}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      caption: String(value.caption || "").trim(),
      imageUrl: String(value.imageUrl || "").trim(),
      videoUrl: String(value.videoUrl || "").trim(),
      targetId: String(value.targetId || value.target?.id || "instagram").trim().toLowerCase(),
      day: String(value.scheduledAt || value.publishedAt || value.createdAt || new Date().toISOString()).slice(0, 10),
    }))
    .digest("hex");
}

function confirmedPublicationStatus(status) {
  return /(^|_)(published|posted|uploaded|created|done|success)(_|$)/i.test(String(status || ""));
}

function publicationDeliveryStatus(payload, flowResult) {
  if (payload.action !== "publish") return payload.action === "schedule" ? "scheduled" : payload.action === "review" ? "pending_publication" : payload.action;
  const resultStatus = String(flowResult?.status || "").trim();
  if (confirmedPublicationStatus(resultStatus)) return resultStatus;
  if (payload.target.id === "instagram" && /already_published|published_by_external_worker/i.test(resultStatus)) return resultStatus;
  if (/confirm|manual|review/i.test(resultStatus)) return "pending_confirmation";
  if (resultStatus) return resultStatus;
  return "received_by_delivery_service";
}

function deliveryModeForPublication(post = {}) {
  const targetId = String(post.targetId || post.target?.id || "").toLowerCase();
  const resultMode = String(post.result?.deliveryMode || "").trim();
  if (resultMode === "youtube_data_api") return "API";
  if (resultMode === "pinterest_api") return "API";
  if (targetId === "blog") return "API";
  if (targetId === "tiktok") return post.options?.tiktokMode === "publish" ? "worker" : "asistido";
  if (["instagram", "linkedin"].includes(targetId)) return "worker";
  return resultMode || "servicio";
}

async function publicationPreflight(payload, workerHealth = null) {
  const targetId = String(payload?.target?.id || payload?.targetId || "").toLowerCase();
  const checks = [];
  const add = (id, label, level, detail = "") => checks.push({ id, label, level, detail });
  const ok = (id, label, detail = "") => add(id, label, "ok", detail);
  const warn = (id, label, detail = "") => add(id, label, "warn", detail);
  const block = (id, label, detail = "") => add(id, label, "block", detail);
  if (manualEditorialTargetIds.has(targetId)) warn("manual", "Publicación manual", "Copia el contenido y publícalo en la plataforma; Flow no lo marcará como publicado automáticamente.");
  if (!String(payload?.caption || "").trim()) block("caption", "Falta texto", "Escribe un caption antes de publicar.");
  else ok("caption", "Texto OK", `${String(payload.caption || "").length} caracteres.`);
  if (targetId === "youtube") {
    if (youtubeUploadConfigured()) ok("youtube", "YouTube OK", `Publica como ${youtubePrivacyStatus}.`);
    else block("youtube", "YouTube sin OAuth", "Faltan credenciales o refresh token.");
    if (safeUrl(payload.videoUrl || payload.imageUrl)) ok("video", "Vídeo OK");
    else block("video", "Falta vídeo", "Sube un MP4, WebM o MOV.");
  } else if (targetId === "pinterest") {
    if (pinterestAccessToken && pinterestBoardId) ok("pinterest", "Pinterest OK");
    else block("pinterest", "Pinterest sin token", "Faltan PINTEREST_ACCESS_TOKEN o PINTEREST_BOARD_ID.");
    if (safeUrl(payload.imageUrl)) ok("image", "Imagen OK");
    else block("image", "Falta imagen", "Pinterest necesita una imagen pública.");
  } else if (targetId === "tiktok") {
    const worker = workerHealth || await externalWorkerHealth();
    if (worker.ok) warn("tiktok", "TikTok asistido", "Se prepara para revisar; publicación automática no garantizada.");
    else block("worker", "Worker caído", worker.error || "El worker no responde.");
    if (safeUrl(payload.videoUrl || payload.imageUrl)) ok("video", "Vídeo OK");
    else block("video", "Falta vídeo", "TikTok necesita un vídeo.");
  } else if (targetId === "linkedin") {
    const worker = workerHealth || await externalWorkerHealth();
    if (worker.ok && worker.loggedIn) ok("linkedin", "LinkedIn sesión OK", "Worker disponible.");
    else warn("linkedin", "LinkedIn sesión a revisar", worker.error || "Worker sin sesión confirmada.");
    if (payload?.options?.linkedinMode === "article") ok("mode", "Artículo LinkedIn", payload.imageUrl ? "Con imagen de portada." : "Sin imagen de portada.");
  } else if (targetId === "instagram") {
    const worker = workerHealth || await externalWorkerHealth();
    if (worker.ok && worker.loggedIn) ok("instagram", "Instagram sesión OK", "Worker disponible.");
    else warn("instagram", "Instagram sesión a revisar", worker.error || "Worker sin sesión confirmada.");
    if (safeUrl(payload.imageUrl || payload.videoUrl)) ok("media", "Media OK");
    else block("media", "Falta media", "Instagram necesita imagen o vídeo.");
  } else if (targetId === "blog") {
    if (aeternalBlogApiToken) ok("blog", "Blog OK");
    else block("blog", "Blog sin token", "Falta AETERNAL_BLOG_API_TOKEN.");
  }
  return {
    ok: !checks.some((check) => check.level === "block"),
    level: checks.some((check) => check.level === "block") ? "block" : checks.some((check) => check.level === "warn") ? "warn" : "ok",
    checks,
  };
}

async function publishWithExternalWorker(payload, endpoint) {
  if (!publicationExternalWorkerUrl) throw new Error("PUBLICATION_EXTERNAL_WORKER_URL no configurado");
  const headers = { "Content-Type": "application/json" };
  if (publicationExternalWorkerToken) headers.Authorization = `Bearer ${publicationExternalWorkerToken}`;
  const response = await fetch(`${publicationExternalWorkerUrl}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...payload,
      requestedAction: "publish",
      deliveryMode: "external_worker",
      requestedAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(180000),
  });
  const text = await response.text();
  let result = null;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }
  if (!response.ok || result?.ok === false) {
    const details = result?.details?.screenshotUrl ? ` Debug: ${result.details.screenshotUrl}` : "";
    const error = new Error(`${result?.error || result?.message || `worker respondió ${response.status}`}${details}`);
    error.status = response.status || 502;
    throw error;
  }
  return result;
}

async function externalWorkerHealth() {
  if (!publicationExternalWorkerUrl) {
    return { ok: false, configured: false, error: "PUBLICATION_EXTERNAL_WORKER_URL no configurado" };
  }
  try {
    const response = await fetch(`${publicationExternalWorkerUrl}/health`, {
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({}));
    return {
      ok: response.ok && result?.ok !== false,
      configured: true,
      loggedIn: Boolean(result?.loggedIn),
      service: result?.service || "worker",
      error: response.ok ? "" : `worker respondió ${response.status}`,
    };
  } catch (error) {
    return { ok: false, configured: true, error: error.message };
  }
}

function youtubeUploadConfigured() {
  const { clientId, clientSecret, refreshToken } = youtubeOAuthConfig();
  return Boolean(clientId && clientSecret && refreshToken);
}

async function youtubeAccessToken() {
  const { clientId, clientSecret, refreshToken } = youtubeOAuthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || `Google OAuth respondió ${response.status}`);
  }
  return result.access_token;
}

function searchConsoleConfigured() {
  const { clientId, clientSecret, refreshToken, siteUrl } = searchConsoleOAuthConfig();
  return Boolean(clientId && clientSecret && refreshToken && siteUrl);
}

async function searchConsoleAccessToken() {
  const { clientId, clientSecret, refreshToken } = searchConsoleOAuthConfig();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Search Console no está autorizado. Abre /oauth/search-console/start y guarda SEARCH_CONSOLE_REFRESH_TOKEN en Railway.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || `Google OAuth respondió ${response.status}`);
  }
  return result.access_token;
}

function ga4Configured() {
  const { clientId, clientSecret, refreshToken, propertyId } = ga4OAuthConfig();
  return Boolean(clientId && clientSecret && refreshToken && propertyId);
}

async function ga4AccessToken() {
  const { clientId, clientSecret, refreshToken } = ga4OAuthConfig();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GA4 no está autorizado. Abre /oauth/ga4/start y guarda GA4_REFRESH_TOKEN en Railway.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || `Google OAuth respondió ${response.status}`);
  }
  return result.access_token;
}

async function ga4RunReport({ propertyId, accessToken, body }) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || `GA4 respondió ${response.status}`);
  }
  return result;
}

function monthDateRange(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function cleanGa4Dimension(value) {
  const text = String(value || "").trim();
  return text && !/^\((not set|direct|none|referral|organic)\)$/i.test(text) ? text : "";
}

function titleCaseChannel(value) {
  const text = String(value || "").trim();
  if (!text) return "UTM";
  const known = {
    instagram: "Instagram",
    ig: "Instagram",
    linkedin: "LinkedIn",
    pinterest: "Pinterest",
    youtube: "YouTube",
    tiktok: "TikTok",
    facebook: "Facebook",
    x: "X",
    twitter: "X",
    newsletter: "Newsletter",
    email: "Email",
    blog: "Blog",
  };
  return known[text.toLowerCase()] || text.split(/[\s_-]+/).filter(Boolean).map((part) =>
    part.length <= 3 ? part.toUpperCase() : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
  ).join(" ");
}

function campaignDisplayName({ source, medium, campaign, content }, savedCampaigns = []) {
  const exactMatch = savedCampaigns.find((item) =>
    String(item.source || "").toLowerCase() === String(source || "").toLowerCase()
    && String(item.medium || "").toLowerCase() === String(medium || "").toLowerCase()
    && String(item.campaign || "").toLowerCase() === String(campaign || "").toLowerCase()
    && content
    && String(item.content || "").toLowerCase() === String(content || "").toLowerCase(),
  );
  const looseMatches = savedCampaigns.filter((item) =>
    String(item.source || "").toLowerCase() === String(source || "").toLowerCase()
    && String(item.medium || "").toLowerCase() === String(medium || "").toLowerCase()
    && String(item.campaign || "").toLowerCase() === String(campaign || "").toLowerCase(),
  );
  const match = exactMatch || (looseMatches.length === 1 ? looseMatches[0] : null);
  const sourceLabel = titleCaseChannel(source || medium || "UTM");
  const normalizedSource = normalizeStatsChannelLabel(sourceLabel);
  if (normalizedSource && normalizedSource !== sourceLabel) return normalizedSource.slice(0, 80);
  if (/^(Instagram|Pinterest|LinkedIn|YouTube|TikTok|Facebook|GA4 Web)$/i.test(normalizedSource)) {
    return normalizedSource.slice(0, 80);
  }
  const campaignLabel = match?.name || content || campaign || medium || "tráfico";
  const contentLabel = content && !match?.name ? ` · ${content}` : "";
  return `${sourceLabel} · ${campaignLabel}${contentLabel}`.slice(0, 80);
}

function comparableUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\/$/, "").toLowerCase();
  }
}

function outboundDisplayName({ linkUrl, linkDomain }, savedCampaigns = []) {
  const normalized = comparableUrl(linkUrl);
  const match = savedCampaigns.find((item) => {
    const saved = comparableUrl(item.url);
    return saved && normalized && (saved === normalized || saved.startsWith(normalized) || normalized.startsWith(saved));
  });
  const domain = String(linkDomain || "").replace(/^www\./, "");
  const fallback = domain ? titleCaseChannel(domain.split(".")[0]) : "Enlace externo";
  return `Salida blog · ${match?.name || fallback}`.slice(0, 80);
}

function mergeMetricRowsByChannel(rows = []) {
  const byChannel = new Map();
  for (const row of rows) {
    const channel = normalizeStatsChannelLabel(row.channel);
    const key = statsChannelKey(channel);
    if (!key) continue;
    const current = byChannel.get(key);
    if (!current) {
      byChannel.set(key, { ...row, channel });
      continue;
    }
    byChannel.set(key, {
      ...current,
      sessions: cleanStatsMetric(current.sessions) + cleanStatsMetric(row.sessions),
      pageViews: cleanStatsMetric(current.pageViews) + cleanStatsMetric(row.pageViews),
      activeUsers: cleanStatsMetric(current.activeUsers) + cleanStatsMetric(row.activeUsers),
      engagedSessions: cleanStatsMetric(current.engagedSessions) + cleanStatsMetric(row.engagedSessions),
      clicks: cleanStatsMetric(current.clicks) + cleanStatsMetric(row.clicks),
    });
  }
  return [...byChannel.values()].sort((left, right) =>
    cleanStatsMetric(right.sessions || right.clicks) - cleanStatsMetric(left.sessions || left.clicks)
    || String(left.channel || "").localeCompare(String(right.channel || ""), "es", { sensitivity: "base" }),
  );
}

async function ga4MonthlyStats({ year, month }) {
  const { propertyId } = ga4OAuthConfig();
  if (!propertyId) throw new Error("Falta GA4_PROPERTY_ID. Es el ID numérico de la propiedad GA4.");
  const accessToken = await ga4AccessToken();
  const { startDate, endDate } = monthDateRange(year, month);
  const metricNames = [
    { name: "sessions" },
    { name: "screenPageViews" },
    { name: "activeUsers" },
    { name: "engagedSessions" },
  ];
  const result = await ga4RunReport({
    propertyId,
    accessToken,
    body: {
      dateRanges: [{ startDate, endDate }],
      metrics: metricNames,
    },
  });
  const values = result.rows?.[0]?.metricValues || [];
  const sessions = Math.round(Number(values[0]?.value || 0));
  const pageViews = Math.round(Number(values[1]?.value || 0));
  const activeUsers = Math.round(Number(values[2]?.value || 0));
  const engagedSessions = Math.round(Number(values[3]?.value || 0));
  const savedCampaigns = await readCampaignUrls();
  let sourceResult;
  try {
    sourceResult = await ga4RunReport({
      propertyId,
      accessToken,
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: "sessionSource" },
          { name: "sessionMedium" },
          { name: "sessionCampaignName" },
          { name: "sessionManualAdContent" },
        ],
        metrics: metricNames,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      },
    });
  } catch {
    sourceResult = await ga4RunReport({
      propertyId,
      accessToken,
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: "sessionSource" },
          { name: "sessionMedium" },
          { name: "sessionCampaignName" },
        ],
        metrics: metricNames,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      },
    });
  }
  const hasSavedCampaignMatch = (row) => savedCampaigns.some((item) =>
    String(item.source || "").toLowerCase() === String(row.source || "").toLowerCase()
    && String(item.medium || "").toLowerCase() === String(row.medium || "").toLowerCase()
    && (!row.campaign || String(item.campaign || "").toLowerCase() === String(row.campaign || "").toLowerCase()),
  );
  const utmRows = (sourceResult.rows || [])
    .map((row) => {
      const dimensions = row.dimensionValues || [];
      const metrics = row.metricValues || [];
      const source = cleanGa4Dimension(dimensions[0]?.value);
      const medium = cleanGa4Dimension(dimensions[1]?.value);
      const campaign = cleanGa4Dimension(dimensions[2]?.value);
      const content = cleanGa4Dimension(dimensions[3]?.value);
      return {
        source,
        medium,
        campaign,
        content,
        sessions: Math.round(Number(metrics[0]?.value || 0)),
        pageViews: Math.round(Number(metrics[1]?.value || 0)),
        activeUsers: Math.round(Number(metrics[2]?.value || 0)),
        engagedSessions: Math.round(Number(metrics[3]?.value || 0)),
      };
    })
    .filter((row) => row.sessions > 0 && (row.campaign || row.content || hasSavedCampaignMatch(row)))
    .map((row) => ({
      ...row,
      channel: campaignDisplayName(row, savedCampaigns),
    }));
  const mergedUtmRows = mergeMetricRowsByChannel(utmRows);
  let outboundRows = [];
  try {
    const outboundResult = await ga4RunReport({
      propertyId,
      accessToken,
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: "linkUrl" },
          { name: "linkDomain" },
        ],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          filter: {
            fieldName: "eventName",
            stringFilter: { matchType: "EXACT", value: "click" },
          },
        },
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 50,
      },
    });
    outboundRows = mergeMetricRowsByChannel((outboundResult.rows || [])
      .map((item) => {
        const dimensions = item.dimensionValues || [];
        const metrics = item.metricValues || [];
        const linkUrl = cleanGa4Dimension(dimensions[0]?.value);
        const linkDomain = cleanGa4Dimension(dimensions[1]?.value);
        const clicks = Math.round(Number(metrics[0]?.value || 0));
        return {
          linkUrl,
          linkDomain,
          clicks,
          channel: outboundDisplayName({ linkUrl, linkDomain }, savedCampaigns),
        };
      })
      .filter((item) => item.clicks > 0 && item.linkUrl));
  } catch {
    outboundRows = [];
  }
  const row = {
    channel: "GA4 Web",
    publications: 0,
    impressions: pageViews,
    interactions: engagedSessions,
    clicks: sessions,
  };
  return {
    source: "Google Analytics 4",
    propertyId,
    startDate,
    endDate,
    sessions,
    pageViews,
    activeUsers,
    engagedSessions,
    utmRows: mergedUtmRows,
    outboundRows,
    row,
    rows: [
      row,
      ...mergedUtmRows.map((item) => ({
        channel: item.channel,
        publications: 0,
        impressions: item.pageViews,
        interactions: item.engagedSessions,
        clicks: item.sessions,
      })),
      ...outboundRows.map((item) => ({
        channel: item.channel,
        publications: 0,
        impressions: 0,
        interactions: 0,
        clicks: item.clicks,
      })),
    ],
  };
}

async function searchConsoleMonthlyStats({ year, month }) {
  const { siteUrl } = searchConsoleOAuthConfig();
  if (!siteUrl) throw new Error("Falta SEARCH_CONSOLE_SITE_URL. Usa el valor exacto de la propiedad, por ejemplo sc-domain:aeternal-flow.es o https://aeternal-flow.es/");
  const accessToken = await searchConsoleAccessToken();
  const { startDate, endDate } = monthDateRange(year, month);
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ["date"],
      rowLimit: 25000,
    }),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || `Search Console respondió ${response.status}`);
  }
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const totals = rows.reduce((acc, row) => ({
    clicks: acc.clicks + Number(row.clicks || 0),
    impressions: acc.impressions + Number(row.impressions || 0),
    positionWeight: acc.positionWeight + (Number(row.position || 0) * Number(row.impressions || 0)),
  }), { clicks: 0, impressions: 0, positionWeight: 0 });
  const ctr = totals.impressions ? totals.clicks / totals.impressions : 0;
  const position = totals.impressions ? totals.positionWeight / totals.impressions : 0;
  return {
    source: "Google Search Console",
    siteUrl,
    startDate,
    endDate,
    days: rows.length,
    clicks: Math.round(totals.clicks),
    impressions: Math.round(totals.impressions),
    ctr,
    position,
    row: {
      channel: "Google Search",
      publications: 0,
      impressions: Math.round(totals.impressions),
      interactions: 0,
      clicks: Math.round(totals.clicks),
    },
  };
}

function youtubeTitleAndDescription(caption) {
  const text = String(caption || "").trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rawTitle = lines[0] || "Flow Console";
  const title = rawTitle.length > 100 ? `${rawTitle.slice(0, 97).trimEnd()}...` : rawTitle;
  return {
    title,
    description: text.slice(0, 5000),
  };
}

function localPublicationMediaPath(mediaUrl) {
  if (!mediaUrl) return null;
  try {
    const parsed = new URL(mediaUrl);
    const pathname = decodeURIComponent(parsed.pathname);
    const match = pathname.match(/^\/media\/(?:publications|instagram)\/([^/]+)$/);
    if (!match) return null;
    return path.join(publicationMediaDirectory, path.basename(match[1]));
  } catch {
    return null;
  }
}

async function readPublicationVideo(videoUrl) {
  const localPath = localPublicationMediaPath(videoUrl);
  if (localPath) {
    const bytes = await fs.readFile(localPath);
    const extension = path.extname(localPath).toLowerCase();
    const mimeType = extension === ".webm"
      ? "video/webm"
      : extension === ".mov"
        ? "video/quicktime"
        : "video/mp4";
    return { bytes, mimeType };
  }
  const response = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`No se pudo descargar el vídeo (${response.status})`);
  const mimeType = String(response.headers.get("content-type") || "video/mp4").split(";")[0].trim();
  if (!mimeType.startsWith("video/")) throw new Error(`El recurso no parece vídeo (${mimeType || "sin tipo"})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, mimeType };
}

function multipartRelatedBody(metadata, media) {
  const boundary = `flow-console-${crypto.randomUUID()}`;
  const head = Buffer.from([
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${media.mimeType}`,
    "",
    "",
  ].join("\r\n"));
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    boundary,
    body: Buffer.concat([head, media.bytes, tail]),
  };
}

async function publishToYouTube(payload) {
  if (!youtubeUploadConfigured()) {
    throw new Error("YouTube no está configurado: faltan YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET o YOUTUBE_REFRESH_TOKEN");
  }
  const videoUrl = safeUrl(payload.videoUrl || payload.imageUrl);
  if (!videoUrl) throw new Error("Sube o indica un vídeo para publicar en YouTube");
  const accessToken = await youtubeAccessToken();
  const media = await readPublicationVideo(videoUrl);
  const { title, description } = youtubeTitleAndDescription(payload.caption);
  const metadata = {
    snippet: {
      title,
      description,
      categoryId: youtubeCategoryId || "22",
    },
    status: {
      privacyStatus: youtubePrivacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };
  const multipart = multipartRelatedBody(metadata, media);
  const response = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${multipart.boundary}`,
      "Content-Length": String(multipart.body.length),
    },
    body: multipart.body,
    signal: AbortSignal.timeout(300000),
  });
  const text = await response.text();
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { raw: text };
  }
  if (!response.ok || !result.id) {
    const reason = result?.error?.errors?.[0]?.reason;
    const message = [
      result?.error?.message || result?.error_description || result?.raw || `YouTube respondió ${response.status}`,
      reason ? `(${reason})` : "",
    ].filter(Boolean).join(" ");
    throw new Error(message);
  }
  return {
    ok: true,
    status: "uploaded_to_youtube",
    deliveryMode: "youtube_data_api",
    videoId: result.id,
    url: `https://www.youtube.com/watch?v=${result.id}`,
    privacyStatus: result.status?.privacyStatus || youtubePrivacyStatus,
    title: result.snippet?.title || title,
    uploadedAt: new Date().toISOString(),
  };
}

function pinterestTitleAndDescription(caption) {
  const text = String(caption || "").trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rawTitle = lines[0] || "Aeternal Flow";
  const title = rawTitle.length > 100 ? `${rawTitle.slice(0, 97).trimEnd()}...` : rawTitle;
  return {
    title,
    description: text.slice(0, 800),
  };
}

async function publishToPinterest(payload) {
  if (!pinterestAccessToken || !pinterestBoardId) {
    throw new Error("Pinterest no está configurado: faltan PINTEREST_ACCESS_TOKEN o PINTEREST_BOARD_ID");
  }
  const imageUrl = safeUrl(payload.imageUrl);
  if (!imageUrl) throw new Error("Pinterest necesita una URL pública de imagen");
  const { title, description } = pinterestTitleAndDescription(payload.caption);
  const body = {
    board_id: pinterestBoardId,
    title,
    description,
    media_source: {
      source_type: "image_url",
      url: imageUrl,
    },
  };
  if (pinterestLinkUrl) body.link = pinterestLinkUrl;
  const response = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pinterestAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { raw: text };
  }
  if (!response.ok || !result.id) {
    const message = result?.message || result?.error?.message || result?.raw || `Pinterest respondió ${response.status}`;
    throw new Error(message);
  }
  return {
    ok: true,
    status: "created_on_pinterest",
    deliveryMode: "pinterest_api",
    pinId: result.id,
    url: result.link || result.url || `https://www.pinterest.com/pin/${result.id}/`,
    title: result.title || title,
    imageUrl,
    boardId: pinterestBoardId,
    publishedAt: new Date().toISOString(),
  };
}

async function publishPublicationPayload(payload, source = "flow-console") {
  if (payload?.target?.id === "instagram" && publicationExternalWorkerUrl) {
    return publishWithExternalWorker(payload, "/instagram/publish");
  }
  if (payload?.target?.id === "linkedin" && publicationExternalWorkerUrl) {
    return publishWithExternalWorker(payload, "/linkedin/publish");
  }
  if (payload?.target?.id === "tiktok" && publicationExternalWorkerUrl) {
    const mode = payload?.options?.tiktokMode === "publish" ? "publish" : "draft";
    return publishWithExternalWorker(payload, `/tiktok/${mode}`);
  }
  if (payload?.target?.id === "youtube") {
    return publishToYouTube(payload);
  }
  if (payload?.target?.id === "pinterest") {
    return publishToPinterest(payload);
  }
  if (payload?.target?.id === "blog") {
    return publishToAeternalBlog(payload, source);
  }
  const webhookPath = cleanWebhookPath(payload?.target?.webhookPath) || "/webhook/publicar-instagram";
  const externalInstagramFlow = payload?.target?.id === "instagram";
  const brain = await queryEditorialBrain({
    task: "publication_delivery",
    channel: payload?.target?.id || payload?.target?.name || "",
    context: payload || {},
  }).catch(async () => {
    const memory = await readRagMemory().catch(() => emptyRagMemory());
    const memoryPayload = generatorMemoryPayload(memory);
    return { memory: memoryPayload, instruction: generatorMemoryInstruction(memoryPayload), source: "flow-console-local-rag" };
  });
  const memoryPayload = brain.memory || generatorMemoryPayload(emptyRagMemory());
  const response = await fetch(`${n8nUrl}${webhookPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      action: externalInstagramFlow ? "external_flow" : "publish",
      requestedAction: "publish",
      deliveryMode: externalInstagramFlow ? "external_flow" : "webhook",
      skipMeta: externalInstagramFlow,
      avoidMetaIntegration: externalInstagramFlow,
      rag_memory: memoryPayload,
      memoria_rag: memoryPayload,
      editorial_brain: {
        source: brain.source,
        instruction: brain.instruction,
      },
      source,
      requestedAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(150000),
  });
  const text = await response.text();
  let flowResult = null;
  try {
    flowResult = text ? JSON.parse(text) : {};
  } catch {
    flowResult = { message: text };
  }
  if (!response.ok || flowResult?.ok === false) {
    const rawMessage = flowResult?.error || flowResult?.message || `n8n respondió ${response.status}`;
    const metaError = externalInstagramFlow && /META_IG|Graph|access_token|instagram.*token/i.test(rawMessage);
    const error = new Error(metaError
      ? `La entrega de Instagram sigue intentando usar Meta Graph. Cámbiala en n8n para usar el flujo browser y respetar skipMeta=true. Detalle n8n: ${rawMessage}`
      : rawMessage);
    error.status = response.status || 502;
    throw error;
  }
  return flowResult;
}

async function rememberPublishedCalendarTask(post) {
  if (!post?.id) return;
  const publishedAt = post.publishedAt || post.updatedAt || post.createdAt || new Date().toISOString();
  const date = new Date(publishedAt);
  const tasks = await readCalendarTasks();
  const taskId = `publication-${post.id}`;
  const task = cleanCalendarTask({
    title: `Publicado en ${post.target?.name || "Publicaciones"}`,
    notes: String(post.caption || "").slice(0, 900),
    dueDate: dateKey(date),
    time: date.toTimeString().slice(0, 5),
    status: "done",
    project: post.target?.name || "Publicaciones",
  }, { id: taskId, createdAt: post.createdAt || publishedAt });
  const scheduledTaskId = `publication-scheduled-${post.id}`;
  const next = [task, ...tasks.filter((item) => item.id !== taskId && item.id !== scheduledTaskId)].slice(0, 300);
  await writeCalendarTasks(next);
}

async function rememberScheduledCalendarTask(post) {
  if (!post?.id || !post.scheduledAt) return;
  const date = new Date(post.scheduledAt);
  const tasks = await readCalendarTasks();
  const taskId = `publication-scheduled-${post.id}`;
  const task = cleanCalendarTask({
    title: `Publicar en ${post.target?.name || "Publicaciones"}`,
    notes: String(post.caption || "").slice(0, 900),
    dueDate: dateKey(date),
    time: date.toTimeString().slice(0, 5),
    status: "pending",
    project: post.target?.name || "Publicaciones",
  }, { id: taskId, createdAt: post.createdAt || new Date().toISOString() });
  const next = [task, ...tasks.filter((item) => item.id !== taskId)].slice(0, 300);
  await writeCalendarTasks(next);
}

async function syncPublishedCalendarTasks(posts) {
  const publishedPosts = (posts || []).filter((post) =>
    post?.publishedAt || confirmedPublicationStatus(post?.status)
  );
  for (const post of publishedPosts) {
    await rememberPublishedCalendarTask(post).catch(() => {});
  }
}

function normalizePublicOrigin(value) {
  const origin = String(value || "").trim().replace(/\/+$/, "");
  if (!origin) return "";
  if (/^https?:\/\//i.test(origin)) return origin;
  return `https://${origin}`;
}

function deriveBlogArticlesApiUrl(value = "") {
  try {
    const url = new URL(String(value || "https://aeternal-flow.es/api/publicar.php").trim());
    url.pathname = /\/api\/publicar\.php$/i.test(url.pathname)
      ? url.pathname.replace(/\/api\/publicar\.php$/i, "/api/articulos.php")
      : "/api/articulos.php";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "https://aeternal-flow.es/api/articulos.php";
  }
}

function publicOrigin(req) {
  if (configuredPublicOrigin) return configuredPublicOrigin;
  if (!req) return "";
  return `${req.protocol}://${req.get("host")}`;
}

function mediaExtension(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  return null;
}

function ftpUploadConfigured() {
  return Boolean(ftpHost && ftpUser && ftpPassword && ftpRemoteDir && instagramImageBaseUrl);
}

function hostedInstagramMediaName({ requestedName = "", scheduledAt = "", extension = "png" } = {}) {
  const requested = path.basename(String(requestedName || "").trim());
  if (/^20\d{2}[-_]\d{2}[-_]\d{2}\.[a-z0-9]+$/i.test(requested)) return requested;
  if (/^\d+\.[a-z0-9]+$/i.test(requested)) return requested;
  const day = dateKey(scheduledAt || new Date());
  return `${day}.${extension}`;
}

async function uploadInstagramMediaToFtp({ bytes, fileName }) {
  if (!ftpUploadConfigured()) {
    throw new Error("Faltan variables FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_REMOTE_DIR o INSTAGRAM_IMAGE_BASE_URL en Railway.");
  }
  const client = new ftp.Client(30000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: ftpHost,
      port: ftpPort,
      user: ftpUser,
      password: ftpPassword,
      secure: ftpSecure,
    });
    await client.ensureDir(ftpRemoteDir);
    await client.uploadFrom(Readable.from(bytes), fileName);
  } finally {
    client.close();
  }
  return `${instagramImageBaseUrl}${encodeURIComponent(fileName)}`;
}

function safeLibraryName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function libraryFileKind(fileName) {
  if (/\.(jpe?g|png|webp|gif)$/i.test(fileName)) return "image";
  if (/\.(mp4|webm|mov)$/i.test(fileName)) return "video";
  if (/\.(txt|md)$/i.test(fileName)) return "text";
  return "";
}

function libraryFileDate(fileName) {
  const match = String(fileName).match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function safeLibraryFileName(value, fallbackExtension = "") {
  const parsed = path.parse(String(value || ""));
  const extension = (parsed.ext || fallbackExtension || "").toLowerCase();
  const base = (parsed.name || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 .@()+=,-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "archivo";
  return `${base}${extension}`;
}

async function publicationLibraryFolders(targetId) {
  const safeTarget = safeLibraryName(targetId || "instagram");
  return [
    path.join(publicationLibraryDirectory, safeTarget),
    path.join(dataDirectory, safeTarget),
  ];
}

async function findPublicationLibraryFile(targetId, fileName) {
  const safeTarget = safeLibraryName(targetId);
  const safeFile = path.basename(String(fileName || ""));
  if (!safeTarget || !/^[\w .@()+=,-]+\.(jpe?g|png|webp|gif|mp4|webm|mov|txt|md)$/i.test(safeFile)) return null;
  for (const folder of await publicationLibraryFolders(safeTarget)) {
    const fullPath = path.join(folder, safeFile);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isFile()) return { fullPath, stat, safeTarget, safeFile };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function listPublicationLibrary(targetId, origin = "") {
  const safeTarget = safeLibraryName(targetId || "instagram");
  const byName = new Map();
  for (const folder of await publicationLibraryFolders(safeTarget)) {
    let entries = [];
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const kind = libraryFileKind(entry.name);
      if (!kind || byName.has(entry.name)) continue;
      const fullPath = path.join(folder, entry.name);
      const stat = await fs.stat(fullPath);
      const item = {
        id: `${safeTarget}:${entry.name}`,
        targetId: safeTarget,
        name: entry.name,
        kind,
        date: libraryFileDate(entry.name),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        url: `${origin}/media/publication-library/${encodeURIComponent(safeTarget)}/${encodeURIComponent(entry.name)}`,
        text: "",
      };
      if (kind === "text") {
        item.text = (await fs.readFile(fullPath, "utf8")).slice(0, 4000);
      }
      byName.set(entry.name, item);
    }
  }
  return [...byName.values()].sort((left, right) => {
    const dateCompare = (left.date || "9999-99-99").localeCompare(right.date || "9999-99-99");
    return dateCompare || left.name.localeCompare(right.name);
  });
}

async function listUploadedPublicationMedia(origin = "") {
  let entries = [];
  try {
    entries = await fs.readdir(publicationMediaDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const kind = libraryFileKind(entry.name);
    if (!["image", "video"].includes(kind)) continue;
    const fullPath = path.join(publicationMediaDirectory, entry.name);
    const stat = await fs.stat(fullPath);
    items.push({
      id: `uploaded:${entry.name}`,
      targetId: "uploads",
      name: entry.name,
      kind,
      date: libraryFileDate(entry.name),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      url: `${origin}/media/publications/${encodeURIComponent(entry.name)}`,
      source: "uploads",
    });
  }
  return items.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function cleanGroups(value) {
  const groups = Array.isArray(value?.groups)
    ? value.groups.slice(0, 30).map((group) => ({
        id: String(group.id || crypto.randomUUID()).slice(0, 80),
        name: String(group.name || "").trim().slice(0, 60),
        color: /^#[0-9a-f]{6}$/i.test(group.color) ? group.color : "#8c8277",
      })).filter((group) => group.name)
    : [];
  const groupIds = new Set(groups.map((group) => group.id));
  const assignments = Object.fromEntries(
    Object.entries(value?.assignments || {})
      .filter(([workflowId, groupId]) => workflowId && groupIds.has(groupId))
      .map(([workflowId, groupId]) => [String(workflowId).slice(0, 120), groupId]),
  );
  return { groups, assignments };
}

async function n8n(pathname, options = {}) {
  const response = await fetch(`${n8nUrl}/api/v1${pathname}`, {
    ...options,
    headers: {
      "X-N8N-API-KEY": n8nApiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    const rawMessage = body?.message || `n8n respondió ${response.status}`;
    const cleanMessage = stripMarkup(rawMessage).replace(/\s+/g, " ").trim();
    const error = new Error(cleanMessage.slice(0, 260) || `n8n respondió ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function checkUrl(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.message,
      url,
      checkedAt: new Date().toISOString(),
    };
  }
}

function webhookUrl(value) {
  if (/^https?:\/\//i.test(String(value || ""))) return String(value);
  if (!n8nUrl) throw new Error("N8N_URL no configurada");
  return `${n8nUrl}${String(value || "").startsWith("/") ? "" : "/"}${value}`;
}

async function callN8nWebhook(webhook, payload, timeoutMs = 150000) {
  const response = await fetch(webhookUrl(webhook), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: stripMarkup(text).replace(/\s+/g, " ").trim().slice(0, 500) };
  }
  if (!response.ok || body?.ok === false) {
    const message = body?.error || body?.message || `n8n respondió ${response.status}`;
    const error = new Error(String(message).slice(0, 500));
    error.status = response.status || 502;
    throw error;
  }
  return body;
}

function editorialBrainEnabled() {
  return Boolean(editorialBrainUrl && editorialBrainToken);
}

async function callEditorialBrain(pathname, options = {}) {
  if (!editorialBrainEnabled()) throw new Error("EDITORIAL_BRAIN_URL no configurado");
  const response = await fetch(`${editorialBrainUrl}${pathname.startsWith("/") ? "" : "/"}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${editorialBrainToken}`,
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || 150000),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || `Editorial Brain respondió ${response.status}` };
  }
  if (!response.ok || body?.ok === false) {
    const error = new Error(body?.error || body?.message || `Editorial Brain respondió ${response.status}`);
    error.status = response.status || 502;
    throw error;
  }
  return body;
}

async function queryEditorialBrain(context = {}) {
  if (!editorialBrainEnabled()) {
    const memory = await readRagMemory();
    const memoryPayload = generatorMemoryPayload(memory);
    return {
      memory: memoryPayload,
      instruction: generatorMemoryInstruction(memoryPayload),
      source: "flow-console-local-rag",
    };
  }
  return callEditorialBrain("/api/brain/query", {
    method: "POST",
    body: JSON.stringify({
      app: "flow-console",
      ...context,
    }),
  });
}

async function rememberEditorialBrainUsage(memoryPayload) {
  if (!editorialBrainEnabled()) return markCurrentRagMemoryUsed(memoryPayload);
  const result = await callEditorialBrain("/api/brain/usage", {
    method: "POST",
    body: JSON.stringify({ memory: memoryPayload }),
  });
  return result.memory || memoryPayload;
}

async function rememberEditorialBrainFeedback(feedback) {
  if (!editorialBrainEnabled()) return rememberGeneratorFeedback(feedback);
  return callEditorialBrain("/api/brain/feedback", {
    method: "POST",
    body: JSON.stringify({
      ...feedback,
      context: {
        ...(feedback?.context || {}),
        app: "flow-console",
      },
    }),
  });
}

function cleanRagInput(value) {
  const type = ["text", "url", "file"].includes(value?.inputType) ? value.inputType : "text";
  const project = String(value?.project || "").trim().slice(0, 80);
  const description = String(value?.description || value?.descripcion || value?.contextDescription || "").trim().slice(0, 1200);
  const text = String(value?.text || "").trim().slice(0, 300000);
  const url = safeUrl(value?.url);
  const file = value?.file && typeof value.file === "object"
    ? {
        name: String(value.file.name || "archivo").slice(0, 180),
        type: String(value.file.type || "application/octet-stream").slice(0, 120),
        size: Number(value.file.size) || 0,
        dataUrl: String(value.file.dataUrl || "").slice(0, 12 * 1024 * 1024),
      }
    : null;
  if (type === "text" && !text) throw new Error("Pega texto o una nota antes de valorar");
  if (type === "url" && !url) throw new Error("Introduce una URL http(s) válida");
  if (type === "file" && !file?.dataUrl) throw new Error("Sube un archivo antes de valorar");
  const urlProfile = url ? classifyTrainingUrl(url) : null;
  return { inputType: type, project: project || null, description, text, url, file, urlProfile };
}

function classifyTrainingUrl(value) {
  const url = safeUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  const image = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url);
  const youtube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host);
  const youtubeChannel = youtube && (/\/(@|channel\/|c\/|user\/)/i.test(parsed.pathname) || pathname === "/");
  const youtubeVideo = youtube && (host === "youtu.be" || pathname === "/watch" || pathname.startsWith("/shorts/"));
  const visualGallery = /(^|\.)pinterest\./.test(host) || /\/search\/pins|\/pin\//.test(pathname);
  const socialProfile = /(^|\.)(instagram\.com|tiktok\.com|linkedin\.com|substack\.com|medium\.com)$/.test(host)
    && pathname.split("/").filter(Boolean).length <= 2;
  if (image) {
    return {
      kind: "image_url",
      label: "Imagen por URL",
      depth: "single_item",
      instruction: "Trata la URL como imagen. Usa vision/OCR si n8n lo tiene: describe contenido, texto visible, estilo visual y posibles temas; no inventes contexto externo.",
    };
  }
  if (youtubeChannel) {
    return {
      kind: "youtube_channel",
      label: "Canal de YouTube",
      depth: "contextual_profile_scan",
      shouldSearchWeb: true,
      profileGoal: "perfil intelectual/publico agregado",
      instruction: "Trata esta URL como perfil/fuente en conjunto, no como pieza aislada ni video por video. Busca contexto ligero en internet si tienes herramientas: pagina oficial/canal, descripcion/about, bio, web asociada, obras, entrevistas, temas recurrentes, descripciones publicas y fuentes fiables. Puedes usar titulos recientes solo como senales agregadas, no para resumirlos. No hagas crawling masivo. Devuelve tags claros de temas, ideas, postura/politicas, estilo retorico, obsesiones, sesgos probables y limites de confianza, con evidencias breves.",
    };
  }
  if (youtubeVideo) {
    return {
      kind: "youtube_video",
      label: "Video de YouTube",
      depth: "single_item",
      instruction: "Analiza solo este video: titulo, descripcion y transcripcion si existe. Extrae tesis, postura del autor, ideas reutilizables y estilo. No hagas resumen largo.",
    };
  }
  if (visualGallery) {
    return {
      kind: "visual_gallery",
      label: "Galeria visual",
      depth: "visual_style_reference",
      shouldSearchWeb: true,
      profileGoal: "referencia visual para prompts de imagen",
      instruction: "Trata esta URL como galeria o referencia visual, no como articulo. Si hay descripcion humana, combinala con la URL para inferir autor/obra/tema. Extrae rasgos reutilizables para generar imagenes: motivos visuales, composicion, paleta, atmosfera, tecnica, textura, tipo de figura, simbolos, ritmo, encuadre y restricciones. Si el referente es un artista vivo, evita proponer copia literal 'in the style of'; convierte la referencia en descriptores visuales neutrales y tags de prompt.",
    };
  }
  if (socialProfile) {
    return {
      kind: "social_profile",
      label: "Perfil social",
      depth: "contextual_profile_scan",
      shouldSearchWeb: true,
      profileGoal: "perfil intelectual/publico agregado",
      instruction: "Trata esta URL como cuenta/persona/fuente en conjunto, no como post aislado ni publicacion por publicacion. Busca contexto ligero en internet si tienes herramientas: perfil oficial, bio, web asociada, obras, entrevistas, temas recurrentes, descripciones publicas, publicaciones visibles como senales agregadas y fuentes fiables. No rastrees todo el historial. Extrae tags claros de temas, ideas, postura/politicas, tono, estilo retorico, sesgos probables, audiencia, criterios visibles y limites de confianza, con evidencias breves.",
    };
  }
  return {
    kind: "web_page",
    label: "Pagina web",
    depth: "whole_page",
    instruction: "Trata esta URL generica como pagina completa disponible, no como perfil, video ni imagen aislada. Extrae y valora el contenido de la pagina en su totalidad razonable: tema, tesis, datos, postura, estilo, autor/fuente si aparece, utilidad para el generador y posibles restricciones. Evita resumen largo.",
  };
}

function dataUrlBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  return match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
}

async function enrichRagInput(input) {
  if (input.inputType !== "file" || input.text) return input;
  const bytes = dataUrlBuffer(input.file?.dataUrl);
  if (!bytes?.length) return input;
  const mimeType = input.file?.type || "";
  const name = input.file?.name || "";
  if (mimeType === "application/pdf" || /\.pdf$/i.test(name)) {
    const parser = new PDFParse({ data: bytes });
    try {
      const parsed = await parser.getText();
      return { ...input, text: String(parsed.text || "").trim().slice(0, 300000) };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (/^text\//.test(mimeType) || /\.(txt|md|csv|json|xml)$/i.test(name)) {
    return { ...input, text: bytes.toString("utf8").trim().slice(0, 300000) };
  }
  return input;
}

function cleanGeneratorFile(value) {
  if (!value || typeof value !== "object") return null;
  const name = String(value.name || "archivo").slice(0, 180);
  const type = String(value.type || "application/octet-stream").slice(0, 80);
  const dataUrl = String(value.dataUrl || "");
  if (!dataUrl || !dataUrlBuffer(dataUrl)?.length) return null;
  return {
    name,
    type,
    size: Number(value.size || 0),
    dataUrl: dataUrl.slice(0, 40 * 1024 * 1024),
  };
}

async function enrichGeneratorBody(body) {
  const materialTipo = String(body?.materialTipo || "");
  const file = cleanGeneratorFile(body?.materialFile || body?.material_file);
  const visualMaterial = ["Imagen", "Foto"].includes(materialTipo);
  if (!file || !["Imagen", "Foto", "PDF"].includes(materialTipo)) return { body, file: null, extractedText: "" };
  const bytes = dataUrlBuffer(file.dataUrl);
  const name = file.name || "";
  const mimeType = file.type || "";
  let extractedText = "";
  if (materialTipo === "PDF" || mimeType === "application/pdf" || /\.pdf$/i.test(name)) {
    const parser = new PDFParse({ data: bytes });
    try {
      const parsed = await parser.getText();
      extractedText = String(parsed.text || "").trim().slice(0, 120000);
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  const materialParts = [
    String(body?.material || "").trim(),
    extractedText ? `\n\nTexto extraído del PDF ${name}:\n${extractedText}` : "",
  ].filter(Boolean);
  const mediaInstruction = visualMaterial
    ? [
        `Hay una ${materialTipo === "Foto" ? "foto" : "imagen"} adjunta en material_file.dataUrl.`,
        "Analiza visualmente la foto o imagen antes de escribir: elementos visibles, composición, época/estética sugerida, texto legible, relación con las notas del usuario y tesis que permite defender.",
        "No te limites a resumir el texto del usuario ni a listar oportunidades obvias. Convierte la imagen en argumento.",
        "Si el usuario pide analizar, entrega criterio editorial útil y una dirección de publicación. Si pide crear o publicar, entrega texto listo para usar.",
        "No digas que no puedes ver la imagen si el flujo/modelo tiene visión; si el modelo no soporta visión, responde indicando que falta análisis visual real.",
      ].join(" ")
    : extractedText
      ? `El PDF ${name} ya tiene texto extraído en material. Basa el contenido en ese texto, no solo en el nombre del archivo.`
      : `Hay un PDF adjunto en material_file.dataUrl, pero no se pudo extraer texto. Intenta procesarlo en el flujo antes de generar.`;
  return {
    body: {
      ...body,
      material: materialParts.join("\n").trim() || body?.material || "",
      material_file: {
        ...file,
        dataUrl: file.dataUrl,
      },
      vision_input: visualMaterial ? {
        name: file.name,
        type: file.type,
        dataUrl: file.dataUrl,
      } : null,
      materialFile: undefined,
      extracted_text: extractedText,
      extractedText,
      pdf_text: extractedText,
      requires_vision_analysis: visualMaterial,
      media_instruction: mediaInstruction,
      instrucciones: [
        mediaInstruction,
        String(body?.instrucciones || "").trim(),
      ].filter(Boolean).join("\n\n"),
    },
    file,
    extractedText,
  };
}

function cleanRagAssessment(value) {
  const allowedTypes = new Set(["ejemplo_copy", "spec", "nota", "prompt_previo"]);
  const allowedProjects = new Set(["generador-contenido"]);
  const allowedUtility = new Set(["alta", "media", "baja"]);
  const allowedChunking = new Set(["por secciones", "por párrafos", "documento completo", "por chunks", "descripcion + OCR"]);
  return {
    tipo: allowedTypes.has(value?.tipo) ? value.tipo : "nota",
    proyecto: allowedProjects.has(value?.proyecto) ? value.proyecto : "generador-contenido",
    resumen: String(value?.resumen || "").trim().slice(0, 1200),
    utilidad_rag: allowedUtility.has(value?.utilidad_rag || value?.utilidad) ? (value.utilidad_rag || value.utilidad) : "media",
    aviso: value?.aviso ? String(value.aviso).trim().slice(0, 1200) : null,
    authorProfile: String(value?.authorProfile || value?.perfil_autor || value?.perfil || "").trim().slice(0, 1600),
    stanceTags: uniqueStrings(value?.stanceTags || value?.stance_tags || value?.postureTags || value?.politicalTags || value?.tags_postura || [], 12),
    evidenceNotes: uniqueStrings(value?.evidenceNotes || value?.evidence_notes || value?.evidencias || [], 6),
    confidence: ["alta", "media", "baja"].includes(value?.confidence || value?.confianza) ? (value.confidence || value.confianza) : "",
    sugerencia_chunking: allowedChunking.has(value?.sugerencia_chunking || value?.chunking)
      ? (value.sugerencia_chunking || value.chunking)
      : "por párrafos",
    tags: Array.isArray(value?.tags)
      ? value.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12)
      : [],
    topics: uniqueStrings(value?.topics || value?.temas || [], 12),
    textPreferences: uniqueStrings(value?.textPreferences || value?.preferencias_texto || value?.preferencias || [], 12),
    styleTags: uniqueStrings(value?.styleTags || value?.estilos || value?.style_tags || [], 12),
    promptHints: uniqueStrings(value?.promptHints || value?.prompt_hints || value?.hints_prompt || [], 12),
    duplicate_of: value?.duplicate_of || value?.duplicado_de || null,
    similarity: Number(value?.similarity || value?.similitud || 0) || null,
  };
}

function extractRagAssessmentCandidate(result) {
  if (Array.isArray(result)) {
    return extractRagAssessmentCandidate(result[0] || {});
  }
  if (!result || typeof result !== "object") return {};
  const json = result.json && typeof result.json === "object" ? result.json : null;
  if (json) return extractRagAssessmentCandidate(json);
  return result.assessment || result.valoracion || result.valoración || result.rag_assessment || result;
}

function assertUsefulRagAssessment(raw, assessment) {
  const rawObject = raw && typeof raw === "object" ? raw : {};
  const rawError = rawObject.error || rawObject.message || rawObject.mensaje || rawObject.statusText;
  const hasExplicitError = rawObject.ok === false || /error|failed|exception|timeout|not found|no encontrado/i.test(String(rawError || ""));
  const evidenceCount = [
    assessment.resumen,
    assessment.authorProfile,
    ...(assessment.tags || []),
    ...(assessment.topics || []),
    ...(assessment.textPreferences || []),
    ...(assessment.styleTags || []),
    ...(assessment.promptHints || []),
    ...(assessment.stanceTags || []),
    ...(assessment.evidenceNotes || []),
  ].map((item) => String(item || "").trim()).filter(Boolean).length;
  if (!hasExplicitError && (assessment.resumen.length >= 12 || evidenceCount >= 3)) return;
  const details = rawError ? ` ${String(rawError).slice(0, 220)}` : "";
  const error = new Error(`La valoración RAG no devolvió datos útiles.${details} Revisa el workflow n8n /rag/valorar.`);
  error.status = 502;
  throw error;
}

function cleanExecution(execution) {
  const startedAt = execution.startedAt || execution.started_at || null;
  const stoppedAt = execution.stoppedAt || execution.stopped_at || null;
  return {
    id: String(execution.id),
    workflowId: execution.workflowId,
    status: execution.status || (execution.finished ? "success" : "running"),
    mode: execution.mode,
    startedAt,
    stoppedAt,
    finished: Boolean(execution.finished),
    retryOf: execution.retryOf || null,
  };
}

function errorSummary(execution) {
  const error = execution?.data?.resultData?.error;
  if (!error) return null;
  return {
    message: error.message || "Error sin mensaje",
    node: error.node?.name || null,
    description: error.description || null,
  };
}

function stripMarkup(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function collectExecutionItems(execution) {
  const runData = execution?.data?.resultData?.runData || {};
  const items = [];
  for (const [nodeName, runs] of Object.entries(runData)) {
    for (const run of runs || []) {
      for (const output of run?.data?.main || []) {
        for (const item of output || []) {
          if (item?.json && typeof item.json === "object") {
            items.push({ nodeName, json: item.json });
          }
        }
      }
    }
  }
  return items;
}

function candidateScore({ nodeName, json }) {
  let score = /format|preparar correo|confirmar|marcar/i.test(nodeName) ? 3 : 0;
  for (const [key, value] of Object.entries(json)) {
    if (/email_subject|telegram_message|email_html/i.test(key) && typeof value === "string") score += 5;
    else if (/draft|answer|output/i.test(key) && value) score += 4;
    else if (key === "variantes" && Array.isArray(value) && value.length) score += 5;
    else if (/title|topic|question|url|message/i.test(key)) score += 1;
  }
  return score;
}

function noticeFromItem(execution, workflow, candidate, index, state) {
  const json = candidate?.json || {};
  const error = errorSummary(execution);
  const subject = String(
    json.email_subject
      || json.title
      || json.topic
      || json.question
      || (error ? `Error en ${workflow.name}` : `${workflow.name} · ejecución completada`),
  ).trim().slice(0, 220);
  const rawBody = json.email_html
    || json.telegram_message
    || json.draft
    || json.answer
    || json.body
    || json.output
    || (Array.isArray(json.variantes) ? json.variantes.join("\n\n---\n\n") : "")
    || error?.description
    || error?.message
    || `Ejecución ${execution.status}. No hay un mensaje final estructurado en esta ejecución.`;
  const body = stripMarkup(typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody, null, 2)).slice(0, 50000);
  const embeddedUrls = typeof rawBody === "string"
    ? [...rawBody.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((match) => match[0])
    : [];
  const urls = [
    json.hn_url,
    json.external_url,
    json.post_url,
    json.url,
    ...(Array.isArray(json.urls) ? json.urls : []),
    ...embeddedUrls,
  ].map(safeUrl).filter(Boolean);
  const id = `${execution.id}:${index}`;
  const noticeState = state[id] || {};
  return {
    id,
    executionId: String(execution.id),
    workflowId: workflow.id,
    workflowName: workflow.name,
    subject,
    preview: body.replace(/\s+/g, " ").slice(0, 180),
    body,
    status: noticeState.status || execution.status || "unknown",
    startedAt: execution.startedAt || null,
    stoppedAt: execution.stoppedAt || null,
    sourceNode: candidate?.nodeName || execution?.data?.resultData?.lastNodeExecuted || null,
    channel: json.email_html ? "correo" : json.telegram_message ? "Flow Console" : error ? "error" : "n8n",
    urls: [...new Set(urls)].slice(0, 8),
    read: Boolean(noticeState.read),
    archived: Boolean(noticeState.archived),
    trashed: Boolean(noticeState.trashed),
    done: noticeState.status === "managed",
    canRetry: ["error", "crashed", "canceled"].includes(execution.status),
    canRun: Boolean(runnableWorkflows[workflow.id]),
    formUrl: workflow.formUrl || null,
  };
}

function extractNotices(executions, workflows, state) {
  const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const notices = [];
  for (const execution of executions) {
    const workflow = workflowsById.get(execution.workflowId);
    if (!workflow?.active) continue;
    const items = collectExecutionItems(execution)
      .sort((left, right) => candidateScore(right) - candidateScore(left));
    const bestScore = items.length ? candidateScore(items[0]) : 0;
    const candidates = bestScore >= 5
      ? items.filter((item) => candidateScore(item) === bestScore).slice(0, 20)
      : errorSummary(execution) ? [null] : [];
    const seen = new Set();
    candidates.forEach((candidate, index) => {
      const notice = noticeFromItem(execution, workflow, candidate, index, state);
      const signature = `${notice.executionId}:${notice.subject}:${notice.body.slice(0, 500)}`;
      if (!seen.has(signature)) {
        seen.add(signature);
        notices.push(notice);
      }
    });
  }
  return notices.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
}

app.get("/api/session", (req, res) => {
  res.json({ authenticated: validSession(req), configured: configured() });
});

function healthcheckResponse(_, res) {
  res.status(200).json({ ok: true, configured: configured() });
}

app.get("/health", healthcheckResponse);
app.head("/", healthcheckResponse);
app.head("/health", healthcheckResponse);
app.get("/healthz", healthcheckResponse);
app.head("/healthz", healthcheckResponse);
app.get("/api/health", healthcheckResponse);
app.head("/api/health", healthcheckResponse);

app.post("/api/login", (req, res) => {
  if (!configured()) {
    return res.status(503).json({ error: "Faltan variables de entorno del servidor" });
  }
  if (!safeEqual(req.body?.password || "", consolePassword)) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  res.setHeader(
    "Set-Cookie",
    `flow_console_session=${createSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${production ? "; Secure" : ""}`,
  );
  res.json({ ok: true });
});

app.post("/api/logout", (_, res) => {
  res.setHeader(
    "Set-Cookie",
    `flow_console_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production ? "; Secure" : ""}`,
  );
  res.json({ ok: true });
});

app.post("/api/routes/compare", requireAuth, async (req, res) => {
  const origin = String(req.body?.origin || "").trim();
  const destination = String(req.body?.destination || "").trim();
  const alternatives = Math.max(1, Math.min(3, Number(req.body?.alternatives || 3)));
  if (!origin || !destination) {
    return res.status(400).json({ error: "Faltan origin y destination" });
  }
  if (!googleMapsApiKey) {
    return res.status(503).json({ error: "Falta GOOGLE_MAPS_API_KEY en el servidor" });
  }
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleMapsApiKey,
        "X-Goog-FieldMask": [
          "routes.duration",
          "routes.distanceMeters",
          "routes.polyline.encodedPolyline",
          "routes.travelAdvisory.tollInfo.estimatedPrice",
          "routes.routeLabels",
        ].join(","),
      },
      body: JSON.stringify({
        origin: routeWaypointFromInput(origin),
        destination: routeWaypointFromInput(destination),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        languageCode: "es-ES",
        units: "METRIC",
        extraComputations: ["TOLLS"],
        computeAlternativeRoutes: alternatives > 1,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || payload?.message || "Google Routes API no respondió correctamente");
      return res.status(502).json({ error: message });
    }
    const routes = Array.isArray(payload.routes) ? payload.routes.slice(0, alternatives) : [];
    return res.json({
      ok: true,
      routes: routes.map((route, index) => {
        const toll = tollAmountFromRoute(route);
        return {
          id: `r${index + 1}`,
          duration: route.duration || "0s",
          durationSeconds: parseDurationSeconds(route.duration),
          distanceMeters: Number(route.distanceMeters || 0),
          tollAmount: toll.tollAmount,
          tollCurrency: toll.tollCurrency,
          polyline: String(route?.polyline?.encodedPolyline || ""),
          labels: Array.isArray(route.routeLabels) ? route.routeLabels : [],
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ error: String(error.message || "No se pudo calcular la ruta") });
  }
});

app.get("/api/routes/autocomplete", requireAuth, async (req, res) => {
  const query = String(req.query?.q || "").trim();
  if (query.length < 3) return res.json({ ok: true, suggestions: [] });
  if (!googleMapsApiKey) {
    return res.status(503).json({ error: "Falta GOOGLE_MAPS_API_KEY en el servidor" });
  }
  try {
    const params = new URLSearchParams({
      input: query,
      key: googleMapsApiKey,
      language: "es",
      types: "geocode",
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === "REQUEST_DENIED") {
      const message = String(payload?.error_message || payload?.status || "No se pudo autocompletar direcciones");
      return res.status(502).json({ error: message });
    }
    const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
    return res.json({
      ok: true,
      suggestions: predictions.slice(0, 6).map((item) => ({
        placeId: String(item.place_id || ""),
        description: String(item.description || ""),
        mainText: String(item?.structured_formatting?.main_text || ""),
        secondaryText: String(item?.structured_formatting?.secondary_text || ""),
      })).filter((item) => item.placeId && item.description),
    });
  } catch (error) {
    return res.status(500).json({ error: String(error.message || "No se pudo autocompletar direcciones") });
  }
});

app.get("/api/oauth/youtube/url", requireAuth, (req, res) => {
  try {
    res.json({
      ok: true,
      url: youtubeOAuthUrl(req),
      redirectUri: youtubeOAuthRedirectUri(req),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/oauth/youtube/status", requireAuth, (req, res) => {
  const { clientId, clientSecret, refreshToken } = youtubeOAuthConfig();
  res.json({
    ok: true,
    configured: Boolean(clientId && clientSecret && refreshToken),
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    hasRefreshToken: Boolean(refreshToken),
    redirectUri: youtubeOAuthRedirectUri(req),
    privacyStatus: youtubePrivacyStatus,
  });
});

app.get("/api/oauth/pinterest/status", requireAuth, (_, res) => {
  res.json({
    ok: true,
    configured: Boolean(pinterestAccessToken && pinterestBoardId),
    hasAccessToken: Boolean(pinterestAccessToken),
    hasBoardId: Boolean(pinterestBoardId),
    hasLinkUrl: Boolean(pinterestLinkUrl),
  });
});

app.get("/api/publications/channels/status", requireAuth, async (_, res) => {
  const worker = await externalWorkerHealth();
  const youtube = youtubeOAuthConfig();
  let youtubeAccessOk = false;
  let youtubeError = "";
  if (youtube.clientId && youtube.clientSecret && youtube.refreshToken) {
    try {
      await youtubeAccessToken();
      youtubeAccessOk = true;
    } catch (error) {
      youtubeError = error.message;
    }
  }
  const channels = [
    {
      id: "instagram",
      name: "Instagram",
      level: worker.ok && worker.loggedIn ? "active" : "attention",
      label: worker.ok && worker.loggedIn ? "Sesión OK" : worker.ok ? "Sesión a revisar" : "Worker caído",
      delivery: "Worker navegador",
      detail: worker.ok
        ? (worker.loggedIn ? "Worker disponible con sesión compartida." : "Worker responde, pero no confirma sesión.")
        : worker.error,
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      level: worker.ok && worker.loggedIn ? "active" : "attention",
      label: worker.ok && worker.loggedIn ? "Sesión OK" : worker.ok ? "Sesión a revisar" : "Worker caído",
      delivery: "Worker navegador",
      detail: "Artículo con imagen validado; la sesión depende del storage compartido del worker.",
    },
    {
      id: "youtube",
      name: "YouTube",
      level: youtubeAccessOk ? "active" : "attention",
      label: youtubeAccessOk ? "API OK" : "OAuth pendiente",
      delivery: "YouTube Data API",
      detail: youtubeAccessOk
        ? `Publica con privacidad ${youtubePrivacyStatus}.`
        : youtubeError || "Faltan credenciales OAuth o refresh token.",
    },
    {
      id: "tiktok",
      name: "TikTok",
      level: worker.ok && worker.loggedIn ? "assisted" : "attention",
      label: worker.ok && worker.loggedIn ? "Sesión OK · Asistido" : "Worker a revisar",
      delivery: "Worker asistido",
      detail: "Prepara la subida para revisión humana; no se presenta como publicación garantizada.",
    },
    {
      id: "pinterest",
      name: "Pinterest",
      level: pinterestAccessToken && pinterestBoardId ? "active" : "pending",
      label: pinterestAccessToken && pinterestBoardId ? "Pinterest OK" : "Pendiente de credenciales",
      delivery: "Pinterest API",
      detail: pinterestAccessToken && pinterestBoardId
        ? "Publicación directa por API configurada."
        : "Añade PINTEREST_ACCESS_TOKEN y PINTEREST_BOARD_ID en Railway.",
    },
    {
      id: "blog",
      name: "Blog",
      level: aeternalBlogApiToken ? "active" : "attention",
      label: aeternalBlogApiToken ? "API OK" : "Token pendiente",
      delivery: "API blog",
      detail: aeternalBlogApiToken ? "Publica en Aeternal Flow por API." : "Falta AETERNAL_BLOG_API_TOKEN.",
    },
  ];
  res.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    channels,
  });
});

app.post("/api/publications/preflight", requireAuth, async (req, res) => {
  try {
    const targets = await readPublicationTargets();
    const requestedTargetId = String(req.body?.targetId || req.body?.target?.id || "instagram");
    const target = targets.find((item) => item.id === requestedTargetId);
    if (!target) return res.status(400).json({ error: "Destino de publicación desconocido" });
    const payload = cleanPublicationPayload({ ...req.body, action: req.body?.action || "publish", target });
    res.json({ ok: true, ...(await publicationPreflight(payload)) });
  } catch (error) {
    res.status(500).json({ area: "Publicaciones", error: `No se pudo diagnosticar la publicación: ${error.message}` });
  }
});

app.get("/oauth/youtube/start", requireAuth, (req, res) => {
  try {
    res.redirect(youtubeOAuthUrl(req));
  } catch (error) {
    res.status(500).type("html").send(`<!doctype html><meta charset="utf-8"><title>YouTube OAuth</title><pre>${escapeHtml(error.message)}</pre>`);
  }
});

app.get("/oauth/youtube/callback", async (req, res) => {
  try {
    if (!validOauthState(req.query?.state)) {
      return res.status(401).type("html").send("<!doctype html><meta charset=\"utf-8\"><title>YouTube OAuth</title><h1>Autorización caducada</h1><p>Vuelve a iniciar YouTube desde Flow Console.</p>");
    }
    if (req.query?.error) {
      throw new Error(String(req.query.error_description || req.query.error));
    }
    const code = String(req.query?.code || "").trim();
    if (!code) throw new Error("Google no devolvió código OAuth.");
    const result = await exchangeYouTubeOAuthCode(req, code);
    const refreshToken = String(result.refresh_token || "").trim();
    const body = refreshToken
      ? `YOUTUBE_REFRESH_TOKEN=${refreshToken}`
      : JSON.stringify(result, null, 2);
    res.type("html").send(`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YouTube autorizado</title>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f1e8;color:#241f19;margin:0;padding:40px;line-height:1.45}
main{max-width:860px;margin:auto}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;border:1px solid #d8cec0;border-radius:8px;padding:18px}
.warn{color:#7a3d18}
</style>
<main>
<h1>YouTube autorizado</h1>
${refreshToken ? "<p>Copia este valor en las variables de Railway de Flow Console.</p>" : "<p class=\"warn\">Google no devolvió refresh token. Repite desde Flow Console y acepta el consentimiento.</p>"}
<pre>${escapeHtml(body)}</pre>
<p>Después configura también <code>YOUTUBE_CLIENT_ID</code>, <code>YOUTUBE_CLIENT_SECRET</code> y <code>YOUTUBE_PRIVACY_STATUS=public</code>.</p>
</main>`);
  } catch (error) {
    res.status(500).type("html").send(`<!doctype html><meta charset="utf-8"><title>YouTube OAuth</title><h1>No se pudo autorizar YouTube</h1><pre>${escapeHtml(error.message)}</pre>`);
  }
});

app.get("/oauth/search-console/start", requireAuth, (req, res) => {
  try {
    res.redirect(searchConsoleOAuthUrl(req));
  } catch (error) {
    res.status(500).type("html").send(`<!doctype html><meta charset="utf-8"><title>Search Console OAuth</title><pre>${escapeHtml(error.message)}</pre>`);
  }
});

app.get("/oauth/search-console/callback", async (req, res) => {
  try {
    if (!validOauthState(req.query?.state)) {
      return res.status(401).type("html").send("<!doctype html><meta charset=\"utf-8\"><title>Search Console OAuth</title><h1>Autorización caducada</h1><p>Vuelve a iniciar Search Console desde Flow Console.</p>");
    }
    if (req.query?.error) {
      throw new Error(String(req.query.error_description || req.query.error));
    }
    const code = String(req.query?.code || "").trim();
    if (!code) throw new Error("Google no devolvió código OAuth.");
    const result = await exchangeSearchConsoleOAuthCode(req, code);
    const refreshToken = String(result.refresh_token || "").trim();
    const body = refreshToken
      ? `SEARCH_CONSOLE_REFRESH_TOKEN=${refreshToken}`
      : JSON.stringify(result, null, 2);
    res.type("html").send(`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Search Console autorizado</title>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f1e8;color:#241f19;margin:0;padding:40px;line-height:1.45}
main{max-width:860px;margin:auto}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;border:1px solid #d8cec0;border-radius:8px;padding:18px}
.warn{color:#7a3d18}
</style>
<main>
<h1>Search Console autorizado</h1>
${refreshToken ? "<p>Copia este valor en las variables de Railway de Flow Console.</p>" : "<p class=\"warn\">Google no devolvió refresh token. Repite desde Flow Console y acepta el consentimiento.</p>"}
<pre>${escapeHtml(body)}</pre>
<p>Configura también <code>SEARCH_CONSOLE_SITE_URL</code> con la propiedad exacta, por ejemplo <code>sc-domain:aeternal-flow.es</code> o <code>https://aeternal-flow.es/</code>.</p>
</main>`);
  } catch (error) {
    res.status(500).type("html").send(`<!doctype html><meta charset="utf-8"><title>Search Console OAuth</title><h1>No se pudo autorizar Search Console</h1><pre>${escapeHtml(error.message)}</pre>`);
  }
});

app.get("/oauth/ga4/start", requireAuth, (req, res) => {
  try {
    res.redirect(ga4OAuthUrl(req));
  } catch (error) {
    res.status(500).type("html").send(`<!doctype html><meta charset="utf-8"><title>GA4 OAuth</title><pre>${escapeHtml(error.message)}</pre>`);
  }
});

app.get("/oauth/ga4/callback", async (req, res) => {
  try {
    if (!validOauthState(req.query?.state)) {
      return res.status(401).type("html").send("<!doctype html><meta charset=\"utf-8\"><title>GA4 OAuth</title><h1>Autorización caducada</h1><p>Vuelve a iniciar GA4 desde Flow Console.</p>");
    }
    if (req.query?.error) {
      throw new Error(String(req.query.error_description || req.query.error));
    }
    const code = String(req.query?.code || "").trim();
    if (!code) throw new Error("Google no devolvió código OAuth.");
    const result = await exchangeGa4OAuthCode(req, code);
    const refreshToken = String(result.refresh_token || "").trim();
    const body = refreshToken
      ? `GA4_REFRESH_TOKEN=${refreshToken}`
      : JSON.stringify(result, null, 2);
    res.type("html").send(`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GA4 autorizado</title>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f1e8;color:#241f19;margin:0;padding:40px;line-height:1.45}
main{max-width:860px;margin:auto}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;border:1px solid #d8cec0;border-radius:8px;padding:18px}
.warn{color:#7a3d18}
</style>
<main>
<h1>GA4 autorizado</h1>
${refreshToken ? "<p>Copia este valor en las variables de Railway de Flow Console.</p>" : "<p class=\"warn\">Google no devolvió refresh token. Repite desde Flow Console y acepta el consentimiento.</p>"}
<pre>${escapeHtml(body)}</pre>
<p>Configura también <code>GA4_PROPERTY_ID</code> con el ID numérico de tu propiedad GA4.</p>
</main>`);
  } catch (error) {
    res.status(500).type("html").send(`<!doctype html><meta charset="utf-8"><title>GA4 OAuth</title><h1>No se pudo autorizar GA4</h1><pre>${escapeHtml(error.message)}</pre>`);
  }
});

app.get("/api/groups", requireAuth, async (_, res) => {
  try {
    res.json(cleanGroups(await readGroups()));
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer los grupos: ${error.message}` });
  }
});

app.put("/api/groups", requireAuth, async (req, res) => {
  try {
    const groups = cleanGroups(req.body);
    await writeGroups(groups);
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: `No se pudieron guardar los grupos: ${error.message}` });
  }
});

app.get("/api/workflows", requireAuth, async (_, res) => {
  try {
    const [workflowResponse, executionResponse] = await Promise.all([
      n8n("/workflows?limit=100&excludePinnedData=true"),
      n8n("/executions?limit=100&includeData=false"),
    ]);
    const executions = (executionResponse?.data || []).map(cleanExecution);
    const latestByWorkflow = new Map();
    for (const execution of executions) {
      if (!latestByWorkflow.has(execution.workflowId)) {
        latestByWorkflow.set(execution.workflowId, execution);
      }
    }
    const workflows = (workflowResponse?.data || []).map((workflow) => {
      const formTrigger = (workflow.nodes || []).find((node) => node.type === "n8n-nodes-base.formTrigger");
      return {
      id: workflow.id,
      name: workflow.name,
      active: Boolean(workflow.active || workflow.activeVersionId),
      archived: Boolean(workflow.isArchived),
      tags: (workflow.tags || []).map((tag) => tag.name || tag),
      updatedAt: workflow.updatedAt,
      triggerCount: workflow.triggerCount || 0,
      lastExecution: latestByWorkflow.get(workflow.id) || null,
      editorUrl: `${n8nUrl}/workflow/${workflow.id}`,
      formUrl: formTrigger?.parameters?.path
        ? `${n8nUrl}/form/${formTrigger.parameters.path}`
        : null,
      canRun: Boolean(runnableWorkflows[workflow.id]),
    };
    });
    res.json({ workflows, n8nUrl });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.get("/api/notices", requireAuth, async (_, res) => {
  try {
    const [workflowResponse, executionResponse, state] = await Promise.all([
      n8n("/workflows?limit=100&excludePinnedData=false"),
      n8n("/executions?limit=75&includeData=true"),
      readNoticesState(),
    ]);
    const workflows = (workflowResponse?.data || []).map((workflow) => {
      const formTrigger = (workflow.nodes || []).find((node) => node.type === "n8n-nodes-base.formTrigger");
      return {
        id: workflow.id,
        name: workflow.name,
        active: Boolean(workflow.active || workflow.activeVersionId),
        canRun: Boolean(runnableWorkflows[workflow.id]),
        formUrl: formTrigger?.parameters?.path
          ? `${n8nUrl}/form/${formTrigger.parameters.path}`
          : null,
      };
    });
    const notices = extractNotices(executionResponse?.data || [], workflows, state);
    res.json({ notices, workflows });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.get("/api/forums", requireAuth, async (_, res) => {
  try {
    res.json(await readForumConfig());
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer los foros: ${error.message}` });
  }
});

app.post("/api/forums", requireAuth, async (req, res) => {
  try {
    const config = await readForumConfig();
    const incoming = cleanForumConfigItem(req.body || {});
    if (!incoming.name) {
      res.status(400).json({ error: "El foro necesita nombre." });
      return;
    }
    const existingIndex = incoming.workflowId
      ? config.forums.findIndex((forum) => forum.workflowId === incoming.workflowId)
      : -1;
    const nextForum = { ...incoming, id: existingIndex >= 0 ? config.forums[existingIndex].id : incoming.id, updatedAt: new Date().toISOString() };
    const forums = existingIndex >= 0
      ? config.forums.map((forum, index) => index === existingIndex ? { ...forum, ...nextForum } : forum)
      : [...config.forums, nextForum];
    const saved = await writeForumConfig({ forums });
    res.status(201).json({ forum: nextForum, forums: saved.forums });
  } catch (error) {
    res.status(500).json({ error: `No se pudo guardar el foro: ${error.message}` });
  }
});

app.patch("/api/forums/:id", requireAuth, async (req, res) => {
  try {
    const config = await readForumConfig();
    const forumId = String(req.params.id || "");
    const index = config.forums.findIndex((forum) => forum.id === forumId);
    if (index < 0) {
      res.status(404).json({ error: "Foro no encontrado." });
      return;
    }
    const nextForum = cleanForumConfigItem({ ...config.forums[index], ...req.body, id: forumId, updatedAt: new Date().toISOString() });
    const saved = await writeForumConfig({ forums: config.forums.map((forum, itemIndex) => itemIndex === index ? nextForum : forum) });
    res.json({ forum: nextForum, forums: saved.forums });
  } catch (error) {
    res.status(500).json({ error: `No se pudo actualizar el foro: ${error.message}` });
  }
});

app.delete("/api/forums/:id", requireAuth, async (req, res) => {
  try {
    const config = await readForumConfig();
    const forumId = String(req.params.id || "");
    const saved = await writeForumConfig({ forums: config.forums.filter((forum) => forum.id !== forumId) });
    res.json(saved);
  } catch (error) {
    res.status(500).json({ error: `No se pudo borrar el foro: ${error.message}` });
  }
});

app.get("/api/calendar/tasks", requireAuth, async (_, res) => {
  try {
    const tasks = await readCalendarTasks();
    res.json({ tasks: tasks.sort((left, right) => `${left.dueDate} ${left.time}`.localeCompare(`${right.dueDate} ${right.time}`)) });
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer las tareas: ${error.message}` });
  }
});

app.post("/api/calendar/tasks", requireAuth, async (req, res) => {
  try {
    const tasks = await readCalendarTasks();
    const createdTasks = repeatedCalendarTasks(req.body);
    tasks.push(...createdTasks);
    await writeCalendarTasks(tasks);
    res.status(201).json({ task: createdTasks[0], tasks: createdTasks });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/calendar/tasks/:id", requireAuth, async (req, res) => {
  try {
    const tasks = await readCalendarTasks();
    const index = tasks.findIndex((task) => task.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Tarea no encontrada" });
    tasks[index] = cleanCalendarTask(req.body, tasks[index]);
    await writeCalendarTasks(tasks);
    res.json({ task: tasks[index] });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/calendar/tasks/:id/series", requireAuth, async (req, res) => {
  try {
    const tasks = await readCalendarTasks();
    const task = tasks.find((item) => item.id === req.params.id);
    if (!task) return res.status(404).json({ error: "Tarea no encontrada" });
    const groupId = task.recurrence?.groupId || task.id;
    const seriesTasks = tasks
      .filter((item) => item.id === task.id || item.recurrence?.groupId === groupId)
      .sort((left, right) => `${left.dueDate} ${left.createdAt}`.localeCompare(`${right.dueDate} ${right.createdAt}`));
    const cleaned = cleanCalendarTask(req.body, task);
    const dayDelta = Math.round((new Date(`${cleaned.dueDate}T12:00:00`) - new Date(`${task.dueDate}T12:00:00`)) / 86400000);
    const now = new Date().toISOString();
    const updatedSeries = tasks.map((item) => {
      const inSeries = item.id === task.id || item.recurrence?.groupId === groupId;
      if (!inSeries) return item;
      const shiftedDate = dayDelta ? dateKey(addCalendarDays(item.dueDate, dayDelta)) : item.dueDate;
      const recurrence = item.recurrence
        ? {
            ...item.recurrence,
            startDate: dayDelta ? dateKey(addCalendarDays(item.recurrence.startDate || seriesTasks[0]?.dueDate || item.dueDate, dayDelta)) : item.recurrence.startDate || seriesTasks[0]?.dueDate || item.dueDate,
            until: item.recurrence.until && dayDelta ? dateKey(addCalendarDays(item.recurrence.until, dayDelta)) : item.recurrence.until || "",
            time: cleaned.time || "",
            weekdays: item.recurrence.type === "weekly"
              ? (item.recurrence.weekdays?.length
                  ? item.recurrence.weekdays.map((day) => ((Number(day) + dayDelta) % 7 + 7) % 7)
                  : [new Date(`${shiftedDate}T12:00:00`).getDay()])
              : item.recurrence.weekdays,
          }
        : item.recurrence;
      return {
        ...item,
        title: cleaned.title,
        notes: cleaned.notes,
        dueDate: shiftedDate,
        time: cleaned.time,
        status: cleaned.status,
        project: cleaned.project,
        recurrence,
        updatedAt: now,
      };
    });
    await writeCalendarTasks(updatedSeries);
    const updatedTask = updatedSeries.find((item) => item.id === task.id);
    res.json({
      task: updatedTask,
      tasks: updatedSeries.filter((item) => item.id === task.id || item.recurrence?.groupId === groupId),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/calendar/notes", requireAuth, async (_, res) => {
  try {
    const notes = await readCalendarNotes();
    res.json({
      notes: notes
        .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
        .slice(0, 100),
    });
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer las notas: ${error.message}` });
  }
});

app.post("/api/calendar/notes", requireAuth, async (req, res) => {
  try {
    const notes = await readCalendarNotes();
    const note = cleanCalendarNote(req.body);
    const nextNotes = [note, ...notes].slice(0, 200);
    await writeCalendarNotes(nextNotes);
    res.status(201).json({ note, notes: nextNotes });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/calendar/notes/:id", requireAuth, async (req, res) => {
  try {
    const notes = await readCalendarNotes();
    const index = notes.findIndex((note) => note.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Nota no encontrada" });
    const note = cleanCalendarNote(req.body, notes[index]);
    notes[index] = note;
    const nextNotes = notes
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .slice(0, 200);
    await writeCalendarNotes(nextNotes);
    res.json({ note, notes: nextNotes });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

async function storeCalendarNoteImage(dataUrlValue, req) {
  const dataUrl = String(dataUrlValue || "");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error("Sube una imagen JPG, PNG, WebP o GIF válida");
  const [, mimeType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("La imagen debe pesar menos de 8 MB");
  const extension = mediaExtension(mimeType);
  if (!extension) throw new Error("Formato de imagen no soportado");
  await fs.mkdir(calendarNoteMediaDirectory, { recursive: true });
  const id = crypto.randomUUID();
  const fileName = `${id}.${extension}`;
  await fs.writeFile(path.join(calendarNoteMediaDirectory, fileName), bytes, { mode: 0o600 });
  return {
    id,
    fileName,
    mimeType,
    size: bytes.length,
    url: `${publicOrigin(req)}/media/notes/${fileName}`,
  };
}

app.post("/api/calendar/notes/media", requireAuth, async (req, res) => {
  try {
    res.status(201).json({ ok: true, image: await storeCalendarNoteImage(req.body?.dataUrl, req) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/calendar/notes/:id", requireAuth, async (req, res) => {
  try {
    const notes = await readCalendarNotes();
    const nextNotes = notes.filter((note) => note.id !== req.params.id);
    if (nextNotes.length === notes.length) return res.status(404).json({ error: "Nota no encontrada" });
    await writeCalendarNotes(nextNotes);
    res.json({ ok: true, notes: nextNotes });
  } catch (error) {
    res.status(500).json({ error: `No se pudo borrar la nota: ${error.message}` });
  }
});

app.post("/api/calendar/tasks/:id/prepare-instagram", requireAuth, async (req, res) => {
  try {
    const tasks = await readCalendarTasks();
    const taskIndex = tasks.findIndex((task) => task.id === req.params.id);
    if (taskIndex === -1) return res.status(404).json({ error: "Tarea no encontrada" });

    const task = tasks[taskIndex];
    if (!isInstagramTask(task)) {
      return res.status(400).json({ error: "Esta tarea no parece ser de Instagram" });
    }

    const posts = await readPublicationPosts();
    const post = findInstagramPostForTask(posts);
    const caption = String(post?.caption || task.notes || task.title || "").trim();
    const instagramUrl = "https://www.instagram.com/";
    const mediaUrl = post ? publicMediaUrl(req, post) : "";
    const desktop = await prepareDesktopInstagram({ caption, instagramUrl, mediaUrl });
    const now = new Date().toISOString();

    const taskUpdate = {
      ...task,
      status: "pending_confirmation",
      updatedAt: now,
      preparedPublication: {
        target: "instagram",
        postId: post?.id || null,
        mediaUrl,
        preparedAt: now,
        desktopAvailable: desktop.desktopAvailable,
      },
    };
    tasks[taskIndex] = taskUpdate;
    await writeCalendarTasks(tasks);

    let updatedPosts = posts;
    let updatedPost = post;
    if (post?.id) {
      updatedPosts = posts.map((item) => {
        if (item.id !== post.id) return item;
        updatedPost = {
          ...item,
          status: "pending_confirmation",
          updatedAt: now,
          assistedPublish: {
            preparedAt: now,
            taskId: task.id,
            desktopAvailable: desktop.desktopAvailable,
          },
        };
        return updatedPost;
      });
      await writePublicationPosts(updatedPosts);
    }

    res.json({
      ok: true,
      task: taskUpdate,
      post: updatedPost,
      posts: updatedPosts.slice(0, 50),
      caption,
      mediaUrl,
      instagramUrl,
      ...desktop,
    });
  } catch (error) {
    res.status(500).json({ error: `No se pudo preparar Instagram: ${error.message}` });
  }
});

app.delete("/api/calendar/tasks", requireAuth, async (_, res) => {
  try {
    await writeCalendarTasks([]);
    res.json({ ok: true, tasks: [] });
  } catch (error) {
    res.status(500).json({ error: `No se pudieron borrar las tareas: ${error.message}` });
  }
});

app.delete("/api/calendar/tasks/:id", requireAuth, async (req, res) => {
  try {
    const tasks = await readCalendarTasks();
    const nextTasks = tasks.filter((task) => task.id !== req.params.id);
    if (nextTasks.length === tasks.length) return res.status(404).json({ error: "Tarea no encontrada" });
    await writeCalendarTasks(nextTasks);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: `No se pudo borrar la tarea: ${error.message}` });
  }
});

app.delete("/api/calendar/tasks/:id/series", requireAuth, async (req, res) => {
  try {
    const tasks = await readCalendarTasks();
    const task = tasks.find((item) => item.id === req.params.id);
    if (!task) return res.status(404).json({ error: "Tarea no encontrada" });
    const groupId = task.recurrence?.groupId || task.id;
    const nextTasks = tasks.filter((item) => item.id !== task.id && item.recurrence?.groupId !== groupId);
    const deleted = tasks.length - nextTasks.length;
    await writeCalendarTasks(nextTasks);
    res.json({ ok: true, deleted, tasks: nextTasks });
  } catch (error) {
    res.status(500).json({ error: `No se pudo borrar la programación: ${error.message}` });
  }
});

app.get("/api/calendar/signals", requireAuth, async (_, res) => {
  try {
    res.json({ signals: await readCalendarSignals() });
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer las señales: ${error.message}` });
  }
});

app.patch("/api/calendar/signals/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 220);
    const status = ["pending", "managed", "ignored"].includes(req.body?.status) ? req.body.status : "pending";
    const signals = await readCalendarSignals();
    signals[id] = {
      status,
      updatedAt: new Date().toISOString(),
    };
    await writeCalendarSignals(signals);
    res.json({ id, signal: signals[id] });
  } catch (error) {
    res.status(400).json({ error: `No se pudo actualizar la señal: ${error.message}` });
  }
});

app.post("/api/internal/calendar/signals", requireInternalRag, async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.signals) ? req.body.signals : [];
    if (!incoming.length) return res.status(400).json({ error: "No hay señales para guardar" });
    const signals = await readCalendarSignals();
    const now = new Date().toISOString();
    const saved = [];
    for (const item of incoming.slice(0, 20)) {
      const title = String(item.title || "Aviso del cerebro").trim().slice(0, 180);
      const id = String(item.id || `brain:${crypto.createHash("sha1").update(`${title}:${item.date || now}`).digest("hex").slice(0, 16)}`).slice(0, 220);
      signals[id] = {
        ...signals[id],
        status: signals[id]?.status || "pending",
        source: String(item.source || "editorial-brain"),
        kind: String(item.kind || "Consejo"),
        date: String(item.date || now),
        title,
        subtitle: String(item.subtitle || "").slice(0, 260),
        fullText: String(item.fullText || item.body || "").slice(0, 3000),
        actionView: String(item.actionView || ""),
        actionTarget: String(item.actionTarget || ""),
        payload: item.payload && typeof item.payload === "object" ? item.payload : {},
        createdAt: signals[id]?.createdAt || now,
        updatedAt: now,
      };
      saved.push({ id, ...signals[id] });
    }
    await writeCalendarSignals(signals);
    res.json({ ok: true, saved });
  } catch (error) {
    res.status(400).json({ error: `No se pudieron guardar señales internas: ${error.message}` });
  }
});

app.get("/api/rag/status", requireAuth, async (_, res) => {
  try {
    if (editorialBrainEnabled()) {
      const status = await callEditorialBrain("/api/rag/status", { method: "GET", timeoutMs: 30000 });
      return res.json({
        ...status,
        externalBrain: true,
        brainUrl: editorialBrainUrl,
      });
    }
    const memory = await readRagMemory().catch(() => emptyRagMemory());
    const response = await n8n("/workflows?limit=100&excludePinnedData=true");
    const workflows = response?.data || [];
    const ragWorkflow = workflows.find((workflow) =>
      /rag/i.test(workflow.name)
      && (workflow.nodes || []).some((node) => node.type === "n8n-nodes-base.webhook" && /rag\/valorar/.test(node.parameters?.path || ""))
      && (workflow.nodes || []).some((node) => node.type === "n8n-nodes-base.webhook" && /rag\/ingestar/.test(node.parameters?.path || ""))
    );
    res.json({
      configured: Boolean(n8nUrl && n8nApiKey),
      valorarWebhook: ragValorarWebhook,
      ingestarWebhook: ragIngestarWebhook,
      workflow: ragWorkflow
        ? {
            id: ragWorkflow.id,
            name: ragWorkflow.name,
            active: Boolean(ragWorkflow.active || ragWorkflow.activeVersionId),
            updatedAt: ragWorkflow.updatedAt,
          }
        : null,
      ready: Boolean(ragWorkflow && (ragWorkflow.active || ragWorkflow.activeVersionId)),
      memory: generatorMemoryPayload(memory),
    });
  } catch (error) {
    const memory = await readRagMemory().catch(() => null);
    res.status(error.status || 502).json({
      configured: Boolean(n8nUrl && n8nApiKey),
      valorarWebhook: ragValorarWebhook,
      ingestarWebhook: ragIngestarWebhook,
      workflow: null,
      ready: false,
      memory: memory ? generatorMemoryPayload(memory) : null,
      error: error.message,
    });
  }
});

app.get("/api/rag/memory", requireAuth, async (_, res) => {
  try {
    if (editorialBrainEnabled()) {
      const memory = await callEditorialBrain("/api/rag/memory", { method: "GET", timeoutMs: 30000 });
      return res.json({ ...memory, externalBrain: true });
    }
    const memory = await withRagMemoryUpdate(async (currentMemory, client) => {
      await writeRagMemory(currentMemory, client);
      return currentMemory;
    });
    res.json({ ok: true, memory: generatorMemoryPayload(memory) });
  } catch (error) {
    res.status(500).json({ error: `No se pudo leer la memoria RAG: ${error.message}` });
  }
});

app.post("/api/rag/memory/clean", requireAuth, async (req, res) => {
  let client;
  try {
    if (editorialBrainEnabled()) {
      const result = await callEditorialBrain("/api/rag/memory/clean", {
        method: "POST",
        body: JSON.stringify(req.body || {}),
        timeoutMs: 30000,
      });
      return res.json({ ...result, externalBrain: true });
    }
    client = await getPgPool().connect();
    await client.query("begin");
    const memory = await readLockedRagMemory(client);
    const next = normalizeRagMemory(memory);
    const action = String(req.body?.action || "");
    const tag = String(req.body?.tag || "").trim();
    const value = String(req.body?.value || req.body?.tag || "").trim();
    const category = String(req.body?.category || "tags").trim();
    const replacement = String(req.body?.replacement || "").trim();
    const documentId = String(req.body?.documentId || "").trim();
    const removeFromArray = (values, value) => uniqueStrings(values || []).filter((item) =>
      canonicalMemoryKey(item) !== canonicalMemoryKey(value),
    );
    const lowerFromArray = (values, value, rawCategory = category) => {
      let seen = 0;
      const target = normalizeMemoryVariable(value, rawCategory) || value;
      return uniqueStrings(values || []).filter((item) => {
        const itemTarget = normalizeMemoryVariable(item, rawCategory) || item;
        return canonicalMemoryKey(itemTarget) !== canonicalMemoryKey(target) || seen++ % 2 === 0;
      });
    };
    const raiseInArray = (values, value, rawCategory = category) => uniqueMemoryStrings([value, ...(values || [])], rawCategory);
    const categoryFields = (id) => {
      if (id === "frameworks") return { memory: ["topics", "tags"], documents: ["topics", "tags"], usage: ["topics", "tags"] };
      if (id === "positions") return { memory: ["topics", "tags"], documents: ["stanceTags", "tags"], usage: ["topics", "tags"] };
      if (id === "influences") return { memory: ["promptHints", "tags"], documents: ["tags", "styles"], usage: ["prompts", "tags", "styles"] };
      if (id === "topics") return { memory: ["topics"], documents: ["topics"], usage: ["topics"] };
      if (id === "stances") return { memory: ["topics"], documents: ["stanceTags"], usage: ["topics"] };
      if (id === "style") return { memory: ["textPreferences", "styleTags"], documents: ["styles"], usage: ["styles"] };
      if (id === "sources") return { memory: ["tags", "promptHints"], documents: ["tags"], usage: ["tags", "prompts"] };
      if (id === "usage") return { memory: ["tags", "topics", "promptHints"], documents: ["tags"], usage: ["tags", "topics", "styles", "prompts"] };
      return { memory: ["tags"], documents: ["tags"], usage: ["tags"] };
    };
    const cleanItem = (mode, rawCategory, rawValue) => {
      const fields = categoryFields(rawCategory);
      if (mode === "remove") {
        next.suppressed = next.suppressed || {};
        next.suppressed[rawCategory] = uniqueStrings([...(next.suppressed[rawCategory] || []), rawValue]);
      }
      const removeEquivalent = (values, value) => {
        const target = normalizeMemoryVariable(value, rawCategory) || value;
        return uniqueStrings(values || []).filter((item) => {
          const itemTarget = normalizeMemoryVariable(item, rawCategory) || item;
          return canonicalMemoryKey(itemTarget) !== canonicalMemoryKey(target);
        });
      };
      const cleaner = mode === "remove" ? removeEquivalent : (values, value) => lowerFromArray(values, value, rawCategory);
      for (const key of fields.memory) {
        next[key] = cleaner(next[key], rawValue);
      }
      next.documents = next.documents.map((document, index) => {
        if (mode === "lower" && index % 2 === 1) return document;
        const updated = { ...document };
        for (const key of fields.documents) {
          updated[key] = cleaner(updated[key], rawValue);
        }
        return updated;
      });
      for (const bucket of fields.usage) {
        if (!next.usage[bucket]) continue;
        for (const key of Object.keys(next.usage[bucket])) {
          const keyTarget = normalizeMemoryVariable(key, rawCategory) || key;
          const rawTarget = normalizeMemoryVariable(rawValue, rawCategory) || rawValue;
          if (canonicalMemoryKey(keyTarget) !== canonicalMemoryKey(rawTarget)) continue;
          if (mode === "remove") delete next.usage[bucket][key];
          else next.usage[bucket][key] = Math.max(0, Math.floor(Number(next.usage[bucket][key]) / 2));
        }
      }
    };
    const raiseItem = (rawCategory, rawValue) => {
      const fields = categoryFields(rawCategory);
      const normalizedValue = normalizeMemoryVariable(rawValue, rawCategory) || rawValue;
      if (next.suppressed?.[rawCategory]) {
        const target = normalizeMemoryVariable(normalizedValue, rawCategory) || normalizedValue;
        next.suppressed[rawCategory] = next.suppressed[rawCategory].filter((item) =>
          canonicalMemoryKey(normalizeMemoryVariable(item, rawCategory) || item) !== canonicalMemoryKey(target),
        );
        if (!next.suppressed[rawCategory].length) delete next.suppressed[rawCategory];
      }
      for (const key of fields.memory) {
        next[key] = raiseInArray(next[key], normalizedValue, rawCategory);
      }
      for (const bucket of fields.usage) {
        next.usage[bucket] = next.usage[bucket] || {};
        next.usage[bucket][normalizedValue] = (Number(next.usage[bucket][normalizedValue]) || 0) + 2;
      }
    };
    if (action === "remove-tag" && tag) {
      next.suppressed = next.suppressed || {};
      next.suppressed.tags = uniqueStrings([...(next.suppressed.tags || []), tag]);
      for (const key of ["tags", "topics", "textPreferences", "styleTags", "promptHints"]) {
        next[key] = removeFromArray(next[key], tag);
      }
      next.documents = next.documents.map((document) => ({
        ...document,
        tags: removeFromArray(document.tags, tag),
        topics: removeFromArray(document.topics, tag),
        stanceTags: removeFromArray(document.stanceTags, tag),
        styles: removeFromArray(document.styles, tag),
      }));
      for (const bucket of Object.keys(next.usage)) delete next.usage[bucket]?.[tag];
    } else if (action === "rename-tag" && tag && replacement) {
      const rename = (values) => uniqueStrings((values || []).map((item) => item === tag ? replacement : item));
      for (const key of ["tags", "topics", "textPreferences", "styleTags", "promptHints"]) {
        next[key] = rename(next[key]);
      }
      next.documents = next.documents.map((document) => ({
        ...document,
        tags: rename(document.tags),
        topics: rename(document.topics),
        stanceTags: rename(document.stanceTags),
        styles: rename(document.styles),
      }));
      for (const bucket of Object.keys(next.usage)) {
        if (!next.usage[bucket]?.[tag]) continue;
        next.usage[bucket][replacement] = (Number(next.usage[bucket][replacement]) || 0) + Number(next.usage[bucket][tag] || 0);
        delete next.usage[bucket][tag];
      }
    } else if (action === "delete-document" && documentId) {
      next.documents = next.documents.filter((document) => document.id !== documentId);
      delete next.usage.documents?.[documentId];
    } else if (action === "lower-tag" && tag) {
      cleanItem("lower", "tags", tag);
    } else if (action === "raise-tag" && tag) {
      raiseItem("tags", tag);
    } else if (action === "remove-item" && value) {
      cleanItem("remove", category, value);
    } else if (action === "lower-item" && value) {
      cleanItem("lower", category, value);
    } else if (action === "raise-item" && value) {
      raiseItem(category, value);
    } else {
      await client.query("rollback").catch(() => {});
      return res.status(400).json({ error: "Acción de limpieza no válida" });
    }
    next.updatedAt = new Date().toISOString();
    await writeRagMemory(next, client);
    await client.query("commit");
    res.json({ ok: true, memory: generatorMemoryPayload(next) });
  } catch (error) {
    await client?.query("rollback").catch(() => {});
    res.status(500).json({ error: `No se pudo limpiar la memoria: ${error.message}` });
  } finally {
    client?.release();
  }
});

app.post("/api/rag/valorar", requireAuth, async (req, res) => {
  try {
    if (editorialBrainEnabled()) {
      const result = await callEditorialBrain("/api/rag/valorar", {
        method: "POST",
        body: JSON.stringify(req.body || {}),
      });
      return res.json({ ...result, externalBrain: true });
    }
    const input = await enrichRagInput(cleanRagInput(req.body));
    const memory = await readRagMemory().catch(() => emptyRagMemory());
    const memoryPayload = generatorMemoryPayload(memory);
    const payload = {
      tipo_material: input.inputType === "file" ? input.file.type || "Archivo" : input.inputType === "url" ? "URL" : "Texto",
      input_type: input.inputType,
      project_hint: input.project,
      proyecto_hint: input.project,
      description: input.description,
      descripcion: input.description,
      context_description: input.description,
      content: input.text,
      url: input.url,
      url_profile: input.urlProfile,
      url_kind: input.urlProfile?.kind || null,
      acquisition_depth: input.urlProfile?.depth || null,
      acquisition_instruction: input.urlProfile?.instruction || null,
      profile_goal: input.urlProfile?.profileGoal || null,
      should_search_web: Boolean(input.urlProfile?.shouldSearchWeb),
      file: input.file,
      rag_memory: memoryPayload,
      memoria_rag: memoryPayload,
      expected_schema: {
        tipo: ["ejemplo_copy", "spec", "nota", "prompt_previo"],
        proyecto: ["generador-contenido"],
        resumen: "2 líneas de qué es",
        utilidad_rag: ["alta", "media", "baja"],
        aviso: "duplicado/sensible/null",
        sugerencia_chunking: ["por secciones", "por párrafos", "documento completo", "por chunks", "descripcion + OCR"],
        topics: "temas que debe recordar el generador",
        textPreferences: "preferencias de texto/voz/estructura",
        styleTags: "etiquetas de estilo reutilizables",
        promptHints: "pistas útiles para montar futuros prompts",
        authorProfile: "si aplica: idea general del autor, pensamientos, politicas, posicionamiento y limites de confianza",
        stanceTags: "si aplica: etiquetas de postura, ideologia, politicas o creencias visibles, siempre con prudencia",
        evidenceNotes: "si aplica: 3-6 señales breves usadas para inferir el perfil, sin copiar contenido largo",
        confidence: ["alta", "media", "baja"],
      },
      requested_model: "claude-haiku",
      requested_at: new Date().toISOString(),
      source: "flow-console-rag-entry",
    };
    const result = await callN8nWebhook(ragValorarWebhook, payload);
    const rawAssessment = extractRagAssessmentCandidate(result);
    const assessment = cleanRagAssessment(rawAssessment);
    assertUsefulRagAssessment(rawAssessment, assessment);
    res.json({ ok: true, input, assessment, memory: memoryPayload, raw: result });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.post("/api/rag/ingestar", requireAuth, async (req, res) => {
  try {
    if (editorialBrainEnabled()) {
      const result = await callEditorialBrain("/api/rag/ingestar", {
        method: "POST",
        body: JSON.stringify(req.body || {}),
      });
      return res.json({ ...result, externalBrain: true });
    }
    const input = await enrichRagInput(cleanRagInput(req.body?.input || req.body));
    const assessment = cleanRagAssessment(req.body?.assessment || req.body?.valoracion || {});
    const title = String(req.body?.title || assessment.resumen || input.file?.name || input.url || "Documento RAG").trim().slice(0, 180);
    const tags = Array.isArray(req.body?.tags)
      ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12)
      : assessment.tags;
    const document = {
      nombre: title,
      title,
      tipo: assessment.tipo,
      type: assessment.tipo,
      proyecto: assessment.proyecto,
      project: assessment.proyecto,
      source: input.inputType === "url" ? "web" : input.inputType === "file" ? "file" : "manual",
      status: "validado",
      tags,
      autor: "Roberto",
      content: input.text || input.url || input.file?.name || "",
      url: input.url,
      file: input.file,
      metadata: {
        assessment,
        inputType: input.inputType,
        description: input.description,
        urlProfile: input.urlProfile,
        aviso: assessment.aviso,
        utilidad_rag: assessment.utilidad_rag,
        sugerencia_chunking: assessment.sugerencia_chunking,
        confirmedAt: new Date().toISOString(),
        source: "flow-console-rag-entry",
      },
    };
    const result = await callN8nWebhook(ragIngestarWebhook, {
      document,
      input,
      assessment,
      chunking: assessment.sugerencia_chunking,
      embedding_target: "pgvector",
      confirmed_at: new Date().toISOString(),
      source: "flow-console-rag-entry",
    });
    const savedDocument = result.document || result;
    const memory = await rememberRagDocument({
      ...document,
      ...savedDocument,
      tags,
    }, assessment);
    res.json({ ok: true, document: savedDocument, memory: generatorMemoryPayload(memory), raw: result });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.post("/api/internal/rag/pgvector", requireInternalRag, async (req, res) => {
  const client = await getPgPool().connect();
  try {
    await ensureRagSchema(client);
    const document = req.body?.document || {};
    const chunks = Array.isArray(req.body?.chunks) ? req.body.chunks : [];
    if (!chunks.length) throw new Error("No hay chunks para insertar");

    const tags = splitTags(document.tags);
    const rawType = document.tipo || document.type || "nota";
    const rawSource = document.source || document.fuente || "manual";
    const metadata = document.metadata && typeof document.metadata === "object" ? document.metadata : {};
    const dbType = dbDocumentType(rawType);
    const dbSource = dbDocumentSource(document);
    await client.query("begin");
    const inserted = await client.query(
      `insert into documents (title, type, project, source, tags, status, author, metadata)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)
       returning id, title, type, project, source, tags, status, author, metadata, created_at`,
      [
        String(document.nombre || document.title || "Documento RAG").slice(0, 240),
        dbType,
        document.proyecto || document.project || "otro",
        dbSource,
        JSON.stringify(tags),
        document.status || document.estado || "validado",
        document.autor || document.author || "Roberto",
        JSON.stringify({
          ...metadata,
          originalType: rawType,
          originalSource: rawSource,
        }),
      ],
    );
    const row = inserted.rows[0];
    for (const chunk of chunks) {
      await client.query(
        `insert into document_chunks (document_id, chunk_index, content, embedding, metadata)
         values ($1, $2, $3, $4::vector, $5::jsonb)`,
        [
          row.id,
          Number(chunk.index ?? chunk.chunk_index ?? 0),
          String(chunk.content || ""),
          vectorLiteral(chunk.embedding),
          JSON.stringify({
            ...metadata,
            ...(chunk.metadata || {}),
            tags,
            type: row.type,
            project: row.project,
            source: row.source,
            status: row.status,
          }),
        ],
      );
    }
    const responseDocument = {
      id: row.id,
      nombre: row.title,
      title: row.title,
      tipo: row.type,
      proyecto: row.project,
      source: row.source,
      status: row.status,
      tags: row.tags || [],
      chunks: chunks.length,
      createdAt: row.created_at,
    };
    const memory = await rememberRagDocument(responseDocument, metadata.assessment || metadata, client);
    await client.query("commit");
    res.json({
      ok: true,
      document: responseDocument,
      memory: generatorMemoryPayload(memory),
    });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    res.status(500).json({ error: `No se pudo insertar en pgvector: ${error.message}` });
  } finally {
    client.release();
  }
});

app.patch("/api/notices/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 160);
    const state = await readNoticesState();
    const current = state[id] || {};
    for (const key of ["read", "archived", "trashed"]) {
      if (typeof req.body?.[key] === "boolean") current[key] = req.body[key];
    }
    if (["managed", "ignored", "success"].includes(req.body?.status)) current.status = req.body.status;
    state[id] = current;
    await writeNoticesState(state);
    res.json({ id, ...current });
  } catch (error) {
    res.status(500).json({ error: `No se pudo actualizar el aviso: ${error.message}` });
  }
});

app.post("/api/workflows/:id/run", requireAuth, async (req, res) => {
  const pathName = runnableWorkflows[req.params.id];
  if (!pathName) return res.status(404).json({ error: "Este workflow no admite ejecución desde la consola" });
  try {
    const context = req.body && typeof req.body === "object" ? req.body : {};
    const subject = String(context.subject || context.title || "").trim();
    const workflowName = String(context.workflowName || req.params.id).trim();
    const brain = await queryEditorialBrain({
      task: "workflow_run",
      workflowId: req.params.id,
      context,
    });
    const memoryPayload = brain.memory || generatorMemoryPayload(emptyRagMemory());
    const response = await fetch(`${n8nUrl}/webhook/${pathName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "flow-console",
        requestedAt: new Date().toISOString(),
        noticeId: context.noticeId || "",
        sourceExecutionId: context.executionId || "",
        subject,
        rag_memory: memoryPayload,
        memoria_rag: memoryPayload,
        editorial_brain: {
          source: brain.source,
          instruction: brain.instruction,
        },
      }),
      signal: AbortSignal.timeout(150000),
    });
    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({ error: text || `n8n respondió ${response.status}` });
    }
    let rawResponse = text || "";
    try {
      const parsed = text ? JSON.parse(text) : null;
      rawResponse = parsed?.message || text;
    } catch {
      rawResponse = text || "";
    }
    res.json({
      ok: true,
      status: "accepted",
      workflowId: req.params.id,
      webhook: pathName,
      startedAt: new Date().toISOString(),
      message: `Flow lanzado: ${workflowName}.`,
      nextStep: subject
        ? `Flow lanzado para “${subject}”. Revisa nuevos avisos en unos segundos; n8n puede tardar en dejar el resultado.`
        : `Flow lanzado: ${workflowName}. Revisa nuevos avisos en unos segundos; n8n puede tardar en dejar el resultado.`,
      rawResponse,
    });
  } catch (error) {
    res.status(error?.name === "TimeoutError" ? 504 : 502).json({
      error: error?.name === "TimeoutError"
        ? "La ejecución continúa en n8n, pero superó el tiempo de espera de la consola"
        : error.message,
    });
  }
});

app.get("/api/workflows/:id/executions", requireAuth, async (req, res) => {
  try {
    const response = await n8n(
      `/executions?limit=25&includeData=false&workflowId=${encodeURIComponent(req.params.id)}`,
    );
    res.json({ executions: (response?.data || []).map(cleanExecution) });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.get("/api/executions/:id", requireAuth, async (req, res) => {
  try {
    const execution = await n8n(`/executions/${encodeURIComponent(req.params.id)}?includeData=true`);
    res.json({ execution: cleanExecution(execution), error: errorSummary(execution) });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.post("/api/workflows/:id/:action", requireAuth, async (req, res) => {
  const action = req.params.action;
  if (!["activate", "deactivate"].includes(action)) {
    return res.status(404).json({ error: "Acción no disponible" });
  }
  try {
    const workflow = await n8n(
      `/workflows/${encodeURIComponent(req.params.id)}/${action}`,
      { method: "POST", body: "{}" },
    );
    res.json({ active: Boolean(workflow?.active || workflow?.activeVersionId) });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.post("/api/executions/:id/retry", requireAuth, async (req, res) => {
  try {
    const execution = await n8n(
      `/executions/${encodeURIComponent(req.params.id)}/retry`,
      { method: "POST", body: JSON.stringify({ loadWorkflow: true }) },
    );
    res.json({ execution: cleanExecution(execution) });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.post("/api/generator", requireAuth, async (req, res) => {
  try {
    const brain = await queryEditorialBrain({
      task: "content_generation",
      channel: req.body?.destino || req.body?.formato || req.body?.targetId || "",
      context: req.body || {},
    });
    const memoryPayload = brain.memory || generatorMemoryPayload(emptyRagMemory());
    const { body: enrichedBody } = await enrichGeneratorBody(req.body || {});
    const existingInstructions = String(enrichedBody?.instrucciones || "").trim();
    const editingMode = generatorEditingMode(enrichedBody);
    const requestBody = {
      ...enrichedBody,
      editing_mode: editingMode,
      modo_edicion: editingMode,
      instrucciones: [
        generatorIntentInstruction(enrichedBody?.intencion),
        generatorSourceMaterialInstruction(enrichedBody),
        existingInstructions,
        brain.instruction || generatorMemoryInstruction(memoryPayload),
      ].filter(Boolean).join("\n\n"),
      rag_memory: memoryPayload,
      memoria_rag: memoryPayload,
      editorial_brain: {
        source: brain.source,
        applicable: brain.applicable || null,
      },
      source: "flow-console-generator",
    };
    const response = await fetch(`${n8nUrl}/webhook/generador-contenido`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(150000),
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { error: text || "n8n devolvió una respuesta vacía" };
    }
    if (!response.ok || body?.ok === false) {
      return res.status(response.status || 502).json({
        error: body?.error || body?.message || `n8n respondió ${response.status}`,
      });
    }
    const usedMemory = await rememberEditorialBrainUsage(memoryPayload).catch(() => memoryPayload);
    res.json({ ...body, rag_memory: usedMemory?.documentCount !== undefined ? usedMemory : generatorMemoryPayload(usedMemory) });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError";
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "El generador superó el tiempo máximo de espera"
        : `No se pudo ejecutar el generador: ${error.message}`,
    });
  }
});

app.post("/api/generator/feedback", requireAuth, async (req, res) => {
  try {
    const result = await rememberEditorialBrainFeedback(req.body || {});
    const memory = result?.memory || result;
    if (!memory) throw new Error("No se pudo guardar el feedback en Training");
    res.json({
      ok: true,
      externalBrain: editorialBrainEnabled(),
      memory: memory?.documentCount !== undefined ? memory : generatorMemoryPayload(memory),
    });
  } catch (error) {
    res.status(400).json({ error: `No se pudo aprender la edición: ${error.message}` });
  }
});

async function handlePublicationPosts(_, res) {
  try {
    const posts = await readPublicationPosts();
    await syncPublishedCalendarTasks(posts);
    res.json({ posts });
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer las publicaciones: ${error.message}` });
  }
}

async function readEditorialRecords(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
let editorialWriteQueue = Promise.resolve();
function mutateEditorialRecords(file, change) {
  const work = editorialWriteQueue.then(async () => {
    const records = await readEditorialRecords(file);
    const result = change(records);
    await fs.mkdir(dataDirectory, { recursive: true });
    const tmp = file + "." + crypto.randomUUID() + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(records, null, 2), { mode: 0o600 });
    await fs.rename(tmp, file);
    return result;
  });
  editorialWriteQueue = work.catch(() => {});
  return work;
}
app.get("/api/editorial/masters", requireAuth, async (_, res) => {
  try { res.json({ masters: await readEditorialRecords(editorialMastersFile) }); }
  catch { res.status(500).json({ error: "No se pudieron leer los artículos maestros" }); }
});
app.post("/api/editorial/masters", requireAuth, async (req, res) => {
  const title = String(req.body?.title || "").trim().slice(0, 250);
  const caption = String(req.body?.caption || "").trim();
  if (!title || !caption || caption.length > 200000) return res.status(400).json({ error: "Indica título y texto válido" });
  const master = { id: crypto.randomUUID(), title, caption, captionHtml: cleanPublicationHtml(req.body?.captionHtml), imageUrl: safeUrl(req.body?.imageUrl), approvedAt: new Date().toISOString() };
  try {
    await mutateEditorialRecords(editorialMastersFile, records => records.unshift(master));
    res.status(201).json({ master });
  } catch { res.status(500).json({ error: "No se pudo guardar el artículo maestro" }); }
});
app.get("/api/editorial/metrics", requireAuth, async (_, res) => {
  try { res.json({ entries: await readEditorialRecords(editorialMetricsFile) }); }
  catch { res.status(500).json({ error: "No se pudieron leer las métricas editoriales" }); }
});
app.put("/api/editorial/metrics", requireAuth, async (req, res) => {
  const period = String(req.body?.period || "");
  const channel = String(req.body?.channel || "").trim().slice(0, 80);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period) || !channel) return res.status(400).json({ error: "Periodo o canal inválido" });
  const entry = { period, channel, updatedAt: new Date().toISOString() };
  for (const key of ["freeSubscribers", "paidSubscribers", "revenue", "leads"]) {
    const raw = req.body?.[key];
    const value = raw === "" || raw == null ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0 || (key !== "revenue" && !Number.isInteger(value)))) return res.status(400).json({ error: "Métrica inválida" });
    entry[key] = value;
  }
  try {
    const entries = await mutateEditorialRecords(editorialMetricsFile, records => {
      const index = records.findIndex(row => row.period === period && row.channel === channel);
      if (index >= 0) records[index] = entry; else records.push(entry);
      return records;
    });
    res.json({ entries });
  } catch { res.status(500).json({ error: "No se pudieron guardar las métricas" }); }
});
app.get("/api/publications/posts", requireAuth, handlePublicationPosts);
app.get("/api/instagram/posts", requireAuth, handlePublicationPosts);

app.delete("/api/publications/posts/:id", requireAuth, async (req, res) => {
  try {
    const posts = await readPublicationPosts();
    const nextPosts = posts.filter((post) => post.id !== req.params.id);
    if (nextPosts.length === posts.length) return res.status(404).json({ error: "Publicación no encontrada" });
    await writePublicationPosts(nextPosts);
    res.json({ ok: true, posts: nextPosts.slice(0, 50) });
  } catch (error) {
    res.status(500).json({ error: `No se pudo borrar del historial: ${error.message}` });
  }
});

app.get("/api/stats/monthly", requireAuth, async (_, res) => {
  try {
    const entries = await readMonthlyStats();
    res.json({
      channels: defaultStatsChannels,
      entries: entries.sort((left, right) =>
        `${left.year}-${String(left.month).padStart(2, "0")}-${left.channel}`
          .localeCompare(`${right.year}-${String(right.month).padStart(2, "0")}-${right.channel}`),
      ),
    });
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer las estadísticas: ${error.message}` });
  }
});

app.get("/api/stats/google-search", requireAuth, async (req, res) => {
  try {
    const year = cleanStatsMetric(req.query?.year || new Date().getFullYear());
    const month = cleanStatsMetric(req.query?.month || new Date().getMonth() + 1);
    if (year < 2000 || year > 2100) throw new Error("Año inválido");
    if (month < 1 || month > 12) throw new Error("Mes inválido");
    if (!searchConsoleConfigured()) {
      return res.status(400).json({
        error: "Search Console no está configurado",
        authUrl: "/oauth/search-console/start",
        requiredEnv: [
          "SEARCH_CONSOLE_CLIENT_ID o GOOGLE_CLIENT_ID",
          "SEARCH_CONSOLE_CLIENT_SECRET o GOOGLE_CLIENT_SECRET",
          "SEARCH_CONSOLE_REFRESH_TOKEN",
          "SEARCH_CONSOLE_SITE_URL",
        ],
      });
    }
    res.json({ ok: true, ...(await searchConsoleMonthlyStats({ year, month })) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/stats/ga4", requireAuth, async (req, res) => {
  try {
    const year = cleanStatsMetric(req.query?.year || new Date().getFullYear());
    const month = cleanStatsMetric(req.query?.month || new Date().getMonth() + 1);
    if (year < 2000 || year > 2100) throw new Error("Año inválido");
    if (month < 1 || month > 12) throw new Error("Mes inválido");
    if (!ga4Configured()) {
      return res.status(400).json({
        error: "GA4 no está configurado",
        authUrl: "/oauth/ga4/start",
        requiredEnv: [
          "GA4_CLIENT_ID o GOOGLE_CLIENT_ID",
          "GA4_CLIENT_SECRET o GOOGLE_CLIENT_SECRET",
          "GA4_REFRESH_TOKEN",
          "GA4_PROPERTY_ID",
        ],
      });
    }
    res.json({ ok: true, ...(await ga4MonthlyStats({ year, month })) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/stats/monthly", requireAuth, async (req, res) => {
  try {
    const year = cleanStatsMetric(req.body?.year);
    const month = cleanStatsMetric(req.body?.month);
    if (year < 2000 || year > 2100) throw new Error("Año inválido");
    if (month < 1 || month > 12) throw new Error("Mes inválido");
    const incomingRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!incomingRows.length) throw new Error("Añade al menos una fila");
    const rows = incomingRows
      .map((row) => cleanMonthlyStatsRow({ ...row, year, month }))
      .filter((row) => row.channel && !isStatsImportedDimensionNoise(row.channel));
    const uniqueRows = dedupeMonthlyStats(rows);
    const entries = await readMonthlyStats();
    const replacingChannels = new Set(uniqueRows.map((row) => statsChannelKey(row.channel)));
    const nextEntries = entries.filter((entry) =>
      entry.year !== year || entry.month !== month || !replacingChannels.has(statsChannelKey(entry.channel)),
    );
    nextEntries.push(...uniqueRows);
    await writeMonthlyStats(nextEntries);
    res.json({ ok: true, entries: nextEntries });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/stats/campaigns", requireAuth, async (_, res) => {
  try {
    const campaigns = await readCampaignUrls();
    res.json({
      campaigns: campaigns.sort((left, right) =>
        String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")),
      ),
    });
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer las campañas: ${error.message}` });
  }
});

app.get("/api/internal/stats/campaigns", requireInternalRag, async (_, res) => {
  try {
    const campaigns = await readCampaignUrls();
    res.json({
      campaigns: campaigns.sort((left, right) =>
        String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")),
      ),
    });
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer las campañas: ${error.message}` });
  }
});

app.post("/api/stats/campaigns", requireAuth, async (req, res) => {
  try {
    const campaigns = await readCampaignUrls();
    const id = String(req.body?.id || "").trim();
    const draftCampaign = cleanCampaignUrl(req.body, id ? campaigns.find((campaign) => campaign.id === id) || {} : {});
    const draftKey = campaignUrlKey(draftCampaign);
    const index = id
      ? campaigns.findIndex((campaign) => campaign.id === id)
      : campaigns.findIndex((campaign) => campaignUrlKey(campaign) === draftKey);
    const campaign = cleanCampaignUrl(req.body, index >= 0 ? campaigns[index] : {});
    const nextCampaigns = index >= 0
      ? campaigns.map((item, itemIndex) => itemIndex === index ? campaign : item)
      : [campaign, ...campaigns];
    const cleanCampaigns = dedupeCampaignUrls(nextCampaigns).slice(0, 500);
    await writeCampaignUrls(cleanCampaigns);
    res.json({ ok: true, campaign, campaigns: cleanCampaigns });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/stats/campaigns/:id", requireAuth, async (req, res) => {
  try {
    const campaigns = await readCampaignUrls();
    const nextCampaigns = campaigns.filter((campaign) => campaign.id !== req.params.id);
    if (nextCampaigns.length === campaigns.length) return res.status(404).json({ error: "Campaña no encontrada" });
    await writeCampaignUrls(nextCampaigns);
    res.json({ ok: true, campaigns: nextCampaigns });
  } catch (error) {
    res.status(500).json({ error: `No se pudo borrar la campaña: ${error.message}` });
  }
});

app.delete("/api/publications/posts", requireAuth, async (_, res) => {
  try {
    await writePublicationPosts([]);
    res.json({ ok: true, posts: [] });
  } catch (error) {
    res.status(500).json({ error: `No se pudo borrar el historial: ${error.message}` });
  }
});

app.get("/api/google-ads/status", requireAuth, async (_, res) => {
  const checks = [
    ["clientId", "GOOGLE_ADS_CLIENT_ID o GOOGLE_CLIENT_ID", googleAdsConfig.clientId],
    ["clientSecret", "GOOGLE_ADS_CLIENT_SECRET o GOOGLE_CLIENT_SECRET", googleAdsConfig.clientSecret],
    ["developerToken", "GOOGLE_ADS_DEVELOPER_TOKEN", googleAdsConfig.developerToken],
    ["refreshToken", "GOOGLE_ADS_REFRESH_TOKEN", googleAdsConfig.refreshToken],
    ["customerId", "GOOGLE_ADS_CUSTOMER_ID", googleAdsConfig.customerId],
  ].map(([id, label, value]) => ({ id, label, configured: Boolean(value) }));
  res.json({
    ok: true,
    configured: checks.every((check) => check.configured),
    checks,
    optional: [
      {
        id: "loginCustomerId",
        label: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
        configured: Boolean(googleAdsConfig.loginCustomerId),
        detail: "Solo necesario si usas MCC/cuenta manager.",
      },
    ],
  });
});

app.post("/api/publications/posts/:id/confirm", requireAuth, async (req, res) => {
  try {
    const posts = await readPublicationPosts();
    const index = posts.findIndex((post) => post.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Publicación no encontrada" });
    const now = new Date().toISOString();
    const manual = manualEditorialTargetIds.has(posts[index].targetId || posts[index].target?.id);
    let finalUrl = posts[index].finalUrl || "";
    if (manual) {
      try {
        const url = new URL(String(req.body?.url || ""));
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid");
        finalUrl = url.href;
      } catch {
        return res.status(400).json({ error: "Indica la URL HTTPS de la publicación real." });
      }
    }
    const post = {
      ...posts[index],
      finalUrl,
      publicUrl: finalUrl || posts[index].publicUrl,
      action: "publish",
      status: "published_by_user_confirmation",
      publishedAt: posts[index].publishedAt || now,
      confirmedBy: "user",
      updatedAt: now,
    };
    posts[index] = post;
    await writePublicationPosts(posts);
    await rememberPublishedCalendarTask(post).catch(() => {});
    const memory = await rememberPublicationInTraining(post);
    res.json({ ok: true, post, posts: posts.slice(0, 50), memory: memory ? generatorMemoryPayload(memory) : null });
  } catch (error) {
    res.status(500).json({ error: `No se pudo confirmar la publicación: ${error.message}` });
  }
});

app.get("/api/publication-targets", requireAuth, async (_, res) => {
  try {
    const targets = await readPublicationTargets();
    res.json({ targets });
  } catch (error) {
    res.status(500).json({ error: `No se pudieron leer los destinos: ${error.message}` });
  }
});

app.get("/api/publications/library", requireAuth, async (req, res) => {
  try {
    const targetId = req.query.target || "instagram";
    const safeTarget = safeLibraryName(targetId);
    const origin = publicOrigin(req);
    const [libraryItems, uploadedItems] = await Promise.all([
      listPublicationLibrary(safeTarget, origin),
      listUploadedPublicationMedia(origin),
    ]);
    res.json({
      targetId: safeTarget,
      folders: [
        `/data/publication-library/${safeTarget}`,
        `/data/${safeTarget}`,
        "/data/instagram-media",
      ],
      items: [...uploadedItems, ...libraryItems],
    });
  } catch (error) {
    res.status(500).json({ error: `No se pudo leer la carpeta de publicaciones: ${error.message}` });
  }
});

app.post("/api/publications/library", requireAuth, async (req, res) => {
  try {
    const safeTarget = safeLibraryName(req.body?.target || "instagram");
    if (!safeTarget) return res.status(400).json({ error: "Destino no válido" });
    const dataUrl = String(req.body?.dataUrl || "");
    const match = dataUrl.match(/^data:((?:image\/(?:jpeg|png|webp|gif))|(?:video\/(?:mp4|webm|quicktime))|(?:text\/plain|text\/markdown)|application\/octet-stream);base64,([a-z0-9+/=]+)$/i);
    if (!match) throw new Error("Sube JPG, PNG, WebP, GIF, MP4, WebM, MOV, TXT o Markdown");
    const [, mimeType, base64] = match;
    const originalName = safeLibraryFileName(req.body?.name || "", "");
    const originalExtension = path.extname(originalName).replace(/^\./, "").toLowerCase();
    const bytes = Buffer.from(base64, "base64");
    const isVideo = mimeType.startsWith("video/");
    const isText = mimeType.startsWith("text/") || ["txt", "md"].includes(originalExtension);
    const maxSize = isVideo ? 100 * 1024 * 1024 : isText ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!bytes.length || bytes.length > maxSize) throw new Error(isVideo ? "El vídeo debe pesar menos de 100 MB" : isText ? "El texto debe pesar menos de 2 MB" : "La imagen debe pesar menos de 8 MB");
    const extension = mediaExtension(mimeType) || (mimeType === "image/gif" ? "gif" : mimeType === "text/markdown" ? "md" : mimeType === "text/plain" ? "txt" : originalExtension);
    if (!["jpg", "png", "webp", "gif", "mp4", "webm", "mov", "txt", "md"].includes(extension)) {
      throw new Error("Formato de archivo no soportado");
    }
    if (!extension) throw new Error("Formato de archivo no soportado");
    const folder = path.join(publicationLibraryDirectory, safeTarget);
    await fs.mkdir(folder, { recursive: true });
    const originalNameWithExtension = safeLibraryFileName(originalName, `.${extension}`);
    const datedName = libraryFileDate(originalName)
      ? originalNameWithExtension
      : `${new Date().toISOString().slice(0, 10)}-${originalNameWithExtension}`;
    let fileName = datedName;
    let counter = 2;
    while (true) {
      try {
        await fs.writeFile(path.join(folder, fileName), bytes, { flag: "wx", mode: 0o600 });
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const parsed = path.parse(datedName);
        fileName = `${parsed.name}-${counter}${parsed.ext}`;
        counter += 1;
      }
    }
    const items = await listPublicationLibrary(safeTarget, publicOrigin(req));
    res.json({ ok: true, targetId: safeTarget, fileName, items });
  } catch (error) {
    res.status(500).json({ error: `No se pudo subir a la carpeta: ${error.message}` });
  }
});

app.post("/api/publication-targets", requireAuth, async (req, res) => {
  try {
    const target = cleanPublicationTarget(req.body);
    if (!target.name) return res.status(400).json({ error: "El nombre del destino es obligatorio" });
    const targets = await readPublicationTargets();
    const exists = targets.some((item) => item.id === target.id);
    const nextTargets = exists
      ? targets.map((item) => item.id === target.id ? { ...item, ...target, builtIn: item.builtIn } : item)
      : [target, ...targets];
    await writePublicationTargets(nextTargets);
    res.json({ ok: true, target, targets: nextTargets });
  } catch (error) {
    res.status(500).json({ error: `No se pudo guardar el destino: ${error.message}` });
  }
});

function handlePublicationMedia(req, res) {
  const file = String(req.params.file || "");
  if (!/^[a-f0-9-]+\.(jpg|png|webp|mp4|webm|mov)$/i.test(file)) {
    return res.status(404).send("No encontrado");
  }
  res.sendFile(path.join(publicationMediaDirectory, file), (error) => {
    if (error && !res.headersSent) res.status(404).send("No encontrado");
  });
}

app.get("/media/publications/:file", handlePublicationMedia);
app.get("/media/instagram/:file", handlePublicationMedia);

app.get("/media/notes/:file", (req, res) => {
  const file = String(req.params.file || "");
  if (!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(file)) {
    return res.status(404).send("No encontrado");
  }
  res.sendFile(path.join(calendarNoteMediaDirectory, file), (error) => {
    if (error && !res.headersSent) res.status(404).send("No encontrado");
  });
});

app.get("/media/publication-library/:target/:file", async (req, res) => {
  try {
    const found = await findPublicationLibraryFile(req.params.target, req.params.file);
    if (!found) return res.status(404).send("No encontrado");
    res.sendFile(found.fullPath, (error) => {
      if (error && !res.headersSent) res.status(404).send("No encontrado");
    });
  } catch {
    res.status(404).send("No encontrado");
  }
});

app.get("/blog/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "");
    const posts = await readPublicationPosts();
    const post = posts.find((item) =>
      postTargetId(item) === "blog"
      && Boolean(item.publishedAt || confirmedPublicationStatus(item.status))
      && blogPostSlug(item) === slug
    );
    if (!post) return res.status(404).send("Entrada no encontrada");
    res.type("html").send(renderBlogPost(post, req));
  } catch (error) {
    res.status(500).send(`No se pudo abrir la entrada: ${escapeHtml(error.message)}`);
  }
});

async function handlePublicationMediaUpload(req, res) {
  try {
    res.json({
      ok: true,
      ...(await storePublicationMedia(req.body?.dataUrl, req, req.body || {})),
    });
  } catch (error) {
    res.status(500).json({ error: `No se pudo subir el archivo: ${error.message}` });
  }
}

async function storePublicationMedia(dataUrlValue, req, options = {}) {
  const dataUrl = String(dataUrlValue || "");
  const match = dataUrl.match(/^data:((?:image\/(?:jpeg|png|webp))|(?:video\/(?:mp4|webm|quicktime)));base64,([a-z0-9+/=]+)$/i);
  if (!match) throw new Error("Sube una imagen JPG, PNG, WebP o un vídeo MP4, WebM o MOV válido");
  const [, mimeType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  const isVideo = mimeType.startsWith("video/");
  const maxSize = isVideo ? 100 * 1024 * 1024 : 8 * 1024 * 1024;
  if (!bytes.length || bytes.length > maxSize) {
    throw new Error(isVideo ? "El vídeo debe pesar menos de 100 MB" : "La imagen debe pesar menos de 8 MB");
  }
  const extension = mediaExtension(mimeType);
  if (!extension) throw new Error("Formato de archivo no soportado");
  await fs.mkdir(publicationMediaDirectory, { recursive: true });
  const id = crypto.randomUUID();
  const fileName = `${id}.${extension}`;
  await fs.writeFile(path.join(publicationMediaDirectory, fileName), bytes, { mode: 0o600 });
  const localUrl = `${publicOrigin(req)}/media/publications/${fileName}`;
  let hosted = null;
  const targetId = String(options?.targetId || options?.target || "").trim().toLowerCase();
  if (targetId === "instagram" && !isVideo && options?.uploadToHost === true) {
    const hostedFileName = hostedInstagramMediaName({
      requestedName: options?.name,
      scheduledAt: options?.scheduledAt,
      extension,
    });
    const hostedUrl = await uploadInstagramMediaToFtp({ bytes, fileName: hostedFileName });
    hosted = {
      fileName: hostedFileName,
      url: hostedUrl,
      baseUrl: instagramImageBaseUrl,
      remoteDir: ftpRemoteDir,
    };
  }
  return {
    id,
    fileName,
    mimeType,
    size: bytes.length,
    url: hosted?.url || localUrl,
    localUrl,
    hosted,
  };
}

app.post("/api/publications/media", requireAuth, handlePublicationMediaUpload);
app.post("/api/instagram/media", requireAuth, handlePublicationMediaUpload);

app.get("/api/blog/articles", requireAuth, async (req, res) => {
  try {
    const slug = String(req.query.slug || "").trim();
    const result = await requestAeternalBlogArticles(slug ? `?slug=${encodeURIComponent(slug)}` : "");
    res.json(result);
  } catch (error) {
    res.status(error.status || 502).json({ error: `No se pudo leer el blog: ${error.message}` });
  }
});

app.put("/api/blog/articles/:slug", requireAuth, async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const result = await requestAeternalBlogArticles(`?slug=${encodeURIComponent(slug)}`, {
      method: "PUT",
      body: req.body || {},
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 502).json({ error: `No se pudo actualizar el artículo: ${error.message}` });
  }
});

app.delete("/api/blog/articles/:slug", requireAuth, async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const result = await requestAeternalBlogArticles(`?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    res.json(result);
  } catch (error) {
    res.status(error.status || 502).json({ error: `No se pudo borrar el artículo: ${error.message}` });
  }
});

app.post("/api/publications/posts/:id/media", requireAuth, async (req, res) => {
  try {
    const posts = await readPublicationPosts();
    const index = posts.findIndex((post) => post.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Publicación no encontrada" });
    const media = await storePublicationMedia(req.body?.dataUrl, req, req.body || {});
    const now = new Date().toISOString();
    posts[index] = {
      ...posts[index],
      imageUrl: media.url,
      fileName: media.fileName,
      media: {
        fileName: media.fileName,
        mimeType: media.mimeType,
        size: media.size,
        url: media.url,
        source: "clipboard",
        attachedAt: now,
      },
      updatedAt: now,
    };
    await writePublicationPosts(posts);
    res.json({ ok: true, post: posts[index], posts: posts.slice(0, 50), media });
  } catch (error) {
    res.status(500).json({ error: `No se pudo adjuntar la captura: ${error.message}` });
  }
});

async function handlePublicationSubmit(req, res) {
  let payload;
  try {
    const targets = await readPublicationTargets();
    const requestedTargetId = String(req.body?.targetId || req.body?.target?.id || "instagram");
    const target = targets.find((item) => item.id === requestedTargetId) || targets.find((item) => item.id === "instagram");
    payload = cleanPublicationPayload({ ...req.body, target });
    const masterId = String(req.body?.masterId || "");
    if (masterId) {
      const masters = await readEditorialRecords(editorialMastersFile);
      if (!masters.some(master => master.id === masterId)) return res.status(400).json({ error: "Artículo maestro inexistente" });
      payload.masterId = masterId;
    }
    payload.editorialFormat = ["post", "article", "newsletter"].includes(req.body?.editorialFormat) ? req.body.editorialFormat : "post";
    if (!payload.caption) {
      return res.status(400).json({ error: "El caption es obligatorio" });
    }
    if (["review", "schedule"].includes(payload.action) && !payload.scheduledAt) {
      return res.status(400).json({ error: "Elige una fecha válida para programar" });
    }
    if (["schedule", "publish"].includes(payload.action) && !payload.target.webhookPath && !(payload.action === "publish" && manualEditorialTargetIds.has(payload.target.id))) {
      return res.status(400).json({ error: `El destino ${payload.target.name} no tiene webhook n8n configurado` });
    }

    const posts = await readPublicationPosts();
    const fingerprint = publicationFingerprint(payload);
    if (payload.action === "publish" && !req.body?.force) {
      const recentDuplicate = posts.find((post) => {
        if (payload.target.id === "blog") return false;
        const status = String(post.status || "");
        const recent = Date.now() - new Date(post.publishedAt || post.updatedAt || post.createdAt || 0).getTime() < 1000 * 60 * 60 * 24;
        return recent
          && (post.fingerprint || publicationFingerprint(post)) === fingerprint
          && /published|posted|uploaded|created|done|success|sent|received|queued|external|flow/i.test(status)
          && !/pending_confirmation/i.test(status);
      });
      if (recentDuplicate) {
        return res.json({
          ok: true,
          post: recentDuplicate,
          result: {
            ok: true,
            status: "already_sent_by_flow_console",
            duplicateSkipped: true,
            originalPostId: recentDuplicate.id,
          },
        });
      }
    }

    let flowResult = null;
    if (payload.action === "publish") {
      flowResult = manualEditorialTargetIds.has(payload.target.id)
        ? { status: "pending_confirmation", deliveryMode: "manual", message: "Preparado; falta publicar y confirmar en la plataforma." }
        : await publishPublicationPayload(payload);
    }

    const now = new Date().toISOString();
    const confirmed = payload.action === "publish" && confirmedPublicationStatus(flowResult?.status);
    const publishedAt = confirmed ? (flowResult?.publishedAt || now) : null;
    const post = {
      id: crypto.randomUUID(),
      ...payload,
      status: publicationDeliveryStatus(payload, flowResult),
      publishedAt,
      result: flowResult,
      deliveryMode: deliveryModeForPublication({ ...payload, result: flowResult }),
      finalUrl: flowResult?.publicUrl || flowResult?.url || "",
      fingerprint,
      createdAt: now,
      updatedAt: now,
    };
    if (post.target?.id === "blog" && post.publishedAt) {
      post.publicUrl = flowResult?.publicUrl || flowResult?.url || "";
      post.result = {
        ...(post.result || {}),
        publicUrl: post.publicUrl,
        url: post.publicUrl,
      };
      flowResult = post.result;
    }
    if (post.target?.id === "pinterest" && post.publishedAt) {
      post.publicUrl = flowResult?.publicUrl || flowResult?.url || "";
      post.result = {
        ...(post.result || {}),
        publicUrl: post.publicUrl,
        url: post.publicUrl,
      };
      flowResult = post.result;
    }
    await writePublicationPosts([post, ...posts].slice(0, 200));
    if (payload.action === "publish" && post.publishedAt) {
      await rememberPublishedCalendarTask(post).catch(() => {});
    } else if (payload.action === "schedule") {
      await rememberScheduledCalendarTask(post).catch(() => {});
    }
    const memory = post.publishedAt ? await rememberPublicationInTraining(post) : null;
    res.json({ ok: true, post, result: flowResult, memory: memory ? generatorMemoryPayload(memory) : null });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError";
    const targetId = String(payload?.target?.id || "");
    const targetName = payload?.target?.name || "el destino seleccionado";
    const deliveryLabel = targetId === "youtube"
      ? `No se pudo subir ${targetName} por YouTube API: ${error.message}`
      : targetId === "pinterest"
        ? `No se pudo publicar ${targetName} por Pinterest API: ${error.message}`
      : targetId === "instagram"
        ? `No se pudo publicar ${targetName} con el worker de navegador: ${error.message}`
      : `No se pudo entregar ${targetName} al sistema de publicación: ${error.message}`;
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "El flujo de publicación continúa en n8n, pero superó el tiempo de espera de la consola"
        : deliveryLabel,
    });
  }
}

app.post("/api/publications/post", requireAuth, handlePublicationSubmit);
app.post("/api/instagram/post", requireAuth, handlePublicationSubmit);

async function processScheduledPublicationPosts() {
  if (!configured()) return;
  const posts = await readPublicationPosts();
  const now = Date.now();
  let changed = false;
  const nextPosts = [];

  for (const post of posts) {
    const due = post.action === "schedule"
      && post.scheduledAt
      && new Date(post.scheduledAt).getTime() <= now
      && ["schedule", "scheduled"].includes(post.status);

    if (!due) {
      nextPosts.push(post);
      continue;
    }

    const publishing = {
      ...post,
      status: "publishing",
      updatedAt: new Date().toISOString(),
      lastError: null,
    };
    nextPosts.push(publishing);
    changed = true;
    await writePublicationPosts(nextPosts.concat(posts.slice(nextPosts.length)));

    try {
      if (!publishing.target?.webhookPath) {
        throw new Error(`El destino ${publishing.target?.name || "seleccionado"} no tiene webhook n8n configurado`);
      }
      const result = await publishPublicationPayload(publishing, "flow-console-scheduler");
      const status = publicationDeliveryStatus({ ...publishing, action: "publish" }, result);
      const confirmed = confirmedPublicationStatus(result?.status);
      Object.assign(publishing, {
        status,
        result,
        publishedAt: confirmed ? (result?.publishedAt || new Date().toISOString()) : null,
        updatedAt: new Date().toISOString(),
      });
      if (publishing.target?.id === "blog" && publishing.publishedAt) {
        publishing.publicUrl = result?.publicUrl || result?.url || "";
        publishing.result = {
          ...(publishing.result || {}),
          publicUrl: publishing.publicUrl,
          url: publishing.publicUrl,
        };
      }
      await rememberPublicationInTraining(publishing);
      if (publishing.publishedAt) await rememberPublishedCalendarTask(publishing).catch(() => {});
    } catch (error) {
      Object.assign(publishing, {
        status: "error",
        lastError: error.message,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (changed) await writePublicationPosts(nextPosts);
}

if (production) {
  app.use(express.static(path.join(root, "dist"), { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(root, "dist", "index.html"));
  });
}

const server = app.listen(port, () => {
  console.log(`Flow Console listening on http://localhost:${port}`);
});

const publicationScheduleTimer = setInterval(() => {
  processScheduledPublicationPosts().catch((error) => {
    console.error("Publication schedule processing failed", error);
  });
}, 60000);
publicationScheduleTimer.unref();
processScheduledPublicationPosts().catch((error) => {
  console.error("Initial publication schedule processing failed", error);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing Flow Console cleanly`);
  server.close((error) => {
    if (error) {
      console.error("Flow Console shutdown failed", error);
      process.exitCode = 1;
      return;
    }
    if (pgPool) pgPool.end().catch(() => {});
    process.exitCode = 0;
  });
  setTimeout(() => {
    console.error("Flow Console shutdown timed out");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
