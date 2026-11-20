// Robot de estadísticas de Instagram y LinkedIn. Corre en el Mac de Roberto. Sin dependencias:
// abre Google Chrome con su propio perfil (perfil-chrome/) y lo maneja por DevTools (CDP) con
// el WebSocket que ya trae Node.
//
// Si alguna red pide entrar, Roberto inicia sesión él mismo en esa ventana: el robot nunca ve
// ni guarda contraseñas. Luego va solo a las estadísticas y le pasa a Flow:
//   - LinkedIn: el Excel de «Exportar» de sus analíticas.
//   - Instagram: capturas de las estadísticas de cada publicación reciente (Flow las lee).
//
// Uso: doble clic en estadisticas-redes.command (o lo lanza el aviso del día 1 de cada mes).
// Opciones: --solo=linkedin | --solo=instagram

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FLOW = process.env.FLOW_URL || "https://flow-console-production.up.railway.app";
const TOKEN = fs.readFileSync(path.join(DIR, ".robot-token"), "utf8").trim();
const SOLO = (process.argv.find((a) => a.startsWith("--solo=")) || "").split("=")[1] || "";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PUERTO = 9333;
const ESPERA_LOGIN_MS = 15 * 60 * 1000;
const DIAS_INSTAGRAM = 60;

const pausa = (min, max = min) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
const log = (...a) => console.log(new Date().toLocaleTimeString("es-ES"), ...a);

// ───────────────────────── Chrome por DevTools ─────────────────────────

async function abrirChrome() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${path.join(DIR, "perfil-chrome")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
    "--lang=es-ES",
    "about:blank",
  ], { stdio: "ignore", detached: false });
  for (let i = 0; i < 60; i += 1) {
    await pausa(500);
    const pestanas = await fetch(`http://127.0.0.1:${PUERTO}/json/list`).then((r) => r.json()).catch(() => null);
    const pagina = pestanas?.find((p) => p.type === "page");
    if (pagina) return { chrome, ws: pagina.webSocketDebuggerUrl };
  }
  chrome.kill();
  throw new Error("Chrome no arrancó.");
}

