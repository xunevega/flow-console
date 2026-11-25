import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Estadisticas from "./Estadisticas.jsx";
import Visibilidad from "./Visibilidad.jsx";
import MiVoz from "./MiVoz.jsx";
import AvisosFlow from "./AvisosFlow.jsx";
const GROUP_COLORS = ["#4a7ab5", "#4a9e7a", "#7a60a8", "#c47a3a", "#c45050", "#8c8277"];
const GENERATOR_OPTIONS = {
  intencion: ["Crear", "Analizar", "Publicar", "Planificar", "Aprender"],
  objetivo: ["Vender", "Informar", "Enseñar", "Debatir", "Entretener"],
  tono: ["Directo", "Humor", "Polémico"],
  variantes: [1, 2, 3],
  materialTipo: ["Texto", "Imagen", "PDF", "URL", "Idea"],
};
const RAG_TYPES = ["ejemplo_copy", "spec", "nota", "prompt_previo"];
const RAG_UTILITIES = ["alta", "media", "baja"];
const RAG_CHUNKING = ["por secciones", "por párrafos", "documento completo", "por chunks", "descripcion + OCR"];
const RAG_TYPE_LABELS = {
  ejemplo_copy: "Ejemplo de copy",
  spec: "Especificación",
  nota: "Nota o referencia",
  prompt_previo: "Prompt previo",
};
const RAG_UTILITY_LABELS = {
  alta: "Valor alto",
  media: "Valor medio",
  baja: "Valor bajo",
};
const RAG_CHUNKING_LABELS = {
  "por secciones": "Dividir por secciones",
  "por párrafos": "Dividir por párrafos",
  "documento completo": "Guardar como documento completo",
  "por chunks": "Dividir en fragmentos",
  "descripcion + OCR": "Descripción + OCR",
};
const PUBLICATION_TARGET_COLORS = ["#c47a3a", "#4a7ab5", "#4a9e7a", "#7a60a8", "#c45050", "#8c8277"];
const PUBLICATION_PLATFORM_ICONS = {
  instagram: "◎",
  youtube: "▶",
  linkedin: "in",
  tiktok: "♪",
  pinterest: "P",
  blog: "✎",
  forums: "F",
};
const FORUM_WORKFLOW_PATTERN = /hn|hacker|indie hackers|quora|reddit|foro|forum|soroa|sora|community|comunidad/i;
const PUBLICATION_MEDIA_ASPECTS = [
  { id: "original", label: "Original", ratio: null, recommended: "Mantiene el tamaño y proporción del archivo original.", output: "Sin recorte" },
  { id: "1-1", label: "1:1", ratio: 1, width: 1080, height: 1080, recommended: "Recomendado 1080 x 1080 px.", output: "Cuadrado" },
  { id: "4-5", label: "4:5", ratio: 4 / 5, width: 1080, height: 1350, recommended: "Recomendado 1080 x 1350 px.", output: "Vertical feed" },
  { id: "16-9", label: "16:9", ratio: 16 / 9, width: 1920, height: 1080, recommended: "Recomendado 1920 x 1080 px.", output: "Horizontal" },
];
const CAPTION_COLORS = [
  ["#050505", "Negro"],
  ["#d24a4a", "Rojo"],
  ["#4a7ab5", "Azul"],
  ["#4a9e7a", "Verde"],
  ["#d6a536", "Amarillo"],
];

function toDatetimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatLimit(value) {
  return Number(value || 0).toLocaleString("es-ES");
}

function readPlainTextFromEditor(editor) {
  return String(editor?.innerText || "").replace(/\n$/, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextToCaptionHtml(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function stripCaptionHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value || "");
  return String(template.content.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function compactText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const NOTICE_TOPIC_STOPWORDS = new Set([
  "borrador", "divulgativo", "semanal", "area", "área", "formato", "recomendado", "articulo", "artículo",
  "propio", "enlace", "generador", "contenido", "backend", "inteligente", "ejecucion", "ejecución",
  "flow", "console", "hacker", "news", "para", "con", "sin", "que", "the", "and", "you", "your", "before",
  "after", "this", "that", "from", "have", "has", "una", "uno", "del", "las", "los", "por", "como", "cuando",
]);

function normalizedTopicText(value = "") {
  return compactText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noticeTopicTokens(notice = {}) {
  const text = normalizedTopicText([
    notice.subject,
    notice.preview,
    String(notice.body || "").split(/\n+/).slice(0, 8).join(" "),
  ].join(" "));
  const counts = new Map();
  for (const token of text.split(/\s+/)) {
    if (token.length < 4 || NOTICE_TOPIC_STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([token]) => token);
}

function noticeGroupKey(notice = {}) {
  const workflowId = notice.workflowId || notice.workflowName || "workflow";
  if (noticeIsForum(notice) || isHnMonitorNotice(notice)) return `workflow:${workflowId}`;
  const tokens = noticeTopicTokens(notice);
  return tokens.length ? `topic:${workflowId}:${tokens.slice(0, 5).join("-")}` : `notice:${notice.id}`;
}

function groupNoticeList(notices = []) {
  const groups = new Map();
  [...notices]
    .sort((left, right) => new Date(right.startedAt || 0) - new Date(left.startedAt || 0))
    .forEach((notice) => {
      const key = noticeGroupKey(notice);
      const current = groups.get(key) || [];
      current.push(notice);
      groups.set(key, current);
    });
  return [...groups.entries()].map(([groupKey, items]) => {
    const latest = items[0];
    const unread = items.some((notice) => !notice.read);
    const open = items.filter((notice) => !notice.archived && !notice.trashed && notice.status !== "managed").length;
    return {
      ...latest,
      id: latest.id,
      groupKey,
      groupCount: items.length,
      openCount: open,
      read: !unread,
      groupedNoticeIds: items.map((notice) => notice.id),
      relatedNotices: items,
      preview: items.length > 1
        ? `${items.length} avisos agrupados · último: ${latest.preview}`
        : latest.preview,
    };
  }).sort((left, right) => new Date(right.startedAt || 0) - new Date(left.startedAt || 0));
}

function sanitizeCaptionHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value || "");
  const allowedTags = new Set([
    "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "BR", "DIV", "P", "SPAN", "HR",
    "H1", "H2", "H3", "H4", "BLOCKQUOTE", "A", "UL", "OL", "LI",
    "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "FIGURE", "FIGCAPTION", "IMG",
  ]);
  const allowedColors = new Set(CAPTION_COLORS.map(([color]) => color.toLowerCase()));
  template.content.querySelectorAll("*").forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent || ""));
      return;
    }
    const originalStyle = node.getAttribute("style") || "";
    const fontWeight = node.style?.fontWeight || "";
    const fontStyle = node.style?.fontStyle || "";
    const textDecoration = node.style?.textDecoration || "";
    const fontSize = node.style?.fontSize || "";
    const href = node.tagName === "A" ? node.getAttribute("href") || "" : "";
    const src = node.tagName === "IMG" ? node.getAttribute("src") || "" : "";
    const alt = node.tagName === "IMG" ? node.getAttribute("alt") || "" : "";
    [...node.attributes].forEach((attribute) => {
      if (attribute.name !== "style") node.removeAttribute(attribute.name);
    });
    const color = node.style?.color || "";
    node.removeAttribute("style");
    if (node.tagName === "IMG") {
      const validDataImage = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(src);
      let validRemoteImage = false;
      try {
        const imageUrl = new URL(src, window.location.origin);
        validRemoteImage = ["http:", "https:"].includes(imageUrl.protocol);
        if (validRemoteImage) node.setAttribute("src", imageUrl.href);
      } catch {
        // Invalid image URLs are removed by the guard below.
      }
      if (!validDataImage && !validRemoteImage) {
        node.remove();
        return;
      }
      if (validDataImage) node.setAttribute("src", src);
      node.setAttribute("alt", alt.slice(0, 120));
      node.setAttribute("loading", "lazy");
      return;
    }
    if (node.tagName === "A") {
      try {
        const url = new URL(href, window.location.origin);
        if (["http:", "https:", "mailto:"].includes(url.protocol)) {
          node.setAttribute("href", url.href);
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noreferrer");
        }
      } catch {
        // Los enlaces no válidos se quedan como texto enlazado sin href.
      }
    }
    if (/bold|[6-9]00/.test(fontWeight) || /font-weight\s*:\s*(bold|[6-9]00)/i.test(originalStyle)) node.style.fontWeight = "700";
    if (/italic/.test(fontStyle) || /font-style\s*:\s*italic/i.test(originalStyle)) node.style.fontStyle = "italic";
    if (/underline/.test(textDecoration) || /text-decoration[^;]*underline/i.test(originalStyle)) node.style.textDecoration = "underline";
    if (/line-through/.test(textDecoration) || /text-decoration[^;]*line-through/i.test(originalStyle)) node.style.textDecoration = `${node.style.textDecoration || ""} line-through`.trim();
    const sizeMatch = `${fontSize};${originalStyle}`.match(/font-size\s*:\s*(16|18|20|22|24|28|32)px/i) || fontSize.match(/^(16|18|20|22|24|28|32)px$/i);
    if (sizeMatch) node.style.fontSize = `${sizeMatch[1]}px`;
    if (color) {
      const probe = document.createElement("span");
      probe.style.color = color;
      const normalized = probe.style.color.toLowerCase();
      const known = CAPTION_COLORS.find(([hex]) => {
        probe.style.color = hex;
        return probe.style.color.toLowerCase() === normalized || hex.toLowerCase() === normalized;
      });
      if (known || allowedColors.has(normalized)) node.style.color = known?.[0] || normalized;
    }
  });
  return template.innerHTML;
}

function formatInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/\*([^*<]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<span>$1</span>");
}

function isMarkdownTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function markdownTableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function markdownTableToHtml(lines) {
  const header = markdownTableCells(lines[0] || "");
  const bodyRows = lines.slice(2).map(markdownTableCells).filter((row) => row.some(Boolean));
  if (!header.length || !bodyRows.length) return "";
  return [
    "<table><thead><tr>",
    header.map((cell) => `<th>${formatInlineMarkdown(cell)}</th>`).join(""),
    "</tr></thead><tbody>",
    bodyRows.map((row) => `<tr>${header.map((_, index) => `<td>${formatInlineMarkdown(row[index] || "")}</td>`).join("")}</tr>`).join(""),
    "</tbody></table>",
  ].join("");
}

async function copyRichText({ text, html }) {
  const plain = String(text || "");
  const cleanHtml = sanitizeCaptionHtml(html || plainTextToCaptionHtml(plain));
  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([cleanHtml], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(plain);
}

function generatedTextToCaptionHtml(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const next = lines[index + 1] || "";
    if (line.includes("|") && isMarkdownTableDivider(next)) {
      const tableLines = [line, next];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      chunks.push(markdownTableToHtml(tableLines));
      continue;
    }
    const unorderedMatch = line.match(/^\s*(?:[-*•]\s+)(.+)$/);
    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items = [];
      while (index < lines.length) {
        const current = lines[index];
        const match = current.match(ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*(?:[-*•]\s+)(.+)$/);
        if (!match) break;
        items.push(`<li>${formatInlineMarkdown(match[1])}</li>`);
        index += 1;
      }
      chunks.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (!line.trim()) {
      chunks.push("<br>");
      index += 1;
      continue;
    }
    chunks.push(`<div>${formatInlineMarkdown(line)}</div>`);
    index += 1;
  }
  return sanitizeCaptionHtml(chunks.filter(Boolean).join(""));
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo preparar la imagen"));
    image.src = dataUrl;
  });
}

async function formatPublicationImage(dataUrl, aspectId) {
  const format = PUBLICATION_MEDIA_ASPECTS.find((item) => item.id === aspectId);
  if (!format?.ratio) return dataUrl;
  const image = await loadImageFromDataUrl(dataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("La imagen no tiene dimensiones válidas");
  const sourceRatio = width / height;
  let cropWidth = width;
  let cropHeight = height;
  if (sourceRatio > format.ratio) {
    cropWidth = height * format.ratio;
  } else {
    cropHeight = width / format.ratio;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(format.width || cropWidth));
  canvas.height = Math.max(1, Math.round(format.height || cropHeight));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo recortar la imagen");
  context.drawImage(
    image,
    Math.max(0, (width - cropWidth) / 2),
    Math.max(0, (height - cropHeight) / 2),
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/jpeg", 0.92);
}

function trainingUrlNotice(value) {
  const trimmed = String(value || "").trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return "";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const pathname = url.pathname.toLowerCase();
  const youtube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host);
  const visualGallery = /(^|\.)pinterest\./.test(host) || /\/search\/pins|\/pin\//.test(pathname);
  if (/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(trimmed)) {
    return "Imagen detectada: se valora contenido visual, texto visible, estilo y temas sin inventar contexto.";
  }
  if (youtube && (/\/(@|channel\/|c\/|user\/)/i.test(url.pathname) || pathname === "/")) {
    return "Canal detectado: perfil contextual del autor, temas, postura y estilo. No se resume todo el canal.";
  }
  if (youtube && (host === "youtu.be" || pathname === "/watch" || pathname.startsWith("/shorts/"))) {
    return "Video detectado: se valora solo este video, con tesis, postura e ideas reutilizables.";
  }
  if (visualGallery) {
    return "Galería visual detectada: se guardan rasgos de estilo, temas visuales y pistas para prompts de imagen.";
  }
  if (/(^|\.)(instagram\.com|tiktok\.com|linkedin\.com|substack\.com|medium\.com)$/.test(host)
    && pathname.split("/").filter(Boolean).length <= 2) {
    return "Perfil detectado: valoración contextual de la cuenta, bio, temas, tono, postura pública y límites de confianza.";
  }
  return "URL detectada: se trata como página completa y se valora qué aporta al generador.";
}

function ragTypeLabel(value) {
  return RAG_TYPE_LABELS[value] || String(value || "Nota o referencia");
}

function ragUtilityLabel(value) {
  return RAG_UTILITY_LABELS[value] || String(value || "Valor medio");
}

function ragChunkingLabel(value) {
  return RAG_CHUNKING_LABELS[value] || String(value || "Dividir por párrafos");
}

function splitCommaText(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function unwrapGeneratedText(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
  text = text.trim();
  const fenced = text.match(/^```(?:json|markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  text = text
    .replace(/^```(?:json|markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.variantes)) return parsed.variantes.flatMap(unwrapGeneratedText);
    if (Array.isArray(parsed?.variants)) return parsed.variants.flatMap(unwrapGeneratedText);
    if (typeof parsed?.texto === "string") return unwrapGeneratedText(parsed.texto);
    if (typeof parsed?.text === "string") return unwrapGeneratedText(parsed.text);
    if (typeof parsed?.output === "string") return unwrapGeneratedText(parsed.output);
    if (typeof parsed === "string") return unwrapGeneratedText(parsed);
  } catch {
    // Not JSON; keep cleaning it as plain generated copy.
  }
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      if (Array.isArray(parsed?.variantes)) return parsed.variantes.flatMap(unwrapGeneratedText);
      if (Array.isArray(parsed?.variants)) return parsed.variants.flatMap(unwrapGeneratedText);
    } catch {
      // Fall through to partial JSON cleanup.
    }
  }
  const partialVariant = text.match(/["']?variantes?["']?\s*:\s*\[\s*([\s\S]*)$/i)
    || text.match(/["']?variants?["']?\s*:\s*\[\s*([\s\S]*)$/i);
  if (partialVariant) {
    text = partialVariant[1]
      .replace(/^\s*["']/, "")
      .replace(/["']?\s*\]\s*\}?\s*$/i, "")
      .replace(/["']?\s*,\s*["']?$/i, "")
      .trim();
  }
  return [
    text
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\")
      .replace(/^["']|["']$/g, "")
      .trim(),
  ].filter(Boolean);
}

function normalizeGeneratedVariants(values) {
  return (Array.isArray(values) ? values : [values])
    .flatMap(unwrapGeneratedText)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function cleanErrorMessage(value, fallback = "No se pudo completar la operación") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw
    .replace(/^Error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function api(path, options = {}) {
  return fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = cleanErrorMessage(body.error || body.message || `HTTP ${response.status}`);
      const area = body.area ? `${body.area}: ` : "";
      throw new Error(`${area}${message}`);
    }
    return body;
  });
}

function relativeTime(value) {
  if (!value) return "nunca";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}

function duration(start, end) {
  if (!start || !end) return "—";
  return `${Math.max(0, (new Date(end) - new Date(start)) / 1000).toFixed(1)}s`;
}

function statusTone(status) {
  if (["success", "managed"].includes(status)) return "success";
  if (status === "ignored") return "muted";
  if (["error", "crashed", "canceled"].includes(status)) return "error";
  if (["running", "new", "waiting", "schedule", "scheduled", "publishing"].includes(status)) return "running";
  return "muted";
}

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const TASK_STATUSES = [
  ["pending", "Pendiente"],
  ["pending_confirmation", "Pendiente confirmación"],
  ["done", "Hecho"],
  ["ignored", "Ignorar"],
  ["blocked", "Bloqueada"],
];
const TASK_REPEATS = [
  ["none", "No repetir"],
  ["weekly", "Cada semana"],
  ["biweekly", "Cada 2 semanas"],
  ["triweekly", "Cada 3 semanas"],
  ["monthly", "Cada mes"],
];
const DEFAULT_TASK_TIME = "12:00";
const DEFAULT_REPEAT_COUNT = 12;
const GENERIC_TASK_PROJECT = "__generic_task__";
const STATS_TEMPLATE_ROWS = [
  { channel: "GA4 Web", publications: 0, impressions: 0, interactions: 0, clicks: 0 },
];
const WEEKDAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function taskTone(status) {
  if (status === "done") return "success";
  if (status === "ignored") return "muted";
  if (status === "blocked") return "error";
  return "running";
}

function publicationTargetForTask(task, targets) {
  const project = String(task?.project || "").trim().toLowerCase();
  const title = String(task?.title || "").trim().toLowerCase();
  return targets.find((target) => {
    const id = String(target.id || "").toLowerCase();
    const name = String(target.name || "").toLowerCase();
    return project === name || project === id || title.includes(name) || title.includes(id);
  }) || null;
}

function isInstagramTaskClient(task) {
  const text = `${task?.title || ""} ${task?.project || ""}`.toLowerCase();
  return text.includes("instagram");
}

function firstUrlInText(value) {
  return String(value || "").match(/https?:\/\/\S+/i)?.[0] || "";
}

function manualPublicationLabel(target, task) {
  const value = `${target?.id || ""} ${target?.name || ""} ${task?.title || ""}`.toLowerCase();
  if (value.includes("blog")) return "Preparar Blog";
  if (/v[ií]deo|video|short|reel/.test(value)) return "Preparar vídeo";
  if (/art[ií]culo|article/.test(value)) return "Preparar artículo";
  if (/pista|idea|nota/.test(value)) return "Preparar pista";
  return `Preparar ${target?.name || "publicación"}`;
}

function workflowRunMessage(result = {}, fallback = "Workflow lanzado desde Flow Console.") {
  const raw = typeof result.message === "string" ? result.message.trim() : "";
  if (result.nextStep) return result.nextStep;
  if (!raw || /^\{?"?message"?\s*:\s*"?workflow was started"?\}?$/i.test(raw)) return fallback;
  if (/workflow was started|workflow iniciado/i.test(raw)) return fallback;
  return raw;
}

function isHnMonitorNotice(notice = {}) {
  return notice?.workflowId === "hnDataImporterMonitor" || /hn|hacker/i.test(notice?.workflowName || "");
}

function workflowRunButtonLabel(notice = {}, busy = false) {
  if (busy) return "EJECUTANDO...";
  if (isHnMonitorNotice(notice)) return "BUSCAR NUEVAS SEÑALES";
  return "EJECUTAR FLOW";
}

function workflowRunHint(notice = {}) {
  if (isHnMonitorNotice(notice)) {
    return "Ejecuta otra vez el monitor de Hacker News: busca señales nuevas, recalcula avisos y deja un nuevo resultado si encuentra algo útil.";
  }
  return "Ejecuta otra vez el workflow de n8n asociado a este aviso y deja el resultado como nuevo aviso cuando termine.";
}

function publicationTargetIdFromSignal(signal = {}) {
  const payload = signal.payload || {};
  const explicit = String(signal.actionTarget || payload.actionTarget || payload.targetId || "").toLowerCase().trim();
  const value = [
    payload.channel,
    payload.intent,
    payload.what,
    payload.why,
    payload.recommendation,
    payload.platform,
    signal.title,
    signal.subtitle,
    signal.fullText,
  ].join(" ").toLowerCase();
  if (/stats|ga4|metric|medici[oó]n|measurement|utm|landing|p[aá]gina para medir|antes de pagar anuncios|antes de invertir en google ads/.test(`${explicit} ${value}`)) return "";
  if (explicit) return explicit.replace(/^publications?:/, "");
  if (value.includes("pinterest")) return "pinterest";
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("youtube")) return "youtube";
  if (value.includes("tiktok")) return "tiktok";
  if (/\bblog\b/.test(value)) return "blog";
  return "";
}

function publicationTargetLabel(targetId = "") {
  const labels = {
    blog: "Blog/Web",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    pinterest: "Pinterest",
    tiktok: "TikTok",
    youtube: "YouTube",
  };
  return labels[targetId] || "publicaciones";
}

function calendarSignalAdvice(signal = {}) {
  const payload = signal.payload || {};
  const text = String(signal.fullText || payload.recommendation || signal.subtitle || "").trim();
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const what = String(payload.what || payload.title || signal.title || "").trim();
  const why = String(payload.why || payload.reason || payload.rationale || "").trim()
    || lines.find((line) => /^por qu[eé]/i.test(line))?.replace(/^por qu[eé]\s*(encaja|hacerlo)?\s*:\s*/i, "")
    || lines.find((line) => /^motivo:/i.test(line))?.replace(/^motivo:\s*/i, "")
    || "";
  const action = lines.find((line) => /^formato recomendado:/i.test(line))
    || lines.find((line) => /^enfoque:/i.test(line))
    || lines[0]
    || "";
  return {
    what: what || action || "Revisar recomendación del cerebro.",
    why,
    summary: lines.slice(0, 4).join(" "),
  };
}

function calendarSignalDetails(signal = {}) {
  const payload = signal.payload || {};
  const text = String(signal.fullText || payload.recommendation || signal.subtitle || "").trim();
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const sourceUrl = firstUrlInText(payload.link)
    || firstUrlInText(payload.url)
    || firstUrlInText(payload.sourceUrl)
    || firstUrlInText(text);
  const newsTitle = String(payload.newsTitle || payload.headline || payload.title || "").trim()
    || lines.find((line) => /noticia|tema|tendencia/i.test(line))?.replace(/^(aprovecha esta noticia\/tema|noticia|tema|tendencia)\s*:\s*/i, "")
    || String(signal.title || "").replace(/^Comentar tendencia:\s*/i, "").trim();
  const sourceName = String(payload.source || payload.publisher || payload.site || "").trim();
  const channel = String(payload.channel || payload.actionTarget || signal.actionTarget || "").trim();
  const recommendation = String(payload.recommendation || "").trim();
  const body = recommendation || text;
  return {
    newsTitle,
    sourceName,
    sourceUrl,
    channel,
    body,
  };
}

function noticeDestinationIssue(notice = {}) {
  const body = String(notice.body || "");
  const text = `${notice.subject || ""}\n${notice.preview || ""}\n${body}`.toLowerCase();
  const recommendsExternalLink = /(enlace|link|url|landing|destino)/i.test(text) && /\b(hn|hacker news)\b/i.test(text);
  const recommendsOwnArticle = /art[ií]culo propio|entrada propia|post propio|borrador divulgativo|publicaci[oó]n propia/i.test(text);
  if (!recommendsExternalLink || !recommendsOwnArticle) return null;
  const explicitDestination = /(?:landing|destino|url final|enlace final|link final|art[ií]culo publicado|publicar en)\s*:\s*https?:\/\//i.test(body);
  const nonSourceUrls = (notice.urls || []).filter((url) => !/news\.ycombinator\.com|ycombinator\.com|hackernews/i.test(url));
  if (explicitDestination || nonSourceUrls.length) return null;
  return {
    title: "Falta URL de destino",
    detail: "El aviso recomienda artículo propio + enlace en HN, pero solo hay fuente/contexto. Antes de ejecutarlo hay que crear o elegir la landing/artículo propio y poner su URL.",
  };
}

function taskStatusLabel(status) {
  return TASK_STATUSES.find(([value]) => value === status)?.[1] || "Pendiente";
}

function signalTone(status, eventStatus) {
  if (status === "managed") return "success";
  if (status === "ignored") return "muted";
  if (statusTone(eventStatus) === "error") return "error";
  return "running";
}

function executionStatusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (value === "success") return "Ejecución OK";
  if (value === "running") return "En ejecución";
  if (["error", "crashed"].includes(value)) return "Error";
  if (value === "canceled") return "Cancelada";
  if (value === "managed") return "Gestionado";
  if (value === "ignored") return "Ignorado";
  return status || "Sin estado";
}

function extractDraftText(body = "") {
  const text = String(body || "").trim();
  const draftMatch = text.match(/(?:^|\n)\s*Borrador\s*\n+([\s\S]*)$/i);
  if (!draftMatch) return text;
  return draftMatch[1]
    .replace(/^\s*(Comentario|Respuesta|Borrador)\s*:\s*/i, "")
    .trim();
}

function forumPublicationUrl(notice = {}, forum = {}) {
  const value = `${forum.name || ""} ${forum.detail || ""} ${notice.workflowName || ""} ${notice.channel || ""} ${notice.subject || ""}`.toLowerCase();
  const explicitForm = String(notice.formUrl || "").trim();
  if (explicitForm) return explicitForm;
  if (/hacker|hn|ycombinator/.test(value)) return "https://news.ycombinator.com/submit";
  if (/indie\s*hackers|indiehackers/.test(value)) return "https://www.indiehackers.com/new-post";
  if (/reddit/.test(value)) return "https://www.reddit.com/submit";
  if (/quora/.test(value)) return "https://www.quora.com/";
  return notice.urls?.find((url) => !/api|webhook|localhost/i.test(url)) || "";
}

function forumPublicationLabel(notice = {}, forum = {}) {
  const value = `${forum.name || ""} ${forum.detail || ""} ${notice.workflowName || ""}`.toLowerCase();
  if (/hacker|hn|ycombinator/.test(value)) return "ABRIR HACKER NEWS";
  if (/indie\s*hackers|indiehackers/.test(value)) return "ABRIR INDIE HACKERS";
  if (/reddit/.test(value)) return "ABRIR REDDIT";
  if (/quora/.test(value)) return "ABRIR QUORA";
  return "ABRIR FORO";
}

function formatStatsNumber(value) {
  return Number(value || 0).toLocaleString("es-ES");
}

function formatStatsPercent(value) {
  return `${Number(value || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
}

function formatStatsSeconds(value) {
  const seconds = Math.round(Number(value || 0));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes} min ${remainingSeconds} s` : `${minutes} min`;
}

function cleanStatsInput(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function isConfirmedPublicationStatus(status) {
  return /(^|_)(published|posted|uploaded|created|done|success)(_|$)/i.test(String(status || ""));
}

function isPublicationAwaitingConfirmation(status) {
  return /pending_confirmation|received_by_delivery|received_by_external|sent_to_external_flow|received_by_n8n|queued|ready_for_oauth/i.test(String(status || ""));
}

function externalDeliveryStatuses(value) {
  const legacyExternal = `received_by_${"external"}_${"workflow"}`;
  const legacyWorker = `received_by_${"external"}_${"worker"}`;
  return ["received_by_delivery_service", "sent_to_external_flow", "received_by_n8n", legacyExternal, legacyWorker].includes(value);
}

function publicationStatusLabel(status, action, targetId = "") {
  const value = String(status || "");
  if (targetId === "youtube" && value === "uploaded_to_youtube") return "Subido a YouTube";
  if (targetId === "pinterest" && value === "created_on_pinterest") return "Publicado en Pinterest";
  if (targetId === "tiktok" && value === "pending_confirmation") return "Preparado para revisar";
  if (targetId === "instagram" && value === "pending_confirmation") return "Listo para publicar en la app";
  if (isConfirmedPublicationStatus(value)) return "Publicado";
  if (value === "pending_confirmation") return "Publicación no confirmada";
  if (action === "schedule" || value === "scheduled") return "Programado";
  if (action === "review" || value === "pending_publication") return "Pendiente";
  if (targetId === "youtube" && externalDeliveryStatuses(value)) return "YouTube API pendiente";
  if (targetId === "pinterest" && externalDeliveryStatuses(value)) return "Pinterest API pendiente";
  if (externalDeliveryStatuses(value)) return "Entrega recibida";
  if (["queued", "youtube_ready_for_oauth_upload"].includes(value)) return "En cola";
  if (value === "draft") return "Borrador";
  if (value === "error") return "Error";
  return value || "Registrado";
}

function publicationResultMessage(action, post, targetName) {
  if (action === "draft") return `Borrador guardado en ${targetName}. No aprende hasta publicar o confirmar.`;
  if (action === "schedule") return `Entrega programada en ${targetName}. Aprenderá cuando quede publicada o confirmada.`;
  const status = String(post?.status || "");
  const url = post?.publicUrl || post?.result?.publicUrl || post?.result?.url || "";
  const targetId = String(post?.targetId || post?.target?.id || "");
  if (targetId === "youtube" && status === "uploaded_to_youtube") {
    const privacy = post?.result?.privacyStatus ? ` (${post.result.privacyStatus})` : "";
    return url ? `Subido a YouTube${privacy}: ${url}` : `Subido a YouTube${privacy}.`;
  }
  if (targetId === "pinterest" && status === "created_on_pinterest") {
    return url ? `Publicado en Pinterest: ${url}` : "Publicado en Pinterest.";
  }
  if (targetId === "tiktok" && status === "pending_confirmation") {
    return url ? `TikTok preparado para revisar: ${url}` : "TikTok preparado para revisar.";
  }
  if (targetId === "instagram" && post?.deliveryMode === "a mano") {
    return "Listo para Instagram. En el historial: Descargar, Copiar texto y, cuando lo publiques en la app, Ya publicado.";
  }
  if (isConfirmedPublicationStatus(status)) {
    return url ? `Publicado en ${targetName}: ${url}` : `Publicado en ${targetName}.`;
  }
  if (isPublicationAwaitingConfirmation(status)) {
    if (targetId === "youtube") return "YouTube API recibió la solicitud, subida no confirmada.";
    if (targetId === "pinterest") return "Pinterest API recibió la solicitud, publicación no confirmada.";
    return `Entrega recibida en ${targetName}. Publicación real no confirmada.`;
  }
  return `${publicationStatusLabel(status, action, targetId)} en ${targetName}. Publicación real no confirmada.`;
}

function StatusMessage({ value }) {
  const text = String(value || "");
  const absolute = text.match(/https?:\/\/\S+/)?.[0] || "";
  const relative = text.match(/\/oauth\/[\w/-]+/)?.[0] || "";
  const url = absolute || relative;
  if (!url) return text;
  const before = text.slice(0, text.indexOf(url)).replace(/:\s*$/, "");
  const after = text.slice(text.indexOf(url) + url.length);
  return (
    <>
      {before ? <span>{before} </span> : null}
      <a href={url} target={absolute ? "_blank" : undefined} rel={absolute ? "noreferrer" : undefined}>
        {absolute ? "Abrir enlace" : url}
      </a>
      {after ? <span>{after}</span> : null}
    </>
  );
}

function publicationIcon(name) {
  const words = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]+/gi) || [];
  return `${words[0]?.[0] || "P"}${words[1]?.[0] || words[0]?.[1] || ""}`.toUpperCase();
}

function platformIcon(target) {
  return PUBLICATION_PLATFORM_ICONS[target?.id] || PUBLICATION_PLATFORM_ICONS[String(target?.name || "").toLowerCase()] || target?.icon || publicationIcon(target?.name);
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sameDate(left, right) {
  return dateKey(left) === dateKey(right);
}

function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const trailing = 6 - ((last.getDay() + 6) % 7);
  const start = new Date(year, month, 1 - offset);
  const length = offset + last.getDate() + trailing;
  return Array.from({ length }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function StatusDot({ status }) {
  return <span className={`status-dot ${statusTone(status)}`} />;
}

function Button({ children, kind = "ghost", className = "", ...props }) {
  return (
    <button className={`button ${kind} ${className}`} {...props}>
      {children}
    </button>
  );
}

function GroupModal({ group, onSave, onDelete, onClose }) {
  const [name, setName] = useState(group?.name || "");
  const [color, setColor] = useState(group?.color || GROUP_COLORS[0]);

  function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ id: group?.id || crypto.randomUUID(), name: name.trim(), color });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal-card" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div>
          <div className="eyebrow">ORGANIZACIÓN</div>
          <h3>{group ? "Editar grupo" : "Nuevo grupo"}</h3>
        </div>
        <label>
          Nombre
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </label>
        <fieldset>
          <legend>Color</legend>
          <div className="color-picker">
            {GROUP_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                className={color === option ? "selected" : ""}
                style={{ background: option }}
                aria-label={`Color ${option}`}
                onClick={() => setColor(option)}
              />
            ))}
          </div>
        </fieldset>
        <div className="modal-actions">
          {group && <Button type="button" kind="danger" onClick={() => onDelete(group.id)}>ELIMINAR</Button>}
          <span />
          <Button type="button" onClick={onClose}>CANCELAR</Button>
          <Button kind="primary" disabled={!name.trim()}>GUARDAR</Button>
        </div>
      </form>
    </div>
  );
}

function Login({ configured, onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/login", { method: "POST", body: JSON.stringify({ password }) });
      onLogin();
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="eyebrow">OPERACIONES PRIVADAS</div>
        <h1>Flow Console</h1>
        <p>Consola privada de calendario, publicaciones, avisos y memoria editorial.</p>
        {!configured && (
          <div className="notice error">
            Faltan variables del servidor. Revisa <code>.env.example</code>.
          </div>
        )}
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <Button kind="primary" disabled={!configured || busy}>
          {busy ? "ENTRANDO..." : "ENTRAR"}
        </Button>
      </form>
    </main>
  );
}

function WorkflowList({ workflows, selectedId, onSelect, groupConfig, onEditGroup, onCreateGroup }) {
  const groups = useMemo(
    () =>
      groupConfig.groups.map((group) => ({
        ...group,
        workflows: workflows.filter((workflow) => groupConfig.assignments[workflow.id] === group.id),
      })),
    [workflows, groupConfig],
  );
  const ungrouped = workflows.filter((workflow) => !groupConfig.assignments[workflow.id]);

  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <div>
          <strong>Workflows</strong>
          <span>{workflows.filter((workflow) => workflow.active).length} activos</span>
        </div>
        <Button onClick={onCreateGroup}>+ GRUPO</Button>
      </div>
      <div className="workflow-groups-scroll">
        <div className="workflow-groups">
          {groups.map((group) => (
            <section key={group.id}>
              <div className="group-heading">
                <i style={{ background: group.color }} />
                <span>{group.name}</span>
                <b>{group.workflows.length}</b>
                <button className="group-edit" onClick={() => onEditGroup(group)} aria-label={`Editar ${group.name}`}>•••</button>
              </div>
              {group.workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  className={`workflow-row ${selectedId === workflow.id ? "selected" : ""}`}
                  onClick={() => onSelect(workflow.id)}
                >
                  <div>
                    <StatusDot status={workflow.active ? "success" : "muted"} />
                    <strong>{workflow.name}</strong>
                  </div>
                  <span>
                    {workflow.lastExecution?.status || "sin ejecuciones"} ·{" "}
                    {relativeTime(workflow.lastExecution?.startedAt)}
                  </span>
                </button>
              ))}
            </section>
          ))}
          {ungrouped.length > 0 && (
            <section>
              <div className="group-heading">
                <i style={{ background: "#aaa096" }} />
                <span>Sin grupo</span>
                <b>{ungrouped.length}</b>
              </div>
              {ungrouped.map((workflow) => (
                <button
                  key={workflow.id}
                  className={`workflow-row ${selectedId === workflow.id ? "selected" : ""}`}
                  onClick={() => onSelect(workflow.id)}
                >
                  <div><StatusDot status={workflow.active ? "success" : "muted"} /><strong>{workflow.name}</strong></div>
                  <span>{workflow.lastExecution?.status || "sin ejecuciones"} · {relativeTime(workflow.lastExecution?.startedAt)}</span>
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}

function ExecutionList({ executions, selectedId, onSelect }) {
  if (!executions.length) return <div className="empty">Sin ejecuciones registradas.</div>;
  return (
    <div className="execution-list">
      {executions.map((execution) => (
        <button
          key={execution.id}
          className={selectedId === execution.id ? "selected" : ""}
          onClick={() => onSelect(execution.id)}
        >
          <StatusDot status={execution.status} />
          <span>
            <strong>#{execution.id}</strong>
            <small>{new Date(execution.startedAt).toLocaleString("es-ES")}</small>
          </span>
          <b className={statusTone(execution.status)}>{execution.status}</b>
          <em>{duration(execution.startedAt, execution.stoppedAt)}</em>
        </button>
      ))}
    </div>
  );
}

function WorkflowDetail({ workflow, onRefresh, groups, groupId, onAssignGroup, calendarContext, onCloseCalendarContext }) {
  const [executions, setExecutions] = useState([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadExecutions = useCallback(async () => {
    if (!workflow) return;
    setError("");
    try {
      const result = await api(`/workflows/${workflow.id}/executions`);
      setExecutions(result.executions);
      const nextId = result.executions[0]?.id || null;
      setSelectedExecutionId(nextId);
      if (nextId) {
        const detail = await api(`/executions/${nextId}`);
        setExecutionError(detail.error);
      } else {
        setExecutionError(null);
      }
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [workflow]);

  useEffect(() => {
    setSelectedExecutionId(null);
    setExecutionError(null);
    loadExecutions();
  }, [loadExecutions]);

  async function inspectExecution(id) {
    setSelectedExecutionId(id);
    setExecutionError(null);
    try {
      const result = await api(`/executions/${id}`);
      setExecutionError(result.error);
    } catch (inspectError) {
      setError(inspectError.message);
    }
  }

  async function toggle() {
    const action = workflow.active ? "deactivate" : "activate";
    setBusy(action);
    setError("");
    try {
      await api(`/workflows/${workflow.id}/${action}`, { method: "POST", body: "{}" });
      await onRefresh();
    } catch (toggleError) {
      setError(toggleError.message);
    } finally {
      setBusy("");
    }
  }

  async function retry() {
    if (!selectedExecution) return;
    setBusy("retry");
    setError("");
    try {
      await api(`/executions/${selectedExecution.id}/retry`, { method: "POST", body: "{}" });
      await loadExecutions();
    } catch (retryError) {
      setError(retryError.message);
    } finally {
      setBusy("");
    }
  }

  async function runWorkflow() {
    setBusy("run");
    setError("");
    try {
      await api(`/workflows/${workflow.id}/run`, { method: "POST", body: "{}" });
      await loadExecutions();
      await onRefresh();
    } catch (runError) {
      setError(runError.message);
    } finally {
      setBusy("");
    }
  }

  async function closeCalendarContext(status) {
    if (!calendarContext?.signalId) return;
    setBusy(status);
    setError("");
    try {
      await onCloseCalendarContext(status);
    } catch (closeError) {
      setError(closeError.message);
    } finally {
      setBusy("");
    }
  }

  if (!workflow) {
    return <section className="empty-state">Selecciona un workflow.</section>;
  }

  const selectedExecution =
    executions.find((execution) => execution.id === selectedExecutionId) || null;
  const failed = ["error", "crashed", "canceled"].includes(selectedExecution?.status);

  return (
    <section className="detail">
      <header className="detail-header">
        <div>
          <div className="eyebrow">WORKFLOW</div>
          <h2><StatusDot status={workflow.active ? "success" : "muted"} />{workflow.name}</h2>
          <div className="tags">
            {workflow.tags.length ? workflow.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>sin tags</span>}
            <label className="group-select">
              Grupo
              <select value={groupId || ""} onChange={(event) => onAssignGroup(workflow.id, event.target.value)}>
                <option value="">Sin grupo</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="actions">
          <a className="button ghost" href={workflow.editorUrl} target="_blank" rel="noreferrer">
            ABRIR EN N8N
          </a>
          <Button kind={workflow.active ? "warning" : "primary"} onClick={toggle} disabled={Boolean(busy)}>
            {busy === "activate" || busy === "deactivate"
              ? "GUARDANDO..."
              : workflow.active ? "PAUSAR" : "ACTIVAR"}
          </Button>
          {workflow.canRun && (
            <Button kind="primary" onClick={runWorkflow} disabled={Boolean(busy)}>
              {busy === "run" ? "EJECUTANDO..." : "EJECUTAR"}
            </Button>
          )}
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}

      {calendarContext?.signalId && (
        <div className="notice calendar-management-notice">
          <div>
            <strong>Acción abierta desde Calendario</strong>
            <span>{calendarContext.title || workflow.name}</span>
          </div>
          <div>
            <Button onClick={() => onCloseCalendarContext("return")} disabled={Boolean(busy)}>
              VOLVER AL CALENDARIO
            </Button>
            <Button kind="danger" onClick={() => closeCalendarContext("ignored")} disabled={Boolean(busy)}>
              {busy === "ignored" ? "BORRANDO..." : "BORRAR"}
            </Button>
          </div>
        </div>
      )}

      <div className="metric-grid">
        <article><span>Estado</span><strong className={workflow.active ? "success" : "muted"}>{workflow.active ? "ACTIVO" : "PAUSADO"}</strong></article>
        <article><span>Última ejecución</span><strong>{relativeTime(workflow.lastExecution?.startedAt)}</strong></article>
        <article><span>Duración</span><strong>{duration(workflow.lastExecution?.startedAt, workflow.lastExecution?.stoppedAt)}</strong></article>
        <article><span>Triggers</span><strong>{workflow.triggerCount}</strong></article>
      </div>

      <div className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <div><span className="section-mark blue" />EJECUCIONES RECIENTES</div>
            <Button onClick={loadExecutions}>ACTUALIZAR</Button>
          </div>
          <ExecutionList
            executions={executions}
            selectedId={selectedExecutionId}
            onSelect={inspectExecution}
          />
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div><span className="section-mark purple" />DETALLE</div>
            {failed && <Button kind="warning" onClick={retry} disabled={Boolean(busy)}>REINTENTAR</Button>}
          </div>
          {!selectedExecution ? (
            <div className="empty">Selecciona una ejecución.</div>
          ) : (
            <div className="execution-detail">
              <dl>
                <div><dt>ID</dt><dd>{selectedExecution.id}</dd></div>
                <div><dt>Estado</dt><dd className={statusTone(selectedExecution.status)}>{selectedExecution.status}</dd></div>
                <div><dt>Modo</dt><dd>{selectedExecution.mode || "—"}</dd></div>
                <div><dt>Inicio</dt><dd>{new Date(selectedExecution.startedAt).toLocaleString("es-ES")}</dd></div>
                <div><dt>Duración</dt><dd>{duration(selectedExecution.startedAt, selectedExecution.stoppedAt)}</dd></div>
              </dl>
              {executionError ? (
                <div className="terminal">
                  <span>ERROR{executionError.node ? ` · ${executionError.node}` : ""}</span>
                  <strong>{executionError.message}</strong>
                  {executionError.description && <p>{executionError.description}</p>}
                </div>
              ) : (
                <div className="terminal muted">Sin error persistido para esta ejecución.</div>
              )}
            </div>
          )}
        </article>
      </div>

      <article className="panel unavailable">
        <div className="panel-heading">
          <div><span className="section-mark amber" />INFLUENCIA Y CONVERSIONES</div>
          <span>ESPERANDO DATOS REALES</span>
        </div>
        <p>
          Esta zona solo se activa cuando los workflows guarden métricas reales de redes, analítica
          o conversiones. Hasta entonces no enseña números inventados.
        </p>
      </article>
    </section>
  );
}

function editorialKarmaScore(notices = []) {
  const helpPattern = /ayuda|aportar|respuesta|responder|gu[ií]a|tutorial|aprende|explica|an[aá]lisis|criterio|reputaci[oó]n|sin promoci[oó]n|divulgaci[oó]n|educativo|valor|comunidad|resolver|soluci[oó]n|consejo|experiencia|caso|herramienta/i;
  const promoPattern = /publicidad|promoci[oó]n|oferta|vender|venta|comprar|contratar|precio|descuento|lead|leads|cta comercial|campaña|anuncio|ads|patrocin/i;
  const items = (notices || []).filter((notice) => !notice.trashed);
  let helpful = 0;
  let promo = 0;
  let neutral = 0;
  for (const notice of items) {
    const text = `${notice.subject || ""} ${notice.preview || ""} ${notice.body || ""} ${notice.workflowName || ""}`;
    const helps = helpPattern.test(text);
    const promotes = promoPattern.test(text);
    if (helps && !promotes) helpful += 1;
    else if (promotes && !helps) promo += 1;
    else if (helps && promotes) {
      helpful += 0.5;
      promo += 0.5;
    } else neutral += 1;
  }
  const total = helpful + promo + neutral;
  const score = total ? Math.round(((helpful + neutral * 0.25) / total) * 100) : 0;
  const tone = score >= 70 ? "good" : score >= 45 ? "mixed" : "low";
  const label = score >= 70 ? "Aporte alto" : score >= 45 ? "Equilibrado" : "Demasiada promo";
  const recommendation = score >= 70 && helpful >= Math.max(2, promo * 2)
    ? "Puedes publicar un anuncio suave: cuenta qué hiciste y pide valoración."
    : score >= 45
      ? "Mejor publica ayuda o caso práctico antes de pedir valoración."
      : "Evita anuncio ahora: primero recupera reputación con aporte útil.";
  return { score, tone, label, recommendation, helpful: Math.round(helpful), promo: Math.round(promo), neutral, total };
}

function forumWorkflowLabel(name = "") {
  const value = String(name || "");
  if (/hn|hacker news/i.test(value)) {
    if (/borrador|divulgativo|semanal/i.test(value)) return "Hacker News semanal";
    if (/data\s*importer/i.test(value)) return /v2/i.test(value) ? "Hacker News DataImporter v2" : "Hacker News DataImporter";
    if (/monitor/i.test(value)) return "Hacker News monitor";
    return "Hacker News";
  }
  if (/indie hackers/i.test(value)) return "Indie Hackers";
  if (/quora/i.test(value)) return "Quora";
  if (/reddit/i.test(value)) return "Reddit";
  if (/soroa/i.test(value)) return "Soroa";
  if (/sora/i.test(value)) return "Sora";
  return value.replace(/\s*(data importer|monitor|workflow|flow)\s*/gi, " ").replace(/\s+/g, " ").trim() || "Foro";
}

function forumSortScore(forum) {
  return (Number(forum.open) || 0) * 1000
    + (Number(forum.unread) || 0) * 100
    + (Number(forum.notices) || 0) * 10
    + (Number(forum.realKarma) || 0);
}

function workflowIsForum(workflow, notices = [], groupConfig = null) {
  if (groupConfig?.assignments?.[workflow.id] === "reputation") return true;
  const text = [
    workflow.name,
    ...notices
      .filter((notice) => notice.workflowId === workflow.id)
      .flatMap((notice) => [notice.workflowName, notice.channel, notice.subject]),
  ].join(" ");
  return FORUM_WORKFLOW_PATTERN.test(text);
}

function noticeIsForum(notice = {}) {
  return FORUM_WORKFLOW_PATTERN.test(`${notice.workflowName || ""} ${notice.channel || ""} ${notice.subject || ""}`);
}

function noticeIsPublicationNotice(notice = {}) {
  const text = [
    notice.workflowName,
    notice.channel,
    notice.subject,
    notice.preview,
    notice.body,
  ].join(" ").toLowerCase();
  const hasPublicationIntent = /\b(publicar|publicaci[oó]n|postear|post|borrador|copy|caption|contenido)\b/i.test(text);
  const hasDestination = /\b(instagram|pinterest|linkedin|youtube|tiktok|blog|hacker\s*news|hn|indie\s*hackers|reddit|quora|foro|forum)\b/i.test(text);
  return hasPublicationIntent && hasDestination;
}

function realKarmaFromForumNotices(notices = []) {
  const candidates = [];
  const metricPattern = /\b(karma\s+(?:real|total)|(?:real|total)\s+karma|real\s+total|karma|points?|puntos?|upvotes?|votos?|likes?)\b\s*(?:actual|total|real)?\s*[:=]?\s*([0-9][0-9.,]*)\s*(?!\/\s*10)/gi;
  [...notices]
    .sort((left, right) => new Date(right.startedAt || 0) - new Date(left.startedAt || 0))
    .forEach((notice, noticeIndex) => {
      const text = `${notice.subject || ""}\n${notice.preview || ""}\n${notice.body || ""}`;
      for (const match of text.matchAll(metricPattern)) {
        const label = String(match[1] || "").toLowerCase();
        const rawValue = String(match[2] || "").replace(/\./g, "").replace(",", ".");
        const value = Math.max(0, Math.round(Number(rawValue) || 0));
        if (!value) continue;
        const confidence = /real|total/.test(label) ? 4 : /karma/.test(label) ? 3 : 2;
        candidates.push({
          value,
          confidence,
          source: notice.workflowName || notice.subject || "monitor",
          updatedAt: notice.startedAt || "",
          noticeIndex,
        });
      }
    });
  candidates.sort((left, right) =>
    right.confidence - left.confidence
    || left.noticeIndex - right.noticeIndex
    || new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0)
  );
  return candidates[0] || null;
}

function forumPromoOpportunity(forum, karma, realKarma = null) {
  const editorialReady = karma.score >= 70 && karma.helpful >= Math.max(2, karma.promo * 2);
  const realReady = realKarma === null || Number(realKarma) >= 30;
  if (!editorialReady || !realReady) {
    return {
      ready: false,
      label: karma.score >= 45 ? "esperar" : "no promo",
      reason: karma.score >= 45
        ? "Mejor suma una o dos respuestas útiles antes de publicar algo propio."
        : "La señal editorial todavía no acompaña: prioriza ayuda, casos y respuestas sin enlace.",
      draft: "",
    };
  }
  const name = forum.name || "este foro";
  const draft = [
    `He estado trabajando en una herramienta pequeña relacionada con ${/hacker|hn/i.test(name) ? "flujos de datos y DX" : "automatización/producto"} y quería pedir criterio antes de seguir empujándola.`,
    "",
    "La idea es simple: reducir una parte concreta del trabajo manual y hacerla menos frágil. Todavía la estoy afinando, así que me interesa más saber si el enfoque tiene sentido que vender nada.",
    "",
    "Qué os parece: ¿esto resuelve un problema real o lo estoy mirando demasiado desde mi propia burbuja?",
  ].join("\n");
  return {
    ready: true,
    label: "promo suave",
    reason: "Buen momento para una mención propia: hay más aporte útil que promo y la señal del foro acompaña.",
    draft,
  };
}

function ForumNoticeManager({ forum, notices, initialNoticeId = "", initialPublicationMode = false, onBack, onReload, onSaveForum }) {
  const [folder, setFolder] = useState("inbox");
  const [selectedId, setSelectedId] = useState(initialNoticeId || "");
  const [search, setSearch] = useState("");
  const [realKarmaDraft, setRealKarmaDraft] = useState(forum.realKarma ?? "");
  const [realKarmaNoteDraft, setRealKarmaNoteDraft] = useState(forum.realKarmaNote || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [publicationMode, setPublicationMode] = useState(false);
  const [publicationDraft, setPublicationDraft] = useState("");

  const forumNotices = useMemo(() => notices.filter((notice) => notice.workflowId === forum.workflowId), [forum.workflowId, notices]);
  const folderNotices = useMemo(() => forumNotices.filter((notice) => {
    if (folder === "archive") return notice.archived && !notice.trashed;
    if (folder === "trash") return notice.trashed;
    if (folder === "executed") return notice.status === "managed" && !notice.archived && !notice.trashed;
    return !notice.archived && !notice.trashed && notice.status !== "managed";
  }), [folder, forumNotices]);
  const visibleNotices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groupNoticeList(folderNotices.filter((notice) => !query || `${notice.subject} ${notice.preview} ${notice.body}`.toLowerCase().includes(query)));
  }, [folderNotices, search]);
  const selected = visibleNotices.find((notice) =>
    notice.id === selectedId || (notice.groupedNoticeIds || []).includes(selectedId)
  ) || visibleNotices[0] || null;
  const karma = editorialKarmaScore(forumNotices.filter((notice) => !notice.trashed));
  const autoRealKarma = realKarmaFromForumNotices(forumNotices);
  const visibleRealKarma = autoRealKarma?.value ?? forum.realKarma ?? null;
  const visibleRealKarmaSource = autoRealKarma
    ? `auto · ${autoRealKarma.source}`
    : forum.realKarmaNote || "manual / pendiente";
  const promoOpportunity = forumPromoOpportunity(forum, karma, visibleRealKarma);
  const selectedPrimaryUrl = selected?.urls?.[0] || "";
  const selectedIsHnMonitor = selected?.workflowId === "hnDataImporterMonitor" || /hn|hacker/i.test(selected?.workflowName || "");
  const selectedPublicationUrl = selected ? forumPublicationUrl(selected, forum) : "";
  const selectedPublicationLabel = selected ? forumPublicationLabel(selected, forum) : "ABRIR FORO";
  const selectedDraftText = selected ? extractDraftText(selected.body) : "";
  const selectedMatchesInitialNotice = Boolean(selected && (
    selected.id === initialNoticeId || (selected.groupedNoticeIds || []).includes(initialNoticeId)
  ));
  const folderCounts = {
    inbox: forumNotices.filter((notice) => !notice.archived && !notice.trashed && notice.status !== "managed").length,
    executed: forumNotices.filter((notice) => notice.status === "managed" && !notice.archived && !notice.trashed).length,
    archive: forumNotices.filter((notice) => notice.archived && !notice.trashed).length,
    trash: forumNotices.filter((notice) => notice.trashed).length,
  };

  useEffect(() => {
    setRealKarmaDraft(forum.realKarma ?? "");
    setRealKarmaNoteDraft(forum.realKarmaNote || "");
  }, [forum.realKarma, forum.realKarmaNote]);

  useEffect(() => {
    if (!initialNoticeId) return;
    const notice = forumNotices.find((item) => item.id === initialNoticeId);
    if (!notice) return;
    setFolder(notice.trashed ? "trash" : notice.archived ? "archive" : notice.status === "managed" ? "executed" : "inbox");
    setSelectedId(notice.id);
  }, [forumNotices, initialNoticeId]);

  useEffect(() => {
    setSelectedId((current) => visibleNotices.some((notice) =>
      notice.id === current || (notice.groupedNoticeIds || []).includes(current)
    ) ? current : visibleNotices[0]?.id || "");
  }, [visibleNotices]);

  useEffect(() => {
    setPublicationMode(Boolean(initialPublicationMode && selectedMatchesInitialNotice));
    setPublicationDraft(selectedDraftText);
  }, [initialPublicationMode, selectedDraftText, selectedMatchesInitialNotice]);

  async function patchNoticeGroup(notice, patch) {
    const ids = notice?.groupedNoticeIds?.length ? notice.groupedNoticeIds : [notice?.id].filter(Boolean);
    if (!ids.length) return;
    setBusy(`patch-${notice.id}`);
    setError("");
    setMessage("");
    try {
      await Promise.all(ids.map((id) => api(`/notices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      })));
      await onReload();
      setMessage(ids.length > 1 ? `Grupo actualizado: ${ids.length} avisos.` : "Aviso actualizado.");
    } catch (patchError) {
      setError(patchError.message);
    } finally {
      setBusy("");
    }
  }

  async function runWorkflow() {
    if (!selected) return;
    setBusy("run");
    setError("");
    setMessage("");
    try {
      const result = await api(`/workflows/${selected.workflowId}/run`, {
        method: "POST",
        body: JSON.stringify({
          noticeId: selected.id,
          executionId: selected.executionId,
          subject: selected.subject,
          workflowName: selected.workflowName,
        }),
      });
      await onReload();
      setMessage(workflowRunMessage(result, isHnMonitorNotice(selected)
        ? "Búsqueda lanzada en Hacker News. Si encuentra señales nuevas, aparecerá otro aviso en este foro en unos segundos."
        : `Flow lanzado: ${selected.workflowName}. Revisa la bandeja en unos segundos para ver el nuevo aviso.`));
    } catch (runError) {
      setError(runError.message);
    } finally {
      setBusy("");
    }
  }

  async function copyBody() {
    if (!selected) return;
    await navigator.clipboard.writeText(publicationMode ? publicationDraft : extractDraftText(selected.body));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  function openPublicationPrep() {
    if (!selected) return;
    setPublicationDraft(extractDraftText(selected.body));
    setPublicationMode(true);
  }

  async function copyPromoDraft() {
    if (!promoOpportunity.draft) return;
    await navigator.clipboard.writeText(promoOpportunity.draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  async function saveRealKarma(event) {
    event.preventDefault();
    setBusy("real-karma");
    setError("");
    setMessage("");
    try {
      await onSaveForum({
        ...forum,
        realKarma: realKarmaDraft === "" ? null : realKarmaDraft,
        realKarmaNote: realKarmaNoteDraft,
        realKarmaLabel: "real total",
      });
      setMessage("Karma real actualizado.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel forum-manager">
      <header className="forum-manager-header">
        <Button type="button" onClick={onBack}>VOLVER A FOROS</Button>
        <div>
          <div className="eyebrow">{forum.detail}</div>
          <h3>{forum.name}</h3>
          <p>{folderCounts.inbox} abiertos · {folderCounts.executed} hechos · {folderCounts.archive} archivados</p>
        </div>
        <div className={`forum-manager-karma ${karma.tone}`}>
          <strong>{karma.score || "—"}</strong>
          <small>karma editorial</small>
        </div>
        <form className="forum-real-karma-form" onSubmit={saveRealKarma}>
          <label>
            <strong>{visibleRealKarma ?? "—"}</strong>
            <small>real total</small>
            <input type="number" min="0" value={realKarmaDraft} onChange={(event) => setRealKarmaDraft(event.target.value)} placeholder="Karma real" />
          </label>
          <input value={realKarmaNoteDraft} onChange={(event) => setRealKarmaNoteDraft(event.target.value)} placeholder={visibleRealKarmaSource} />
          <Button type="submit" disabled={busy === "real-karma"}>{busy === "real-karma" ? "GUARDANDO..." : "GUARDAR REAL"}</Button>
        </form>
      </header>
      <div className="forum-manager-tools">
        {[
          ["inbox", "Abiertos"],
          ["executed", "Hechos"],
          ["archive", "Archivados"],
          ["trash", "Papelera"],
        ].map(([id, label]) => (
          <button key={id} type="button" className={folder === id ? "active" : ""} onClick={() => setFolder(id)}>
            {label} <b>{folderCounts[id]}</b>
          </button>
        ))}
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en este foro" />
        <Button type="button" onClick={onReload}>ACTUALIZAR</Button>
      </div>
      {promoOpportunity.ready && (
        <aside className="forum-promo-opportunity">
          <div>
            <strong>Momento para publicación propia</strong>
            <span>{promoOpportunity.reason}</span>
          </div>
          <pre>{promoOpportunity.draft}</pre>
          <Button type="button" kind="primary" onClick={copyPromoDraft}>{copied ? "COPIADO" : "COPIAR TEXTO"}</Button>
        </aside>
      )}
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}
      <div className="forum-manager-layout">
        <div className="forum-notice-list">
          {!visibleNotices.length && <div className="mail-empty">No hay avisos en esta carpeta.</div>}
          {visibleNotices.map((notice) => (
            <button key={notice.id} type="button" className={`${selected?.id === notice.id ? "selected" : ""} ${notice.read ? "" : "unread"}`} onClick={() => setSelectedId(notice.id)}>
              <span className={`message-status ${statusTone(notice.status)}`} />
              <div>
                <header>
                  <strong>{notice.subject}</strong>
                  <time>{notice.groupCount > 1 ? `${notice.groupCount} avisos` : relativeTime(notice.startedAt)}</time>
                </header>
                <p>{notice.preview}</p>
              </div>
            </button>
          ))}
        </div>
        <article className="forum-notice-reader">
          {!selected ? (
            <div className="reader-empty">Selecciona un aviso de este foro.</div>
          ) : (
            <>
              <header className="reader-header">
                <div>
                  <div className="eyebrow">{selected.workflowName}</div>
                  <h2>{selected.subject}</h2>
                  <p>{new Date(selected.startedAt).toLocaleString("es-ES")} · ejecución #{selected.executionId}</p>
                </div>
                <span className={`reader-status ${statusTone(selected.status)}`}>{executionStatusLabel(selected.status)}</span>
              </header>
              <div className="reader-actions">
                <Button onClick={copyBody}>{copied ? "COPIADO" : publicationMode ? "COPIAR TEXTO" : "COPIAR BORRADOR"}</Button>
                {selected && !selected.trashed && !publicationMode && <Button kind="primary" className="publish-primary" onClick={openPublicationPrep}>PREPARAR PUBLICACIÓN</Button>}
                {selectedPrimaryUrl && selectedIsHnMonitor && <a className="button primary" href={selectedPrimaryUrl} target="_blank" rel="noreferrer">ABRIR HN</a>}
                {selected.canRun && <Button onClick={runWorkflow} disabled={Boolean(busy)}>{workflowRunButtonLabel(selected, busy === "run")}</Button>}
                {!selected.trashed && publicationMode && <Button kind="primary" className="done-primary" onClick={() => patchNoticeGroup(selected, { status: "managed", read: true, archived: false })}>PUBLICACIÓN HECHA</Button>}
                {selected.status === "managed" && !selected.trashed && <Button onClick={() => patchNoticeGroup(selected, { status: "success", archived: false })}>REABRIR</Button>}
                {!selected.archived && !selected.trashed && <Button onClick={() => patchNoticeGroup(selected, { archived: true })}>ARCHIVAR</Button>}
                {selected.archived && !selected.trashed && <Button onClick={() => patchNoticeGroup(selected, { archived: false })}>MOVER A ABIERTOS</Button>}
                {!selected.trashed && <Button kind="danger" onClick={() => patchNoticeGroup(selected, { trashed: true })}>PAPELERA</Button>}
                {selected.trashed && <Button onClick={() => patchNoticeGroup(selected, { trashed: false, archived: false })}>RESTAURAR</Button>}
              </div>
              {selected.groupCount > 1 && (
                <div className="reader-group-summary">
                  <strong>{selected.groupCount} avisos del mismo tema</strong>
                  <span>Se muestra el último borrador. Los anteriores quedan como historial para distinguir seguimiento de tarea nueva.</span>
                </div>
              )}
              {selected.canRun && <p className="reader-action-hint">{workflowRunHint(selected)}</p>}
              {publicationMode ? (
                <section className="forum-publication-panel">
                  <header>
                    <div>
                      <strong>Pantalla de publicación</strong>
                      <span>Edita el borrador, copia el texto y abre el foro para publicarlo manualmente.</span>
                    </div>
                    <Button type="button" onClick={() => setPublicationMode(false)}>VOLVER AL AVISO</Button>
                  </header>
                  <textarea
                    value={publicationDraft}
                    onChange={(event) => setPublicationDraft(event.target.value)}
                    aria-label="Borrador editable para publicar"
                  />
                  <footer>
                    <Button type="button" onClick={copyBody}>{copied ? "COPIADO" : "COPIAR TEXTO"}</Button>
                    {selectedPublicationUrl && <a className="button primary publish-primary" href={selectedPublicationUrl} target="_blank" rel="noreferrer">{selectedPublicationLabel}</a>}
                    <Button type="button" kind="primary" className="done-primary" onClick={() => patchNoticeGroup(selected, { status: "managed", read: true, archived: false })}>PUBLICADO</Button>
                  </footer>
                </section>
              ) : (
                <div className="forum-reader-body">{selected.body}</div>
              )}
              {selected.urls.length > 0 && (
                <footer className="reader-links">
                  {selected.urls.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      ABRIR ENLACE{selected.urls.length > 1 ? ` ${index + 1}` : ""} ↗
                    </a>
                  ))}
                </footer>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}

function ForumHub({ initialWorkflowId = "", initialNoticeId = "", initialPublicationMode = false }) {
  const [notices, setNotices] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selectedForumId, setSelectedForumId] = useState(initialWorkflowId);
  const [groupConfig, setGroupConfig] = useState(null);
  const [savedForums, setSavedForums] = useState([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", workflowId: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [noticeResult, groupResult, forumResult] = await Promise.allSettled([api("/notices"), api("/groups"), api("/forums")]);
      if (noticeResult.status === "rejected") throw noticeResult.reason;
      setNotices(noticeResult.value.notices || []);
      setWorkflows(noticeResult.value.workflows || []);
      setGroupConfig(groupResult.status === "fulfilled" ? groupResult.value : null);
      setSavedForums(forumResult.status === "fulfilled" ? forumResult.value.forums || [] : []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (initialWorkflowId) setSelectedForumId(initialWorkflowId);
  }, [initialWorkflowId]);

  async function saveForumConfig(forum) {
    const payload = {
      name: forum.name,
      workflowId: forum.workflowId || "",
      realKarma: forum.realKarma ?? null,
      realKarmaLabel: forum.realKarmaLabel || "real total",
      realKarmaNote: forum.realKarmaNote || "",
    };
    const result = forum.configId
      ? await api(`/forums/${encodeURIComponent(forum.configId)}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api("/forums", { method: "POST", body: JSON.stringify(payload) });
    setSavedForums(result.forums || []);
    return result.forum;
  }

  async function addForum(event) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    try {
      await saveForumConfig({ name, workflowId: draft.workflowId });
      setDraft({ name: "", workflowId: "" });
    } catch (saveError) {
      setError(saveError.message);
      return;
    }
    setAdding(false);
  }

  const forums = useMemo(() => {
    const configsByWorkflow = new Map(savedForums.filter((forum) => forum.workflowId).map((forum) => [forum.workflowId, forum]));
    const detectedWorkflowIds = new Set();
    const detected = workflows
      .filter((workflow) => workflowIsForum(workflow, notices, groupConfig))
      .map((workflow, index) => {
        detectedWorkflowIds.add(workflow.id);
        const config = configsByWorkflow.get(workflow.id);
        const flowNotices = notices.filter((notice) => notice.workflowId === workflow.id && !notice.trashed);
        const openNotices = flowNotices.filter((notice) => !notice.archived && notice.status !== "managed");
        const karma = editorialKarmaScore(flowNotices);
        const autoRealKarma = realKarmaFromForumNotices(flowNotices);
        const realKarma = autoRealKarma?.value ?? config?.realKarma ?? null;
        return {
          id: config?.id || workflow.id,
          configId: config?.id || "",
          workflowId: workflow.id,
          name: config?.name || forumWorkflowLabel(workflow.name),
          detail: workflow.name,
          notices: flowNotices.length,
          open: openNotices.length,
          unread: flowNotices.filter((notice) => !notice.read).length,
          karma,
          realKarma,
          realKarmaNote: autoRealKarma ? `auto · ${autoRealKarma.source}` : config?.realKarmaNote || "",
          autoRealKarma: Boolean(autoRealKarma),
          promoReady: forumPromoOpportunity({ name: config?.name || forumWorkflowLabel(workflow.name) }, karma, realKarma).ready,
          color: GROUP_COLORS[index % GROUP_COLORS.length],
          manageable: true,
        };
      });
    const extras = savedForums
      .filter((forum) => !forum.workflowId || !detectedWorkflowIds.has(forum.workflowId))
      .map((forum, index) => {
        const workflow = workflows.find((item) => item.id === forum.workflowId);
        const flowNotices = workflow ? notices.filter((notice) => notice.workflowId === workflow.id && !notice.trashed) : [];
        const openNotices = flowNotices.filter((notice) => !notice.archived && notice.status !== "managed");
        const autoRealKarma = realKarmaFromForumNotices(flowNotices);
        const realKarma = autoRealKarma?.value ?? forum.realKarma ?? null;
        const karma = editorialKarmaScore(flowNotices);
        return {
          id: forum.id,
          configId: forum.id,
          workflowId: forum.workflowId || "",
          name: forum.name,
          detail: workflow?.name || "Pendiente de conectar a un workflow de bandeja",
          notices: flowNotices.length,
          open: openNotices.length,
          unread: flowNotices.filter((notice) => !notice.read).length,
          karma,
          realKarma,
          realKarmaNote: autoRealKarma ? `auto · ${autoRealKarma.source}` : forum.realKarmaNote || "",
          autoRealKarma: Boolean(autoRealKarma),
          promoReady: forumPromoOpportunity(forum, karma, realKarma).ready,
          color: PUBLICATION_TARGET_COLORS[index % PUBLICATION_TARGET_COLORS.length],
          manageable: Boolean(workflow),
        };
      });
    return [...detected, ...extras].sort((left, right) =>
      forumSortScore(right) - forumSortScore(left)
      || String(left.name || "").localeCompare(String(right.name || ""), "es", { sensitivity: "base" })
      || String(left.detail || "").localeCompare(String(right.detail || ""), "es", { sensitivity: "base" })
    );
  }, [groupConfig, notices, savedForums, workflows]);

  const selectedForum = forums.find((forum) => forum.workflowId === selectedForumId) || null;

  if (selectedForum) {
    return (
      <ForumNoticeManager
        forum={selectedForum}
        notices={notices}
        initialNoticeId={initialNoticeId}
        initialPublicationMode={initialPublicationMode}
        onBack={() => setSelectedForumId("")}
        onReload={load}
        onSaveForum={saveForumConfig}
      />
    );
  }

  return (
    <section className="panel publication-forums">
      <div className="panel-heading">
        <div><span className="section-mark purple" />FOROS Y REPUTACIÓN</div>
        <div className="publication-forum-actions">
          <Button type="button" onClick={load}>{loading ? "LEYENDO..." : "ACTUALIZAR"}</Button>
          <Button type="button" onClick={() => setAdding((current) => !current)}>{adding ? "CERRAR" : "AÑADIR"}</Button>
        </div>
      </div>
      {adding && (
        <form className="publication-forum-form" onSubmit={addForum}>
          <label>
            Foro
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre del foro" />
          </label>
          <label>
            Avisos
            <select value={draft.workflowId} onChange={(event) => setDraft((current) => ({ ...current, workflowId: event.target.value }))}>
              <option value="">Sin workflow todavía</option>
              {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
            </select>
          </label>
          <Button kind="primary" disabled={!draft.name.trim()}>GUARDAR</Button>
        </form>
      )}
      {error && <div className="notice error">{error}</div>}
      <div className="publication-forum-grid">
        {loading && !forums.length ? (
          <div className="mail-empty">Leyendo bandejas de foros...</div>
        ) : forums.length ? forums.map((forum) => (
          <button
            key={forum.id}
            type="button"
            onClick={() => forum.manageable && setSelectedForumId(forum.workflowId)}
            className={forum.manageable ? "" : "disabled"}
          >
            <i style={{ background: forum.color }}>{publicationIcon(forum.name)}</i>
            <strong>{forum.name}</strong>
            <span>{forum.detail}</span>
            <div className="forum-karma-line">
              <div>
                <b className={forum.karma.tone}>{forum.karma.score || "—"}</b>
                <small>karma editorial</small>
              </div>
              <div>
                <b>{forum.realKarma ?? "—"}</b>
                <small>{forum.autoRealKarma ? "real auto" : "real total"}</small>
              </div>
            </div>
            <em>{forum.open} abiertos · {forum.unread} nuevos · {forum.notices} total</em>
            <mark className={forum.promoReady ? "ready" : ""}>{forum.manageable ? forum.promoReady ? "PROMO SUAVE" : "GESTIONAR" : "SIN WORKFLOW"}</mark>
          </button>
        )) : (
          <div className="mail-empty">No he encontrado foros en la bandeja todavía.</div>
        )}
      </div>
    </section>
  );
}

function Inbox({ refreshToken = 0, selectedNoticeId = "", selectedWorkflowId = "", initialPublicationMode = false }) {
  const [notices, setNotices] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [folder, setFolder] = useState("inbox");
  const [workflowId, setWorkflowId] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [publicationMode, setPublicationMode] = useState(false);
  const [publicationDraft, setPublicationDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api("/notices");
      setNotices(result.notices || []);
      setWorkflows(result.workflows || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  const folderNotices = useMemo(() => notices.filter((notice) => {
    if (folder === "archive") return notice.archived && !notice.trashed;
    if (folder === "trash") return notice.trashed;
    if (folder === "executed") return notice.status === "managed" && !notice.archived && !notice.trashed;
    return !notice.archived && !notice.trashed && notice.status !== "managed";
  }), [notices, folder]);

  const visibleNotices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groupNoticeList(folderNotices.filter((notice) => {
      if (workflowId !== "all" && notice.workflowId !== workflowId) return false;
      if (!query) return true;
      return `${notice.subject} ${notice.preview} ${notice.workflowName}`.toLowerCase().includes(query);
    }));
  }, [folderNotices, search, workflowId]);

  useEffect(() => {
    setSelectedId((current) =>
      visibleNotices.some((notice) => notice.id === current || (notice.groupedNoticeIds || []).includes(current))
        ? current
        : visibleNotices[0]?.id || null,
    );
  }, [visibleNotices]);

  useEffect(() => {
    if (!selectedNoticeId) return;
    const notice = notices.find((item) => item.id === selectedNoticeId);
    if (!notice) return;
    setFolder(notice.trashed ? "trash" : notice.archived ? "archive" : notice.status === "managed" ? "executed" : "inbox");
    setWorkflowId("all");
    setSelectedId(notice.id);
    if (!notice.read) {
      api(`/notices/${encodeURIComponent(notice.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ read: true }),
      })
        .then(() => setNotices((current) => current.map((item) => item.id === notice.id ? { ...item, read: true } : item)))
        .catch((readError) => setError(readError.message));
    }
  }, [notices, selectedNoticeId]);

  useEffect(() => {
    if (!selectedWorkflowId || selectedNoticeId) return;
    if (!workflows.some((workflow) => workflow.id === selectedWorkflowId)) return;
    setFolder("inbox");
    setWorkflowId(selectedWorkflowId);
  }, [selectedNoticeId, selectedWorkflowId, workflows]);

  const selected = visibleNotices.find((notice) =>
    notice.id === selectedId || (notice.groupedNoticeIds || []).includes(selectedId)
  ) || null;
  const selectedDraftText = selected ? extractDraftText(selected.body) : "";
  const selectedMatchesRequestedNotice = Boolean(selected && (
    selected.id === selectedNoticeId || (selected.groupedNoticeIds || []).includes(selectedNoticeId)
  ));

  useEffect(() => {
    setPublicationMode(Boolean(initialPublicationMode && selectedMatchesRequestedNotice));
    setPublicationDraft(selectedDraftText);
  }, [initialPublicationMode, selectedDraftText, selectedMatchesRequestedNotice]);

  async function patchNoticeGroup(notice, patch) {
    const ids = notice?.groupedNoticeIds?.length ? notice.groupedNoticeIds : [notice?.id].filter(Boolean);
    if (!ids.length) return;
    setMessage("");
    await Promise.all(ids.map((id) => api(`/notices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    })));
    setNotices((current) => current.map((notice) =>
      ids.includes(notice.id) ? { ...notice, ...patch } : notice
    ));
  }

  async function selectNotice(notice) {
    setSelectedId(notice.id);
    if (!notice.read) {
      try {
        await patchNoticeGroup(notice, { read: true });
      } catch (readError) {
        setError(readError.message);
      }
    }
  }

  async function retry() {
    if (!selected) return;
    setBusy("retry");
    setError("");
    setMessage("");
    try {
      await api(`/executions/${selected.executionId}/retry`, { method: "POST", body: "{}" });
      await load();
    } catch (retryError) {
      setError(retryError.message);
    } finally {
      setBusy("");
    }
  }

  async function runWorkflow() {
    if (!selected) return;
    setBusy("run");
    setError("");
    setMessage("");
    try {
      const result = await api(`/workflows/${selected.workflowId}/run`, {
        method: "POST",
        body: JSON.stringify({
          noticeId: selected.id,
          executionId: selected.executionId,
          subject: selected.subject,
          workflowName: selected.workflowName,
        }),
      });
      await load();
      setMessage(workflowRunMessage(result, isHnMonitorNotice(selected)
        ? "Búsqueda lanzada en Hacker News. Si encuentra señales nuevas, aparecerá otro aviso en unos segundos."
        : `Flow lanzado: ${selected.workflowName}. Revisa nuevos avisos en unos segundos; n8n puede tardar en generar el resultado.`));
    } catch (runError) {
      setError(runError.message);
    } finally {
      setBusy("");
    }
  }

  async function copyBody() {
    if (!selected) return;
    await navigator.clipboard.writeText(publicationMode ? publicationDraft : extractDraftText(selected.body));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  function openPublicationPrep() {
    if (!selected) return;
    setPublicationDraft(extractDraftText(selected.body));
    setPublicationMode(true);
  }

  const folderCounts = {
    inbox: notices.filter((notice) => !notice.archived && !notice.trashed && notice.status !== "managed").length,
    executed: notices.filter((notice) => notice.status === "managed" && !notice.archived && !notice.trashed).length,
    archive: notices.filter((notice) => notice.archived && !notice.trashed).length,
    trash: notices.filter((notice) => notice.trashed).length,
  };
  const inboxKarma = useMemo(() => editorialKarmaScore(notices.filter((notice) => !notice.archived && !notice.trashed)), [notices]);
  const selectedIsHnMonitor = selected?.workflowId === "hnDataImporterMonitor";
  const selectedPrimaryUrl = selected?.urls?.[0] || "";
  const selectedDestinationIssue = selected ? noticeDestinationIssue(selected) : null;
  const selectedPublicationUrl = selected ? forumPublicationUrl(selected) : "";
  const selectedPublicationLabel = selected ? forumPublicationLabel(selected) : "ABRIR FORO";

  return (
    <main className="inbox-workspace">
      <aside className="mailboxes">
        <div className="mailboxes-title">
          <div className="eyebrow">CENTRO DE AVISOS</div>
          <h2>Flow Inbox</h2>
        </div>
        <section className={`inbox-karma ${inboxKarma.tone}`}>
          <span>KARMA EDITORIAL</span>
          <div className="inbox-karma-scoreline">
            <strong>{inboxKarma.score || "—"}</strong>
            <div className="inbox-real-karma">
              <strong>—</strong>
              <small>real total</small>
            </div>
          </div>
          <p>{inboxKarma.label}</p>
          <small>{inboxKarma.helpful} ayuda · {inboxKarma.promo} promo</small>
          <em>{inboxKarma.recommendation}</em>
        </section>
        <nav className="mail-folders">
          {[
            ["inbox", "Entrada"],
            ["executed", "Hechos"],
            ["archive", "Archivados"],
            ["trash", "Papelera"],
          ].map(([id, label]) => (
            <button key={id} className={folder === id ? "active" : ""} onClick={() => setFolder(id)}>
              <span className={`folder-icon ${id}`}>{label.slice(0, 1)}</span>
              <strong>{label}</strong>
              <b>{folderCounts[id]}</b>
            </button>
          ))}
        </nav>
        <div className="buzones-n8n-section">
          <div className="mailbox-heading">BUZONES N8N</div>
          <div className="n8n-workflows-scroll">
            <div className="mailbox-list">
              <button className={workflowId === "all" ? "active" : ""} onClick={() => setWorkflowId("all")}>
                <i style={{ background: "#4a7ab5" }} />
                <span>Todos los flows</span>
                <b>{folderNotices.filter((notice) => !notice.read).length}</b>
              </button>
              {workflows.map((workflow, index) => {
                const flowNotices = folderNotices.filter((notice) => notice.workflowId === workflow.id);
                const unread = flowNotices.filter((notice) => !notice.read).length;
                const flowKarma = editorialKarmaScore(flowNotices);
                return (
                  <button
                    key={workflow.id}
                    className={workflowId === workflow.id ? "active" : ""}
                    onClick={() => setWorkflowId(workflow.id)}
                  >
                    <i style={{ background: GROUP_COLORS[index % GROUP_COLORS.length] }} />
                    <span title={workflow.name}>
                      {workflow.name}
                      {flowKarma.total > 0 && <small className={`workflow-karma ${flowKarma.tone}`}>karma {flowKarma.score}</small>}
                    </span>
                    <b className={unread ? "new" : ""}>{unread || flowNotices.length}</b>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      <section className="message-column">
        <header className="message-toolbar">
          <div>
            <strong>{workflowId === "all" ? "Todos los avisos" : workflows.find((item) => item.id === workflowId)?.name}</strong>
            <span>{visibleNotices.length} mensajes</span>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar"
            aria-label="Buscar avisos"
          />
          <Button onClick={load}>ACTUALIZAR</Button>
        </header>
        {error && <div className="notice error">{error}</div>}
        {message && <div className="notice success">{message}</div>}
        <div className="message-list-scroll">
          <div className="message-list">
            {loading && <div className="mail-empty">Leyendo ejecuciones de n8n...</div>}
            {!loading && !visibleNotices.length && <div className="mail-empty">No hay avisos en esta carpeta.</div>}
            {visibleNotices.map((notice) => (
              <button
                key={notice.id}
                className={`${selectedId === notice.id ? "selected" : ""} ${notice.read ? "" : "unread"}`}
                onClick={() => selectNotice(notice)}
              >
                <span className={`message-status ${statusTone(notice.status)}`} />
                <div>
                  <header>
                    <strong>{notice.subject}</strong>
                    <time>{notice.groupCount > 1 ? `${notice.groupCount} avisos` : relativeTime(notice.startedAt)}</time>
                  </header>
                  <span>{notice.workflowName} · {notice.channel}</span>
                  <p>{notice.preview}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="message-reader">
        {!selected ? (
          <div className="reader-empty">Selecciona un aviso para leerlo.</div>
        ) : (
          <>
            <header className="reader-header">
              <div>
                <div className="eyebrow">{selected.workflowName}</div>
                <h2>{selected.subject}</h2>
                <p>
                  {new Date(selected.startedAt).toLocaleString("es-ES")} · {selected.channel} · ejecución #{selected.executionId}
                </p>
              </div>
              <span className={`reader-status ${statusTone(selected.status)}`}>{executionStatusLabel(selected.status)}</span>
            </header>
            <div className="reader-actions">
              <Button onClick={copyBody}>{copied ? "COPIADO" : publicationMode ? "COPIAR TEXTO" : "COPIAR BORRADOR"}</Button>
              {selected && !selected.trashed && !publicationMode && <Button kind="primary" className="publish-primary" onClick={openPublicationPrep}>PREPARAR PUBLICACIÓN</Button>}
              {selectedPrimaryUrl && selectedIsHnMonitor && <a className="button primary" href={selectedPrimaryUrl} target="_blank" rel="noreferrer">ABRIR HN</a>}
              {selected.canRun && <Button kind={selectedIsHnMonitor ? undefined : "primary"} onClick={runWorkflow} disabled={Boolean(busy)}>{workflowRunButtonLabel(selected, busy === "run")}</Button>}
              {selected.canRetry && <Button kind="warning" onClick={retry} disabled={Boolean(busy)}>{busy === "retry" ? "REINTENTANDO..." : "REINTENTAR"}</Button>}
              {selected.formUrl && <a className="button ghost" href={selected.formUrl} target="_blank" rel="noreferrer">ABRIR FORMULARIO</a>}
              {!selected.trashed && publicationMode && <Button kind="primary" className="done-primary" onClick={() => patchNoticeGroup(selected, { status: "managed", read: true, archived: false })}>PUBLICACIÓN HECHA</Button>}
              {selected.status === "managed" && !selected.trashed && <Button onClick={() => patchNoticeGroup(selected, { status: "success", archived: false })}>REABRIR</Button>}
              {!selected.archived && !selected.trashed && <Button onClick={() => patchNoticeGroup(selected, { archived: true })}>ARCHIVAR</Button>}
              {selected.archived && !selected.trashed && <Button onClick={() => patchNoticeGroup(selected, { archived: false })}>MOVER A ENTRADA</Button>}
              {!selected.trashed && <Button kind="danger" onClick={() => patchNoticeGroup(selected, { trashed: true })}>PAPELERA</Button>}
              {selected.trashed && <Button onClick={() => patchNoticeGroup(selected, { trashed: false, archived: false })}>RESTAURAR</Button>}
            </div>
            {selected.canRun && <p className="reader-action-hint">{workflowRunHint(selected)}</p>}
            {selected.groupCount > 1 && (
              <div className="reader-group-summary">
                <strong>{selected.groupCount} avisos del mismo tema</strong>
                <span>Se muestra el último borrador. Los anteriores quedan como historial para distinguir seguimiento de tarea nueva.</span>
              </div>
            )}
            {selectedDestinationIssue && (
              <div className="reader-warning">
                <strong>{selectedDestinationIssue.title}</strong>
                <span>{selectedDestinationIssue.detail}</span>
              </div>
            )}
            {publicationMode ? (
              <section className="forum-publication-panel inbox-publication-panel">
                <header>
                  <div>
                    <strong>Pantalla de publicación</strong>
                    <span>Edita el borrador, copia el texto y abre el foro para publicarlo manualmente.</span>
                  </div>
                  <Button type="button" onClick={() => setPublicationMode(false)}>VOLVER AL AVISO</Button>
                </header>
                <textarea
                  value={publicationDraft}
                  onChange={(event) => setPublicationDraft(event.target.value)}
                  aria-label="Borrador editable para publicar"
                />
                <footer>
                  <Button type="button" onClick={copyBody}>{copied ? "COPIADO" : "COPIAR TEXTO"}</Button>
                  {selectedPublicationUrl && <a className="button primary publish-primary" href={selectedPublicationUrl} target="_blank" rel="noreferrer">{selectedPublicationLabel}</a>}
                  <Button type="button" kind="primary" className="done-primary" onClick={() => patchNoticeGroup(selected, { status: "managed", read: true, archived: false })}>PUBLICADO</Button>
                </footer>
              </section>
            ) : (
              <article className="reader-content">{selected.body}</article>
            )}
            {selected.urls.length > 0 && (
              <footer className="reader-links">
                {selected.urls.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    ABRIR ENLACE{selected.urls.length > 1 ? ` ${index + 1}` : ""} ↗
                  </a>
                ))}
              </footer>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Calendar({ workflows, refreshToken = 0, focusDateKey = "", onOpenWorkflow, onOpenInstagram, onOpenInbox, onOpenForumNotice, onOpenPublicationTarget, onOpenStats }) {
  const today = useMemo(() => new Date(), []);
  const dayPanelRef = useRef(null);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [notices, setNotices] = useState([]);
  const [posts, setPosts] = useState([]);
  const [publicationTargets, setPublicationTargets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [signalStates, setSignalStates] = useState({});
  const [expandedSignalIds, setExpandedSignalIds] = useState(() => new Set());
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [taskEditorMode, setTaskEditorMode] = useState("");
  const [taskDraft, setTaskDraft] = useState(() => ({
    title: "",
    notes: "",
    dueDate: dateKey(today),
    time: DEFAULT_TASK_TIME,
    status: "pending_confirmation",
    project: GENERIC_TASK_PROJECT,
    repeat: "none",
    repeatCount: DEFAULT_REPEAT_COUNT,
    repeatUntil: "",
    repeatWeekdays: [],
  }));
  const [loading, setLoading] = useState(true);
  const [savingTask, setSavingTask] = useState(false);
  const [scrollToDay, setScrollToDay] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const [noticeResult, postResult, taskResult, signalResult, targetResult] = await Promise.allSettled([
        api("/notices"),
        api("/publications/posts"),
        api("/calendar/tasks"),
        api("/calendar/signals"),
        api("/publication-targets"),
      ]);
      setNotices(noticeResult.status === "fulfilled" ? noticeResult.value.notices || [] : []);
      setPosts(postResult.status === "fulfilled" ? postResult.value.posts || [] : []);
      setTasks(taskResult.status === "fulfilled" ? taskResult.value.tasks || [] : []);
      setSignalStates(signalResult.status === "fulfilled" ? signalResult.value.signals || {} : {});
      setPublicationTargets(targetResult.status === "fulfilled" ? targetResult.value.targets || [] : []);
      const failures = [noticeResult, postResult, taskResult, signalResult, targetResult]
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason?.message)
        .filter(Boolean);
      if (failures.length) setError(failures[0]);
      const brainSignals = signalResult.status === "fulfilled" ? signalResult.value.editorial_brain : null;
      if (brainSignals?.configured && brainSignals.error) {
        setError(`Cerebro configurado pero no aportó señales: ${brainSignals.error}`);
      } else if (brainSignals?.configured && brainSignals.live && brainSignals.pulled && !brainSignals.received) {
        setInfo("El cerebro respondió y no hay señales nuevas. El calendario sigue con tareas y publicaciones.");
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  useEffect(() => {
    if (!focusDateKey) return;
    const focusedDate = new Date(`${focusDateKey}T12:00:00`);
    if (Number.isNaN(focusedDate.getTime())) return;
    setCursor(new Date(focusedDate.getFullYear(), focusedDate.getMonth(), 1));
    setSelectedDate(focusedDate);
    setScrollToDay(true);
  }, [focusDateKey]);

  const realEvents = useMemo(() => {
    const workflowEvents = workflows
      .filter((workflow) => workflow.lastExecution?.startedAt)
      .map((workflow) => {
        const matchingNotice = notices.find((notice) =>
          notice.workflowId === workflow.id
          && String(notice.executionId || "") === String(workflow.lastExecution.id || "")
          && !notice.trashed
        );
        if (matchingNotice) {
          const forumNotice = noticeIsForum(matchingNotice) || workflowIsForum(workflow, [matchingNotice]);
          const publicationNotice = noticeIsPublicationNotice(matchingNotice);
          return {
            id: `notice:${matchingNotice.id}`,
            date: matchingNotice.startedAt || workflow.lastExecution.startedAt,
            title: matchingNotice.subject || workflow.name,
            subtitle: `${matchingNotice.workflowName || workflow.name} · ${matchingNotice.channel || "aviso"}`,
            status: matchingNotice.status || workflow.lastExecution.status,
            source: "inbox",
            kind: "Aviso",
            signalStatus: ["managed", "ignored"].includes(matchingNotice.status) ? matchingNotice.status : undefined,
            actionLabel: publicationNotice ? "Ir a publicar" : forumNotice ? "Abrir foro" : "Abrir bandeja",
            action: () => forumNotice
              ? onOpenForumNotice(matchingNotice.workflowId, matchingNotice.id, { publicationMode: publicationNotice })
              : onOpenInbox(matchingNotice.id, { publicationMode: publicationNotice }),
          };
        }
        if (statusTone(workflow.lastExecution.status) !== "error") return null;
        const eventId = `workflow:${workflow.id}:${workflow.lastExecution.id}`;
        return {
          id: eventId,
          date: workflow.lastExecution.startedAt,
          title: workflow.name,
          subtitle: `Última ejecución #${workflow.lastExecution.id}`,
          status: workflow.lastExecution.status,
          source: "n8n",
          kind: "Ejecución",
          actionLabel: "Ver técnica",
          action: () => onOpenWorkflow(workflow.id, { signalId: eventId, title: workflow.name }),
        };
      })
      .filter(Boolean);

    const noticeEvents = groupNoticeList(notices.filter((notice) => !notice.archived && !notice.trashed))
      .map((notice) => {
        const forumNotice = noticeIsForum(notice);
        const publicationNotice = noticeIsPublicationNotice(notice);
        return {
          id: `notice:${notice.id}`,
          date: notice.startedAt,
          title: notice.subject,
          subtitle: notice.groupCount > 1
            ? `${notice.workflowName} · ${notice.groupCount} avisos agrupados`
            : `${notice.workflowName} · ${notice.channel}`,
          status: notice.status,
          source: "inbox",
          kind: "Aviso",
          noticeIds: notice.groupedNoticeIds || [notice.id],
          groupCount: notice.groupCount || 1,
          signalStatus: ["managed", "ignored"].includes(notice.status) ? notice.status : undefined,
          actionLabel: publicationNotice ? "Ir a publicar" : forumNotice ? "Abrir foro" : "Abrir bandeja",
          action: () => forumNotice
            ? onOpenForumNotice(notice.workflowId, notice.id, { publicationMode: publicationNotice })
            : onOpenInbox(notice.id, { publicationMode: publicationNotice }),
        };
      });

    const postEvents = posts
      .filter((post) => post.scheduledAt || post.createdAt || post.publishedAt)
      .flatMap((post) => {
        const scheduled = post.action === "schedule";
        const pendingPublication = post.action === "review" || post.status === "pending_publication";
        const awaitingConfirmation = isPublicationAwaitingConfirmation(post.status);
        const targetName = post.target?.name || "Publicación";
        const label = publicationStatusLabel(post.status, post.action);
        const fullText = String(post.caption || post.result?.youtube?.title || "").replace(/\s+/g, " ").trim();
        const baseEvent = {
          title: pendingPublication ? `${targetName} pendiente` : scheduled ? `${targetName} programado` : `${targetName} · ${label}`,
          subtitle: fullText || "Sin texto",
          fullText,
          status: post.status,
          source: post.target?.id || "publicaciones",
          kind: pendingPublication ? "Pendiente de publicación" : scheduled ? "Programación" : "Publicación",
          actionLabel: pendingPublication ? "Revisar y publicar" : "Abrir publicaciones",
          action: () => onOpenInstagram(post),
          pendingPublication,
          postId: post.id,
          awaitingConfirmation,
        };
        const publishEvent = {
          ...baseEvent,
          id: `publication:${post.id}`,
          date: post.scheduledAt || post.publishedAt || post.createdAt,
        };
        if (!pendingPublication || !post.createdAt || sameDate(post.createdAt, publishEvent.date)) {
          return [publishEvent];
        }
        return [
          {
            ...baseEvent,
            id: `publication-prepared:${post.id}`,
            date: post.createdAt,
            title: `${targetName} preparado`,
            status: "done",
            kind: "Preparado para publicar",
            actionLabel: "Abrir preparación",
            pendingPublication: false,
            preparedPublication: true,
          },
          publishEvent,
        ];
      });
    const brainEvents = Object.entries(signalStates)
      .filter(([id, signal]) =>
        id.startsWith("brain:")
        && !id.startsWith("brain:ads:campaign:")
        && signal?.kind !== "Campaña candidata"
        && signal?.date
        && !["managed", "ignored"].includes(signal.status)
      )
      .map(([id, signal]) => {
        const view = signal.actionView || "";
        const targetId = publicationTargetIdFromSignal(signal);
        const targetLabel = publicationTargetLabel(targetId);
        const advice = calendarSignalAdvice(signal);
        return {
          id,
          date: signal.date,
          title: signal.title || "Consejo del cerebro",
          subtitle: signal.subtitle || "Editorial Brain",
          fullText: signal.fullText || "",
          advice,
          publicationTargetId: targetId,
          status: signal.status || "pending",
          source: signal.source || "editorial-brain",
          kind: signal.kind || "Consejo",
          signalStatus: signal.status || "pending",
          actionLabel: targetId ? `Abrir ${targetLabel}` : view === "stats" ? "Abrir estadísticas" : "Abrir consejo",
          action: () => {
            if (targetId) {
              onOpenPublicationTarget?.(targetId, {
                title: signal.title || "Consejo del cerebro",
                project: targetLabel,
                notes: [
                  advice.what,
                  advice.why ? `Por qué: ${advice.why}` : "",
                  signal.fullText || signal.subtitle || "",
                ].filter(Boolean).join("\n\n"),
              });
              return;
            }
            if (view === "instagram") {
              onOpenInstagram({ text: signal.fullText || signal.subtitle || "", notes: signal.fullText || signal.subtitle || "", source: "editorial-brain" });
              return;
            }
            onOpenStats?.();
          },
        };
      });

    const eventMap = new Map();
    [...workflowEvents, ...noticeEvents, ...postEvents, ...brainEvents].forEach((event) => {
      if (!eventMap.has(event.id)) eventMap.set(event.id, event);
    });
    const contentMap = new Map();
    [...eventMap.values()].forEach((event) => {
      const contentKey = [
        event.source,
        event.kind,
        dateKey(new Date(event.date)),
        compactText(event.title).toLowerCase(),
      ].join("|");
      const current = contentMap.get(contentKey);
      if (!current || new Date(event.date) > new Date(current.date)) {
        contentMap.set(contentKey, event);
      }
    });
    return [...contentMap.values()]
      .filter((event) => event.date && !Number.isNaN(new Date(event.date).getTime()))
      .map((event) => ({
        ...event,
        signalStatus: signalStates[event.id]?.status || event.signalStatus || (event.preparedPublication ? "managed" : event.pendingPublication ? "pending" : event.source !== "n8n" && event.source !== "inbox" && !/programado/i.test(event.title) ? "managed" : "pending"),
      }))
      .sort((left, right) => new Date(left.date) - new Date(right.date));
  }, [notices, onOpenForumNotice, onOpenInbox, onOpenInstagram, onOpenPublicationTarget, onOpenStats, onOpenWorkflow, posts, signalStates, workflows]);

  const selectedKey = dateKey(selectedDate);
  const selectedTasks = tasks
    .filter((task) => task.dueDate === selectedKey)
    .sort((left, right) => `${left.time || "99:99"} ${left.createdAt}`.localeCompare(`${right.time || "99:99"} ${right.createdAt}`));
  const visibleRealEvents = realEvents.filter((event) => !["ignored", "managed"].includes(event.signalStatus));
  const selectedEvents = visibleRealEvents.filter((event) => sameDate(event.date, selectedDate));
  const cells = monthCells(cursor.getFullYear(), cursor.getMonth());
  const editingTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const editingSeriesTasks = useMemo(() => {
    if (!editingTask) return [];
    const groupId = editingTask.recurrence?.groupId || editingTask.id;
    return tasks
      .filter((task) => task.id === editingTask.id || task.recurrence?.groupId === groupId)
      .sort((left, right) => `${left.dueDate} ${left.createdAt}`.localeCompare(`${right.dueDate} ${right.createdAt}`));
  }, [editingTask, tasks]);
  const defaultPublicationTarget = publicationTargets[0]?.name || "";
  const repeatDescription = (() => {
    const date = new Date(`${taskDraft.dueDate || selectedKey}T12:00:00`);
    if (taskDraft.repeat === "none") return "Se crea solo una vez.";
    if (taskDraft.repeat === "weekly") return `Se crea cada ${WEEKDAY_LONG[date.getDay()]} hasta la fecha final.`;
    if (taskDraft.repeat === "biweekly") return `Se crea cada 2 semanas, siempre en ${WEEKDAY_LONG[date.getDay()]}.`;
    if (taskDraft.repeat === "triweekly") return `Se crea cada 3 semanas, siempre en ${WEEKDAY_LONG[date.getDay()]}.`;
    if (taskDraft.repeat === "monthly") return `Se crea el día ${date.getDate()} de cada mes hasta la fecha final.`;
    return "Elige cada cuánto se repite la programación.";
  })();
  const editingSeriesSummary = (() => {
    if (!editingTask?.recurrence?.groupId) return "";
    const recurrence = editingTask.recurrence || {};
    const first = editingSeriesTasks[0] || editingTask;
    const last = editingSeriesTasks.at(-1) || editingTask;
    const start = recurrence.startDate || first.dueDate;
    const until = recurrence.until || last.dueDate;
    const count = recurrence.count || editingSeriesTasks.length;
    const baseDate = new Date(`${start || editingTask.dueDate}T12:00:00`);
    const weekday = recurrence.weekdays?.length
      ? recurrence.weekdays.map((day) => WEEKDAY_LONG[day]).join(", ")
      : WEEKDAY_LONG[baseDate.getDay()];
    const repeatLabel = TASK_REPEATS.find(([value]) => value === recurrence.type)?.[1] || "Repetición";
    const endText = recurrence.until ? `hasta ${until}` : `${count} veces`;
    if (recurrence.type === "monthly") return `${repeatLabel}: día ${baseDate.getDate()} de cada mes, ${endText}.`;
    return `${repeatLabel}: ${weekday}, ${endText}.`;
  })();
  useEffect(() => {
    if (editingTask) {
      const recurrence = editingTask.recurrence || {};
      setTaskDraft({
        title: editingTask.title || "",
        notes: editingTask.notes || "",
        dueDate: editingTask.dueDate || selectedKey,
        time: editingTask.time || DEFAULT_TASK_TIME,
        status: editingTask.status || "pending",
        project: editingTask.project === "Tarea" ? GENERIC_TASK_PROJECT : editingTask.project || "",
        repeat: recurrence.type || "weekly",
        repeatCount: recurrence.count || editingSeriesTasks.length || DEFAULT_REPEAT_COUNT,
        repeatUntil: recurrence.until || "",
        repeatWeekdays: recurrence.weekdays || [],
      });
      setTaskEditorMode("edit");
      return;
    }
    setTaskDraft((current) => ({ ...current, dueDate: selectedKey }));
  }, [editingTask, editingSeriesTasks, selectedKey]);

  useEffect(() => {
    if (!scrollToDay) return;
    const target = dayPanelRef.current;
    window.setTimeout(() => {
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToDay(false);
    }, 40);
  }, [scrollToDay, selectedEvents.length, selectedKey]);

  function moveMonth(amount) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  function selectDay(day) {
    setSelectedDate(day);
    setSelectedTaskId("");
    setScrollToDay(true);
    if (taskEditorMode === "edit") setTaskEditorMode("");
  }

  function resetTaskDraft(day = selectedDate) {
    setSelectedTaskId("");
    setTaskDraft({
      title: "",
      notes: "",
      dueDate: dateKey(day),
      time: DEFAULT_TASK_TIME,
      status: "pending_confirmation",
      project: GENERIC_TASK_PROJECT,
      repeat: "none",
      repeatCount: DEFAULT_REPEAT_COUNT,
      repeatUntil: "",
      repeatWeekdays: [],
    });
  }

  function openNewTask(repeat = "none") {
    resetTaskDraft(selectedDate);
    setTaskDraft((current) => ({ ...current, repeat }));
    setTaskEditorMode("new");
  }

  function viewSelectedDayTasks() {
    resetTaskDraft();
    setTaskEditorMode("");
    setScrollToDay(true);
  }

  async function saveTask(event) {
    event.preventDefault();
    const genericTask = taskDraft.project === GENERIC_TASK_PROJECT;
    setSavingTask(true);
    setError("");
    try {
      const payload = {
        ...taskDraft,
        project: genericTask ? "Tarea" : taskDraft.project,
        title: genericTask
          ? taskDraft.title.trim()
          : editingTask
            ? taskDraft.title
            : `Publicar en ${taskDraft.project || defaultPublicationTarget || "Publicaciones"}`,
        notes: taskDraft.notes,
        repeatWeekdays: [],
      };
      const result = editingTask
        ? await api(`/calendar/tasks/${encodeURIComponent(editingTask.id)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await api("/calendar/tasks", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      setTasks((current) => {
        if (editingTask) return current.map((task) => task.id === result.task.id ? result.task : task);
        return [...current, ...(result.tasks || [result.task])];
      });
      setSelectedDate(new Date(`${result.task.dueDate}T12:00:00`));
      resetTaskDraft(new Date(`${result.task.dueDate}T12:00:00`));
      setTaskEditorMode("");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingTask(false);
    }
  }

  async function saveTaskSeries() {
    if (!editingTask?.recurrence?.groupId) return;
    const genericTask = taskDraft.project === GENERIC_TASK_PROJECT || taskDraft.project === "Tarea";
    const confirmed = window.confirm(`Vas a modificar toda esta programación: ${editingSeriesTasks.length} ${genericTask ? "tareas" : "publicaciones"}. ¿Continuar?`);
    if (!confirmed) return;
    setSavingTask(true);
    setError("");
    try {
      const payload = {
        ...taskDraft,
        project: genericTask ? "Tarea" : taskDraft.project,
        title: genericTask ? taskDraft.title.trim() : taskDraft.title || `Publicar en ${taskDraft.project || defaultPublicationTarget || "Publicaciones"}`,
        notes: taskDraft.notes,
        repeatWeekdays: [],
      };
      const result = await api(`/calendar/tasks/${encodeURIComponent(editingTask.id)}/series`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const updatedTasks = result.tasks || [];
      const updatedIds = new Set(updatedTasks.map((task) => task.id));
      setTasks((current) => current.map((task) => updatedIds.has(task.id) ? updatedTasks.find((item) => item.id === task.id) : task));
      if (result.task?.dueDate) setSelectedDate(new Date(`${result.task.dueDate}T12:00:00`));
      resetTaskDraft(result.task?.dueDate ? new Date(`${result.task.dueDate}T12:00:00`) : selectedDate);
      setTaskEditorMode("");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingTask(false);
    }
  }

  async function updateTaskStatus(task, status) {
    const previous = tasks;
    const optimistic = { ...task, status };
    setTasks((current) => current.map((item) => item.id === task.id ? optimistic : item));
    setError("");
    try {
      const result = await api(`/calendar/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ...task, status }),
      });
      setTasks((current) => current.map((item) => item.id === task.id ? result.task : item));
    } catch (statusError) {
      setTasks(previous);
      setError(statusError.message);
    }
  }

  async function openTaskPublication(task) {
    const target = publicationTargetForTask(task, publicationTargets);
    if (!target) {
      setSelectedTaskId(task.id);
      setTaskEditorMode("edit");
      return;
    }
    const targetId = String(target.id || "").toLowerCase();
    onOpenPublicationTarget?.(targetId || "instagram", task);
  }

  async function prepareInstagramTask(task) {
    setError("");
    try {
      await api(`/calendar/tasks/${encodeURIComponent(task.id)}/prepare-instagram`, { method: "POST" });
      await openTaskPublication(task);
    } catch (prepareError) {
      setError(prepareError.message);
    }
  }

  async function deleteTask() {
    if (!editingTask) return;
    await deleteTaskById(editingTask.id);
  }

  async function deleteTaskById(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const previous = tasks;
    setTasks((current) => current.filter((item) => item.id !== taskId));
    setSelectedTaskId("");
    setError("");
    try {
      await api(`/calendar/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      resetTaskDraft();
      setTaskEditorMode("");
    } catch (deleteError) {
      setTasks(previous);
      setError(deleteError.message);
    }
  }

  async function deleteTaskSeriesById(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const groupId = task.recurrence?.groupId || task.id;
    const series = tasks.filter((item) => item.id === task.id || item.recurrence?.groupId === groupId);
    const confirmed = window.confirm(`Vas a borrar toda esta programación: ${series.length} tareas. ¿Continuar?`);
    if (!confirmed) return;
    const previous = tasks;
    setTasks((current) => current.filter((item) => item.id !== task.id && item.recurrence?.groupId !== groupId));
    setSelectedTaskId("");
    setError("");
    try {
      await api(`/calendar/tasks/${encodeURIComponent(taskId)}/series`, { method: "DELETE" });
      resetTaskDraft();
      setTaskEditorMode("");
    } catch (deleteError) {
      setTasks(previous);
      setError(deleteError.message);
    }
  }

  async function updateSignalStatus(event, status) {
    const previous = signalStates;
    setSignalStates((current) => ({
      ...current,
      [event.id]: { ...(current[event.id] || {}), status },
    }));
    setError("");
    try {
      if (event.source === "inbox" && event.id.startsWith("notice:")) {
        const noticeIds = event.noticeIds?.length ? event.noticeIds : [event.id.replace(/^notice:/, "")];
        const removeNotice = status === "ignored";
        await Promise.all(noticeIds.map((noticeId) => api(`/notices/${encodeURIComponent(noticeId)}`, {
          method: "PATCH",
          body: JSON.stringify(removeNotice
            ? { status, read: true, archived: false, trashed: true }
            : { status, read: true, archived: false }),
        })));
        setNotices((current) => current.map((notice) =>
          noticeIds.includes(notice.id)
            ? { ...notice, status, read: true, archived: false, trashed: removeNotice }
            : notice
        ));
        return;
      }
      const result = await api(`/calendar/signals/${encodeURIComponent(event.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setSignalStates((current) => ({ ...current, [event.id]: result.signal }));
    } catch (signalError) {
      setSignalStates(previous);
      setError(signalError.message);
    }
  }

  function toggleSignalDetails(signalId) {
    setExpandedSignalIds((current) => {
      const next = new Set(current);
      if (next.has(signalId)) next.delete(signalId);
      else next.add(signalId);
      return next;
    });
  }

  async function confirmPublicationPost(postId) {
    setError("");
    setInfo("");
    try {
      const result = await api(`/publications/posts/${encodeURIComponent(postId)}/confirm`, { method: "POST" });
      await load();
      if (result.learned) {
        setInfo(result.trainingSource === "editorial-brain"
          ? "Publicación confirmada. El cerebro la recibió para aprender."
          : "Publicación confirmada. Guardada en la memoria local.");
      } else if (result.trainingError) {
        setError(`Publicación confirmada. El cerebro no recibió el aprendizaje: ${result.trainingError}`);
      } else {
        setInfo("Publicación confirmada. No hay aprendizaje editorial que enviar.");
      }
    } catch (confirmError) {
      setError(confirmError.message);
    }
  }

  const selectedTitle = selectedDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const selectedDayItems = [
    ...selectedTasks.map((task) => ({ type: "task", task, date: `${task.dueDate}T${task.time || DEFAULT_TASK_TIME}:00` })),
    ...selectedEvents.map((event) => ({ type: "event", event, date: event.date })),
  ].sort((left, right) => new Date(left.date) - new Date(right.date));

  return (
    <main className="calendar-workspace dashboard-calendar-workspace">
      <section className="dashboard-calendar-shell">
        <header className="dashboard-calendar-header">
          <div className="dashboard-calendar-title">
            <div className="dashboard-calendar-title-row">
              <button type="button" className="calendar-nav-icon" aria-label="Mes anterior" onClick={() => moveMonth(-1)}>‹</button>
              <button type="button" className="calendar-nav-icon" aria-label="Mes siguiente" onClick={() => moveMonth(1)}>›</button>
              <h2>{MONTHS[cursor.getMonth()]} de {cursor.getFullYear()}</h2>
            </div>
            <span className="eyebrow">Calendario</span>
          </div>
          <div className="dashboard-calendar-actions">
            <Button onClick={() => {
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelectedDate(today);
            }}>Hoy</Button>
            <Button onClick={load} disabled={loading}>{loading ? "Sync..." : "Sync"}</Button>
          </div>
        </header>
        {error && <div className="notice error">{error}</div>}
        {info && <div className="notice success">{info}</div>}

        <div className="calendar-dashboard-layout">
          <section className="dashboard-month panel">
            <div className="dashboard-month-head">
              <strong>{MONTHS[cursor.getMonth()]}</strong>
              <span>{cursor.getFullYear()}</span>
            </div>
            <div className="dashboard-weekdays">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="dashboard-month-grid">
              {cells.map((cell) => {
                const dayEvents = visibleRealEvents.filter((event) => sameDate(event.date, cell));
                const dayTasks = tasks.filter((task) => task.dueDate === dateKey(cell));
                const actionCount = dayEvents.length + dayTasks.length;
                const currentMonth = cell.getMonth() === cursor.getMonth();
                return (
                  <button
                    key={dateKey(cell)}
                    type="button"
                    className={`${currentMonth ? "" : "outside"} ${sameDate(cell, selectedDate) ? "selected" : ""} ${sameDate(cell, today) ? "today" : ""}`}
                    onClick={() => selectDay(cell)}
                  >
                    <span className="day-number">{cell.getDate()}</span>
                    {actionCount > 0 && <span className="day-action-count">{actionCount}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="dashboard-events panel" ref={dayPanelRef}>
            <header>
              <div>
                <span>Acciones</span>
                <h3>{selectedTitle}</h3>
              </div>
              <div>
                <Button kind="primary" onClick={() => openNewTask("none")}>Tarea puntual</Button>
                <Button onClick={() => openNewTask("weekly")}>Tarea repetitiva</Button>
              </div>
            </header>
            <div className="dashboard-event-list">
              {loading && <div className="empty">Leyendo acciones...</div>}
              {!loading && !selectedDayItems.length && <div className="empty">Sin acciones para este día.</div>}
              {selectedDayItems.map((item) => {
                if (item.type === "task") {
                  const task = item.task;
                  const publicationTarget = publicationTargetForTask(task, publicationTargets);
                  return (
                    <article key={`dash-${task.id}`} className={`dashboard-event-card ${taskTone(task.status)}`}>
                      <time>
                        <strong>{new Date(`${task.dueDate}T12:00:00`).getDate()}</strong>
                        <span>{new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short" })}</span>
                      </time>
                      <div>
                        <strong>{task.title}</strong>
                        <p>{task.time || "12:00"} · {taskStatusLabel(task.status)}{task.project ? ` · ${task.project}` : ""}</p>
                        {task.notes && <p className="dashboard-task-hint">Pista: {task.notes}</p>}
                        {publicationTarget && (
                          <p className="dashboard-task-help">
                            {manualPublicationLabel(publicationTarget, task)} abre la pantalla de Publicaciones. Al terminar, pulsa Hecho o Borrar si ya está cerrado.
                          </p>
                        )}
                        <footer>
                          {publicationTarget && <button type="button" onClick={() => openTaskPublication(task)}>{manualPublicationLabel(publicationTarget, task)}</button>}
                          {isInstagramTaskClient(task) && (
                            <button type="button" onClick={() => prepareInstagramTask(task)}>Dejar listo en Instagram</button>
                          )}
                          <button type="button" onClick={() => task.status === "done" ? deleteTaskById(task.id) : updateTaskStatus(task, "done")}>{task.status === "done" ? "Borrar" : "Hecho"}</button>
                          <button type="button" onClick={() => setSelectedTaskId(task.id)}>Editar</button>
                        </footer>
                      </div>
                    </article>
                  );
                }
                const event = item.event;
                const advice = event.advice || calendarSignalAdvice(event);
                const details = calendarSignalDetails(event);
                const expanded = expandedSignalIds.has(event.id);
                return (
                  <article key={`dash-${event.id}`} className={`dashboard-event-card ${signalTone(event.signalStatus, event.status)}`}>
                    <time>
                      <strong>{new Date(event.date).getDate()}</strong>
                      <span>{new Date(event.date).toLocaleDateString("es-ES", { weekday: "short" })}</span>
                    </time>
                    <div>
	                      <strong>{event.title}</strong>
	                      <p>{new Date(event.date).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · {event.kind}</p>
	                      {event.groupCount > 1 && <p className="dashboard-task-hint">Seguimiento: {event.groupCount} avisos agrupados del mismo tema.</p>}
	                      {event.source === "editorial-brain" && (
                        <div className="dashboard-brain-advice">
                          <span>Qué hacer</span>
                          <strong>{advice.what}</strong>
                          {advice.why && (
                            <>
                              <span>Por qué</span>
                              <em>{advice.why}</em>
                            </>
                          )}
                          {!advice.why && advice.summary && <em>{advice.summary}</em>}
                        </div>
                      )}
                      {event.source === "editorial-brain" && expanded && (
                        <div className="dashboard-brain-details">
                          {details.newsTitle && (
                            <section>
                              <span>Noticia</span>
                              <strong>{details.newsTitle}</strong>
                            </section>
                          )}
                          {(details.sourceName || details.sourceUrl) && (
                            <section>
                              <span>Fuente</span>
                              {details.sourceUrl
                                ? <a href={details.sourceUrl} target="_blank" rel="noreferrer">{details.sourceName || details.sourceUrl}</a>
                                : <strong>{details.sourceName}</strong>}
                            </section>
                          )}
                          {details.channel && (
                            <section>
                              <span>Canal sugerido</span>
                              <strong>{publicationTargetLabel(details.channel.toLowerCase())}</strong>
                            </section>
                          )}
                          {details.body && (
                            <section>
                              <span>Detalle</span>
                              <p>{details.body}</p>
                            </section>
                          )}
                        </div>
                      )}
                        <footer>
                          {event.source === "editorial-brain" && (
                            <button type="button" onClick={() => toggleSignalDetails(event.id)}>{expanded ? "Cerrar info" : "Ampliar"}</button>
                          )}
                          <button type="button" onClick={event.action}>{event.actionLabel || "Gestionar"}</button>
                          {event.awaitingConfirmation && event.postId && (
                            <button type="button" onClick={() => confirmPublicationPost(event.postId)}>Confirmar publicado</button>
                          )}
                          {!String(event.id || "").startsWith("publication") && (
                            <>
                              <button type="button" onClick={() => updateSignalStatus(event, "managed")}>Hecho</button>
                              <button type="button" onClick={() => updateSignalStatus(event, "ignored")}>Borrar</button>
                            </>
                          )}
                        </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>
        </div>
      </section>

      {taskEditorMode && (
        <div className="calendar-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            resetTaskDraft();
            setTaskEditorMode("");
          }
        }}>
          <section className="calendar-task-modal">
            <header>
              <button type="button" className="icon-button" aria-label="Mover">≡</button>
              <button type="button" className="icon-button" onClick={() => {
                resetTaskDraft();
                setTaskEditorMode("");
              }}>×</button>
            </header>
            <form onSubmit={saveTask}>
              <input
                className="task-title-input"
                type="text"
                value={taskDraft.title}
                onChange={(event) => setTaskDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Añade un título"
              />
              <div className="task-kind-tabs">
                <button type="button" className={taskDraft.repeat === "none" ? "active" : ""} onClick={() => setTaskDraft((current) => ({ ...current, repeat: "none" }))}>Tarea puntual</button>
                <button type="button" className={taskDraft.repeat !== "none" ? "active" : ""} onClick={() => setTaskDraft((current) => ({ ...current, repeat: current.repeat === "none" ? "weekly" : current.repeat }))}>Tarea repetitiva</button>
              </div>
              <div className="task-form-grid">
                <label>
                  Día
                  <input type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                </label>
                <label>
                  Hora
                  <input type="time" value={taskDraft.time} onChange={(event) => setTaskDraft((current) => ({ ...current, time: event.target.value }))} />
                </label>
              </div>
              {taskDraft.repeat !== "none" && !editingTask && (
                <>
                  <label>
                    Repetir
                    <select value={taskDraft.repeat} onChange={(event) => setTaskDraft((current) => ({ ...current, repeat: event.target.value }))}>
                      {TASK_REPEATS.filter(([value]) => value !== "none").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <p className="repeat-explain">{repeatDescription}</p>
                  <div className="task-form-grid">
                    <label>
                      Hasta
                      <input type="date" value={taskDraft.repeatUntil} onChange={(event) => setTaskDraft((current) => ({ ...current, repeatUntil: event.target.value }))} />
                    </label>
                    <label>
                      Veces si no pones fecha final
                      <input type="number" min="1" max="366" value={taskDraft.repeatCount} onChange={(event) => setTaskDraft((current) => ({ ...current, repeatCount: event.target.value }))} />
                    </label>
                  </div>
                </>
              )}
              <label>
                Destino
                <select value={taskDraft.project} onChange={(event) => {
                  const value = event.target.value;
                  const target = publicationTargets.find((item) => item.name === value);
                  setTaskDraft((current) => ({
                    ...current,
                    project: value,
                    title: value === GENERIC_TASK_PROJECT ? current.title : target ? `Publicar en ${target.name}` : current.title,
                  }));
                }}>
                  <option value={GENERIC_TASK_PROJECT}>Tarea</option>
                  {publicationTargets.map((target) => <option key={target.id} value={target.name}>{target.name}</option>)}
                </select>
              </label>
              <label>
                Descripción
                <textarea value={taskDraft.notes} onChange={(event) => setTaskDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Descripción opcional..." />
              </label>
              {editingTask && (
                <label>
                  Estado
                  <select value={taskDraft.status} onChange={(event) => setTaskDraft((current) => ({ ...current, status: event.target.value }))}>
                    {TASK_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              )}
              {editingTask?.recurrence?.groupId && <div className="task-series-info"><strong>Serie</strong><span>{editingSeriesSummary}</span></div>}
              <footer>
                {editingTask && <Button type="button" kind="danger" onClick={deleteTask}>Borrar esta</Button>}
                {editingTask?.recurrence?.groupId && <Button type="button" kind="danger" onClick={() => deleteTaskSeriesById(editingTask.id)}>Borrar serie</Button>}
                <span />
                <Button type="button" onClick={viewSelectedDayTasks}>Ver tareas</Button>
                <Button type="button" onClick={() => { resetTaskDraft(); setTaskEditorMode(""); }}>Cancelar</Button>
                {editingTask?.recurrence?.groupId && <Button type="button" kind="primary" disabled={savingTask} onClick={saveTaskSeries}>{savingTask ? "Guardando..." : "Guardar serie"}</Button>}
                <Button kind="primary" disabled={!taskDraft.title.trim() || savingTask}>{savingTask ? "Guardando..." : editingTask ? "Guardar" : "Crear"}</Button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function NotesNotebook() {
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteImages, setNoteImages] = useState([]);
  const [editingNoteId, setEditingNoteId] = useState("");
  const [editingNoteDraft, setEditingNoteDraft] = useState("");
  const [editingNoteImages, setEditingNoteImages] = useState([]);
  const [viewingNoteId, setViewingNoteId] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingNoteImage, setUploadingNoteImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api("/calendar/notes");
      setNotes(result.notes || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadNoteImageFile(file, applyImage) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type || "")) {
      setError("Sube una imagen JPG, PNG, WebP o GIF.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("La imagen debe pesar menos de 8 MB.");
      return;
    }
    setUploadingNoteImage(true);
    setError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await api("/calendar/notes/media", {
        method: "POST",
        body: JSON.stringify({ dataUrl }),
      });
      if (result.image) applyImage(result.image);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploadingNoteImage(false);
    }
  }

  async function uploadNewNoteImage(event) {
    await uploadNoteImageFile(event.target.files?.[0], (image) => {
      setNoteImages((current) => [...current, image].slice(0, 8));
    });
    event.target.value = "";
  }

  async function uploadEditingNoteImage(event) {
    await uploadNoteImageFile(event.target.files?.[0], (image) => {
      setEditingNoteImages((current) => [...current, image].slice(0, 8));
    });
    event.target.value = "";
  }

  async function saveNote() {
    const body = noteDraft.trim();
    if (!body && !noteImages.length) return;
    setSavingNote(true);
    setError("");
    try {
      const result = await api("/calendar/notes", {
        method: "POST",
        body: JSON.stringify({ body, images: noteImages }),
      });
      setNotes(result.notes || (result.note ? [result.note, ...notes] : notes));
      setNoteDraft("");
      setNoteImages([]);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingNote(false);
    }
  }

  function startEditingNote(note) {
    setEditingNoteId(note.id);
    setEditingNoteDraft(note.body || "");
    setEditingNoteImages(note.images || []);
    setViewingNoteId("");
  }

  function cancelEditingNote() {
    setEditingNoteId("");
    setEditingNoteDraft("");
    setEditingNoteImages([]);
  }

  async function updateNote(noteId) {
    const body = editingNoteDraft.trim();
    if (!body && !editingNoteImages.length) return;
    setSavingNote(true);
    setError("");
    try {
      const result = await api(`/calendar/notes/${encodeURIComponent(noteId)}`, {
        method: "PATCH",
        body: JSON.stringify({ body, images: editingNoteImages }),
      });
      setNotes(result.notes || (result.note ? notes.map((note) => note.id === noteId ? result.note : note) : notes));
      setViewingNoteId("");
      cancelEditingNote();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(noteId) {
    setError("");
    try {
      await api(`/calendar/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" });
      setNotes((current) => current.filter((note) => note.id !== noteId));
      if (viewingNoteId === noteId) setViewingNoteId("");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  return (
    <main className="notebook-workspace">
      <section className="notebook-shell">
        <header className="generator-header">
          <div>
            <span className="eyebrow">Libreta de notas</span>
            <h2>Notas</h2>
            <p>Ideas, apuntes y fotos con espacio propio para escribir sin comprimir el calendario.</p>
          </div>
          <Button onClick={loadNotes} disabled={loading}>{loading ? "CARGANDO..." : "ACTUALIZAR"}</Button>
        </header>
        {error && <div className="notice error">{error}</div>}
        <section className="notebook-layout">
          <article className="panel notebook-editor">
            <label>
              Nueva nota
              <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Escribe una nota larga, una idea o un borrador..." />
            </label>
            <footer>
              <span>{noteDraft.length.toLocaleString("es-ES")} caracteres</span>
              <div className="notebook-editor-actions">
                <div className="calendar-note-upload notebook-upload">
                  <label>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadNewNoteImage} />
                    <span>{uploadingNoteImage ? "SUBIENDO..." : "AÑADIR FOTO"}</span>
                  </label>
                </div>
                <Button type="button" kind="primary" disabled={(!noteDraft.trim() && !noteImages.length) || savingNote || uploadingNoteImage} onClick={saveNote}>
                  {savingNote ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </footer>
            {noteImages.length > 0 && (
              <div className="calendar-note-images draft">
                {noteImages.map((image) => (
                  <figure key={image.id}>
                    <img src={image.url} alt="" />
                    <button type="button" aria-label="Quitar foto" title="Quitar foto" onClick={() => setNoteImages((current) => current.filter((item) => item.id !== image.id))}>x</button>
                  </figure>
                ))}
              </div>
            )}
          </article>

          <section className="notebook-list">
            {loading && <div className="empty">Leyendo notas...</div>}
            {!loading && notes.length ? notes.map((note) => {
              const editing = editingNoteId === note.id;
              const viewing = viewingNoteId === note.id;
              const images = note.images || [];
              return (
                <article key={note.id} className={`panel notebook-note ${viewing ? "viewing" : ""}`}>
                  {editing ? (
                    <>
                      <textarea value={editingNoteDraft} onChange={(event) => setEditingNoteDraft(event.target.value)} />
                      <div className="calendar-note-upload">
                        <label>
                          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadEditingNoteImage} />
                          <span>{uploadingNoteImage ? "SUBIENDO..." : "AÑADIR FOTO"}</span>
                        </label>
                      </div>
                      {editingNoteImages.length > 0 && (
                        <div className="calendar-note-images">
                          {editingNoteImages.map((image) => (
                            <figure key={image.id}>
                              <img src={image.url} alt="" />
                              <button type="button" aria-label="Quitar foto" title="Quitar foto" onClick={() => setEditingNoteImages((current) => current.filter((item) => item.id !== image.id))}>x</button>
                            </figure>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {note.body && (
                        <button
                          type="button"
                          className="notebook-note-preview"
                          onClick={() => setViewingNoteId((current) => current === note.id ? "" : note.id)}
                        >
                          {note.body}
                        </button>
                      )}
                      {viewing && (
                        <div className="notebook-note-full">
                          {note.body && <p>{note.body}</p>}
                          {images.length > 0 && (
                            <div className="calendar-note-images">
                              {images.map((image) => <figure key={image.id}><img src={image.url} alt="" /></figure>)}
                            </div>
                          )}
                        </div>
                      )}
                      {!viewing && images.length > 0 && (
                        <div className="calendar-note-images">
                          {images.map((image) => <figure key={image.id}><img src={image.url} alt="" /></figure>)}
                        </div>
                      )}
                    </>
                  )}
                  <footer>
                    <time>{new Date(note.updatedAt || note.createdAt).toLocaleString("es-ES")}</time>
                    <div>
                      {editing ? (
                        <>
                          <button type="button" onClick={cancelEditingNote}>Cancelar</button>
                          <button type="button" className="notebook-save-action" onClick={() => updateNote(note.id)} disabled={(!editingNoteDraft.trim() && !editingNoteImages.length) || savingNote || uploadingNoteImage}>Guardar</button>
                        </>
                      ) : (
                        <>
	                          <button type="button" onClick={() => setViewingNoteId((current) => current === note.id ? "" : note.id)}>{viewing ? "Ocultar" : "Ver"}</button>
		                          <button type="button" onClick={() => startEditingNote(note)}>Editar</button>
	                          <button type="button" onClick={() => deleteNote(note.id)}>Borrar</button>
                        </>
                      )}
                    </div>
                  </footer>
                </article>
              );
            }) : !loading ? <div className="empty">Sin notas todavía.</div> : null}
          </section>
        </section>
      </section>
    </main>
  );
}

function OptionGroup({ options, value, onChange, multi = false }) {
  return (
    <div className="generator-options">
      {options.map((option) => {
        const selected = multi ? value.includes(option) : value === option;
        return (
          <button
            key={option}
            type="button"
            className={selected ? "selected" : ""}
            onClick={() => {
              if (!multi) return onChange(option);
              onChange(selected ? value.filter((item) => item !== option) : [...value, option]);
            }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function memoryReady(status) {
  return Boolean(status?.ready || status?.live || status?.chatgpt);
}

function memoryReadyLabel(status) {
  if (status?.externalBrain && memoryReady(status) && status?.live !== false) return "CEREBRO ACTIVO";
  if (status?.externalBrain) return status?.chatgpt ? "CEREBRO CAÍDO · CHATGPT" : "CEREBRO NO ACTIVO";
  if (status?.ready && status?.workflow) return "RAG n8n ACTIVO";
  if (status?.chatgpt) return "CHATGPT LOCAL";
  if (status?.ready) return "MEMORIA LOCAL";
  return "SIN ALMACÉN";
}

function generatorSourceLabel(source, brain) {
  if (source === "editorial-brain" || brain?.wroteText) return "escrito por el cerebro";
  if (brain?.applied && source === "n8n") return "vía n8n; se le envió instrucción del cerebro";
  if (source === "n8n") return "vía n8n, sin cerebro";
  if (source === "chatgpt") return brain?.applied ? "ChatGPT, con instrucción del cerebro" : "ChatGPT, sin cerebro";
  return source ? `vía ${source}` : "";
}

function VisualAnalysisPanel({ analysis, busy = false, title = "Análisis visual" }) {
  if (busy) {
    return (
      <div className="visual-analysis-panel">
        <strong>{title}</strong>
        <p>Analizando la imagen...</p>
      </div>
    );
  }
  if (!analysis) return null;
  if (analysis.error) {
    return (
      <div className="visual-analysis-panel error">
        <strong>{title}</strong>
        <p>{analysis.error}</p>
      </div>
    );
  }
  const lines = [
    analysis.summary,
    analysis.subjects?.length ? `Sujetos: ${analysis.subjects.join(", ")}` : "",
    analysis.palette ? `Paleta: ${analysis.palette}` : "",
    analysis.visibleText ? `Texto visible: ${analysis.visibleText}` : "",
    analysis.style ? `Estilo: ${analysis.style}` : "",
    analysis.warnings?.length ? `Avisos: ${analysis.warnings.join("; ")}` : "",
  ].filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="visual-analysis-panel">
      <strong>{title}</strong>
      {lines.map((line) => <p key={line.slice(0, 48)}>{line}</p>)}
    </div>
  );
}

function RagEntryConsole({ prefill }) {
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [preferredUtility, setPreferredUtility] = useState("alta");
  const [file, setFile] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [tagsText, setTagsText] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [textPreferencesText, setTextPreferencesText] = useState("");
  const [styleTagsText, setStyleTagsText] = useState("");
  const [promptHintsText, setPromptHintsText] = useState("");
  const [authorProfileText, setAuthorProfileText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ingestedDocument, setIngestedDocument] = useState(null);
  const [ragStatus, setRagStatus] = useState(null);
  const [visualAnalysis, setVisualAnalysis] = useState(null);

  const loadRagStatus = useCallback(async () => {
    try {
      const result = await api("/rag/status");
      setRagStatus(result);
    } catch (statusError) {
      setRagStatus({ ready: false, error: statusError.message });
    }
  }, []);

	  useEffect(() => {
	    loadRagStatus();
	  }, [loadRagStatus]);

	  useEffect(() => {
	    if (!prefill?.text && !prefill?.description) return;
	    resetResult();
	    setFile(null);
	    setText(prefill.text || "");
	    setDescription(prefill.description || "");
	    setPreferredUtility(prefill.utility || "alta");
	    setMessage(prefill.message || "Material recibido. Valora y confirma si quieres que pase a memoria.");
	  }, [prefill]);

  function resetResult() {
    setAssessment(null);
    setTagsText("");
    setTopicsText("");
    setTextPreferencesText("");
    setStyleTagsText("");
    setPromptHintsText("");
    setAuthorProfileText("");
    setTitle("");
    setIngestedDocument(null);
    setVisualAnalysis(null);
    setMessage("");
    setError("");
  }

  function readFile(selectedFile) {
    if (!selectedFile) return;
    resetResult();
    const reader = new FileReader();
    reader.onload = () => {
      setFile({
        name: selectedFile.name,
        type: selectedFile.type || "application/octet-stream",
        size: selectedFile.size,
        dataUrl: String(reader.result || ""),
      });
    };
    reader.onerror = () => setError("No se pudo leer el archivo");
    reader.readAsDataURL(selectedFile);
  }

  function inputPayload() {
    const trimmedText = text.trim();
    const urlOnly = !file && /^https?:\/\/\S+$/i.test(trimmedText);
    return {
      inputType: file ? "file" : urlOnly ? "url" : "text",
      project: "generador-contenido",
      description: description.trim(),
      preferredUtility,
      text: urlOnly ? "" : text,
      url: urlOnly ? trimmedText : "",
      file,
    };
  }

  async function evaluate(event) {
    event.preventDefault();
    setBusy("evaluate");
    setError("");
    setMessage("");
    setIngestedDocument(null);
    try {
      const result = await api("/rag/valorar", {
        method: "POST",
        body: JSON.stringify(inputPayload()),
      });
      setAssessment({ ...result.assessment, proyecto: "generador-contenido", utilidad_rag: preferredUtility });
      setTagsText((result.assessment?.tags || []).join(", "));
      setTopicsText((result.assessment?.topics || result.assessment?.temas || []).join(", "));
      setTextPreferencesText((result.assessment?.textPreferences || result.assessment?.preferencias_texto || []).join(", "));
      setStyleTagsText((result.assessment?.styleTags || result.assessment?.estilos || []).join(", "));
      setPromptHintsText((result.assessment?.promptHints || result.assessment?.prompt_hints || []).join(", "));
      setAuthorProfileText(result.assessment?.authorProfile || result.assessment?.perfil_autor || result.assessment?.perfil || "");
      setTitle(result.assessment?.resumen || file?.name || text.trim() || "Documento RAG");
      setVisualAnalysis(result.visual_analysis || result.input?.visualAnalysis || null);
      setMessage(result.externalBrain
        ? "Valoración del cerebro. Revisa estilo y temas antes de guardar."
        : "Valoración de n8n RAG. Revisa estilo y temas antes de guardar.");
    } catch (evaluateError) {
      setError(evaluateError.message);
    } finally {
      setBusy("");
    }
  }

  async function ingest() {
    if (!assessment) return;
    setBusy("ingest");
    setError("");
    setMessage("");
    try {
      const tags = tagsText.split(",").map((tag) => tag.trim()).filter(Boolean);
      const topics = topicsText.split(",").map((item) => item.trim()).filter(Boolean);
      const textPreferences = textPreferencesText.split(",").map((item) => item.trim()).filter(Boolean);
      const styleTags = styleTagsText.split(",").map((item) => item.trim()).filter(Boolean);
      const promptHints = promptHintsText.split(",").map((item) => item.trim()).filter(Boolean);
      const result = await api("/rag/ingestar", {
        method: "POST",
        body: JSON.stringify({
          input: inputPayload(),
          assessment: {
            ...assessment,
            topics,
            textPreferences,
            styleTags,
            promptHints,
            authorProfile: authorProfileText.trim(),
          },
          title,
          tags,
        }),
      });
      setIngestedDocument(result.document);
      setMessage(result.externalBrain
        ? "Guardado en el cerebro como estilo."
        : "Guardado en la memoria RAG de n8n.");
    } catch (ingestError) {
      setError(ingestError.message);
    } finally {
      setBusy("");
    }
  }

  function discard() {
    resetResult();
    setText("");
    setDescription("");
    setFile(null);
  }

  const canEvaluate = text.trim() || file?.dataUrl;
  const fileLabel = file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "Opcional: imagen JPG/PNG/WebP, PDF, TXT, Markdown, CSV o JSON";
  const urlNotice = !file ? trainingUrlNotice(text) : "";
  const previewTags = splitCommaText(tagsText);
  const previewTopics = splitCommaText(topicsText);
  const previewTextPreferences = splitCommaText(textPreferencesText);
  const previewStyleTags = splitCommaText(styleTagsText);
  const previewPromptHints = splitCommaText(promptHintsText);
  const savePreview = assessment ? [
    {
      label: "Documento",
      status: "yes",
      detail: `${ragTypeLabel(assessment.tipo)} · ${title || assessment.resumen || "sin título"}`,
    },
    {
      label: "Texto fuente",
      status: text.trim() || file?.dataUrl ? "yes" : inputPayload().url ? "partial" : "no",
      detail: text.trim()
        ? "Se guarda el texto pegado como contenido base."
        : file?.dataUrl
          ? /^image\//.test(file.type || "") || /\.(jpe?g|png|webp|gif)$/i.test(file.name)
            ? `Se envía la imagen ${file.name}. ChatGPT la analiza si hay OPENAI_API_KEY; si no, el hueco se ve.`
            : `Se envía el archivo ${file.name}; si se puede extraer texto, genera chunks.`
          : inputPayload().url
            ? "Se guarda la URL y lo que n8n consiga valorar; si no hay contenido extraído, puede quedar como perfil/referencia."
            : "No hay material principal.",
    },
    {
      label: "Tags",
      status: previewTags.length ? "yes" : "no",
      detail: previewTags.length ? previewTags.slice(0, 8).join(" · ") : "No se guardarán tags si no añades o aceptas etiquetas.",
    },
    {
      label: "Temas",
      status: previewTopics.length ? "yes" : "partial",
      detail: previewTopics.length ? previewTopics.slice(0, 6).join(" · ") : "No hay temas explícitos; la memoria pesará menos este material.",
    },
    {
      label: "Texto y estilo",
      status: previewTextPreferences.length || previewStyleTags.length ? "yes" : "partial",
      detail: [...previewTextPreferences, ...previewStyleTags].length
        ? [...previewTextPreferences, ...previewStyleTags].slice(0, 6).join(" · ")
        : "No se guardan preferencias de voz/estilo salvo que n8n las proponga o las añadas.",
    },
    {
      label: "Perfil / autor",
      status: authorProfileText.trim() ? "yes" : inputPayload().url ? "partial" : "no",
      detail: authorProfileText.trim()
        ? authorProfileText.trim().slice(0, 160)
        : inputPayload().url
          ? "No hay perfil de autor revisable; para canales/perfiles conviene completarlo antes de enviarlo al cerebro."
          : "No aplica si no es una fuente/persona/perfil.",
    },
    {
      label: "Chunks + embeddings",
      status: "yes",
      detail: ragStatus?.externalBrain
        ? "Al confirmar, el cerebro guarda este material como estilo."
        : `${ragChunkingLabel(assessment.sugerencia_chunking)}; n8n genera embeddings y pgvector los guarda al confirmar.`,
    },
    {
      label: "Memoria del generador",
      status: previewTags.length || previewTopics.length || previewPromptHints.length || authorProfileText.trim() ? "yes" : "partial",
      detail: previewPromptHints.length
        ? previewPromptHints.slice(0, 4).join(" · ")
        : "Se actualiza con tags/temas/perfil disponibles; cuantos menos campos, menos señal para el generador.",
    },
  ] : [];
  const saveSuggestions = assessment ? [
    previewTags.length < 3 ? "Añade 3-6 tags claros; son lo que más pesa al generar." : "",
    previewTopics.length < 2 ? "Añade temas si quieres que esto aparezca bien agrupado en la memoria." : "",
    inputPayload().url && !authorProfileText.trim() ? "Si es canal, cuenta o autor, completa Perfil / autor antes de guardar." : "",
    assessment.utilidad_rag === "baja" ? "Valor bajo: confirma solo si quieres guardar una referencia débil o incompleta." : "",
    assessment.aviso ? `Revisa aviso antes de enviar al cerebro: ${assessment.aviso}` : "",
  ].filter(Boolean) : [];

  return (
    <main className="rag-workspace">
      <section className="rag-shell">
        <header className="rag-header">
          <div>
            <h2>Añadir estilo</h2>
            <p>Valora y guarda estilo. Si el cerebro está vivo, va allí. Si no, ChatGPT o la memoria local. Flow no finge que el cerebro escribió.</p>
          </div>
          <div className="rag-header-right">
            <button type="button" className={`rag-ready ${memoryReady(ragStatus) ? "ready" : "not-ready"}`} onClick={loadRagStatus}>
              {memoryReadyLabel(ragStatus)}
            </button>
            <div className="rag-pipeline">
              <span className={assessment ? "done" : "active"}>1 Valoración</span>
              <span className={assessment ? "active" : ""}>2 Revisión</span>
              <span className={ingestedDocument ? "done" : ""}>3 Guardar</span>
            </div>
          </div>
        </header>

        {ragStatus && !memoryReady(ragStatus) && (
          <div className="notice error">
            {ragStatus.externalBrain
              ? `El cerebro no responde. ${ragStatus.error || ""} Sin él no se guarda estilo.`
              : `No hay almacén de estilo activo. ${ragStatus.error || ""}`}
          </div>
        )}

        {(message || error) && <div className={`instagram-status ${error ? "error" : "success"}`}><StatusMessage value={error || message} /></div>}
        <LearningFlow active={assessment ? "review" : "add"} />

        <div className="rag-layout">
          <form className="panel rag-input-panel" onSubmit={evaluate}>
            <div className="panel-heading">
              <div><span className="section-mark blue" />ENTRADA</div>
              <span>VALORACIÓN ASISTIDA</span>
            </div>

            <label className="rag-material">
              Material para aprender
              <textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  resetResult();
                }}
                rows={12}
                placeholder="Pega texto, una URL, una nota, copy, una spec, un prompt previo o material de referencia..."
              />
              {urlNotice && <span className="rag-url-hint">{urlNotice}</span>}
            </label>

            <label
              className="rag-dropzone compact"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                readFile(event.dataTransfer.files?.[0]);
              }}
            >
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.txt,.md,.json,.csv,text/*,application/pdf" onChange={(event) => readFile(event.target.files?.[0])} />
              <strong>{file ? "Archivo cargado" : "Añadir archivo"}</strong>
              <span>{fileLabel}</span>
            </label>

            <label className="rag-material compact">
              Descripción de ayuda
              <textarea
                className="rag-help-textarea"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  resetResult();
                }}
                rows={6}
                maxLength={1200}
                placeholder="Opcional: una pista breve para orientar la valoración. Ej: Laissez faire, laissez passer."
              />
              <span className="rag-url-hint">No sustituye al material. Sirve para aclarar enfoque, postura, tags o intención.</span>
            </label>

            <div className="rag-utility-picker" aria-label="Valor para el generador">
              <span>Valor para el generador</span>
              <div>
                {RAG_UTILITIES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={preferredUtility === value ? "selected" : ""}
                    onClick={() => {
                      setPreferredUtility(value);
                      setAssessment((current) => current ? { ...current, utilidad_rag: value } : current);
                    }}
                  >
                    {ragUtilityLabel(value).replace("Valor ", "")}
                  </button>
                ))}
              </div>
            </div>

            <Button kind="primary" disabled={!canEvaluate || Boolean(busy)}>
              {busy === "evaluate"
                ? (ragStatus?.externalBrain ? "VALORANDO EN EL CEREBRO..." : "VALORANDO...")
                : "VALORAR"}
            </Button>
          </form>

          <section className="panel rag-review-panel">
            <div className="panel-heading">
              <div><span className="section-mark purple" />VALORACIÓN</div>
              <span>NO GUARDA HASTA CONFIRMAR</span>
            </div>
            {!assessment ? (
              <div className="rag-empty">
                <strong>Esperando valoración.</strong>
                <span>El resultado debe indicar qué es, cuánto aporta, cómo dividirlo y qué etiquetas guardar.</span>
              </div>
            ) : (
              <div className="rag-assessment">
                <label>
                  Título
                  <input value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <div className="rag-edit-grid">
                  <label>
                    Qué es
                    <select value={assessment.tipo} onChange={(event) => setAssessment((current) => ({ ...current, tipo: event.target.value }))}>
                      {RAG_TYPES.map((value) => <option key={value} value={value}>{ragTypeLabel(value)}</option>)}
                    </select>
                  </label>
                  <label>
                    Valor para el generador
                    <select value={assessment.utilidad_rag} onChange={(event) => setAssessment((current) => ({ ...current, utilidad_rag: event.target.value }))}>
                      {RAG_UTILITIES.map((value) => <option key={value} value={value}>{ragUtilityLabel(value)}</option>)}
                    </select>
                  </label>
                  <label>
                    Cómo dividirlo
                    <select value={assessment.sugerencia_chunking} onChange={(event) => setAssessment((current) => ({ ...current, sugerencia_chunking: event.target.value }))}>
                      {RAG_CHUNKING.map((value) => <option key={value} value={value}>{ragChunkingLabel(value)}</option>)}
                    </select>
                  </label>
                </div>
                <label>
                  Resumen
                  <textarea value={assessment.resumen} rows={3} onChange={(event) => setAssessment((current) => ({ ...current, resumen: event.target.value }))} />
                </label>
                <label>
                  Aviso
                  <textarea value={assessment.aviso || ""} rows={2} onChange={(event) => setAssessment((current) => ({ ...current, aviso: event.target.value || null }))} />
                </label>
                <VisualAnalysisPanel analysis={visualAnalysis} title="Análisis visual del archivo" />
                <label>
                  Etiquetas
                  <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="copy, violet moon, ads..." />
                </label>
                <details className="rag-memory-editor">
                  <summary>Memoria para generador</summary>
                  <div className="rag-memory-edit-grid">
                    <label>
                      Temas para recordar
                      <input value={topicsText} onChange={(event) => setTopicsText(event.target.value)} placeholder="IA, ecommerce, márgenes..." />
                    </label>
                    <label>
                      Preferencias de texto
                      <input value={textPreferencesText} onChange={(event) => setTextPreferencesText(event.target.value)} placeholder="directo, frases cortas, sin jerga..." />
                    </label>
                    <label>
                      Estilos
                      <input value={styleTagsText} onChange={(event) => setStyleTagsText(event.target.value)} placeholder="tono cercano, CTA final..." />
                    </label>
                    <label>
                      Hints de prompt
                      <input value={promptHintsText} onChange={(event) => setPromptHintsText(event.target.value)} placeholder="usar como ejemplo, evitar promesas..." />
                    </label>
                    <label className="wide">
                      Perfil / autor
                      <textarea
                        value={authorProfileText}
                        rows={3}
                        onChange={(event) => setAuthorProfileText(event.target.value)}
                        placeholder="Ideas, postura, políticas, obsesiones, límites de confianza..."
                      />
                    </label>
                  </div>
                </details>

                <div className="rag-card-summary">
                  <strong>
                    Esto se guardará como {ragTypeLabel(assessment.tipo).toLowerCase()}, con {ragUtilityLabel(assessment.utilidad_rag).toLowerCase()}.
                  </strong>
                  <span>{ragChunkingLabel(assessment.sugerencia_chunking)}.</span>
                  <span>{assessment.aviso || "Sin avisos de duplicado o datos sensibles."}</span>
                </div>

                <div className="rag-actions">
                  <Button kind="primary" type="button" onClick={ingest} disabled={busy === "ingest"}>
                    {busy === "ingest" ? "ENVIANDO..." : "CONFIRMAR Y ENVIAR AL CEREBRO"}
                  </Button>
                  <Button kind="danger" type="button" onClick={discard}>DESCARTAR</Button>
                </div>
              </div>
            )}
          </section>

          <section className="panel rag-ingest-panel">
            <div className="panel-heading">
              <div><span className="section-mark amber" />QUÉ SE GUARDA</div>
              <span>NO HAY ENVÍO HASTA CONFIRMAR</span>
            </div>
            {!assessment ? (
              <div className="rag-save-empty">
                <strong>Sin decisión todavía.</strong>
                <span>Valora el material para ver qué estilo se enviará, qué falta y qué conviene completar.</span>
              </div>
            ) : (
              <div className="rag-save-preview">
                <div className="rag-save-preview-heading">
                  <strong>Previsualización de envío</strong>
                  <span>{ragUtilityLabel(assessment.utilidad_rag)} · {ragChunkingLabel(assessment.sugerencia_chunking)}</span>
                </div>
                <div className="rag-save-items">
                  {savePreview.map((item) => (
                    <article key={item.label} className={item.status}>
                      <b>{item.status === "yes" ? "Sí" : item.status === "partial" ? "Parcial" : "No"}</b>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </div>
                    </article>
                  ))}
                </div>
                {saveSuggestions.length > 0 && (
                  <div className="rag-save-suggestions">
                    <strong>Propuestas antes de confirmar</strong>
                    {saveSuggestions.map((suggestion) => <span key={suggestion}>{suggestion}</span>)}
                  </div>
                )}
              </div>
            )}
            {ingestedDocument && (
              <div className="rag-ingested">
                <strong>{ingestedDocument.nombre || ingestedDocument.title || "Documento ingerido"}</strong>
                <span>ID: {ingestedDocument.id || "devuelto por n8n"}</span>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function hasRagMemory(memory) {
  return Boolean(
    memory?.updatedAt
    || memory?.tags?.length
    || memory?.topics?.length
    || memory?.textPreferences?.length
    || memory?.styleTags?.length
    || memory?.promptHints?.length
    || memory?.tagSummary?.length
    || memory?.topicSummary?.length
    || memory?.recentDocuments?.length
  );
}

function normalizeUiMemoryLabel(value) {
  return String(value || "")
    .replace(/^(?:\s*refuerzo\s*:\s*)+/gi, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[()"'“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeStyleNoise(value) {
  const text = normalizeUiMemoryLabel(value);
  if (!text) return true;
  return /^(instagram|linkedin|youtube|pinterest|tiktok|facebook|blog|twitter|x|publish|published|draft|manual|publicaciones|success|done)$/.test(text)
    || /received by/.test(text)
    || /^con (imagen|video|url|archivo)/.test(text)
    || /^con-/.test(text);
}

function memoryItemLabel(item) {
  return String(item?.label || item?.tag || "").trim();
}

function asMemoryItems(values) {
  return uniqueUiStrings(values).map((label) => ({ label, count: 1, score: 40 }));
}

function uniqueUiStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const label = String(value || "").trim();
    const key = normalizeUiMemoryLabel(label);
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

function editableStyleCategories(memory) {
  const fromSummary = Array.isArray(memory?.topicSummary) ? memory.topicSummary.filter((category) => category?.items?.length) : [];
  if (fromSummary.length) {
    const known = new Set(fromSummary.map((item) => item.id));
    const extras = [];
    if (!known.has("style") && (memory?.textPreferences?.length || memory?.styleTags?.length)) {
      extras.push({
        id: "style",
        title: "Estilo y voz",
        description: "Cómo debe escribir las entradas.",
        items: asMemoryItems([...(memory.textPreferences || []), ...(memory.styleTags || [])]),
      });
    }
    if (!known.has("topics") && memory?.topics?.length) {
      extras.push({ id: "topics", title: "Temas", description: "Conceptos para las entradas.", items: asMemoryItems(memory.topics) });
    }
    if (!known.has("influences") && memory?.promptHints?.length) {
      extras.push({ id: "influences", title: "Pistas", description: "Instrucciones reutilizables.", items: asMemoryItems(memory.promptHints) });
    }
    if (!known.has("tags") && memory?.tags?.length) {
      extras.push({
        id: "tags",
        title: "Etiquetas",
        description: "Rótulos sueltos. Quita ruido operativo.",
        items: (memory.tagSummary || []).map((item) => ({ label: item.tag, count: item.count, score: item.score }))
          .concat(asMemoryItems((memory.tags || []).filter((tag) => !(memory.tagSummary || []).some((item) => normalizeUiMemoryLabel(item.tag) === normalizeUiMemoryLabel(tag))))),
      });
    }
    return [...fromSummary, ...extras];
  }
  return [
    { id: "style", title: "Estilo y voz", description: "Cómo debe escribir las entradas.", items: asMemoryItems([...(memory?.textPreferences || []), ...(memory?.styleTags || [])]) },
    { id: "topics", title: "Temas", description: "Conceptos para las entradas.", items: asMemoryItems(memory?.topics) },
    { id: "influences", title: "Pistas", description: "Instrucciones reutilizables.", items: asMemoryItems(memory?.promptHints) },
    { id: "tags", title: "Etiquetas", description: "Rótulos sueltos. Quita ruido operativo.", items: asMemoryItems(memory?.tags) },
  ].filter((category) => category.items.length);
}

function RagCorrectConsole() {
  const [memory, setMemory] = useState(null);
  const [ragStatus, setRagStatus] = useState(null);
  const [query, setQuery] = useState("");
  const [rename, setRename] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [statusResult, memoryResult] = await Promise.all([
      api("/rag/status").catch((statusError) => ({ ready: false, error: statusError.message })),
      api("/rag/memory?view=correct"),
    ]);
    setRagStatus(statusResult);
    setMemory(memoryResult.memory || memoryResult);
  }, []);

  useEffect(() => {
    load().catch((loadError) => {
      setError(loadError.message);
      setMemory(null);
    });
  }, [load]);

  async function runClean(body, successMessage) {
    const key = `${body.action}:${body.value || body.tag || body.documentId || ""}`;
    setBusyAction(key);
    setError("");
    setMessage("");
    try {
      await api("/rag/memory/clean", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load();
      setMessage(successMessage);
      setRename(null);
    } catch (cleanError) {
      setError(cleanError.message);
    } finally {
      setBusyAction("");
    }
  }

  async function deleteDocument(documentId) {
    if (!documentId || !window.confirm("¿Retirar esta ingesta del almacén de estilo?")) return;
    await runClean({ action: "delete-document", documentId }, "Ingesta retirada.");
  }

  const needle = normalizeUiMemoryLabel(query);
  const categories = editableStyleCategories(memory).map((category) => ({
    ...category,
    items: (category.items || [])
      .map((item) => ({ ...item, label: memoryItemLabel(item) }))
      .filter((item) => item.label && (!needle || normalizeUiMemoryLabel(item.label).includes(needle))),
  })).filter((category) => category.items.length || !needle);
  const documents = (memory?.recentDocuments || []).filter((document) => {
    if (!needle) return true;
    const haystack = normalizeUiMemoryLabel(`${document.title || ""} ${(document.tags || []).join(" ")} ${document.type || ""}`);
    return haystack.includes(needle);
  });
  const busy = Boolean(busyAction);

  return (
    <main className="rag-workspace">
      <section className="rag-shell">
        <header className="rag-header">
          <div>
            <h2>Corregir estilo</h2>
            <p>
              El cerebro es el almacén de estilo. Aquí subes, bajas, quitas o renombras lo que ya aprendió,
              para que genere mejores entradas. Flow no es el cerebro: solo lo corrige.
            </p>
          </div>
          <button type="button" className={`rag-ready ${memoryReady(ragStatus) ? "ready" : "not-ready"}`} onClick={() => {
            setError("");
            load().catch((loadError) => {
              setError(loadError.message);
              setMemory(null);
            });
          }}>
            {memoryReadyLabel(ragStatus)}
          </button>
        </header>
        {ragStatus && !memoryReady(ragStatus) && (
          <div className="notice error">
            {ragStatus.externalBrain
              ? `El cerebro no responde. ${ragStatus.error || ""} Sin él no se corrige el estilo.`
              : `No hay almacén de estilo activo. ${ragStatus.error || ""}`}
          </div>
        )}
        {message && <div className="instagram-status success"><StatusMessage value={message} /></div>}
        {error && <div className="instagram-status error"><StatusMessage value={error} /></div>}

        <section className="panel rag-memory-screen">
          <div className="panel-heading">
            <div><span className="section-mark green" />ESTILO GUARDADO</div>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar ruido, tema o estilo"
              aria-label="Buscar en el estilo guardado"
            />
          </div>
          {!hasRagMemory(memory) ? (
            <div className="rag-empty">
              <strong>Sin estilo guardado todavía.</strong>
              <span>Añade material y confirma. Lo publicado y las ediciones del generador también alimentan el cerebro si está vivo.</span>
            </div>
          ) : (
            <>
              <div className="rag-memory-stats">
                <article><span>Ingestas</span><strong>{memory?.documentCount || documents.length}</strong></article>
                <article><span>Estilo</span><strong>{(memory?.textPreferences || []).length + (memory?.styleTags || []).length}</strong></article>
                <article><span>Temas</span><strong>{(memory?.topics || []).length}</strong></article>
                <article><span>Actualizada</span><strong>{memory?.updatedAt ? relativeTime(memory.updatedAt) : "nunca"}</strong></article>
              </div>
              <div className="rag-topic-groups rag-correct-groups">
                {categories.map((category, index) => (
                  <details key={category.id} open={index < 3 || Boolean(needle)}>
                    <summary>
                      <span>{category.title}</span>
                      <b>{category.items.length}</b>
                    </summary>
                    <p>{category.description}</p>
                    <div>
                      {category.items.map((item) => {
                        const value = item.label;
                        const actionKey = (action) => `${action}:${value}`;
                        const renaming = rename?.category === category.id && rename?.value === value;
                        return (
                          <article key={`${category.id}-${value}`} className={looksLikeStyleNoise(value) ? "noise" : ""}>
                            <span title={value}>{value}</span>
                            <b>{item.count} · {item.score}</b>
                            <i className="score-donut blue" style={{ "--tag-score": `${Math.max(8, item.score)}%` }} aria-label={`Peso ${item.score}`} />
                            <div className="rag-item-actions">
                              <button type="button" disabled={busy} onClick={() => runClean({ action: "raise-item", category: category.id, value }, `Subido: ${value}.`)}>
                                {busyAction === actionKey("raise-item") ? "..." : "Subir"}
                              </button>
                              <button type="button" disabled={busy} onClick={() => runClean({ action: "lower-item", category: category.id, value }, `Bajado: ${value}.`)}>
                                {busyAction === actionKey("lower-item") ? "..." : "Bajar"}
                              </button>
                              <button type="button" disabled={busy} onClick={() => setRename({ category: category.id, value, next: value })}>
                                Renombrar
                              </button>
                              <button
                                type="button"
                                className="danger"
                                disabled={busy}
                                onClick={() => {
                                  if (!window.confirm(`¿Quitar “${value}” del estilo?`)) return;
                                  runClean({ action: "remove-item", category: category.id, value }, `Quitado: ${value}.`);
                                }}
                              >
                                {busyAction === actionKey("remove-item") ? "..." : "Quitar"}
                              </button>
                            </div>
                            {renaming && (
                              <form
                                className="rag-rename-row"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const next = String(rename.next || "").trim();
                                  if (!next || next === value) return;
                                  runClean(
                                    { action: "rename-item", category: category.id, value, replacement: next },
                                    `Renombrado: ${value} → ${next}.`,
                                  );
                                }}
                              >
                                <input
                                  value={rename.next}
                                  onChange={(event) => setRename((current) => ({ ...current, next: event.target.value }))}
                                  autoFocus
                                />
                                <button type="submit" disabled={busy || !String(rename.next || "").trim()}>Guardar</button>
                                <button type="button" onClick={() => setRename(null)}>Cancelar</button>
                              </form>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
              {documents.length > 0 && (
                <div className="rag-recent-docs">
                  <strong>Ingestas</strong>
                  {documents.map((document) => (
                    <article key={document.id}>
                      <div>
                        <span>{document.title}</span>
                        <b>{document.tags?.slice(0, 5).join(" · ") || document.type}</b>
                      </div>
                      <Button type="button" kind="danger" disabled={busy} onClick={() => deleteDocument(document.id)}>
                        BORRAR
                      </Button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function LearningFlow({ active = "add" }) {
  const steps = [
    {
      id: "add",
      title: "Material",
      detail: "Texto, URL, archivo o referencia que el cerebro debe aprender como estilo.",
    },
    {
      id: "review",
      title: "Revisar",
      detail: "Temas, voz y utilidad. Si está mal etiquetado, no lo confirmes.",
    },
    {
      id: "generate",
      title: "Usar",
      detail: "El generador pide ese estilo al cerebro para escribir entradas.",
    },
  ];
  return (
    <div className="learning-flow" aria-label="Flow de aprendizaje">
      {steps.map((step) => (
        <article key={step.id} className={step.id === active ? "active" : ""}>
          <strong>{step.title}</strong>
          <span>{step.detail}</span>
        </article>
      ))}
    </div>
  );
}

function FormattedTextarea({
  value,
  onChange,
  html = "",
  onHtmlChange,
  maxLength,
  rows,
  placeholder,
  id,
  className = "",
}) {
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const selectionRangeRef = useRef(null);
  const lastPlainValueRef = useRef("");
  const lastHtmlValueRef = useRef("");

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (html && html !== lastHtmlValueRef.current) {
      editor.innerHTML = sanitizeCaptionHtml(html);
      lastHtmlValueRef.current = editor.innerHTML;
      lastPlainValueRef.current = readPlainTextFromEditor(editor);
      return;
    }
    if (value === lastPlainValueRef.current) return;
    editor.textContent = value || "";
    lastPlainValueRef.current = value || "";
    lastHtmlValueRef.current = editor.innerHTML;
  }, [html, value]);

  function readPlainText() {
    return readPlainTextFromEditor(editorRef.current);
  }

  function selectionBelongsToEditor(range) {
    const editor = editorRef.current;
    if (!editor || !range) return false;
    return editor.contains(range.commonAncestorContainer);
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (selectionBelongsToEditor(range)) selectionRangeRef.current = range.cloneRange();
  }

  function restoreSelection() {
    const range = selectionRangeRef.current;
    if (!selectionBelongsToEditor(range)) return false;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function moveCaretToEnd() {
    const editor = editorRef.current;
    if (!editor) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function emitPlainText() {
    const editor = editorRef.current;
    if (!editor) return;
    const plain = readPlainText();
    if (maxLength && plain.length > maxLength) {
      const clipped = plain.slice(0, maxLength);
      editor.textContent = clipped;
      lastPlainValueRef.current = clipped;
      onChange(clipped);
      requestAnimationFrame(moveCaretToEnd);
      return;
    }
    lastPlainValueRef.current = plain;
    lastHtmlValueRef.current = sanitizeCaptionHtml(editor.innerHTML);
    onChange(plain);
    onHtmlChange?.(lastHtmlValueRef.current);
  }

  function normalizeLinkUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw).href;
    } catch {
      try {
        return new URL(`https://${raw}`).href;
      } catch {
        return "";
      }
    }
  }

  function applyLink() {
    editorRef.current?.focus();
    restoreSelection();
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";
    if (!selectedText) {
      alert("Selecciona primero el texto que quieres convertir en enlace.");
      return;
    }
    const href = normalizeLinkUrl(prompt("Pega el enlace") || "");
    if (!href) return;
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("createLink", false, href);
    emitPlainText();
  }

  function formatSelection(command, commandValue = null) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, commandValue);
    emitPlainText();
  }

  function applyFontSize(size) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("fontSize", false, "7");
    const editor = editorRef.current;
    editor?.querySelectorAll("font[size='7']").forEach((node) => {
      const span = document.createElement("span");
      span.style.fontSize = `${size}px`;
      span.innerHTML = node.innerHTML;
      node.replaceWith(span);
    });
    emitPlainText();
  }

  function insertDivider() {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("insertHTML", false, "<hr><div><br></div>");
    emitPlainText();
  }

  function insertImageFile(file) {
    if (!file || !file.type?.startsWith("image/")) return;
    if (file.size > 4 * 1024 * 1024) {
      alert("La imagen es demasiado grande para insertarla en el texto. Usa una de menos de 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      const alt = escapeHtml(file.name.replace(/\.[^.]+$/, "").slice(0, 120));
      editorRef.current?.focus();
      restoreSelection();
      document.execCommand(
        "insertHTML",
        false,
        sanitizeCaptionHtml(`<figure><img src="${src}" alt="${alt}"><figcaption></figcaption></figure><div><br></div>`),
      );
      emitPlainText();
    };
    reader.readAsDataURL(file);
  }

  function pickImage(event) {
    const file = event.target.files?.[0];
    insertImageFile(file);
    event.target.value = "";
  }

  function pasteFormattedText(event) {
    event.preventDefault();
    const htmlText = event.clipboardData.getData("text/html");
    const pasted = event.clipboardData.getData("text/plain");
    const current = readPlainText();
    const remaining = maxLength ? Math.max(0, maxLength - current.length) : pasted.length;
    if (htmlText && (!maxLength || pasted.length <= remaining)) {
      document.execCommand("insertHTML", false, sanitizeCaptionHtml(htmlText));
    } else {
      document.execCommand("insertText", false, pasted.slice(0, remaining));
    }
    emitPlainText();
  }

  return (
    <div className="caption-editor">
      <details className="caption-format-menu" open>
        <summary>FORMATO</summary>
        <div className="caption-toolbar" aria-label="Opciones de edición de texto">
          <button type="button" title="Negrita" onClick={() => formatSelection("bold")}>B</button>
          <button type="button" title="Cursiva" onClick={() => formatSelection("italic")}><i>I</i></button>
          <button type="button" title="Subrayado" onClick={() => formatSelection("underline")}><u>U</u></button>
          <button type="button" title="Tachado" onClick={() => formatSelection("strikeThrough")}><s>S</s></button>
          <button
            type="button"
            className="caption-link-button"
            title="Insertar enlace"
            onMouseDown={(event) => {
              event.preventDefault();
              rememberSelection();
            }}
            onClick={applyLink}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
              <path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.1 2.1a4 4 0 0 0 5.7 5.7l1.2-1.2" />
            </svg>
          </button>
          <button type="button" title="Fuente normal" onClick={() => applyFontSize(16)}>A</button>
          <button type="button" title="Fuente grande" onClick={() => applyFontSize(20)}>A+</button>
          <button type="button" title="Fuente muy grande" onClick={() => applyFontSize(24)}>A++</button>
          {CAPTION_COLORS.map(([color, label]) => (
            <button
              key={color}
              type="button"
              className="caption-color-button"
              title={`Color ${label.toLowerCase()}`}
              onClick={() => formatSelection("foreColor", color)}
            >
              <span style={{ backgroundColor: color }} />
            </button>
          ))}
          <button type="button" title="Insertar imagen" onClick={() => imageInputRef.current?.click()}>IMAGEN</button>
          <button type="button" title="Insertar línea divisoria" onClick={insertDivider}>LÍNEA</button>
          <input
            ref={imageInputRef}
            className="caption-image-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={pickImage}
          />
        </div>
      </details>
      <div
        ref={editorRef}
        id={id}
        className={`formatted-textarea ${className}`.trim()}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        style={{ minHeight: `${Math.max(120, Number(rows || 6) * 28)}px` }}
        onInput={emitPlainText}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onFocus={rememberSelection}
        onPaste={pasteFormattedText}
        suppressContentEditableWarning
      />
    </div>
  );
}

function hashtagToken(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .trim();
  if (!normalized) return "";
  return `#${normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("")}`;
}

const hashtagStopWords = new Set("ademas ahora algo aqui aunque cada casi como con contra cuando desde donde durante ella ellas ellos entre eran esta estas este estos forma formas hacia hasta hay hace hacen hacer hizo la las los mas mientras mucha muchas mucho muchos nada para pero poco por porque puede pueden que quien quienes sin sobre solo son su sus todo todos tras una unas uno unos usar usos valor version vez texto generado generar variante material contenido buenos malas malos bueno".split(" "));

const broadHashtagRules = [
  { pattern: /\b(?:ia|inteligencia artificial|openai|claude|rag|prompt|agente|agentes|automatizaci[oó]n|automatizar|workflow|n8n|api)\b/iu, tags: ["#InteligenciaArtificial", "#Automatizacion", "#Productividad"] },
  { pattern: /\b(?:marketing|contenido|publicaci[oó]n|copy|seo|marca|branding|redes|social media|instagram|linkedin|youtube|pinterest)\b/iu, tags: ["#MarketingDigital", "#Contenido", "#RedesSociales"] },
  { pattern: /\b(?:vender|ventas?|cliente|clientes|producto|ecommerce|negocio|empresa|emprender|emprendimiento)\b/iu, tags: ["#Ventas", "#Negocios", "#Emprendimiento"] },
  { pattern: /\b(?:facturae|facturaci[oó]n|csv|excel|datos|importaci[oó]n|dataimporter|validaci[oó]n|backend|software|saas)\b/iu, tags: ["#Software", "#Datos", "#SaaS"] },
  { pattern: /\b(?:liberalismo|marxismo|keynesianismo|econom[ií]a|mercado|pol[ií]tica|sociedad|estado|regulaci[oó]n)\b/iu, tags: ["#Economia", "#Politica", "#Sociedad"] },
  { pattern: /\b(?:realismo m[aá]gico|literatura|narrativa|ensayo|historia|cultura|arte|creatividad|pensamiento)\b/iu, tags: ["#Cultura", "#Literatura", "#Creatividad"] },
  { pattern: /\b(?:aprender|ense[nñ]ar|educaci[oó]n|formaci[oó]n|tutorial|gu[ií]a|documentaci[oó]n)\b/iu, tags: ["#Aprendizaje", "#Educacion", "#Conocimiento"] },
];

const internalHashtagNoise = new Set([
  "analizar",
  "aprender",
  "crear",
  "debatir",
  "directo",
  "entretener",
  "idea",
  "imagen",
  "informar",
  "pdf",
  "planificar",
  "publicar",
  "texto",
  "url",
  "vender",
]);

const channelHashtagRules = [
  { pattern: /\b(?:youtube|shorts|video)\b/u, tags: ["#VideoMarketing"] },
  { pattern: /\b(?:linkedin|articulo|profesional|b2b)\b/u, tags: ["#LinkedIn", "#B2B"] },
  { pattern: /\b(?:instagram|reels|foto|visual)\b/u, tags: ["#Instagram", "#ContenidoVisual"] },
  { pattern: /\b(?:blog|articulo|post)\b/u, tags: ["#Blog", "#ContenidoDigital"] },
];

function broadHashtagsFromText(text) {
  const source = String(text || "");
  const tags = [];
  for (const rule of broadHashtagRules) {
    if (!rule.pattern.test(source)) continue;
    tags.push(...rule.tags);
  }
  const lower = source
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const rule of channelHashtagRules) {
    if (rule.pattern.test(lower)) tags.push(...rule.tags);
  }
  return tags;
}

function hashtagsFromMemory(memory) {
  if (!memory) return [];
  const labels = [
    ...(memory.styleTags || []),
    ...(memory.tags || []),
    ...(memory.topics || []),
  ];
  return [...new Set(labels
    .map((item) => hashtagToken(item))
    .filter((tag) => tag.length > 2 && tag.length <= 32 && !internalHashtagNoise.has(normalizeUiMemoryLabel(tag.replace(/^#/, "")))))]
    .slice(0, 8);
}

function hashtagsFromGeneratedResults(results = [], form = {}, memory = null) {
  const resultText = results.join("\n");
  const materialText = [form.material, form.instrucciones].filter(Boolean).join("\n");
  const hasUserMaterial = compactText(materialText).length >= 12;
  if (!hasUserMaterial && !compactText(resultText) && !memory) return [];
  const primaryText = [resultText, materialText].filter(Boolean).join("\n");
  const contextText = [
    form.formato,
    form.objetivo,
    form.tono,
  ].filter(Boolean).join("\n");
  const existing = (String(primaryText).match(/#[\p{L}\p{N}_]+/gu) || [])
    .filter((tag) => !internalHashtagNoise.has(normalizeUiMemoryLabel(tag.replace(/^#/, ""))));
  const primaryPhrases = broadHashtagsFromText(primaryText);
  const contextPhrases = resultText || hasUserMaterial ? broadHashtagsFromText(contextText).slice(0, 2) : [];
  const words = String(primaryText)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/\b[\p{L}\p{N}]{4,24}\b/gu) || [];
  const frequent = [...words.reduce((counts, word) => {
    if (!hashtagStopWords.has(word) && !internalHashtagNoise.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
    return counts;
  }, new Map()).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .filter(([word]) => !internalHashtagNoise.has(word))
    .slice(0, 5)
    .map(([word]) => word);
  const generated = [...existing, ...primaryPhrases, ...frequent.map(hashtagToken), ...contextPhrases]
    .filter(Boolean);
  const memoryTags = hashtagsFromMemory(memory);
  if (memoryTags.length) return [...new Set([...memoryTags, ...generated])].slice(0, 10);
  return [...new Set(generated)].slice(0, 10);
}

const PUBLICATION_DRAFT_STORAGE_KEY = "flow-console-publication-draft-v2";

function readPublicationDraft() {
  try {
    return JSON.parse(window.localStorage.getItem(PUBLICATION_DRAFT_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function writePublicationDraft(draft) {
  window.localStorage.setItem(PUBLICATION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function deletePublicationDraft() {
  window.localStorage.removeItem(PUBLICATION_DRAFT_STORAGE_KEY);
}

function editableResultValue(result) {
  return typeof result === "object" && result !== null ? result.edited : String(result || "");
}

function originalResultValue(result) {
  return typeof result === "object" && result !== null ? result.original : String(result || "");
}

function textStats(value) {
  const text = String(value || "").trim();
  const paragraphs = text.split(/\n{2,}/).map((line) => line.trim()).filter(Boolean).length;
  return {
    chars: text.length,
    lines: text ? text.split(/\n+/).filter((line) => line.trim()).length : 0,
    paragraphs,
    hashtags: (text.match(/#[\p{L}\p{N}_-]+/gu) || []).length,
    questions: (text.match(/[?¿]/g) || []).length,
    ctas: /\b(comenta|escr[ií]beme|prueba|descubre|entra|reserva|contacta|guarda|comparte|lee|publica|abre)\b/i.test(text),
    bullets: (text.match(/(^|\n)\s*(?:[-*•]|\d+[.)])\s+/g) || []).length,
    bold: (text.match(/\*\*[^*]+\*\*/g) || []).length,
    links: (text.match(/https?:\/\/\S+/g) || []).length,
    quotes: (text.match(/[«»"]/g) || []).length,
    exclamations: (text.match(/[!¡]/g) || []).length,
  };
}

function learningSignalsFromEdit(original, edited, context = {}) {
  const before = textStats(original);
  const after = textStats(edited);
  const originalLower = String(original || "").toLowerCase();
  const editedLower = String(edited || "").toLowerCase();
  const signals = [];
  if (!after.chars) return signals;
  if (!before.chars) {
    signals.push("Guardar esta versión final como patrón preferido.");
  } else {
    const ratio = after.chars / Math.max(before.chars, 1);
    if (ratio < 0.82) signals.push("Prefieres una versión más corta y directa.");
    else if (ratio > 1.18) signals.push("Prefieres desarrollar más el argumento.");
    if (after.paragraphs > before.paragraphs) signals.push("Prefieres separar ideas en bloques más claros.");
    if (after.paragraphs < before.paragraphs) signals.push("Prefieres compactar cuando la estructura se dispersa.");
    if (after.bullets > before.bullets) signals.push("Añades listas cuando ayudan a ordenar la explicación.");
    if (after.bullets < before.bullets) signals.push("Eliminas listas cuando suenan mecánicas.");
  }
  if (after.hashtags > before.hashtags) signals.push("Añades más hashtags al cierre.");
  if (after.hashtags < before.hashtags) signals.push("Reduces hashtags.");
  if (after.questions > before.questions) signals.push("Usas más preguntas para abrir conversación.");
  if (after.ctas && !before.ctas) signals.push("Añades llamada a la acción.");
  if (!after.ctas && before.ctas) signals.push("Quitas llamadas a la acción cuando empujan demasiado.");
  if (after.bold < before.bold) signals.push("Reduces énfasis visual y marcas de formato.");
  if (after.links < before.links) signals.push("Quitas enlaces que no son necesarios para la pieza.");
  if (after.quotes > before.quotes) signals.push("Añades citas o referencias cuando ayudan a precisar.");
  if (after.exclamations < before.exclamations) signals.push("Rebajas énfasis emocional o promocional.");
  if (/ficci[oó]n|inventad|pel[ií]cula|real/i.test(editedLower) && !/ficci[oó]n|inventad|pel[ií]cula|real/i.test(originalLower)) {
    signals.push("Añades verificación entre realidad, ficción y fuente.");
  }
  if (/matiz|exact|precis|no es|sí es|depende/i.test(editedLower) && !/matiz|exact|precis|no es|sí es|depende/i.test(originalLower)) {
    signals.push("Corriges hacia más precisión y matiz conceptual.");
  }
  if (/ejemplo|caso|por ejemplo/i.test(editedLower) && !/ejemplo|caso|por ejemplo/i.test(originalLower)) {
    signals.push("Añades ejemplos concretos para aterrizar ideas abstractas.");
  }
  if (/clickbait|viral|última oportunidad|haz clic|compra ya/i.test(originalLower) && !/clickbait|viral|última oportunidad|haz clic|compra ya/i.test(editedLower)) {
    signals.push("Eliminas tono de clickbait o venta agresiva.");
  }
  if (context.formato || context.objetivo || context.tono) {
    signals.push(`Aplicar en contexto similar: ${[context.formato, context.objetivo, context.tono].filter(Boolean).join(" · ")}.`);
  }
  return [...new Set(signals)].slice(0, 8);
}

function publicationLearningSignals(post) {
  const caption = String(post?.caption || "");
  const targetName = post?.target?.name || post?.targetId || "Publicaciones";
  const stats = textStats(caption);
  return [
    `Canal confirmado: ${targetName}.`,
    stats.chars ? `Longitud final: ${stats.chars.toLocaleString("es-ES")} caracteres en ${stats.lines || 1} bloque${stats.lines === 1 ? "" : "s"}.` : "",
    stats.hashtags ? `Hashtags usados: ${stats.hashtags}.` : "",
    stats.ctas ? "Incluye llamada a la acción." : "",
    "Se guarda como ejemplo real para futuras publicaciones del mismo canal.",
  ].filter(Boolean).slice(0, 5);
}

function Generator({ embedded = false, onBack, onUseText, targetFormat = "", targetId = "", seedText = "" }) {
  const [form, setForm] = useState({
    intencion: "Crear",
    formato: targetFormat || "Publicación",
    objetivo: "Vender",
    tono: "Directo",
    variantes: 3,
    materialTipo: "Texto",
    material: "",
    analisis: [],
    creatividad: [],
    instrucciones: "",
  });
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(null);
  const [learned, setLearned] = useState(null);
  const [ragMemory, setRagMemory] = useState(null);
  const [generationMemory, setGenerationMemory] = useState(null);
  const [materialFile, setMaterialFile] = useState(null);
  const [materialFilePayload, setMaterialFilePayload] = useState(null);
  const [generatorStatus, setGeneratorStatus] = useState(null);
  const [resultSource, setResultSource] = useState("");
  const [brainReport, setBrainReport] = useState(null);
  const [visualAnalysis, setVisualAnalysis] = useState(null);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!targetFormat) return;
    set("formato", targetFormat);
  }, [targetFormat]);

  function readBrowserFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
      reader.readAsDataURL(file);
    });
  }

  async function setGeneratorFile(file) {
    if (!file) return;
    const allowed = form.materialTipo === "PDF"
      ? ["application/pdf"]
      : ["image/jpeg", "image/png", "image/webp"];
    const validExtension = form.materialTipo === "PDF"
      ? /\.pdf$/i.test(file.name)
      : /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!allowed.includes(file.type) && !validExtension) {
      setError(form.materialTipo === "PDF" ? "Selecciona un PDF" : "Selecciona una imagen JPG, PNG o WebP");
      return;
    }
    try {
      setError("");
      const dataUrl = await readBrowserFile(file);
      setMaterialFile(file);
      setMaterialFilePayload({
        name: file.name,
        type: file.type || (form.materialTipo === "PDF" ? "application/pdf" : "image/*"),
        size: file.size,
        dataUrl,
      });
      const size = `${(file.size / 1024 / 1024).toFixed(file.size > 1024 * 1024 ? 1 : 3)} MB`;
      set("material", [
        `${form.materialTipo} adjunto: ${file.name}`,
        `Formato: ${file.type || "desconocido"} · Tamaño: ${size}`,
        form.materialTipo === "PDF"
          ? "El servidor extraerá texto real del PDF y lo añadirá al material antes de generar."
          : "La imagen se envía adjunta para análisis visual real antes de escribir el texto.",
        form.material.trim() ? `\nNotas:\n${form.material.trim()}` : "",
      ].filter(Boolean).join("\n"));
    } catch (readError) {
      setError(readError.message);
      setMaterialFile(null);
      setMaterialFilePayload(null);
    }
  }

  async function selectGeneratorFile(event) {
    await setGeneratorFile(event.target.files?.[0]);
    event.target.value = "";
  }

  async function dropGeneratorFile(event) {
    event.preventDefault();
    await setGeneratorFile(event.dataTransfer.files?.[0]);
  }

  useEffect(() => {
    api("/rag/memory")
      .then((result) => setRagMemory(result.memory || null))
      .catch(() => setRagMemory(null));
    api("/generator/status")
      .then(setGeneratorStatus)
      .catch(() => setGeneratorStatus({ brain: false, brainLive: false, configured: false, n8n: false }));
  }, []);

  async function generate(event) {
    event.preventDefault();
    const material = form.material.trim() || String(seedText || "").trim();
    if (!material && !materialFilePayload) return;
    setBusy(true);
    setError("");
    setMessage("");
    setResults([]);
    setGenerationMemory(null);
    setResultSource("");
    setBrainReport(null);
    setVisualAnalysis(null);
    try {
      const response = await api("/generator", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          material: material || form.material,
          materialFile: materialFilePayload,
          destino: targetFormat,
          targetId,
          currentCaption: seedText || "",
        }),
      });
      if (!Array.isArray(response.variantes)) throw new Error("No se devolvieron variantes de texto");
      setResults(normalizeGeneratedVariants(response.variantes).map((text) => ({ original: text, edited: text })));
      setResultSource(String(response.source || ""));
      setBrainReport(response.editorial_brain || null);
      setVisualAnalysis(response.visual_analysis || null);
      if (response.rag_memory) setRagMemory(response.rag_memory);
      if (response.rag_memory) setGenerationMemory(response.rag_memory);
    } catch (generationError) {
      setError(generationError.message);
    } finally {
      setBusy(false);
    }
  }

  function loadEditorText() {
    const next = String(seedText || "").trim();
    if (!next) {
      setError("No hay texto en el editor de publicación.");
      return;
    }
    set("materialTipo", "Texto");
    setMaterialFile(null);
    setMaterialFilePayload(null);
    set("material", next.slice(0, 20000));
    setError("");
    setMessage("Texto del editor cargado para reescribirlo.");
  }

  async function copy(text, index) {
    await copyRichText({ text, html: generatedTextToCaptionHtml(text) });
    setCopied(index);
    setTimeout(() => setCopied(null), 1400);
  }

  function updateResult(index, value) {
    setResults((current) => current.map((result, itemIndex) =>
      itemIndex === index ? { ...result, edited: value } : result,
    ));
  }

  function queueLookupResult(result) {
    const queuedText = formatLookupResultForMaterial(result);
    if (!queuedText) return;
    set("materialTipo", "Texto");
    setMaterialFile(null);
    setMaterialFilePayload(null);
    set("material", [form.material.trim(), queuedText].filter(Boolean).join("\n\n---\n\n").slice(0, 20000));
    setMessage("Búsqueda añadida al material del generador.");
  }

	  async function learnEdit(result, index) {
	    const original = originalResultValue(result);
	    const edited = editableResultValue(result).trim();
	    if (!edited) {
	      setError("No hay texto que aprender.");
	      return;
	    }
    setError("");
    setMessage("");
    try {
	      const response = await api("/generator/feedback", {
	        method: "POST",
	        body: JSON.stringify({ original: original === edited ? "" : original, edited, context: form }),
	      });
      if (response.memory) {
        setRagMemory(response.memory);
        setGenerationMemory(response.memory);
      }
      setLearned(index);
	      setMessage(original === edited
	        ? (response.externalBrain
              ? "Versión final aprendida en el cerebro editorial."
              : "Versión final guardada en la memoria local.")
	        : (response.externalBrain
              ? "Edición aprendida en el cerebro editorial."
              : "Edición guardada en la memoria local."));
      setTimeout(() => setLearned(null), 1600);
    } catch (feedbackError) {
      setError(feedbackError.message);
    }
  }

  const fileMaterial = ["Imagen", "PDF"].includes(form.materialTipo);
  const hasMaterial = fileMaterial ? Boolean(materialFilePayload) : Boolean(form.material.trim() || String(seedText || "").trim());
  const generatorDisabled = busy || !hasMaterial;
  const GeneratorWrapper = embedded ? "div" : "main";
  const generatedHashtags = hashtagsFromGeneratedResults(results.map(editableResultValue), form, generationMemory || ragMemory);

  return (
    <GeneratorWrapper className={`generator-workspace ${embedded ? "embedded-generator" : ""}`}>
      <section className="generator-shell">
        <header className="generator-header">
          <div>
            <h2>{targetFormat ? `Texto para ${targetFormat}` : "Texto para esta publicación"}</h2>
            <p>
              {targetFormat ? `Sale listo para ${targetFormat}. ` : ""}
              {generatorStatus?.brain
                ? "El cerebro escribe o orienta con el estilo guardado. Si no aporta texto, se usa n8n o ChatGPT y se dice."
                : generatorStatus?.configured
                  ? "El cerebro está configurado pero no responde. Se genera con n8n o ChatGPT, no como si el cerebro hubiera escrito."
                  : generatorStatus?.n8n
                    ? "Sin cerebro. Genera con n8n y se dice."
                    : generatorStatus?.chatgpt
                      ? "Sin cerebro ni n8n. ChatGPT escribe el texto y se etiqueta como ChatGPT."
                      : "Falta cerebro, n8n y OPENAI_API_KEY. No hay de dónde sacar texto."}
            </p>
          </div>
          <button
            type="button"
            className={`rag-ready ${generatorStatus?.brain ? "ready" : "not-ready"}`}
            onClick={() => api("/generator/status").then(setGeneratorStatus).catch(() => {})}
          >
            {generatorStatus?.brain ? "CEREBRO ACTIVO" : generatorStatus?.configured ? "CEREBRO NO RESPONDE" : generatorStatus?.chatgpt ? "CHATGPT LOCAL" : generatorStatus?.n8n ? "N8N" : "SIN GENERADOR"}
          </button>
          {embedded && onBack && (
            <Button type="button" onClick={onBack}>← PUBLICACIONES</Button>
          )}
        </header>
        {generatorStatus?.configured && !generatorStatus?.brain && (
          <div className="notice error">
            El cerebro está configurado pero no responde. {generatorStatus.error || ""} Se genera con n8n o ChatGPT, no como cerebro.
          </div>
        )}

        <div className="generator-layout">
          <form className="generator-form panel" onSubmit={generate}>
            <Last30DaysLookupPanel className="generator-lookup-panel" onQueueResult={queueLookupResult} />
            <div className="generator-field">
              <label>Variables</label>
              <OptionGroup options={GENERATOR_OPTIONS.variantes} value={form.variantes} onChange={(value) => set("variantes", value)} />
            </div>
            <div className="generator-field">
              <label>Material</label>
              <OptionGroup options={GENERATOR_OPTIONS.materialTipo} value={form.materialTipo} onChange={(value) => {
                set("materialTipo", value);
                setMaterialFile(null);
                setMaterialFilePayload(null);
                if (["Imagen", "PDF"].includes(value)) set("material", "");
              }} />
              {["Imagen", "PDF"].includes(form.materialTipo) && (
                <label
                  className={`generator-file-dropzone ${materialFile ? "loaded" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={dropGeneratorFile}
                >
                  <input
                    type="file"
                    accept={form.materialTipo === "PDF" ? "application/pdf,.pdf" : "image/jpeg,image/png,image/webp"}
                    onChange={selectGeneratorFile}
                  />
                  <span className="generator-file-icon">{form.materialTipo === "PDF" ? "PDF" : "IMG"}</span>
                  <strong>{materialFile ? materialFile.name : `Arrastra ${form.materialTipo === "PDF" ? "un PDF" : "una imagen"} aquí`}</strong>
                  <em>{form.materialTipo === "PDF" ? "PDF" : "JPG, PNG o WebP"}</em>
                  <b>{materialFile ? "Cambiar archivo" : "Seleccionar del ordenador"}</b>
                </label>
              )}
              {!["Imagen", "PDF"].includes(form.materialTipo) && (
                <>
                  <textarea
                    value={form.material}
                    onChange={(event) => set("material", event.target.value)}
                    maxLength={20000}
                    rows={8}
                    placeholder={form.materialTipo === "URL" ? "Pega la URL y, si puedes, el texto relevante..." : "Pega aquí el material bruto..."}
                  />
                  <small>{form.material.length.toLocaleString("es-ES")} / 20.000</small>
                </>
              )}
            </div>
            <div className="generator-field">
              <label htmlFor="generator-instructions">Instrucciones adicionales</label>
              <textarea
                id="generator-instructions"
                value={form.instrucciones}
                onChange={(event) => set("instrucciones", event.target.value)}
                maxLength={4000}
                rows={3}
                placeholder="Restricciones, contexto o llamada a la acción..."
              />
            </div>
            <Button kind="primary" className="generator-submit" disabled={generatorDisabled}>
              {busy ? "GENERANDO..." : `GENERAR ${form.variantes} VARIANTE${form.variantes > 1 ? "S" : ""}`}
            </Button>
            {embedded && (
              <Button type="button" disabled={!String(seedText || "").trim() || busy} onClick={loadEditorText}>
                USAR TEXTO DEL EDITOR
              </Button>
            )}
          </form>

          <section className="generator-results">
            <div className="generator-results-heading">
              <h3>Texto generado</h3>
              {resultSource ? <small>{generatorSourceLabel(resultSource, brainReport)}</small> : null}
            </div>
            <div className="generated-hashtags-panel">
              <label>{(generationMemory || ragMemory) ? "Hashtags del estilo y del texto" : "Hashtags generados"}</label>
              <div>
                {generatedHashtags.length ? generatedHashtags.join(" ") : "Se generan del estilo guardado y del texto."}
              </div>
            </div>
            <VisualAnalysisPanel analysis={visualAnalysis} title="Análisis visual del material" />
            {error && <div className="notice error">{error}</div>}
            {message && <div className="notice success">{message}</div>}
            {busy && (
              <div className="generator-empty">
                {generatorStatus?.brain ? "El cerebro editorial está trabajando." : generatorStatus?.n8n ? "n8n está generando el texto. El cerebro no participa." : "ChatGPT está generando el texto."}
              </div>
            )}
            {!busy && !error && !results.length && (
              <div className="generator-empty">
                <strong>Sin variantes todavía.</strong>
                <span>
                  {generatorStatus?.brain
                    ? "Pega material o usa el texto del editor. Si el cerebro no escribe, n8n o ChatGPT lo harán y se verá la fuente."
                    : generatorStatus?.configured
                      ? "El cerebro no responde. Se genera con n8n o ChatGPT si están."
                      : generatorStatus?.n8n
                        ? "Sin cerebro. Genera con n8n y se etiquetará como n8n."
                        : generatorStatus?.chatgpt
                          ? "ChatGPT escribirá el texto. No es el cerebro."
                          : "Falta cerebro, n8n y ChatGPT. No hay de dónde sacar texto."}
                </span>
              </div>
            )}
            {results.map((result, index) => (
              <article className="result-card" key={`${index}-${originalResultValue(result).slice(0, 24)}`}>
                <textarea
                  className="result-edit-textarea"
                  value={editableResultValue(result)}
                  onChange={(event) => updateResult(index, event.target.value)}
                  rows={Math.max(5, Math.min(14, editableResultValue(result).split("\n").length + 3))}
                />
	                <LearningPreview
	                  title="Qué aprenderá"
	                  signals={learningSignalsFromEdit(originalResultValue(result), editableResultValue(result), form)}
	                  empty="Puede aprender esta versión final como patrón preferido."
	                />
                <div className="result-actions">
                  <Button type="button" className="result-copy-button" onClick={() => copy(editableResultValue(result), index)}>
                    {copied === index ? "COPIADO" : "COPIAR"}
                  </Button>
	                  <Button
	                    type="button"
	                    className="result-copy-button"
	                    onClick={() => learnEdit(result, index)}
	                  >
	                    {learned === index
	                      ? "APRENDIDO"
	                      : originalResultValue(result) === editableResultValue(result)
	                        ? "APRENDER VERSIÓN"
	                        : "APRENDER EDICIÓN"}
	                  </Button>
                  {onUseText && (
                    <Button type="button" className="result-copy-button" onClick={() => onUseText({
                      text: editableResultValue(result),
                      html: generatedTextToCaptionHtml(editableResultValue(result)),
                    })}>
                      USAR
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {!busy && !error && results.length > 0 && (
            <GeneratorWhy memory={generationMemory || ragMemory} brain={brainReport} />
            )}
          </section>
        </div>
      </section>
    </GeneratorWrapper>
  );
}

function GeneratorWhy({ memory, brain }) {
  const tags = memory?.tags || [];
  const topics = memory?.topics || [];
  const styleTags = memory?.styleTags || [];
  const promptHints = memory?.promptHints || [];
  const recent = memory?.recentDocuments || [];
    const used = [
    tags.length ? { label: "Tags disponibles", value: tags.slice(0, 8).join(" · ") } : null,
    topics.length ? { label: "Temas disponibles", value: topics.slice(0, 6).join(" · ") } : null,
    styleTags.length ? { label: "Estilo disponible", value: styleTags.slice(0, 6).join(" · ") } : null,
    promptHints.length ? { label: "Pistas de prompt", value: promptHints.slice(0, 4).join(" · ") } : null,
    recent.length ? { label: "Memoria reciente", value: recent.slice(0, 3).map((item) => item.title).join(" · ") } : null,
    brain?.wroteText ? { label: "Cerebro", value: "Escribió el texto." } : null,
    brain?.applied && !brain?.wroteText ? {
      label: "Cerebro",
      value: brain.documentCount
        ? `Se envió memoria a n8n (${brain.documentCount} ingestas). No se afirma que n8n la usara.`
        : "Se envió instrucción a n8n. No se afirma que n8n la usara.",
    } : null,
    brain && !brain.applied ? { label: "Cerebro", value: "No participó en esta generación." } : null,
    brain?.usageRecorded === true ? { label: "Uso", value: "El cerebro registró que se usó esta memoria." } : null,
    brain?.usageRecorded === false && brain?.applied ? {
      label: "Uso",
      value: brain.usageError
        ? `No se registró el uso en el cerebro: ${brain.usageError}`
        : "No se registró el uso en el cerebro.",
    } : null,
  ].filter(Boolean);
	return (
	  <details className="generator-why">
	    <summary>Qué se usó de verdad</summary>
      <div>
        {used.length ? used.map((item) => (
          <article key={item.label}>
            <strong>{item.label}</strong>
            <p>{item.value}</p>
          </article>
        )) : (
          <article>
            <strong>Sin memoria ni cerebro</strong>
            <p>Esta generación no usó cerebro ni memoria confirmada.</p>
          </article>
        )}
	    <article>
	      <strong>Límite</strong>
	      <p>
            {brain?.wroteText
              ? "El texto lo escribió el cerebro editorial."
              : brain?.applied
                ? "n8n escribió el texto. Se le envió instrucción o memoria del cerebro; no se puede afirmar que n8n la usara."
                : "n8n escribió el texto. El cerebro no participó."}
          </p>
	    </article>
      </div>
    </details>
  );
}

function LearningPreview({ title = "Qué aprende", signals = [], empty = "Sin señales nuevas todavía." }) {
  return (
    <div className="learning-preview">
      <strong>{title}</strong>
      {signals.length ? (
        <ul>
          {signals.map((signal) => <li key={signal}>{signal}</li>)}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}


function InstagramPublisher({ draftCaption, onCaptionConsumed, onPublicationSaved, initialForumWorkflowId = "", initialForumNoticeId = "", initialForumPublicationMode = false }) {
  const [caption, setCaption] = useState("");
  const [captionHtml, setCaptionHtml] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [publicationScheduledAt, setPublicationScheduledAt] = useState("");
  const [linkedinMode, setLinkedinMode] = useState("post");
  const [tiktokMode, setTiktokMode] = useState("draft");
  const [posts, setPosts] = useState([]);
  const [libraryItems, setLibraryItems] = useState([]);
  const [savedDraft, setSavedDraft] = useState(readPublicationDraft);
  const [blogArticles, setBlogArticles] = useState([]);
  const [blogArticleDraft, setBlogArticleDraft] = useState({
    slug: "",
    title: "",
    category: "Datos",
    cat_class: "cat-teal",
    excerpt: "",
    lede: "",
    minutes: 5,
    published: 1,
  });
  const [targets, setTargets] = useState([]);
  const [channelStatus, setChannelStatus] = useState(null);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [publisherScreen, setPublisherScreen] = useState("hub");
  const [targetDraft, setTargetDraft] = useState({
    name: "",
    handle: "",
    kind: "red social",
    webhookPath: "",
    color: PUBLICATION_TARGET_COLORS[1],
  });
  const [targetEditorOpen, setTargetEditorOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaLoadFailed, setMediaLoadFailed] = useState(false);
  const [mediaAspect, setMediaAspect] = useState("original");
  const [mediaSource, setMediaSource] = useState(null);
  const [mediaFit, setMediaFit] = useState("cover");
  const [mediaPosition, setMediaPosition] = useState({ x: 0, y: 0 });
  const [mediaDrag, setMediaDrag] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [visualAnalysis, setVisualAnalysis] = useState(null);
  const [visualBusy, setVisualBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const mediaInputRef = useRef(null);
  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId)
      || targets.find((target) => target.id === "instagram")
      || {
        id: "instagram",
        name: "Instagram",
        handle: "",
        kind: "red social",
        icon: "IG",
        color: "#c47a3a",
        webhookPath: "/webhook/publicar-instagram",
      },
    [targets, selectedTargetId],
  );

  useEffect(() => {
    if (draftCaption?.source !== "publication") return;
    setCaption(String(draftCaption.caption || draftCaption.text || ""));
    setCaptionHtml(String(draftCaption.captionHtml || ""));
    const nextMediaUrl = draftCaption.imageUrl || draftCaption.videoUrl || "";
    setImageUrl(nextMediaUrl);
    setMediaSource(null);
    setMediaAspect("original");
    setPublicationScheduledAt(toDatetimeLocalValue(draftCaption.scheduledAt || draftCaption.publicationScheduledAt || ""));
    setLinkedinMode(draftCaption.linkedinMode || draftCaption.options?.linkedinMode || "post");
    setTiktokMode(draftCaption.tiktokMode || draftCaption.options?.tiktokMode || "draft");
    setSelectedTargetId(draftCaption.targetId || draftCaption.target?.id || "instagram");
    setPublisherScreen("editor");
    onCaptionConsumed?.();
  }, [draftCaption, onCaptionConsumed]);

  useEffect(() => {
    if (!initialForumWorkflowId && !initialForumNoticeId) return;
    setPublisherScreen("forums");
  }, [initialForumNoticeId, initialForumWorkflowId]);

  useEffect(() => {
    setMediaLoadFailed(false);
  }, [imageUrl]);

  useEffect(() => {
    const video = ["youtube", "tiktok"].includes(selectedTarget.id);
    if (publisherScreen !== "editor" || !imageUrl || video) {
      setVisualAnalysis(null);
      setVisualBusy(false);
      return undefined;
    }
    const controller = new AbortController();
    setVisualBusy(true);
    api("/publications/vision", {
      method: "POST",
      body: JSON.stringify({
        imageUrl,
        caption,
        targetId: selectedTarget.id,
        aspect: mediaAspect,
      }),
    })
      .then((result) => {
        if (!controller.signal.aborted) setVisualAnalysis(result.analysis || null);
      })
      .catch((visionError) => {
        if (!controller.signal.aborted) {
          setVisualAnalysis({ error: visionError.message, configured: true, live: false });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setVisualBusy(false);
      });
    return () => controller.abort();
  }, [publisherScreen, imageUrl, selectedTarget.id, mediaAspect]);

  useEffect(() => {
    Promise.all([api("/publications/posts"), api("/publication-targets"), api("/publications/channels/status")])
      .then(([postResult, targetResult, channelResult]) => {
        const nextTargets = targetResult.targets || [];
        setPosts(postResult.posts || []);
        setTargets(nextTargets);
        setChannelStatus(channelResult);
      })
      .catch(() => {});
  }, []);

  const loadBlogArticles = useCallback(async () => {
    if (selectedTargetId !== "blog") return;
    try {
      const result = await api("/blog/articles");
      setBlogArticles(Array.isArray(result.articles) ? result.articles : []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [selectedTargetId]);

  useEffect(() => {
    if (publisherScreen === "editor" && ["blog", "linkedin"].includes(selectedTargetId)) loadBlogArticles();
  }, [loadBlogArticles, publisherScreen, selectedTargetId]);

  useEffect(() => {
    if (publisherScreen !== "editor") return;
    api(`/publications/library?target=${encodeURIComponent(selectedTarget.id)}`)
      .then((result) => setLibraryItems(Array.isArray(result.items) ? result.items : []))
      .catch(() => setLibraryItems([]));
  }, [publisherScreen, selectedTarget.id]);

  useEffect(() => {
    if (publisherScreen !== "editor" || !selectedTarget?.id) return;
    const controller = new AbortController();
    const mediaUrl = imageUrl;
    const timer = window.setTimeout(() => {
      api("/publications/preflight", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          action: "publish",
          targetId: selectedTarget.id,
          target: selectedTarget,
          caption,
          imageUrl: mediaUrl,
          videoUrl: ["youtube", "tiktok"].includes(selectedTarget.id) ? mediaUrl : "",
          options: {
            linkedinMode: selectedTarget.id === "linkedin" ? linkedinMode : undefined,
            tiktokMode: selectedTarget.id === "tiktok" ? tiktokMode : undefined,
          },
        }),
      })
        .then(setPreflight)
        .catch((preflightError) => {
          if (preflightError.name !== "AbortError") {
            setPreflight({ ok: false, level: "block", checks: [{ id: "diagnostic", label: "Diagnóstico no disponible", level: "warn", detail: preflightError.message }] });
          }
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [publisherScreen, selectedTarget, caption, imageUrl, linkedinMode, tiktokMode]);

  async function createTarget(event) {
    event.preventDefault();
    if (!targetDraft.name.trim()) return;
    setBusy("target");
    setError("");
    setMessage("");
    try {
      const result = await api("/publication-targets", {
        method: "POST",
        body: JSON.stringify({
          ...targetDraft,
          icon: publicationIcon(targetDraft.name),
        }),
      });
      setTargets(result.targets || []);
      setTargetDraft({
        name: "",
        handle: "",
        kind: "red social",
        webhookPath: "",
        color: PUBLICATION_TARGET_COLORS[(targets.length + 1) % PUBLICATION_TARGET_COLORS.length],
      });
      setTargetEditorOpen(false);
      setMessage(`Destino creado: ${result.target.name}`);
    } catch (targetError) {
      setError(targetError.message);
    } finally {
      setBusy("");
    }
  }

  async function uploadMediaFile(file) {
    if (!file) return;
    setMediaBusy(true);
    setError("");
    setMessage("");
    try {
      const videoTarget = ["youtube", "tiktok"].includes(selectedTarget.id);
      const allowedTypes = videoTarget
        ? ["video/mp4", "video/webm", "video/quicktime"]
        : ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        throw new Error(videoTarget ? "Sube un vídeo MP4, WebM o MOV" : "Sube una imagen JPG, PNG o WebP");
      }
      const maxSize = videoTarget ? 100 * 1024 * 1024 : 8 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error(videoTarget ? "El vídeo debe pesar menos de 100 MB" : "La imagen debe pesar menos de 8 MB");
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
        reader.readAsDataURL(file);
      });
      const nextSource = {
        name: file.name,
        type: file.type,
        dataUrl,
      };
      const uploadDataUrl = videoTarget ? dataUrl : await formatPublicationImage(dataUrl, mediaAspect);
      const result = await api("/publications/media", {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          type: file.type,
          dataUrl: uploadDataUrl,
          targetId: selectedTarget.id,
          scheduledAt: publicationScheduledAt || null,
        }),
      });
      setMediaSource(nextSource);
      setImageUrl(result.url);
      setMediaPosition({ x: 0, y: 0 });
      setMessage(result.hosted?.url
        ? `Imagen subida al hosting: ${result.hosted.fileName}`
        : `Archivo cargado en Flow Console: ${result.fileName || file.name}`);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setMediaBusy(false);
    }
  }

  async function generatePublicationImage() {
    if (!caption.trim()) {
      setError("Escribe el texto de la pieza para pedir el brief visual.");
      return;
    }
    setImageBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/publications/generate-image", {
        method: "POST",
        body: JSON.stringify({
          caption,
          targetId: selectedTarget.id,
          aspect: mediaAspect,
          analysis: visualAnalysis && !visualAnalysis.error ? visualAnalysis : null,
        }),
      });
      setImageUrl(result.url);
      setMediaSource(null);
      setMediaLoadFailed(false);
      if (Array.isArray(result.items)) setLibraryItems(result.items);
      const briefNote = result.brief?.applied
        ? (result.brief.source === "editorial-brain" ? "Brief del cerebro." : "Brief del estilo guardado.")
        : "";
      const sourceNote = result.model ? `ChatGPT (${result.model}).` : "ChatGPT.";
      setMessage(["Imagen generada y guardada en la biblioteca.", sourceNote, briefNote].filter(Boolean).join(" "));
    } catch (generateError) {
      setError(generateError.message);
    } finally {
      setImageBusy(false);
    }
  }

  async function uploadMedia(event) {
    await uploadMediaFile(event.target.files?.[0]);
    event.target.value = "";
  }

  async function applyMediaAspect(nextAspect) {
    setMediaAspect(nextAspect);
    setMediaPosition({ x: 0, y: 0 });
    if (isVideoTarget || !mediaSource?.dataUrl) {
      if (imageUrl && !isVideoTarget) setMessage("Formato visual cambiado. Para generar el archivo recortado, vuelve a seleccionar la imagen desde el ordenador.");
      return;
    }
    setMediaBusy(true);
    setError("");
    setMessage("");
    try {
      const uploadDataUrl = await formatPublicationImage(mediaSource.dataUrl, nextAspect);
      const result = await api("/publications/media", {
        method: "POST",
        body: JSON.stringify({
          name: mediaSource.name,
          type: nextAspect === "original" ? mediaSource.type : "image/jpeg",
          dataUrl: uploadDataUrl,
          targetId: selectedTarget.id,
          scheduledAt: publicationScheduledAt || null,
        }),
      });
      setImageUrl(result.url);
      setMediaLoadFailed(false);
      const formatLabel = PUBLICATION_MEDIA_ASPECTS.find((item) => item.id === nextAspect)?.label || nextAspect;
      setMessage(formatLabel === "Original" ? "Imagen original preparada." : `Imagen recortada a ${formatLabel} y preparada.`);
    } catch (formatError) {
      setError(formatError.message);
    } finally {
      setMediaBusy(false);
    }
  }

  function dropPublicationMedia(event) {
    event.preventDefault();
    uploadMediaFile(event.dataTransfer.files?.[0]);
  }

  function publicationMediaActions({ failed = false } = {}) {
    return (
      <div className="publication-media-action-row">
        <label className="publication-upload-action" htmlFor="publication-media-input">
          {mediaBusy ? "Subiendo..." : failed ? "Subir desde ordenador" : "Seleccionar del ordenador"}
        </label>
        {!isVideoTarget && (
          <button
            type="button"
            className="publication-generate-image"
            disabled={imageBusy || mediaBusy || !caption.trim()}
            onClick={generatePublicationImage}
          >
            {imageBusy ? "GENERANDO IMAGEN..." : "GENERAR IMAGEN"}
          </button>
        )}
      </div>
    );
  }

  function updateBlogArticleDraft(field, value) {
    setBlogArticleDraft((current) => ({ ...current, [field]: value }));
  }

  async function editBlogArticle(article) {
    const slug = String(article?.slug || "").trim();
    if (!slug) return;
    setBusy(`blog-edit-${slug}`);
    setError("");
    setMessage("");
    try {
      const result = await api(`/blog/articles?slug=${encodeURIComponent(slug)}`);
      const next = result.article || article;
      setBlogArticleDraft({
        slug: next.slug || slug,
        title: next.title || "",
        category: next.category || "Datos",
        cat_class: next.cat_class || "cat-teal",
        excerpt: next.excerpt || "",
        lede: next.lede || "",
        minutes: Number(next.minutes || 5),
        published: Number(next.published ?? 1),
      });
      setCaption(stripCaptionHtml(next.body || ""));
      setCaptionHtml(sanitizeCaptionHtml(next.body || ""));
      setImageUrl(next.image_url || "");
      setMediaSource(null);
      setMediaAspect("original");
      setMessage(`Editando artículo: ${next.title || slug}`);
    } catch (editError) {
      setError(editError.message);
    } finally {
      setBusy("");
    }
  }

  async function saveBlogArticleEdit() {
    if (!blogArticleDraft.slug) return;
    setBusy("blog-save");
    setError("");
    setMessage("");
    try {
      const body = sanitizeCaptionHtml(captionHtml || generatedTextToCaptionHtml(caption));
      await api(`/blog/articles/${encodeURIComponent(blogArticleDraft.slug)}`, {
        method: "PUT",
        body: JSON.stringify({
          ...blogArticleDraft,
          minutes: Number(blogArticleDraft.minutes || 5),
          published: Number(blogArticleDraft.published ? 1 : 0),
          body,
          image_url: imageUrl || "",
        }),
      });
      await loadBlogArticles();
      setMessage("Artículo del blog actualizado.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy("");
    }
  }

  async function submit(action, options = {}) {
    const busyKey = options.busyKey || action;
    const mediaUrl = imageUrl;
    const scheduledAt = action === "schedule" ? fromDatetimeLocalValue(publicationScheduledAt) : null;
    if (action === "schedule" && !scheduledAt) {
      setError("Elige fecha y hora para programar.");
      return;
    }
    if (action === "schedule" && new Date(scheduledAt).getTime() <= Date.now()) {
      setError("La programación tiene que ser futura.");
      return;
    }
    setBusy(busyKey);
    setError("");
    setMessage("");
    try {
      const result = await api("/publications/post", {
        method: "POST",
        body: JSON.stringify({
          action,
          targetId: selectedTarget.id,
          target: selectedTarget,
          caption,
          captionHtml,
          imageUrl: mediaUrl,
          videoUrl: ["youtube", "tiktok"].includes(selectedTarget.id) ? mediaUrl : "",
          location: "",
          tag: "",
          audience: "public",
          scheduledAt,
          force: Boolean(options.force),
          options: {
            hideLikes: false,
            noComments: false,
            shareThreads: false,
            linkedinMode: selectedTarget.id === "linkedin" ? linkedinMode : undefined,
            tiktokMode: selectedTarget.id === "tiktok" ? tiktokMode : undefined,
            mediaAspect,
            mediaFit,
            mediaPosition,
          },
        }),
      });
	      setPosts((current) => [result.post, ...current.filter((post) => post.id !== result.post.id)].slice(0, 50));
	      onPublicationSaved?.();
	      const learned = Boolean(result.learned);
	      const learnedSignals = learned ? publicationLearningSignals(result.post) : [];
	      const n8nBrain = result.result?.editorial_brain || result.post?.result?.editorial_brain;
	      setMessage([
	        publicationResultMessage(action, result.post, selectedTarget.name),
	        learned
            ? (learnedSignals.length ? `Aprendido: ${learnedSignals.join(" ")}` : "Aprendido.")
            : "",
          n8nBrain?.sentToN8n ? "Memoria del cerebro enviada a n8n. No se afirma que n8n la usara." : "",
	      ].filter(Boolean).join(" "));
	    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy("");
    }
  }

  async function copyPostCaption(post) {
    try {
      await navigator.clipboard.writeText(String(post.caption || ""));
      setError("");
      setMessage("Texto copiado. Pégalo en Instagram.");
    } catch {
      setError("No se pudo copiar; selecciona el texto y cópialo a mano.");
    }
  }

  async function confirmPublication(postId) {
    setBusy("confirm");
    setError("");
    setMessage("");
    try {
      const result = await api(`/publications/posts/${encodeURIComponent(postId)}/confirm`, { method: "POST" });
      setPosts((current) => current.map((post) => post.id === postId ? result.post : post));
      onPublicationSaved?.();
      if (result.learned) {
        setMessage(result.trainingSource === "editorial-brain"
          ? "Publicación confirmada. El cerebro la recibió para aprender."
          : "Publicación confirmada. Guardada en la memoria local.");
      } else {
        // La memoria editorial está parada (19/11/2026): no se avisa de que no aprendió.
        setMessage("Publicación confirmada.");
      }
    } catch (confirmError) {
      setError(confirmError.message);
    } finally {
      setBusy("");
    }
  }

  function currentPublicationDraftPayload() {
    return {
      targetId: selectedTarget.id,
      targetName: selectedTarget.name,
      caption,
      captionHtml,
      imageUrl,
      publicationScheduledAt,
      linkedinMode,
      tiktokMode,
      mediaAspect,
      mediaFit,
      mediaPosition,
      blogArticleDraft,
      updatedAt: new Date().toISOString(),
    };
  }

  function saveWorkspaceDraft() {
    const draft = currentPublicationDraftPayload();
    writePublicationDraft(draft);
    setSavedDraft(draft);
    setMessage("Borrador guardado. No se publica ni entra en historial.");
    setError("");
  }

  function recoverWorkspaceDraft() {
    const draft = savedDraft || readPublicationDraft();
    if (!draft) return;
    setSelectedTargetId(draft.targetId || "instagram");
    setCaption(String(draft.caption || ""));
    setCaptionHtml(String(draft.captionHtml || ""));
    setImageUrl(String(draft.imageUrl || ""));
    setPublicationScheduledAt(String(draft.publicationScheduledAt || ""));
    setLinkedinMode(draft.linkedinMode || "post");
    setTiktokMode(draft.tiktokMode || "draft");
    setMediaAspect(draft.mediaAspect || "original");
    setMediaFit(draft.mediaFit || "cover");
    setMediaPosition(draft.mediaPosition || { x: 0, y: 0 });
    setBlogArticleDraft((current) => ({ ...current, ...(draft.blogArticleDraft || {}) }));
    setMediaSource(null);
    setPublisherScreen("editor");
    setMessage(`Borrador recuperado${draft.targetName ? ` para ${draft.targetName}` : ""}.`);
    setError("");
  }

  function clearWorkspaceDraft() {
    deletePublicationDraft();
    setSavedDraft(null);
    setMessage("Borrador eliminado.");
    setError("");
  }

  function reset() {
    setCaption("");
    setCaptionHtml("");
    setImageUrl("");
    setMediaSource(null);
    setMediaAspect("original");
    setBlogArticleDraft((current) => ({ ...current, slug: "", title: "", excerpt: "", lede: "" }));
    setMessage("");
  }

  function startMediaDrag(event) {
    if (!imageUrl || isVideoTarget) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (mediaFit !== "cover") setMediaFit("cover");
    setMediaDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: mediaPosition.x,
      originY: mediaPosition.y,
    });
  }

  function moveMediaDrag(event) {
    if (!mediaDrag || mediaDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - mediaDrag.startX) / Math.max(bounds.width, 1)) * 45;
    const deltaY = ((event.clientY - mediaDrag.startY) / Math.max(bounds.height, 1)) * 45;
    const clamp = (value) => Math.max(-35, Math.min(35, value));
    setMediaPosition({
      x: clamp(mediaDrag.originX + deltaX),
      y: clamp(mediaDrag.originY + deltaY),
    });
  }

  function stopMediaDrag(event) {
    if (mediaDrag?.pointerId === event.pointerId) setMediaDrag(null);
  }

  function openTarget(targetId) {
    setSelectedTargetId(targetId);
    setPublisherScreen("editor");
    setError("");
    setMessage("");
  }

  const isVideoTarget = ["youtube", "tiktok"].includes(selectedTarget.id);
  const selectedChannel = (channelStatus?.channels || []).find((channel) => channel.id === selectedTarget.id);
  const targetPending = ["pending", "attention"].includes(selectedChannel?.level || "") && selectedTarget.id === "pinterest";
  const preflightBlocked = preflight?.checks?.some((check) => check.level === "block");
  const selectedMediaAspect = PUBLICATION_MEDIA_ASPECTS.find((option) => option.id === mediaAspect) || PUBLICATION_MEDIA_ASPECTS[0];
  const previewMediaFit = "contain";
  const publishButtonLabel = (() => {
    if (!selectedTarget.webhookPath) return "CONFIGURA ENTREGA";
    if (targetPending) return "PENDIENTE CONFIG";
    if (selectedTarget.id === "tiktok" && tiktokMode === "draft") return "PREPARAR PARA REVISAR";
    if (selectedTarget.id === "tiktok" && tiktokMode === "publish") return "INTENTAR PUBLICAR";
    if (selectedTarget.id === "youtube") return "PUBLICAR EN YOUTUBE";
    if (selectedTarget.id === "pinterest") return "PUBLICAR EN PINTEREST";
    if (selectedTarget.id === "linkedin" && linkedinMode === "article") return "PUBLICAR ARTÍCULO";
    if (selectedTarget.id === "linkedin") return "PUBLICAR EN LINKEDIN";
    if (selectedTarget.id === "instagram" && selectedChannel?.delivery === "App de Instagram") return "DEJAR LISTO PARA INSTAGRAM";
    if (selectedTarget.id === "instagram") return "PUBLICAR EN INSTAGRAM";
    if (selectedTarget.id === "blog") return "PUBLICAR EN BLOG";
    return `ENVIAR A ${selectedTarget.name.toUpperCase()}`;
  })();
  const disabled = !caption.trim() || Boolean(busy);
  const workspaceDraftPanel = (
    <div className="linkedin-article-adapter publication-draft-panel">
      <header>
        <strong>Borrador actual</strong>
        <span>{savedDraft ? "Guardado" : "Sin guardar"}</span>
      </header>
      <p>
        {savedDraft
          ? `${savedDraft.targetName || "Publicaciones"} · ${savedDraft.updatedAt ? new Date(savedDraft.updatedAt).toLocaleString("es-ES") : "sin fecha"}`
          : "Guarda lo que estás escribiendo para volver después sin publicarlo ni meterlo en historial."}
      </p>
      {savedDraft?.caption ? <p className="draft-snippet">{savedDraft.caption}</p> : null}
      <div className="history-row-actions">
        <button type="button" onClick={saveWorkspaceDraft} disabled={!caption.trim() && !imageUrl}>Guardar actual</button>
        <button type="button" onClick={recoverWorkspaceDraft} disabled={!savedDraft}>Recuperar</button>
        <button type="button" className="danger" onClick={clearWorkspaceDraft} disabled={!savedDraft}>Borrar</button>
      </div>
    </div>
  );

  return (
    <main className="instagram-workspace">
      <section className="instagram-shell">
        <header className="instagram-header">
          <div>
            <div className="eyebrow">PUBLICACIONES</div>
            <h2>Publicaciones</h2>
            <p>Publica ahora, programa una hora o confirma una entrega pendiente. El historial de esta pantalla no borra posts.</p>
          </div>
          {publisherScreen === "editor" && (
            <span className="generator-route">{selectedTarget.name}</span>
          )}
        </header>

        {publisherScreen === "hub" ? (
          <section className="panel publication-hub">
            <div className="panel-heading">
              <div><span className="section-mark blue" />PANTALLAS DE PUBLICACIÓN</div>
              <Button type="button" onClick={() => setTargetEditorOpen((current) => !current)}>
                {targetEditorOpen ? "CERRAR" : "NUEVO DESTINO"}
              </Button>
            </div>
            {targetEditorOpen && (
              <form className="publication-target-form" onSubmit={createTarget}>
                <label>
                  Sitio
                  <input
                    value={targetDraft.name}
                    onChange={(event) => setTargetDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="LinkedIn, Blog, Pinterest..."
                  />
                </label>
                <label>
                  Usuario / cuenta
                  <input
                    value={targetDraft.handle}
                    onChange={(event) => setTargetDraft((current) => ({ ...current, handle: event.target.value }))}
                    placeholder="@cuenta o URL"
                  />
                </label>
                <label>
                  Entrega
                  <input
                    value={targetDraft.webhookPath}
                    onChange={(event) => setTargetDraft((current) => ({ ...current, webhookPath: event.target.value }))}
                    placeholder="Ruta de entrega"
                  />
                </label>
                <label>
                  Color
                  <select
                    value={targetDraft.color}
                    onChange={(event) => setTargetDraft((current) => ({ ...current, color: event.target.value }))}
                  >
                    {PUBLICATION_TARGET_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
                  </select>
                </label>
                <Button kind="primary" disabled={busy === "target" || !targetDraft.name.trim()}>
                  {busy === "target" ? "CREANDO..." : `CREAR ${publicationIcon(targetDraft.name)}`}
                </Button>
              </form>
            )}
            <div className="publication-hub-grid">
              <button type="button" onClick={() => setPublisherScreen("forums")} className="publication-forums-entry">
                <i className="publication-platform-icon" style={{ background: "#4a9e7a" }}>{PUBLICATION_PLATFORM_ICONS.forums}</i>
                <strong>Foros</strong>
                <span>Gestiona Hacker, Soroa y el resto de bandejas de reputación.</span>
                <b>ABRIR</b>
              </button>
              {targets.map((target) => (
                <button key={target.id} type="button" onClick={() => openTarget(target.id)} className={(channelStatus?.channels || []).find((channel) => channel.id === target.id)?.level === "pending" ? "pending" : ""}>
                  <i className="publication-platform-icon" style={{ background: target.color }}>{platformIcon(target)}</i>
                  <strong>{target.name}</strong>
                  <span>
                    {target.id === "youtube"
                      ? "Publicación directa por YouTube API."
                      : target.id === "instagram"
                        ? "Publicación por n8n con worker local de navegador."
                        : target.id === "tiktok"
                          ? "Worker asistido: deja el vídeo preparado para revisar en TikTok."
                        : target.id === "pinterest"
                          ? "Publicación directa por Pinterest API."
                      : target.webhookPath ? "Destino preparado para entregar publicaciones." : "Configura la entrega para activar publicaciones."}
                  </span>
                  <b>{(channelStatus?.channels || []).find((channel) => channel.id === target.id)?.level === "pending" ? "PENDIENTE" : target.webhookPath ? "ABRIR" : "CONFIGURAR"}</b>
                </button>
              ))}
            </div>
          </section>
        ) : publisherScreen === "forums" ? (
          <ForumHub
            initialWorkflowId={initialForumWorkflowId}
            initialNoticeId={initialForumNoticeId}
            initialPublicationMode={initialForumPublicationMode}
          />
        ) : (
          <div className="publication-editor-layout">
            <section className="publication-editor-generator">
              <Generator
                embedded
                targetFormat={selectedTarget.name}
                targetId={selectedTarget.id}
                seedText={caption}
                onUseText={(value) => {
                  const nextText = typeof value === "object" && value !== null ? value.text : value;
                  const nextHtml = typeof value === "object" && value !== null ? value.html : "";
                  setCaption(String(nextText || ""));
                  setCaptionHtml(sanitizeCaptionHtml(nextHtml || generatedTextToCaptionHtml(nextText || "")));
                  setMessage(`Texto enviado a ${selectedTarget.name}`);
                  setError("");
                }}
              />
            </section>

            <div className="instagram-layout">
              <section className="instagram-phone panel">
                <div className="instagram-phone-head">
                  <Button type="button" onClick={() => setPublisherScreen("hub")}>← DESTINOS</Button>
                  <strong>{targetPending ? `${selectedTarget.name} pendiente` : `Publicar en ${selectedTarget.name}`}</strong>
                </div>
                {targetPending && (
                  <div className="publication-target-warning">
                    {selectedChannel?.detail || "Este destino necesita credenciales antes de publicar."}
                  </div>
                )}
                <input
                  id="publication-media-input"
                  ref={mediaInputRef}
                  className="publication-file-input"
                  type="file"
                  accept={isVideoTarget ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp"}
                  onChange={uploadMedia}
                />
                {imageUrl ? (
                  <div
                    className={`instagram-preview has-media ${!isVideoTarget ? "draggable" : ""} aspect-${mediaAspect}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={dropPublicationMedia}
                    onPointerDown={startMediaDrag}
                    onPointerMove={moveMediaDrag}
                    onPointerUp={stopMediaDrag}
                    onPointerCancel={stopMediaDrag}
                  >
                    {isVideoTarget ? (
                    <video src={imageUrl} controls muted playsInline style={{ objectFit: mediaFit }} />
                    ) : mediaLoadFailed ? (
                    <div className="instagram-drop-content media-fallback">
                      <span className="publication-media-icon">IMG</span>
                      <strong>No se pudo cargar la imagen</strong>
                      <em>{imageUrl}</em>
                    </div>
                    ) : (
                    <img
                      src={imageUrl}
                      alt={`Vista previa de ${selectedTarget.name}`}
                      draggable={false}
                      onError={() => setMediaLoadFailed(true)}
                      onLoad={() => setMediaLoadFailed(false)}
                      style={{
                        objectFit: previewMediaFit,
                        transform: "none",
                      }}
                    />
                    )}
                  </div>
                ) : (
                  <div
                    className={`instagram-preview empty-dropzone aspect-${mediaAspect}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={dropPublicationMedia}
                  >
                    <div className="instagram-drop-content">
                      <span className="publication-media-icon">{isVideoTarget ? "VID" : "IMG"}</span>
                      <strong>{isVideoTarget ? "Arrastra el vídeo aquí" : "Arrastra las fotos aquí"}</strong>
                      <p>O usa los botones de debajo.</p>
                    </div>
                  </div>
                )}
                <div className="publication-media-actions">
                  {publicationMediaActions({ failed: mediaLoadFailed })}
                </div>
                {!isVideoTarget && (
                  <VisualAnalysisPanel
                    analysis={visualAnalysis}
                    busy={visualBusy}
                    title="Análisis visual"
                  />
                )}
                <div className="publication-library">
                  <strong>Biblioteca</strong>
                  {libraryItems.length ? (
                    <div className="publication-library-list">
                      {libraryItems.slice(0, 12).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={imageUrl === item.url ? "active" : ""}
                          onClick={() => {
                            setImageUrl(item.url);
                            setMediaSource(null);
                            setMediaLoadFailed(false);
                          }}
                        >
                          {item.kind === "image"
                            ? <img src={item.url} alt={item.name} />
                            : <span>{item.name}</span>}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p>Sin archivos en la biblioteca de este destino.</p>
                  )}
                </div>
                {imageUrl && (
                  <>
                    <div className="publication-aspect-tools">
                      {PUBLICATION_MEDIA_ASPECTS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          disabled={mediaBusy}
                          className={mediaAspect === option.id ? "active" : ""}
                          onClick={() => applyMediaAspect(option.id)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="publication-aspect-reference">
                      <strong>{selectedMediaAspect.output}</strong>
                      <span>{selectedMediaAspect.recommended}</span>
                    </p>
                  </>
                )}
                {selectedTarget.id === "linkedin" && (
                  <div className="linkedin-publisher-tools">
                    <div className="publication-mode-toggle">
                      <span>LinkedIn</span>
                      <button
                        type="button"
                        className={linkedinMode === "post" ? "active" : ""}
                        onClick={() => setLinkedinMode("post")}
                      >
                        Crear publicación
                      </button>
                      <button
                        type="button"
                        className={linkedinMode === "article" ? "active" : ""}
                        onClick={() => setLinkedinMode("article")}
                      >
                        Escribir artículo
                      </button>
                    </div>
                    {workspaceDraftPanel}
                  </div>
                )}
                {selectedTarget.id === "tiktok" && (
                  <div className="publication-mode-toggle">
                    <span>TikTok</span>
                    <button
                      type="button"
                      className={tiktokMode === "draft" ? "active" : ""}
                      onClick={() => setTiktokMode("draft")}
                    >
                      Dejar listo
                    </button>
                    <button
                      type="button"
                      className={tiktokMode === "publish" ? "active" : ""}
                      onClick={() => setTiktokMode("publish")}
                    >
                      Intentar publicar
                    </button>
                    <p>Modo recomendado: deja el vídeo en la pantalla de subida para revisarlo en la app.</p>
                  </div>
                )}
                {selectedTarget.id === "blog" && (
                  <div className="blog-article-editor">
                    <div className="blog-article-fields">
                      <label>
                        Título
                        <input
                          value={blogArticleDraft.title}
                          onChange={(event) => updateBlogArticleDraft("title", event.target.value)}
                          placeholder="Título del artículo"
                        />
                      </label>
                      <label>
                        Categoría
                        <input
                          value={blogArticleDraft.category}
                          onChange={(event) => updateBlogArticleDraft("category", event.target.value)}
                          placeholder="Automatización"
                        />
                      </label>
                      <label>
                        Resumen tarjeta
                        <textarea
                          value={blogArticleDraft.excerpt}
                          onChange={(event) => updateBlogArticleDraft("excerpt", event.target.value)}
                          placeholder="Texto corto para la tarjeta del blog"
                          rows={3}
                        />
                      </label>
                      <label>
                        Entradilla
                        <textarea
                          value={blogArticleDraft.lede}
                          onChange={(event) => updateBlogArticleDraft("lede", event.target.value)}
                          placeholder="Primer párrafo visible dentro del artículo"
                          rows={3}
                        />
                      </label>
                    </div>
                    <div className="blog-article-list">
                      <header>
                        <strong>Artículos del blog</strong>
                        <button type="button" onClick={loadBlogArticles} disabled={busy === "blog-refresh"}>Actualizar</button>
                      </header>
                      {blogArticles.length ? blogArticles.map((article) => (
                        <article key={article.slug} className={blogArticleDraft.slug === article.slug ? "editing" : ""}>
                          <div>
                            <strong>{article.title}</strong>
                            <span>{article.category} · {article.created_at ? new Date(article.created_at).toLocaleDateString("es-ES") : "sin fecha"}</span>
                          </div>
                          <a href={`https://aeternal-flow.es/blog.php?post=${encodeURIComponent(article.slug)}`} target="_blank" rel="noreferrer">Abrir</a>
                          <button type="button" onClick={() => editBlogArticle(article)} disabled={Boolean(busy)}>Editar</button>
                        </article>
                      )) : (
                        <p>Sin artículos cargados.</p>
                      )}
                    </div>
                  </div>
                )}
                <FormattedTextarea
                  className="instagram-caption"
                  value={caption}
                  html={captionHtml}
                  rows={7}
                  placeholder={`Escribe el contenido para ${selectedTarget.name}...`}
                  onChange={setCaption}
                  onHtmlChange={setCaptionHtml}
                />
                <div className="instagram-caption-meta">
                  <button type="button" onClick={() => {
                    setCaption((current) => `${current}${current ? " " : ""}✨`);
                    setCaptionHtml("");
                  }}>
                    :)
                  </button>
                  <span>{formatLimit(caption.length)} caracteres</span>
                </div>
              </section>

              <section className="instagram-controls">
                {message && <div className="instagram-status success"><StatusMessage value={message} /></div>}
                {error && <div className="instagram-status error"><StatusMessage value={error} /></div>}

                {preflight?.checks?.length ? (
                  <div className={`panel publication-preflight ${preflight.level || "ok"}`}>
                    <div className="panel-heading compact">
                      <div><span className="section-mark green" />Diagnóstico antes de publicar</div>
                      <span>{preflight.level === "block" ? "BLOQUEADO" : preflight.level === "warn" ? "REVISAR" : "OK"}</span>
                    </div>
                    <div className="preflight-grid">
                      {preflight.checks.map((check) => (
                        <article key={check.id} className={check.level}>
                          <strong>{check.label}</strong>
                          {check.detail ? <p>{check.detail}</p> : null}
                          {check.action?.href ? <a className="publication-upload-action" href={check.action.href}>{check.action.label}</a> : null}
                          {check.id === "youtube" && check.level === "block" && (
                            <a href="/oauth/youtube/start">Autorizar YouTube</a>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="instagram-actions panel">
                  <label className="publication-schedule-field">
                    Programar
                    <input
                      type="datetime-local"
                      value={publicationScheduledAt}
                      onChange={(event) => setPublicationScheduledAt(event.target.value)}
                    />
                  </label>
                  {selectedTarget.id === "blog" && blogArticleDraft.slug ? (
                    <Button type="button" kind="primary" disabled={Boolean(busy) || !blogArticleDraft.title.trim() || !caption.trim()} onClick={saveBlogArticleEdit}>
                      {busy === "blog-save" ? "GUARDANDO..." : "GUARDAR CAMBIOS BLOG"}
                    </Button>
                  ) : null}
                  <Button type="button" disabled={!caption.trim() && !imageUrl} onClick={saveWorkspaceDraft}>
                    GUARDAR BORRADOR
                  </Button>
                  <Button
                    type="button"
                    disabled={disabled || !selectedTarget.webhookPath || targetPending || preflightBlocked || !publicationScheduledAt || busy === "schedule"}
                    onClick={() => submit("schedule")}
                  >
                    {busy === "schedule" ? "PROGRAMANDO..." : "PROGRAMAR"}
                  </Button>
                  <Button
                    type="button"
                    kind="primary"
                    disabled={disabled || !selectedTarget.webhookPath || targetPending || preflightBlocked}
                    onClick={() => (selectedTarget.id === "blog" && blogArticleDraft.slug ? saveBlogArticleEdit() : submit("publish"))}
                  >
                    {busy === "publish" || busy === "blog-save"
                      ? (selectedTarget.id === "tiktok" && tiktokMode === "draft" ? "PREPARANDO..." : "PUBLICANDO...")
                      : selectedTarget.id === "blog" && blogArticleDraft.slug ? "ACTUALIZAR BLOG" : publishButtonLabel}
                  </Button>
                  <Button type="button" onClick={reset}>LIMPIAR</Button>
                </div>
                <section className="instagram-history panel">
                  <div className="panel-heading compact">
                    <div><span className="section-mark" />Historial reciente</div>
                    <span>Sin borrar posts</span>
                  </div>
                  {posts.length ? posts.slice(0, 12).map((post) => (
                    <article key={post.id}>
                      <header>
                        <div>
                          <strong>{post.target?.name || post.targetId || "Destino"}</strong>
                          <span>{publicationStatusLabel(post.status, post.action, post.target?.id || post.targetId)} · {new Date(post.scheduledAt || post.publishedAt || post.createdAt || Date.now()).toLocaleString("es-ES")}</span>
                        </div>
                        <div className="history-row-actions">
                          {post.deliveryMode === "a mano" && isPublicationAwaitingConfirmation(post.status) && (post.videoUrl || post.imageUrl) && (
                            <a href={post.videoUrl || post.imageUrl} download target="_blank" rel="noreferrer">Descargar</a>
                          )}
                          {post.deliveryMode === "a mano" && isPublicationAwaitingConfirmation(post.status) && (
                            <button type="button" onClick={() => copyPostCaption(post)}>Copiar texto</button>
                          )}
                          {isPublicationAwaitingConfirmation(post.status) && (
                            <button type="button" disabled={Boolean(busy)} onClick={() => confirmPublication(post.id)}>
                              {busy === "confirm" ? "..." : post.deliveryMode === "a mano" ? "Ya publicado" : "Confirmar"}
                            </button>
                          )}
                        </div>
                      </header>
                      {post.caption ? <p className="draft-snippet">{post.caption}</p> : null}
                      {post.training?.learned ? (
                        <p className="draft-snippet">Aprendida en {post.training.source === "editorial-brain" ? "el cerebro editorial" : "la memoria local"}.</p>
                      ) : post.training?.error ? (
                        <p className="draft-snippet">No se aprendió: {post.training.error}</p>
                      ) : null}
                    </article>
                  )) : (
                    <p>Aún no hay entregas registradas.</p>
                  )}
                </section>

              </section>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function emptyStatsRows() {
  return STATS_TEMPLATE_ROWS.map((row) => ({ ...row }));
}

function emptyStatsRow(channel) {
  return { channel, publications: 0, impressions: 0, interactions: 0, clicks: 0 };
}

function isStatsImportedDimensionNoise(channel) {
  return /(?:^|·\s*)\((referral|organic|not set|direct|none)\)$/i.test(String(channel || "").trim());
}

function normalizeStatsChannelLabel(channel) {
  const source = String(channel || "").trim();
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
  if (/ga4|google analytics|web/.test(text)) return source === "GA4 Web" ? source : "GA4 Web";
  return source;
}

function mergeStatsRowsByChannel(rows = []) {
  const byChannel = new Map();
  for (const row of rows) {
    const channel = normalizeStatsChannelLabel(row.channel);
    const key = channel.toLowerCase();
    if (!key || isStatsImportedDimensionNoise(channel)) continue;
    const current = byChannel.get(key);
    if (!current) {
      byChannel.set(key, { ...row, channel });
      continue;
    }
    byChannel.set(key, {
      ...current,
      publications: cleanStatsInput(current.publications) + cleanStatsInput(row.publications),
      impressions: cleanStatsInput(current.impressions) + cleanStatsInput(row.impressions),
      interactions: cleanStatsInput(current.interactions) + cleanStatsInput(row.interactions),
      clicks: cleanStatsInput(current.clicks) + cleanStatsInput(row.clicks),
    });
  }
  return [...byChannel.values()];
}

function campaignStatsChannel(campaign) {
  const source = normalizeStatsChannelLabel(campaign?.source);
  if (source) return source;
  const destination = campaignDestinationLabel(campaign?.url);
  const normalizedDestination = normalizeStatsChannelLabel(destination);
  return normalizedDestination || destination;
}

function statsRowsWithCampaignChannels(rows = [], campaigns = []) {
  const byChannel = new Map(rows.map((row) => [normalizeStatsChannelLabel(row.channel).toLowerCase(), row]));
  for (const campaign of campaigns) {
    const channel = campaignStatsChannel(campaign);
    const key = normalizeStatsChannelLabel(channel).toLowerCase();
    if (!key || byChannel.has(key)) continue;
    byChannel.set(key, emptyStatsRow(channel));
  }
  return [...byChannel.values()]
    .filter((row) => String(row.channel || "").trim())
    .sort((left, right) => String(left.channel || "").localeCompare(String(right.channel || ""), "es", { sensitivity: "base" }));
}

function configuredStatsChannelKeys(campaigns = []) {
  return new Set([
    ...STATS_TEMPLATE_ROWS.map((row) => normalizeStatsChannelLabel(row.channel).toLowerCase()),
    ...campaigns.map((campaign) => normalizeStatsChannelLabel(campaign.source).toLowerCase()).filter(Boolean),
  ]);
}

function isAllowedStatsRow(row = {}, campaigns = []) {
  const channel = normalizeStatsChannelLabel(row.channel);
  const key = channel.toLowerCase();
  if (!key || isStatsImportedDimensionNoise(channel)) return false;
  if (key === "ga4 web") return true;
  return configuredStatsChannelKeys(campaigns).has(key);
}

function statsRowsForMonth(entries, year, month, campaigns = []) {
  const savedRows = mergeStatsRowsByChannel(entries
    .filter((entry) => Number(entry.year) === year && Number(entry.month) === month)
    .filter((entry) => isAllowedStatsRow(entry, campaigns))
    .filter((entry) => !isStatsImportedDimensionNoise(entry.channel))
    .sort((left, right) => String(left.channel || "").localeCompare(String(right.channel || ""))));
  if (!savedRows.length) return statsRowsWithCampaignChannels(emptyStatsRows(), campaigns);
  const hasRealData = savedRows.some((row) =>
    cleanStatsInput(row.publications)
    || cleanStatsInput(row.impressions)
    || cleanStatsInput(row.interactions)
    || cleanStatsInput(row.clicks),
  );
  const rows = hasRealData
    ? savedRows.filter((row) =>
      normalizeStatsChannelLabel(row.channel).toLowerCase() === "ga4 web"
      || cleanStatsInput(row.publications)
      || cleanStatsInput(row.impressions)
      || cleanStatsInput(row.interactions)
      || cleanStatsInput(row.clicks),
    )
    : savedRows;
  return statsRowsWithCampaignChannels(rows, campaigns);
}

function last30DaysDisplayValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function formatLookupResultForMaterial(result = {}) {
  const items = Array.isArray(result.items) ? result.items : [];
  return [
    `Búsqueda externa: ${result.keyword || result.query || "consulta"}`,
    result.label ? `Label: ${result.label}` : "",
    result.text ? `Resumen: ${result.text}` : "",
    items.length ? "Resultados:" : "",
    ...items.slice(0, 8).map((item, index) => [
      `${index + 1}. ${item.title || item.url || "Resultado"}`,
      item.summary ? `   ${item.summary}` : "",
      item.url ? `   ${item.url}` : "",
    ].filter(Boolean).join("\n")),
  ].filter(Boolean).join("\n");
}

function Last30DaysLookupPanel({ className = "", onQueueResult }) {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function lookup() {
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword) {
      setError("Escribe una palabra o una instrucción para consultar");
      return;
    }
    setLoading(true);
    setResult(null);
    setError("");
    setMessage("");
    try {
      const response = await api("/claude/last30days", {
        method: "POST",
        body: JSON.stringify({ keyword: cleanKeyword }),
      });
      setResult(response);
      setMessage(`Consulta lista para "${response.keyword || cleanKeyword}"`);
    } catch (lookupError) {
      setError(lookupError.message);
    } finally {
      setLoading(false);
    }
  }

  function addResultToMaterial() {
    if (!result) return;
    onQueueResult?.(result);
    setMessage(`Resultado añadido al material para "${result.keyword || keyword.trim()}"`);
  }

  return (
    <section className={`last30days-panel ${className}`}>
      <div className="panel-heading">
        <span className="section-mark blue" />
        <div>
          <strong>Búsqueda para label</strong>
          <small>n8n si responde; si no, publicaciones, notas, calendario y estilo de esta consola</small>
        </div>
        <Button type="button" kind="primary" disabled={loading} onClick={lookup}>
          {loading ? "CONSULTANDO..." : "CONSULTAR"}
        </Button>
      </div>
      <label className="last30days-field">
        Palabra
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              lookup();
            }
          }}
          placeholder="por ejemplo últimos 30 días"
        />
      </label>
      {(error || message) && (
        <div className={error ? "publication-feedback error" : "publication-feedback success"}>
          <span>{error || message}</span>
        </div>
      )}
      {result && (
        <div className="last30days-result">
          <header>
            <strong>{result.label || result.keyword}</strong>
            <span>{result.provider || result.source || "n8n"} · {result.receivedAt ? relativeTime(result.receivedAt) : "recibido"}</span>
          </header>
          <Button type="button" onClick={addResultToMaterial}>AÑADIR A MATERIAL</Button>
          {result.text && result.text !== result.label && <p>{result.text}</p>}
          {Array.isArray(result.items) && result.items.length > 0 && (
            <div className="last30days-items">
              {result.items.map((item, index) => (
                <article key={`${result.keyword}-${index}`}>
                  <strong>{item.title || item.url || `Resultado ${index + 1}`}</strong>
                  {item.summary && <p>{item.summary}</p>}
                  <span>{[item.source, item.publishedAt, item.language || item.country].filter(Boolean).join(" · ")}</span>
                  {item.url && <a href={item.url} target="_blank" rel="noreferrer">Abrir resultado</a>}
                </article>
              ))}
            </div>
          )}
          {!result.text && result.raw && (
            <pre>{last30DaysDisplayValue(result.raw)}</pre>
          )}
        </div>
      )}
    </section>
  );
}

function sumStatsRows(rows) {
  return rows.reduce((totals, row) => ({
    publications: totals.publications + cleanStatsInput(row.publications),
    impressions: totals.impressions + cleanStatsInput(row.impressions),
    interactions: totals.interactions + cleanStatsInput(row.interactions),
    clicks: totals.clicks + cleanStatsInput(row.clicks),
  }), { publications: 0, impressions: 0, interactions: 0, clicks: 0 });
}

function datesBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const dates = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function shortDateLabel(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");
}

function buildGa4TrafficChartData(stats) {
  const seriesRows = Array.isArray(stats?.trafficSeries) ? stats.trafficSeries : [];
  const dates = datesBetween(stats?.startDate, stats?.endDate);
  if (!seriesRows.length || !dates.length) return null;
  const totalsBySource = new Map();
  for (const row of seriesRows) {
    const sourceMedium = row.sourceMedium || `${row.source || ""} / ${row.medium || ""}`;
    totalsBySource.set(sourceMedium, (totalsBySource.get(sourceMedium) || 0) + cleanStatsInput(row.sessions));
  }
  const topSources = [...totalsBySource.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es", { sensitivity: "base" }))
    .slice(0, 5)
    .map(([source]) => source);
  const totalByDate = new Map(dates.map((date) => [date, 0]));
  const sourceDateMap = new Map(topSources.map((source) => [source, new Map(dates.map((date) => [date, 0]))]));
  for (const row of seriesRows) {
    const sessions = cleanStatsInput(row.sessions);
    totalByDate.set(row.date, (totalByDate.get(row.date) || 0) + sessions);
    const sourceMedium = row.sourceMedium || `${row.source || ""} / ${row.medium || ""}`;
    const dateMap = sourceDateMap.get(sourceMedium);
    if (dateMap) dateMap.set(row.date, (dateMap.get(row.date) || 0) + sessions);
  }
  const lines = [
    {
      key: "Total",
      label: "Total",
      color: "#0b85c4",
      values: dates.map((date) => totalByDate.get(date) || 0),
      dashed: true,
    },
    ...topSources.map((source, index) => ({
      key: source,
      label: source,
      color: ["#2774dd", "#7ac143", "#e42d90", "#f2b705", "#4858b8"][index] || "#4a7ab5",
      values: dates.map((date) => sourceDateMap.get(source)?.get(date) || 0),
    })),
  ];
  return { dates, lines, maxValue: Math.max(1, ...lines.flatMap((line) => line.values)) };
}

function Ga4TrafficChart({ stats }) {
  const chart = buildGa4TrafficChartData(stats);
  if (!chart) return null;
  const width = 960;
  const height = 330;
  const padding = { top: 24, right: 36, bottom: 56, left: 32 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xFor = (index) => padding.left + (chart.dates.length <= 1 ? 0 : (index / (chart.dates.length - 1)) * plotWidth);
  const yFor = (value) => padding.top + plotHeight - (value / chart.maxValue) * plotHeight;
  const gridValues = [0, Math.ceil(chart.maxValue / 2), chart.maxValue];
  return (
    <section className="panel ga4-chart-panel">
      <div className="panel-heading">
        <span className="section-mark blue" />
        <div>
          <strong>Sesiones por Fuente/medio de la sesión a lo largo del tiempo</strong>
          <small>Día · {stats.startDate} - {stats.endDate}</small>
        </div>
      </div>
      <div className="ga4-chart-scroll">
        <svg className="ga4-traffic-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sesiones por fuente y medio a lo largo del tiempo">
          {gridValues.map((value) => (
            <g key={value}>
              <line x1={padding.left} x2={width - padding.right} y1={yFor(value)} y2={yFor(value)} />
              <text x={width - padding.right + 8} y={yFor(value) + 4}>{formatStatsNumber(value)}</text>
            </g>
          ))}
          {chart.dates.map((date, index) => index % 2 === 0 || index === chart.dates.length - 1 ? (
            <text key={date} x={xFor(index)} y={height - 20} textAnchor="middle">{shortDateLabel(date)}</text>
          ) : null)}
          {chart.lines.map((line) => {
            const points = line.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
            return (
              <polyline
                key={line.key}
                points={points}
                fill="none"
                stroke={line.color}
                strokeWidth={line.key === "Total" ? 3 : 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={line.dashed ? "4 4" : ""}
              />
            );
          })}
        </svg>
      </div>
      <div className="ga4-chart-legend">
        {chart.lines.map((line) => (
          <span key={line.key}>
            <i style={{ background: line.color }} />
            {line.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function buildCampaignUrl(campaign) {
  const rawUrl = String(campaign?.url || "").trim();
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    [
      ["utm_source", campaign.source],
      ["utm_medium", campaign.medium],
      ["utm_campaign", campaign.campaign],
      ["utm_content", campaign.content],
      ["utm_term", campaign.term],
    ].forEach(([key, value]) => {
      const clean = String(value || "").trim();
      if (clean) url.searchParams.set(key, clean);
      else url.searchParams.delete(key);
    });
    return url.toString();
  } catch {
    return "";
  }
}

function cleanUtmValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._~-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function campaignDestinationLabel(value) {
  try {
    const url = new URL(String(value || ""));
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = decodeURIComponent(url.pathname || "/").replace(/\/+$/, "");
    return `${hostname}${pathname && pathname !== "/" ? pathname : ""}`;
  } catch {
    return "destino sin URL";
  }
}

const CAMPAIGN_SOURCE_ORDER = ["linkedin", "pinterest", "instagram", "youtube", "blog", "google", "facebook", "tiktok", "reddit", "quora", "newsletter", "email"];

function campaignSourceKey(campaign = {}) {
  return String(campaign.source || "sin-origen").trim().toLowerCase() || "sin-origen";
}

function campaignSourceLabel(campaignOrSource = {}) {
  const source = typeof campaignOrSource === "string" ? campaignOrSource : campaignSourceKey(campaignOrSource);
  const labels = {
    "sin-origen": "Sin origen",
    blog: "Blog",
    email: "Email",
    facebook: "Facebook",
    google: "Google",
    instagram: "Instagram",
    linkedin: "LinkedIn",
    newsletter: "Newsletter",
    pinterest: "Pinterest",
    quora: "Quora",
    reddit: "Reddit",
    tiktok: "TikTok",
    youtube: "YouTube",
  };
  return labels[source] || source.replace(/[-_]+/g, " ");
}

function campaignSourceSort(left = "", right = "") {
  const leftIndex = CAMPAIGN_SOURCE_ORDER.indexOf(left);
  const rightIndex = CAMPAIGN_SOURCE_ORDER.indexOf(right);
  if (leftIndex >= 0 || rightIndex >= 0) {
    return (leftIndex >= 0 ? leftIndex : 999) - (rightIndex >= 0 ? rightIndex : 999);
  }
  return campaignSourceLabel(left).localeCompare(campaignSourceLabel(right), "es", { sensitivity: "base" });
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function StatsDashboard() {
  const campaignBuilderRef = useRef(null);
  const currentYear = new Date().getFullYear();
  const [entries, setEntries] = useState([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [draftRows, setDraftRows] = useState(emptyStatsRows);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importingGa4, setImportingGa4] = useState(false);
  const [ga4Stats, setGa4Stats] = useState(null);
  const [importingSearch, setImportingSearch] = useState(false);
  const [searchConsoleStats, setSearchConsoleStats] = useState(null);
  const [utmDraft, setUtmDraft] = useState({
    id: "",
    name: "",
    url: "https://aeternal-flow.es/",
    source: "instagram",
    medium: "social",
    campaign: "",
    content: "",
    term: "",
  });
  const [campaigns, setCampaigns] = useState([]);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [campaignActionId, setCampaignActionId] = useState("");
  const [generatedCampaignUrl, setGeneratedCampaignUrl] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    async function loadStats() {
      setLoading(true);
      setError("");
      try {
        const [statsResult, campaignsResult] = await Promise.all([
          api("/stats/monthly"),
          api("/stats/campaigns"),
        ]);
        if (alive) {
          setEntries(Array.isArray(statsResult.entries) ? statsResult.entries : []);
          setCampaigns(Array.isArray(campaignsResult.campaigns) ? campaignsResult.campaigns : []);
        }
      } catch (loadError) {
        if (alive) setError(loadError.message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadStats();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setDraftRows(statsRowsForMonth(entries, selectedYear, selectedMonth, campaigns));
  }, [campaigns, entries, selectedYear, selectedMonth]);

  const monthlyTotals = useMemo(() => MONTHS.map((monthName, index) => {
    const month = index + 1;
    const rows = entries.filter((entry) => Number(entry.year) === selectedYear && Number(entry.month) === month);
    const totals = sumStatsRows(rows);
    return { month, monthName, ...totals, hasData: rows.length > 0 };
  }), [entries, selectedYear]);

  const currentTotals = useMemo(() => sumStatsRows(draftRows), [draftRows]);
  const ga4TrafficRows = useMemo(() => Array.isArray(ga4Stats?.trafficRows)
    ? ga4Stats.trafficRows
    : [], [ga4Stats]);
  const displayTotals = ga4Stats ? {
    publications: currentTotals.publications,
    impressions: ga4Stats.pageViews,
    interactions: ga4Stats.engagedSessions,
    clicks: ga4Stats.sessions,
  } : currentTotals;
  const years = [...new Set([
    ...entries.map((entry) => Number(entry.year)).filter(Boolean),
    currentYear,
    selectedYear,
  ])].sort((left, right) => right - left);

  async function saveStats(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const rows = mergeStatsRowsByChannel(draftRows)
        .filter((row) => String(row.channel || "").trim());
      const result = await api("/stats/monthly", {
        method: "PUT",
        body: JSON.stringify({ year: selectedYear, month: selectedMonth, rows }),
      });
      setEntries(Array.isArray(result.entries) ? result.entries : []);
      setMessage("Datos mensuales guardados");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  const campaignUrl = useMemo(() => buildCampaignUrl(utmDraft), [utmDraft]);
  const campaignsBySource = useMemo(() => {
    const groups = new Map();
    campaigns.forEach((campaign) => {
      const sourceKey = campaignSourceKey(campaign);
      if (!groups.has(sourceKey)) groups.set(sourceKey, []);
      groups.get(sourceKey).push(campaign);
    });
    return Array.from(groups.entries())
      .map(([source, items]) => ({
        source,
        label: campaignSourceLabel(source),
        items: [...items].sort((left, right) =>
          campaignDestinationLabel(left.url).localeCompare(campaignDestinationLabel(right.url), "es", { sensitivity: "base" })
          || String(left.campaign || "").localeCompare(String(right.campaign || ""), "es", { sensitivity: "base" })
          || String(left.content || "").localeCompare(String(right.content || ""), "es", { sensitivity: "base" })
        ),
      }))
      .sort((first, second) => campaignSourceSort(first.source, second.source));
  }, [campaigns]);

  function mergeGa4Rows(rows) {
    setDraftRows((current) => {
      const incoming = mergeStatsRowsByChannel((Array.isArray(rows) ? rows : [])
        .filter((row) => String(row.channel || "").trim())
        .filter((row) => isAllowedStatsRow(row, campaigns))
        .filter((row) => !isStatsImportedDimensionNoise(row.channel)));
      if (!incoming.length) return current;
      const byChannel = new Map(incoming.map((row) => [normalizeStatsChannelLabel(row.channel).toLowerCase(), row]));
      const currentRows = current.filter((row) => {
        const channel = normalizeStatsChannelLabel(row.channel).toLowerCase();
        const isEmpty = !cleanStatsInput(row.publications)
          && !cleanStatsInput(row.impressions)
          && !cleanStatsInput(row.interactions)
          && !cleanStatsInput(row.clicks);
        return channel === "ga4 web" || !isEmpty;
      });
      const next = currentRows.map((item) => {
        const key = normalizeStatsChannelLabel(item.channel).toLowerCase();
        const imported = byChannel.get(key);
        if (!imported) return item;
        byChannel.delete(key);
        return {
          ...item,
          ...imported,
          publications: Number(item.publications || 0) || Number(imported.publications || 0),
        };
      });
      for (const row of byChannel.values()) {
        if (normalizeStatsChannelLabel(row.channel).toLowerCase() === "ga4 web") {
          next.unshift(row);
        } else {
          next.push(row);
        }
      }
      return next;
    });
  }

  async function importGa4Stats() {
    setImportingGa4(true);
    setError("");
    setMessage("");
    try {
      const result = await api(`/stats/ga4?year=${selectedYear}&month=${selectedMonth}`);
      setGa4Stats(result);
      mergeGa4Rows(result.rows || [result.row]);
      setMessage(`GA4 importado: ${formatStatsNumber(result.sessions)} sesiones, ${formatStatsNumber(result.pageViews)} vistas, ${(result.utmRows || []).length} entradas UTM y ${(result.outboundRows || []).length} salidas`);
    } catch (importError) {
      setGa4Stats(null);
      setError(importError.message.includes("GA4 no está configurado")
        ? "Falta configurar GA4. Abre /oauth/ga4/start y guarda el refresh token en Railway."
        : importError.message);
    } finally {
      setImportingGa4(false);
    }
  }

  async function importSearchConsoleStats() {
    setImportingSearch(true);
    setError("");
    setMessage("");
    try {
      const result = await api(`/stats/google-search?year=${selectedYear}&month=${selectedMonth}`);
      setSearchConsoleStats(result);
      if (result.row) mergeGa4Rows([result.row]);
      setMessage(`Search Console importado: ${formatStatsNumber(result.clicks)} clics, ${formatStatsNumber(result.impressions)} impresiones, CTR ${(Number(result.ctr || 0) * 100).toFixed(1)}%`);
    } catch (importError) {
      setSearchConsoleStats(null);
      setError(importError.message.includes("Search Console no está configurado")
        ? "Falta configurar Search Console. Abre /oauth/search-console/start y guarda el refresh token en Railway."
        : importError.message);
    } finally {
      setImportingSearch(false);
    }
  }

  async function copyCampaignUrl() {
    if (!generatedCampaignUrl) return;
    try {
      await copyText(generatedCampaignUrl);
      setMessage("URL de campaña copiada");
    } catch (copyError) {
      setError(`No se pudo copiar la URL: ${copyError.message}`);
    }
  }

  async function copySavedCampaignUrl(campaign) {
    const url = buildCampaignUrl(campaign);
    if (!url) return;
    setCampaignActionId(`copy-${campaign.id}`);
    setError("");
    setMessage("");
    try {
      await copyText(url);
      setMessage(`URL copiada: ${campaign.name || campaign.campaign}`);
    } catch (copyError) {
      setError(`No se pudo copiar la URL: ${copyError.message}`);
    } finally {
      setCampaignActionId("");
    }
  }

  function updateUtmDraft(patch) {
    setGeneratedCampaignUrl("");
    setUtmDraft((current) => ({ ...current, ...patch, id: "" }));
  }

  async function saveCampaignUrl() {
    if (!generatedCampaignUrl) {
      setError("Pulsa GENERAR URL antes de guardar");
      return;
    }
    setSavingCampaign(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/stats/campaigns", {
        method: "POST",
        body: JSON.stringify({ ...utmDraft, id: "" }),
      });
      setCampaigns(Array.isArray(result.campaigns) ? result.campaigns : []);
      setUtmDraft((current) => ({ ...current, id: "" }));
      setMessage("Campaña UTM guardada");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingCampaign(false);
    }
  }

  function generateCampaignUrl() {
    const inferredContent = utmDraft.content || utmDraft.name;
    const nextDraft = {
      ...utmDraft,
      source: cleanUtmValue(utmDraft.source),
      medium: cleanUtmValue(utmDraft.medium),
      campaign: cleanUtmValue(utmDraft.campaign),
      content: cleanUtmValue(inferredContent),
      term: cleanUtmValue(utmDraft.term),
    };
    const nextUrl = buildCampaignUrl(nextDraft);
    if (!nextUrl) {
      setGeneratedCampaignUrl("");
      setError("Revisa la URL base");
      return;
    }
    if (!nextDraft.source || !nextDraft.medium || !nextDraft.campaign) {
      setGeneratedCampaignUrl("");
      setError("Source, Medium y Campaign son obligatorios");
      return;
    }
    setError("");
    setMessage("URL UTM generada");
    setUtmDraft(nextDraft);
    setGeneratedCampaignUrl(nextUrl);
  }

  function loadCampaignUrl(campaign) {
    const nextDraft = {
      id: "",
      name: campaign.name || "",
      url: campaign.url || "https://aeternal-flow.es/",
      source: campaign.source || "",
      medium: campaign.medium || "",
      campaign: campaign.campaign || "",
      content: campaign.content || "",
      term: campaign.term || "",
    };
    setUtmDraft(nextDraft);
    setGeneratedCampaignUrl(buildCampaignUrl(nextDraft));
    setMessage(`Campaña cargada como copia: ${campaign.name || campaign.campaign}`);
    campaignBuilderRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function deleteCampaignUrl(campaignId) {
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (campaign && !window.confirm(`Borrar campaña "${campaign.name || campaign.campaign}"?`)) return;
    setCampaignActionId(`delete-${campaignId}`);
    setError("");
    setMessage("");
    try {
      const result = await api(`/stats/campaigns/${campaignId}`, { method: "DELETE" });
      setCampaigns(Array.isArray(result.campaigns) ? result.campaigns : []);
      setMessage("Campaña borrada");
      if (utmDraft.id === campaignId) setUtmDraft((current) => ({ ...current, id: "" }));
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setCampaignActionId("");
    }
  }

  return (
    <main className="stats-workspace">
      <section className="stats-shell">
        <header className="generator-header">
          <div>
            <span className="eyebrow">Métricas mensuales</span>
            <h2>Clics web/redes</h2>
            <p>Registro mensual de publicaciones, impresiones, interacciones y clics hacia tu web u otras redes.</p>
          </div>
          <div className="stats-period-picker">
            <label>
              Año
              <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label>
              Mes
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
              </select>
            </label>
          </div>
        </header>

        <section className="stats-summary-grid">
          <article><span>Publicaciones</span><strong>{formatStatsNumber(displayTotals.publications)}</strong></article>
          <article><span>Vistas GA4</span><strong>{formatStatsNumber(displayTotals.impressions)}</strong></article>
          <article><span>Sesiones con interacción</span><strong>{formatStatsNumber(displayTotals.interactions)}</strong></article>
          <article><span>Sesiones</span><strong>{formatStatsNumber(displayTotals.clicks)}</strong></article>
        </section>

        {(error || message) && (
          <div className={error ? "publication-feedback error" : "publication-feedback success"}>
            <StatusMessage value={error || message} />
          </div>
        )}

        <section className="stats-layout">
          <div className="stats-left-column">
          <form className="panel stats-editor" onSubmit={saveStats}>
            <div className="panel-heading">
              <span className="section-mark" />
              <div>
                <strong>{MONTHS[selectedMonth - 1]} {selectedYear}</strong>
                <small>GA4 mide visitas por UTM; aquí se muestran canales configurados y datos importados</small>
              </div>
              <Button type="button" kind="primary" onClick={importGa4Stats} disabled={importingGa4}>
                {importingGa4 ? "IMPORTANDO..." : "IMPORTAR GA4"}
              </Button>
              <Button type="button" onClick={importSearchConsoleStats} disabled={importingSearch}>
                {importingSearch ? "IMPORTANDO..." : "IMPORTAR SEARCH CONSOLE"}
              </Button>
            </div>
            {ga4Stats && (
              <div className="stats-source-note">
                <span>GA4</span>
                <b>{ga4Stats.startDate} - {ga4Stats.endDate}</b>
                <strong>{formatStatsNumber(ga4Stats.activeUsers)} usuarios activos</strong>
                <strong>{formatStatsNumber(ga4Stats.engagedSessions)} sesiones con interacción</strong>
                <strong>{formatStatsNumber((ga4Stats.utmRows || []).length)} entradas UTM</strong>
                <strong>{formatStatsNumber((ga4Stats.outboundRows || []).length)} salidas</strong>
              </div>
            )}
            {searchConsoleStats && (
              <div className="stats-source-note">
                <span>Search Console</span>
                <b>{searchConsoleStats.startDate} - {searchConsoleStats.endDate}</b>
                <strong>{formatStatsNumber(searchConsoleStats.clicks)} clics</strong>
                <strong>{formatStatsNumber(searchConsoleStats.impressions)} impresiones</strong>
                <strong>{(Number(searchConsoleStats.ctr || 0) * 100).toFixed(1)}% CTR</strong>
                <strong>pos. {Number(searchConsoleStats.position || 0).toFixed(1)}</strong>
              </div>
            )}
            {ga4TrafficRows.length ? (
              <div className="stats-table ga4-traffic-table">
                <div className="stats-table-head">
                  <span>Fuente/medio de la sesión</span>
                  <span>Sesiones</span>
                  <span>Sesiones con interacción</span>
                  <span>% interacción</span>
                  <span>Tiempo medio</span>
                  <span>Eventos</span>
                </div>
                <div className="stats-table-row stats-total-row">
                  <div className="stats-channel-cell">Total</div>
                  <div className="stats-number-cell">{formatStatsNumber(ga4Stats.sessions)}</div>
                  <div className="stats-number-cell">{formatStatsNumber(ga4Stats.engagedSessions)}</div>
                  <div className="stats-number-cell">{formatStatsPercent(ga4Stats.sessions ? (ga4Stats.engagedSessions / ga4Stats.sessions) * 100 : 0)}</div>
                  <div className="stats-number-cell">{formatStatsSeconds(ga4Stats.sessions ? ga4Stats.engagementSeconds / ga4Stats.sessions : 0)}</div>
                  <div className="stats-number-cell">{formatStatsNumber(ga4Stats.eventCount)}</div>
                </div>
                {ga4TrafficRows.map((row, index) => (
                  <div className="stats-table-row" key={`${row.sourceMedium}-${index}`}>
                    <div className="stats-channel-cell">{row.sourceMedium}</div>
                    <div className="stats-number-cell">{formatStatsNumber(row.sessions)}</div>
                    <div className="stats-number-cell">{formatStatsNumber(row.engagedSessions)}</div>
                    <div className="stats-number-cell">{formatStatsPercent(row.engagementRate)}</div>
                    <div className="stats-number-cell">{formatStatsSeconds(row.averageEngagementSeconds)}</div>
                    <div className="stats-number-cell">{formatStatsNumber(row.eventCount)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stats-table">
                <div className="stats-table-head">
                  <span>Canal</span>
                  <span>Publicaciones</span>
                  <span>Impresiones</span>
                  <span>Interacciones</span>
                  <span>Clics</span>
                </div>
                {draftRows.map((row, index) => (
                  <div className="stats-table-row" key={`${row.channel}-${index}`}>
                    <div className="stats-channel-cell">{row.channel}</div>
                    <div className="stats-number-cell">{formatStatsNumber(row.publications)}</div>
                    <div className="stats-number-cell">{formatStatsNumber(row.impressions)}</div>
                    <div className="stats-number-cell">{formatStatsNumber(row.interactions)}</div>
                    <div className="stats-number-cell">{formatStatsNumber(row.clicks)}</div>
                  </div>
                ))}
              </div>
            )}
            <footer className="stats-editor-actions">
              <span>{loading ? "Cargando datos..." : "Importar GA4 muestra la adquisición real por fuente/medio. Guardar mes conserva el resumen para comparar campañas."}</span>
              <Button className="primary" disabled={saving}>{saving ? "GUARDANDO..." : "GUARDAR MES"}</Button>
            </footer>
          </form>

          <section className="panel stats-year">
            <div className="panel-heading">
              <span className="section-mark" />
              <div>
                <strong>Calendario {selectedYear}</strong>
                <small>12 meses de rendimiento</small>
              </div>
            </div>
            <div className="stats-month-grid">
              {monthlyTotals.map((month) => (
                <button
                  type="button"
                  key={month.month}
                  className={month.month === selectedMonth ? "selected" : ""}
                  onClick={() => setSelectedMonth(month.month)}
                >
                  <strong>{month.monthName}</strong>
                  <span>{month.hasData ? `${formatStatsNumber(month.clicks)} clics` : "sin datos guardados"}</span>
                  <small>{formatStatsNumber(month.impressions)} impresiones · {formatStatsNumber(month.interactions)} interacciones</small>
                </button>
              ))}
            </div>
          </section>
          </div>

          <div className="stats-right-column">
          <section className="panel campaign-url-builder" ref={campaignBuilderRef}>
            <div className="panel-heading">
              <span className="section-mark" />
              <div>
                <strong>Campaign URL Builder</strong>
                <small>Enlaces UTM para GA4</small>
              </div>
            </div>
            <div className="campaign-url-grid">
              <label>
                Nombre
                <input value={utmDraft.name} onChange={(event) => updateUtmDraft({ name: event.target.value })} placeholder="Instagram blog inicio" />
              </label>
              <label>
                URL destino
                <input value={utmDraft.url} onChange={(event) => updateUtmDraft({ url: event.target.value })} />
              </label>
              <label>
                Origen
                <input value={utmDraft.source} onChange={(event) => updateUtmDraft({ source: event.target.value })} placeholder="instagram" />
              </label>
              <label>
                Medio
                <input value={utmDraft.medium} onChange={(event) => updateUtmDraft({ medium: event.target.value })} placeholder="social" />
              </label>
              <label>
                Campaña
                <input value={utmDraft.campaign} onChange={(event) => updateUtmDraft({ campaign: event.target.value })} placeholder="lanzamiento-junio" />
              </label>
              <label>
                Pieza
                <input value={utmDraft.content} onChange={(event) => updateUtmDraft({ content: event.target.value })} placeholder="post-1" />
              </label>
              <label>
                Term
                <input value={utmDraft.term} onChange={(event) => updateUtmDraft({ term: event.target.value })} placeholder="opcional" />
              </label>
            </div>
            <div className="campaign-url-output">
              <code>{generatedCampaignUrl || "Pulsa GENERAR URL para crear el enlace"}</code>
              <div className="campaign-url-actions">
                <Button type="button" kind="primary" disabled={!campaignUrl} onClick={generateCampaignUrl}>GENERAR URL</Button>
                <Button type="button" disabled={!generatedCampaignUrl || savingCampaign} onClick={saveCampaignUrl}>{savingCampaign ? "GUARDANDO..." : "GUARDAR"}</Button>
                <Button type="button" disabled={!generatedCampaignUrl} onClick={copyCampaignUrl}>COPIAR URL</Button>
              </div>
            </div>
            <div className="campaign-url-history">
              <header>
                <strong>Enlaces por origen</strong>
                <span>{campaigns.length ? `${campaigns.length} enlaces` : "sin enlaces"}</span>
              </header>
              {campaignsBySource.length ? (
                <div className="campaign-source-groups">
                  {campaignsBySource.map((group, index) => (
                    <details key={group.source} open={index === 0}>
                      <summary>
                        <span>{group.label}</span>
                        <b>{group.items.length} enlaces</b>
                      </summary>
                      <div className="campaign-source-items">
                        {group.items.map((campaign) => (
                          <article key={campaign.id}>
                            <div>
                              <strong>{campaign.name || campaign.campaign}</strong>
                              <span>Destino: {campaignDestinationLabel(campaign.url)}</span>
                              <span>UTM: {[campaign.source, campaign.medium, campaign.campaign, campaign.content].filter(Boolean).join(" / ")}</span>
                            </div>
                            <div className="campaign-url-row-actions">
                              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); loadCampaignUrl(campaign); }}>RECUPERAR</button>
                              <button type="button" disabled={campaignActionId === `copy-${campaign.id}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); copySavedCampaignUrl(campaign); }}>
                                {campaignActionId === `copy-${campaign.id}` ? "..." : "COPIAR"}
                              </button>
                              <button type="button" className="danger" disabled={campaignActionId === `delete-${campaign.id}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); deleteCampaignUrl(campaign.id); }}>
                                {campaignActionId === `delete-${campaign.id}` ? "..." : "BORRAR"}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="empty">Guarda las URLs que uses en publicaciones para poder repetir o comparar campañas.</div>
              )}
            </div>
          </section>
          </div>
        </section>

        {ga4Stats ? (
          <Ga4TrafficChart stats={ga4Stats} />
        ) : (
          <section className="panel ga4-chart-panel">
            <div className="panel-heading">
              <span className="section-mark blue" />
              <div>
                <strong>Sesiones por Fuente/medio de la sesión a lo largo del tiempo</strong>
                <small>Importa GA4 para ver la evolución diaria</small>
              </div>
            </div>
            <div className="empty">Pulsa Importar GA4 para pintar la gráfica con datos reales.</div>
          </section>
        )}
      </section>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState({ loading: true, authenticated: false, configured: false });
  const [workflows, setWorkflows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [connection, setConnection] = useState("loading");
  const [error, setError] = useState("");
  const [view, setView] = useState("calendar");
  const [, setViewHistory] = useState([]);
  const [inboxRefresh, setInboxRefresh] = useState(0);
  const [inboxSelectedNoticeId, setInboxSelectedNoticeId] = useState("");
  const [inboxSelectedWorkflowId, setInboxSelectedWorkflowId] = useState("");
  const [calendarRefresh, setCalendarRefresh] = useState(0);
		  const [groupConfig, setGroupConfig] = useState({ groups: [], assignments: {} });
		  const [groupModal, setGroupModal] = useState(undefined);
		  const [instagramDraft, setInstagramDraft] = useState(null);
  const [calendarFocusDateKey, setCalendarFocusDateKey] = useState("");
  const [managementContext, setManagementContext] = useState(null);
  const [publicationForumContext, setPublicationForumContext] = useState({ workflowId: "", noticeId: "", publicationMode: false });
  const [inboxPublicationMode, setInboxPublicationMode] = useState(false);

  const saveGroups = useCallback(async (next) => {
    const saved = await api("/groups", { method: "PUT", body: JSON.stringify(next) });
    setGroupConfig(saved);
  }, []);

  const loadWorkflows = useCallback(async () => {
    setConnection("loading");
    setError("");
    try {
      const [result, savedGroups] = await Promise.all([api("/workflows"), api("/groups")]);
      const assignments = { ...savedGroups.assignments };
      let changed = false;
      for (const workflow of result.workflows) {
        if (assignments[workflow.id]) continue;
        const fallback = /HN|Indie Hackers|Quora/i.test(workflow.name)
          ? "reputation"
          : /Borrador|Check-in|Contenido|LinkedIn/i.test(workflow.name)
            ? "content"
            : "other";
        if (savedGroups.groups.some((group) => group.id === fallback)) {
          assignments[workflow.id] = fallback;
          changed = true;
        }
      }
      const nextGroups = { ...savedGroups, assignments };
      setGroupConfig(nextGroups);
      if (changed) api("/groups", { method: "PUT", body: JSON.stringify(nextGroups) }).catch(() => {});
      setWorkflows(result.workflows);
      setSelectedId((current) =>
        result.workflows.some((workflow) => workflow.id === current)
          ? current
          : result.workflows[0]?.id || null,
      );
      setConnection("live");
    } catch (loadError) {
      if (/autorizado/i.test(loadError.message)) {
        setSession((current) => ({ ...current, authenticated: false }));
      }
      setConnection("error");
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    api("/session")
      .then((result) => {
        setSession({ loading: false, ...result });
        if (result.authenticated) loadWorkflows();
      })
      .catch(() => setSession({ loading: false, authenticated: false, configured: false }));
  }, [loadWorkflows]);

  async function logout() {
    await api("/logout", { method: "POST", body: "{}" });
    setSession((current) => ({ ...current, authenticated: false }));
  }

  const navigate = useCallback((nextView) => {
    setView((current) => {
      if (current === nextView) return current;
      setViewHistory((history) => [...history, current].slice(-12));
      return nextView;
    });
  }, []);

  const goBack = useCallback(() => {
    setViewHistory((history) => {
      const previous = history.at(-1) || "calendar";
      setView(previous);
      return history.slice(0, -1);
    });
  }, []);

  function syncCurrentView() {
    if (view === "inbox") setInboxRefresh((current) => current + 1);
    else if (view === "calendar") setCalendarRefresh((current) => current + 1);
    else if (view === "stats" || view === "visibilidad" || view === "mivoz" || view === "add" || view === "correct") return;
    else loadWorkflows();
  }

  async function upsertGroup(group) {
    const exists = groupConfig.groups.some((item) => item.id === group.id);
    await saveGroups({
      ...groupConfig,
      groups: exists
        ? groupConfig.groups.map((item) => item.id === group.id ? group : item)
        : [...groupConfig.groups, group],
    });
    setGroupModal(undefined);
  }

  async function deleteGroup(groupId) {
    const assignments = Object.fromEntries(
      Object.entries(groupConfig.assignments).filter(([, assigned]) => assigned !== groupId),
    );
    await saveGroups({
      groups: groupConfig.groups.filter((group) => group.id !== groupId),
      assignments,
    });
    setGroupModal(undefined);
  }

  async function assignGroup(workflowId, groupId) {
    const assignments = { ...groupConfig.assignments };
    if (groupId) assignments[workflowId] = groupId;
    else delete assignments[workflowId];
    await saveGroups({ ...groupConfig, assignments });
  }

  const openPublication = useCallback((post = null) => {
    if (post) {
      setInstagramDraft({ ...post, source: "publication", updatedAt: Date.now() });
      const sourceDate = post.scheduledAt || post.publishedAt || post.createdAt || "";
      if (sourceDate) setCalendarFocusDateKey(dateKey(new Date(sourceDate)));
    }
    setPublicationForumContext({ workflowId: "", noticeId: "", publicationMode: false });
    navigate("instagram");
  }, [navigate]);

  const openPublicationTarget = useCallback(async (targetId, task = null) => {
    if (task?.dueDate) setCalendarFocusDateKey(task.dueDate);
    setPublicationForumContext({ workflowId: "", noticeId: "", publicationMode: false });
    let draft = {
      source: "publication",
      targetId,
      caption: task?.notes || "",
      text: task?.notes || "",
      publicationScheduledAt: task?.dueDate && task?.time ? `${task.dueDate}T${task.time}` : "",
      scheduledAt: task?.dueDate && task?.time ? `${task.dueDate}T${task.time}:00` : "",
      updatedAt: Date.now(),
    };
    if (task?.publicationPostId) {
      try {
        const result = await api("/publications/posts");
        const post = (result.posts || []).find((item) => item.id === task.publicationPostId);
        if (post) draft = { ...post, source: "publication", updatedAt: Date.now() };
      } catch {
        // Keep the task draft if the post cannot be read.
      }
    }
    setInstagramDraft(draft);
    navigate("instagram");
  }, [navigate]);

  const consumeInstagramCaption = useCallback(() => {
    setInstagramDraft((current) => current ? { ...current, source: "instagram" } : current);
  }, []);

  const openWorkflow = useCallback((workflowId, context = null) => {
    setSelectedId(workflowId);
    setManagementContext(context?.signalId ? context : null);
    navigate("management");
  }, [navigate]);

  const closeManagementFromCalendar = useCallback(async (status) => {
    if (!managementContext?.signalId) return;
    if (status !== "return") {
      await api(`/calendar/signals/${encodeURIComponent(managementContext.signalId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    }
    setManagementContext(null);
    setCalendarRefresh((current) => current + 1);
    navigate("calendar");
  }, [managementContext, navigate]);

	  const openInbox = useCallback((noticeId = "", options = {}) => {
	    setInboxSelectedNoticeId(String(noticeId || ""));
	    setInboxSelectedWorkflowId("");
	    setInboxPublicationMode(Boolean(options.publicationMode));
	    navigate("inbox");
	    setInboxRefresh((current) => current + 1);
	  }, [navigate]);

  const openForumNotice = useCallback((workflowId = "", noticeId = "", options = {}) => {
    setPublicationForumContext({
      workflowId: String(workflowId || ""),
      noticeId: String(noticeId || ""),
      publicationMode: Boolean(options.publicationMode),
    });
    setInstagramDraft(null);
    navigate("instagram");
  }, [navigate]);

  if (session.loading) return <div className="boot">INICIANDO FLOW CONSOLE...</div>;
  if (!session.authenticated) {
    return (
      <Login
        configured={session.configured}
        onLogin={() => {
          setSession((current) => ({ ...current, authenticated: true }));
          loadWorkflows();
        }}
      />
    );
  }

  const selected = workflows.find((workflow) => workflow.id === selectedId) || null;

  return (
    <div className="app-shell">
      {groupModal !== undefined && (
        <GroupModal
          group={groupModal || null}
          onSave={upsertGroup}
          onDelete={deleteGroup}
          onClose={() => setGroupModal(undefined)}
        />
      )}
      <header className="topbar">
        <div className="brand">
          <strong>Flow Console</strong>
          <span className={connection}>{connection === "live" ? "● LIVE" : connection === "error" ? "● ERROR" : "● SYNC"}</span>
        </div>
        <nav>
          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => navigate("calendar")}
          >
            CALENDARIO
          </button>
          <button
            className={view === "notebook" ? "active" : ""}
            onClick={() => navigate("notebook")}
          >
            LIBRETA
          </button>
          <button
            className={view === "mivoz" ? "active" : ""}
            onClick={() => navigate("mivoz")}
          >
            MI VOZ
          </button>
          <button
            className={view === "instagram" ? "active" : ""}
            onClick={() => {
              setPublicationForumContext({ workflowId: "", noticeId: "", publicationMode: false });
              navigate("instagram");
            }}
          >
            PUBLICACIONES
          </button>
          <button
            className={view === "inbox" ? "active" : ""}
            onClick={() => openInbox()}
          >
            AVISOS
          </button>
          <button
            className={view === "stats" ? "active" : ""}
            onClick={() => navigate("stats")}
          >
            ESTADÍSTICAS
          </button>
          <button
            className={view === "visibilidad" ? "active" : ""}
            onClick={() => navigate("visibilidad")}
          >
            VISIBILIDAD
          </button>
        </nav>
        <div className="top-actions">
          <Button onClick={goBack}>ATRÁS</Button>
          <Button onClick={syncCurrentView}>↺ SYNC</Button>
          <Button onClick={logout}>SALIR</Button>
        </div>
      </header>
      {error && <div className="global-error">{error}</div>}
      {view === "calendar" ? (
        <Calendar
          workflows={workflows}
          refreshToken={calendarRefresh}
          focusDateKey={calendarFocusDateKey}
          onOpenWorkflow={openWorkflow}
          onOpenInstagram={openPublication}
          onOpenInbox={openInbox}
          onOpenForumNotice={openForumNotice}
          onOpenPublicationTarget={openPublicationTarget}
          onOpenStats={() => navigate("stats")}
        />
	      ) : view === "notebook" ? (
		        <NotesNotebook />
      ) : view === "add" ? (
        <RagEntryConsole />
      ) : view === "correct" ? (
        <RagCorrectConsole />
      ) : view === "inbox" ? (
        <>
          <main className="stats-workspace avf-envoltura"><div className="stats-shell vis"><AvisosFlow api={api} ir={navigate} /></div></main>
          <Inbox
            refreshToken={inboxRefresh}
            selectedNoticeId={inboxSelectedNoticeId}
            selectedWorkflowId={inboxSelectedWorkflowId}
            initialPublicationMode={inboxPublicationMode}
          />
        </>
      ) : view === "management" ? (
        <main className="workspace">
	          <WorkflowList
	            workflows={workflows}
	            selectedId={selectedId}
	            onSelect={(workflowId) => {
	              setSelectedId(workflowId);
	              setManagementContext(null);
	            }}
	            groupConfig={groupConfig}
            onCreateGroup={() => setGroupModal(null)}
            onEditGroup={setGroupModal}
          />
	          <WorkflowDetail
	            workflow={selected}
	            onRefresh={loadWorkflows}
	            groups={groupConfig.groups}
	            groupId={selected ? groupConfig.assignments[selected.id] : ""}
	            onAssignGroup={assignGroup}
	            calendarContext={managementContext}
	            onCloseCalendarContext={closeManagementFromCalendar}
	          />
        </main>
      ) : view === "instagram" ? (
        <InstagramPublisher
          draftCaption={instagramDraft}
          onCaptionConsumed={consumeInstagramCaption}
          onPublicationSaved={() => setCalendarRefresh((current) => current + 1)}
          initialForumWorkflowId={publicationForumContext.workflowId}
          initialForumNoticeId={publicationForumContext.noticeId}
          initialForumPublicationMode={publicationForumContext.publicationMode}
        />
      ) : view === "mivoz" ? (
        <MiVoz api={api} />
      ) : view === "visibilidad" ? (
        <Visibilidad api={api} />
      ) : view === "stats" ? (
        <Estadisticas api={api} Antiguo={StatsDashboard} />
      ) : (
        <Calendar
          workflows={workflows}
          refreshToken={calendarRefresh}
          focusDateKey={calendarFocusDateKey}
          onOpenWorkflow={openWorkflow}
          onOpenInstagram={openPublication}
          onOpenInbox={openInbox}
          onOpenForumNotice={openForumNotice}
          onOpenPublicationTarget={openPublicationTarget}
          onOpenStats={() => navigate("stats")}
        />
      )}
    </div>
  );
}