function conectar(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pendientes = new Map();
  const oyentes = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pendientes.has(msg.id)) {
      const { ok, ko } = pendientes.get(msg.id);
      pendientes.delete(msg.id);
      if (msg.error) ko(new Error(msg.error.message)); else ok(msg.result);
    } else if (msg.method) {
      for (const f of oyentes) f(msg);
    }
  };
  const listo = new Promise((ok, ko) => {
    ws.onopen = ok;
    ws.onerror = () => ko(new Error("No se pudo hablar con Chrome."));
  });
  const enviar = (method, params = {}) => new Promise((ok, ko) => {
    id += 1;
    pendientes.set(id, { ok, ko });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const esperarEvento = (metodo, filtro = () => true, ms = 60000) => new Promise((ok, ko) => {
    const t = setTimeout(() => { oyentes.delete(f); ko(new Error(`Tiempo agotado esperando ${metodo}`)); }, ms);
    const f = (msg) => {
      if (msg.method === metodo && filtro(msg.params)) { clearTimeout(t); oyentes.delete(f); ok(msg.params); }
    };
    oyentes.add(f);
  });
  return { listo, enviar, esperarEvento, cerrar: () => ws.close() };
}

function pagina(cdp) {
  const evaluar = async (expr) => {
    const r = await cdp.enviar("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "Error en la página");
    return r.result?.value;
  };
  return {
    evaluar,
    async ir(url) {
      const carga = cdp.esperarEvento("Page.loadEventFired", () => true, 45000).catch(() => {});
      await cdp.enviar("Page.navigate", { url });
      await carga;
      await pausa(1500);
    },
    url: () => evaluar("return location.href"),
    hay: (selector) => evaluar(`return !!document.querySelector(${JSON.stringify(selector)})`),
    // Pulsa el primer botón o enlace visible cuyo texto encaje.
    pulsarTexto: (patron) => evaluar(`
      const re = new RegExp(${JSON.stringify(patron)}, "i");
      const el = [...document.querySelectorAll("button, a, [role=button], [role=link]")]
        .find((e) => re.test((e.innerText || e.getAttribute("aria-label") || "").trim()) && e.offsetParent !== null);
      if (!el) return false;
      el.click();
      return true;`),
    async captura(selector = "") {
      let clip;
      if (selector) {
        const caja = await evaluar(`
          const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.offsetParent !== null);
          const e = els[els.length - 1];
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };`);
        if (caja && caja.width > 50 && caja.height > 50) clip = { ...caja, scale: 1 };
      }
      const r = await cdp.enviar("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
      return r.data;
    },
    escape: async () => {
      await cdp.enviar("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await cdp.enviar("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    },
  };
}

async function aFlow(cuerpo) {
  const r = await fetch(`${FLOW}/api/estadisticas/robot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Robot-Token": TOKEN },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(120000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Flow respondió ${r.status}`);
  return j;
}

// Franja arriba de la página para que Roberto sepa qué pasa.
async function franja(p, texto, color = "#4a7ab5") {
  await p.evaluar(`
    let d = document.getElementById("flow-robot-franja");
    if (!d) {
      d = document.createElement("div");
      d.id = "flow-robot-franja";
      d.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;font:600 15px system-ui,sans-serif;color:#fff;text-align:center;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25)";
      document.documentElement.appendChild(d);
    }
    d.style.background = ${JSON.stringify(color)};
    d.textContent = ${JSON.stringify(texto)};`).catch(() => {});
}

const quitarFranja = (p) => p.evaluar(`document.getElementById("flow-robot-franja")?.remove()`).catch(() => {});

async function esperarSesion(p, red, dentro) {
  const inicio = Date.now();
  log(`${red}: esperando a que inicies sesión en la ventana de Chrome…`);
  while (Date.now() - inicio < ESPERA_LOGIN_MS) {
    if (await dentro().catch(() => false)) return true;
    await franja(p, `Flow · Inicia sesión en ${red} en esta ventana. El robot sigue solo cuando entres.`, "#c47a3a");
    await pausa(3000);
  }
  return false;
}

// ───────────────────────── LinkedIn ─────────────────────────

async function linkedin(p) {
  const analiticas = "https://www.linkedin.com/analytics/creator/content/?metricType=IMPRESSIONS&timeRange=past_28_days";
  await p.ir(analiticas);
  const dentro = async () => !/\/(login|checkpoint|authwall|uas\/login|signup)/.test(await p.url())
    && !(await p.hay("input#username, input[name='session_key']"))
    && (await p.hay("a[href*='/feed/'], a[href*='/mynetwork/']"));
  await pausa(3000);
  if (!(await dentro())) {
    if (!(await esperarSesion(p, "LinkedIn", dentro))) throw new Error("No se inició sesión en LinkedIn a tiempo.");
    await pausa(2000);
    await p.ir(analiticas);
  }
  // 1) Resumen de los últimos 28 días (LinkedIn ya no deja exportar el Excel).
  await franja(p, "Flow · Leyendo tus estadísticas de LinkedIn…");
  await pausa(5000, 7000);
  await quitarFranja(p);
  const resumen = await aFlow({ tipo: "linkedin-resumen", imagen: await p.captura() });
  log(`LinkedIn resumen 28 días: ${resumen.guardado ? JSON.stringify(resumen.metricas) : resumen.motivo}`);

  // 2) Tus publicaciones: cada una tiene «Ver análisis» (/analytics/post-summary/urn:li:activity:ID/).
  //    El ID lleva dentro la fecha exacta de publicación.
  await p.ir("https://www.linkedin.com/in/me/recent-activity/all/");
  await pausa(4000, 6000);
  let enlaces = [];
  for (let i = 0; i < 5; i += 1) {
    const nuevos = await p.evaluar(`return [...document.querySelectorAll("a[href*='/analytics/post-summary/urn:li:activity:']")].map((a) => {
      const id = (a.getAttribute("href").match(/activity:(\\d+)/) || [])[1];
      const caja = a.closest("li, article, [data-view-name], div[class*='update']") || a.parentElement;
      return { id, texto: (caja?.innerText || "").replace(/\\s+/g, " ").slice(0, 400) };
    }).filter((x) => x.id);`);
    for (const n of nuevos) if (!enlaces.some((e) => e.id === n.id)) enlaces.push(n);
    await p.evaluar(`
      const cajas = [document.scrollingElement, ...document.querySelectorAll("*")].filter((e) => e && e.scrollHeight - e.clientHeight > 200
        && (e === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(e).overflowY)));
      const caja = cajas.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
      caja?.scrollBy(0, caja.clientHeight * 0.9);
      await new Promise((r) => setTimeout(r, 2500));`);
    await pausa(1000, 2000);
  }
  const fechaDeId = (id) => new Date(Number(BigInt(id) >> 22n)).toISOString().slice(0, 10);
  enlaces = enlaces
    .map((e) => ({ ...e, fecha: fechaDeId(e.id) }))
    .filter((e) => Date.now() - Date.parse(e.fecha) < 365 * 864e5)
    .slice(0, 15);
  log(`LinkedIn: ${enlaces.length} publicaciones del último año.`);
  let leidas = 0;
  for (const [i, e] of enlaces.entries()) {
    const url = `https://www.linkedin.com/feed/update/urn:li:activity:${e.id}/`;
    await p.ir(`https://www.linkedin.com/analytics/post-summary/urn:li:activity:${e.id}/`);
    await franja(p, `Flow · Leyendo LinkedIn (${i + 1} de ${enlaces.length})…`);
    await pausa(4000, 6000);
    await quitarFranja(p);
    // Título: el texto de la publicación, quitando la cabecera (nombre, cargo, «4 meses •»).
    const titulo = (e.texto.split(/•\s*(?:Tú|You)?\s*/).pop() || e.texto)
      .replace(/^.*?\d+\s*(?:min|h|d|sem|mes(?:es)?|año(?:s)?)\s*•\s*/i, "")
      .replace(/\s*\d[\d.,]*\s*impresiones.*$/i, "")
      .trim().slice(0, 120);
    try {
      const r = await aFlow({ tipo: "linkedin-publicacion", imagen: await p.captura(), url, fecha: e.fecha, titulo });
      if (r.guardado) leidas += 1;
      log(`  ${e.fecha} ${titulo.slice(0, 40)} → ${r.guardado ? JSON.stringify(r.metricas) : r.motivo}`);
    } catch (err) {
      log(`  ${e.fecha} no se pudo leer: ${err.message}`);
    }
    await pausa(2000, 4000);
  }
  return `LinkedIn: resumen y ${leidas} publicaciones`;
}

// ───────────────────────── Instagram ─────────────────────────

async function instagram(p) {
  await p.ir("https://www.instagram.com/");
  await pausa(2500, 4000);
  const dentro = async () => !/accounts\/login|challenge/.test(await p.url())
    && !(await p.hay("input[name='password'], a[href='/accounts/emailsignup/']"))
    && (await p.hay("a[href='/direct/inbox/'], a[href^='/explore/'], svg[aria-label='Inicio'], svg[aria-label='Home']"));
  if (!(await dentro())) {
    if (!(await esperarSesion(p, "Instagram", dentro))) throw new Error("No se inició sesión en Instagram a tiempo.");
    await pausa(3000);
  }
  await franja(p, "Flow · Leyendo tus estadísticas de Instagram…");

  // Tu perfil: el enlace «Perfil» del menú.
  let usuario = await p.evaluar(`
    const a = [...document.querySelectorAll("a[href^='/']")].find((e) => /^(perfil|profile)$/i.test((e.innerText || "").trim()));
    if (a) return a.getAttribute("href").replace(/\\//g, "");
    const img = [...document.querySelectorAll("img[alt]")].find((i) => /foto del perfil de|profile picture/i.test(i.alt) && i.closest("a[href^='/']"));
    return img ? img.closest("a").getAttribute("href").replace(/\\//g, "") : "";`);
  if (!usuario) {
    const config = path.join(DIR, "config.json");
    usuario = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, "utf8")).instagram || "" : "";
  }
  if (!usuario) throw new Error("No encuentro tu usuario de Instagram (pon {\"instagram\":\"usuario\"} en robot-redes/config.json).");
  await p.ir(`https://www.instagram.com/${usuario}/`);
  await pausa(3000, 5000);
  const enlaces = await p.evaluar(`
    return [...new Set([...document.querySelectorAll("a[href*='/p/'], a[href*='/reel/']")]
      .map((a) => a.getAttribute("href")).filter(Boolean))].slice(0, 12);`);
  log(`Instagram (@${usuario}): ${enlaces.length} publicaciones recientes.`);

  let guardadas = 0;
  for (const [i, enlace] of enlaces.entries()) {
    const url = `https://www.instagram.com${enlace.replace(/^\/[^/]+(?=\/(p|reel)\/)/, "")}`;
    await p.ir(url);
    await pausa(3000, 5000);
    await franja(p, `Flow · Leyendo Instagram (${i + 1} de ${enlaces.length})…`);
    const fecha = await p.evaluar(`return document.querySelector("time[datetime]")?.getAttribute("datetime") || ""`).catch(() => "");
    if (fecha && Date.now() - Date.parse(fecha) > DIAS_INSTAGRAM * 864e5) {
      log("  más antigua de 60 días; paro aquí.");
      break;
    }
    const titulo = await p.evaluar(`return (document.querySelector("h1")?.innerText || "").split("\\n")[0].slice(0, 120)`).catch(() => "");
    // «Ver estadísticas» abre el panel con alcance, interacciones, etc.
    const abierto = await p.pulsarTexto("ver estad[ií]sticas|view insights");
    if (abierto) await pausa(3000, 4500);
    await quitarFranja(p);
    const imagen = await p.captura(abierto ? "[role=dialog]" : "");
    try {
      const r = await aFlow({ tipo: "instagram-captura", imagen, url, fecha: fecha ? fecha.slice(0, 10) : "", titulo });
      if (r.guardado) guardadas += 1;
      log(`  ${fecha?.slice(0, 10) || "?"} ${titulo.slice(0, 40)} → ${r.guardado ? JSON.stringify(r.metricas) : r.motivo}`);
    } catch (e) {
      log(`  no se pudo leer: ${e.message}`);
    }
    await p.escape().catch(() => {});
    await pausa(2000, 4000);
  }
  return `Instagram: ${guardadas} publicaciones`;
}

// ───────────────────────── principal ─────────────────────────

const { chrome, ws } = await abrirChrome();
const cdp = conectar(ws);
await cdp.listo;
await cdp.enviar("Page.enable");
const p = pagina(cdp);
const resumen = [];
for (const [nombre, fn] of [["linkedin", linkedin], ["instagram", instagram]]) {
  if (SOLO && SOLO !== nombre) continue;
  try {
    resumen.push(await fn(p));
  } catch (e) {
    log(`${nombre}: ${e.message}`);
    resumen.push(`${nombre}: no se pudo (${e.message})`);
  }
}
await p.ir(`${FLOW}/`).catch(() => {});
await franja(p, `Flow · Listo. ${resumen.join(" · ")}. Esta ventana se cierra sola.`, "#4a9e7a");
log("Listo:", resumen.join(" · "));
await pausa(8000);
cdp.cerrar();
chrome.kill();
