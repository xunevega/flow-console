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
//
// --publicar: publica en LinkedIn los artículos que Flow tiene en cola (la API oficial no publica
// artículos). Si no hay ninguno, sale sin abrir Chrome. Lo lanza cada 10 minutos el agente que
// instala instalar-publicador.command; a mano, doble clic en publicar-linkedin.command.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FLOW = process.env.FLOW_URL || "https://flow-console-production.up.railway.app";
const TOKEN = fs.readFileSync(path.join(DIR, ".robot-token"), "utf8").trim();
const SOLO = (process.argv.find((a) => a.startsWith("--solo=")) || "").split("=")[1] || "";
// --textos: no mide nada; guarda el texto de tus publicaciones de LinkedIn en textos-linkedin.json
// para elegir cuáles van a MI VOZ como ejemplos de cómo escribes.
const TEXTOS = process.argv.includes("--textos");
const PUBLICAR = process.argv.includes("--publicar");
const CHROME = process.env.ROBOT_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Solo para pruebas: otra dirección en vez de LinkedIn y argumentos extra para Chrome.
const LINKEDIN = process.env.ROBOT_LINKEDIN_URL || "https://www.linkedin.com";
const CHROME_EXTRA = (process.env.ROBOT_CHROME_ARGS || "").split(" ").filter(Boolean);
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
    ...CHROME_EXTRA,
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

// ───────────────────────── LinkedIn: textos para MI VOZ ─────────────────────────

async function textosLinkedin(p) {
  await p.ir("https://www.linkedin.com/in/me/recent-activity/all/");
  const dentro = () => p.hay("a[href*='/feed/']");
  if (!(await dentro()) && !(await esperarSesion(p, "LinkedIn", dentro))) throw new Error("no se inició sesión");
  if (!/recent-activity/.test(await p.url())) await p.ir("https://www.linkedin.com/in/me/recent-activity/all/");
  await franja(p, "Flow · Leyendo tus publicaciones de LinkedIn para MI VOZ…");
  const vistos = new Map();
  for (let vuelta = 0; vuelta < 8; vuelta += 1) {
    // LinkedIn (11/2026): el texto va en [data-testid=expandable-text-box] y «… más» en expandable-text-button;
    // cada publicación propia lleva un enlace a su análisis con el ID de actividad.
    const lote = await p.evaluar(`
      for (const b of document.querySelectorAll("[data-testid='expandable-text-button']")) {
        if (/más|more/i.test(b.innerText || "")) b.click();
      }
      await new Promise((r) => setTimeout(r, 700));
      return [...document.querySelectorAll("[data-testid='expandable-text-box']")].map((caja) => {
        let el = caja.parentElement;
        let enlace = null;
        while (el && el !== document.body && !enlace) {
          enlace = el.querySelector("a[href*='urn:li:activity:']");
          if (enlace && el.querySelectorAll("[data-testid='expandable-text-box']").length > 1) enlace = null;
          el = el.parentElement;
        }
        const urn = (enlace?.getAttribute("href") || "").match(/urn:li:activity:\\d+/)?.[0] || "";
        return { urn, texto: (caja.innerText || "").replace(/…\\s*(más|more)\\s*$/i, "").trim() };
      });`);
    for (const x of lote || []) if (x.urn && x.texto && !vistos.has(x.urn)) vistos.set(x.urn, x);
    await p.evaluar(`
      const caja = [...document.querySelectorAll("main, .scaffold-finite-scroll, body")].find((e) => e.scrollHeight > e.clientHeight + 200) || document.scrollingElement;
      caja.scrollBy(0, 2600); window.scrollBy(0, 2600);
      return true;`);
    await pausa(1800, 2600);
  }
  const textos = [...vistos.values()].map((x) => {
    const id = x.urn.split(":").pop();
    return {
      url: `https://www.linkedin.com/feed/update/${x.urn}/`,
      fecha: new Date(Number(BigInt(id) >> 22n)).toISOString().slice(0, 10),
      texto: x.texto,
      palabras: x.texto.split(/\s+/).length,
    };
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));
  fs.writeFileSync(path.join(DIR, "textos-linkedin.json"), JSON.stringify(textos, null, 2), { mode: 0o600 });
  return `LinkedIn: ${textos.length} textos guardados en textos-linkedin.json`;
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
  // 1) Resumen de los últimos 28 días, leído del texto de la página («38 | Impresiones»).
  await franja(p, "Flow · Leyendo tus estadísticas de LinkedIn…");
  await pausa(5000, 7000);
  await p.evaluar("scrollBy(0, 3000); await new Promise((r) => setTimeout(r, 2500)); scrollTo(0, 0);").catch(() => {});
  const lineas = await p.evaluar(`return ((document.querySelector("main") || document.body).innerText || "").split("\\n").map((l) => l.trim()).filter(Boolean);`);
  const ETIQUETAS = [
    [/^impresiones$/i, "impresiones"],
    [/^miembros alcanzados$/i, "alcance"],
    [/^reacciones$/i, "me_gusta"],
    [/^comentarios$/i, "comentarios"],
    [/^(veces compartido|republicaciones|contenido compartido)$/i, "compartidos"],
    [/^guardados$/i, "guardados"],
    [/^(nuevos seguidores|seguidores)$/i, "seguidores"],
    [/^(visualizaciones del perfil|visitas al perfil)$/i, "visitas_perfil"],
  ];
  const metricas = {};
  lineas.forEach((l, i) => {
    const anterior = (lineas[i - 1] || "").replace(/\./g, "");
    if (!/^\d+$/.test(anterior)) return;
    for (const [re, clave] of ETIQUETAS) if (re.test(l) && metricas[clave] === undefined) metricas[clave] = Number(anterior);
  });
  await quitarFranja(p);
  const resumen = Object.keys(metricas).length
    ? await aFlow({ tipo: "linkedin-resumen", metricas })
    : await aFlow({ tipo: "linkedin-resumen", imagen: await p.captura() });
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
      log("  más antigua de 60 días (o fijada); la salto.");
      continue;
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

// ───────────────────────── LinkedIn: publicar artículos en cola ─────────────────────────

async function flowRobot(ruta, opciones = {}) {
  const r = await fetch(`${FLOW}/api/publications/posts-robot/linkedin${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", "X-Robot-Token": TOKEN, ...(opciones.headers || {}) },
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Flow respondió ${r.status}`);
  return j;
}

const avisarFlow = (id, estado, extra = {}) => flowRobot(`/${encodeURIComponent(id)}`, {
  method: "POST",
  body: JSON.stringify({ estado, ...extra }),
});

// Busca un campo del editor por su placeholder o etiqueta y devuelve su posición (o null).
async function marcarCampo(p, tipo) {
  return p.evaluar(`
    const visible = (e) => e && e.offsetParent !== null && e.getBoundingClientRect().height > 10;
    const etiqueta = (e) => [e.getAttribute("placeholder"), e.getAttribute("aria-label"), e.getAttribute("data-placeholder"), e.id, e.className]
      .filter(Boolean).join(" ");
    document.querySelectorAll("[data-flow-robot]").forEach((e) => e.removeAttribute("data-flow-robot"));
    const campos = [...document.querySelectorAll("textarea, input[type=text], [contenteditable=true], [contenteditable=''], [role=textbox]")].filter(visible);
    let el;
    if (${JSON.stringify(tipo)} === "titulo") {
      el = campos.find((e) => /t[ií]tulo|title|headline/i.test(etiqueta(e)));
    } else {
      const editables = campos.filter((e) => e.isContentEditable && !/t[ií]tulo|title|headline/i.test(etiqueta(e)));
      el = editables.find((e) => /escrib|write|contenido|content|cuerpo|body|ql-editor|editor/i.test(etiqueta(e)))
        || editables.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    }
    if (!el) return null;
    el.setAttribute("data-flow-robot", ${JSON.stringify(tipo)});
    el.scrollIntoView({ block: "center" });
    el.focus();
    return true;`);
}

async function escribirTitulo(p, cdp, titulo) {
  for (let i = 0; i < 30; i += 1) {
    if (await marcarCampo(p, "titulo")) break;
    if (i === 29) throw new Error("no encuentro el campo del título en el editor de artículos");
    await pausa(1000);
  }
  await cdp.enviar("Input.insertText", { text: titulo });
  await pausa(600, 1000);
}

// Pega el cuerpo como lo pegarías tú (con formato si hay HTML) y comprueba que ha entrado.
async function escribirCuerpo(p, cdp, cuerpo, html) {
  if (!(await marcarCampo(p, "cuerpo"))) throw new Error("no encuentro el cuerpo del artículo en el editor");
  const largo = () => p.evaluar(`return (document.querySelector("[data-flow-robot=cuerpo]")?.innerText || "").trim().length`);
  const objetivo = Math.min(cuerpo.length, 200) * 0.6;
  const intentos = [
    `const dt = new DataTransfer();
     dt.setData("text/plain", ${JSON.stringify(cuerpo)});
     ${html ? `dt.setData("text/html", ${JSON.stringify(html)});` : ""}
     const el = document.querySelector("[data-flow-robot=cuerpo]");
     el.focus();
     el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
     return true;`,
    html ? `document.querySelector("[data-flow-robot=cuerpo]").focus(); return document.execCommand("insertHTML", false, ${JSON.stringify(html)});` : "",
  ].filter(Boolean);
  for (const js of intentos) {
    await p.evaluar(js).catch(() => {});
    await pausa(1500);
    if ((await largo()) >= objetivo) return;
  }
  // Último recurso: escribirlo como texto, párrafo a párrafo.
  await marcarCampo(p, "cuerpo");
  const parrafos = cuerpo.split(/\n+/).filter((x) => x.trim());
  for (const [i, parrafo] of parrafos.entries()) {
    await cdp.enviar("Input.insertText", { text: parrafo });
    if (i < parrafos.length - 1) {
      await cdp.enviar("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
      await cdp.enviar("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    }
  }
  await pausa(1500);
  if ((await largo()) < objetivo) throw new Error("el texto no entró en el editor");
}

// Portada: la baja a descargas/ y la mete en el selector de archivos del editor.
async function ponerPortada(p, cdp, url, id) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`no se pudo bajar la imagen (${r.status})`);
  const tipo = String(r.headers.get("content-type") || "");
  const ext = /png/.test(tipo) ? "png" : /gif/.test(tipo) ? "gif" : "jpg";
  const carpeta = path.join(DIR, "descargas");
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `portada-${id}.${ext}`);
  fs.writeFileSync(archivo, Buffer.from(await r.arrayBuffer()));
  let hay = await p.hay("input[type=file]");
  if (!hay) {
    await p.pulsarTexto("subir desde (el )?ordenador|upload from computer|a[ñn]adir (una )?(imagen|portada)|add (a )?cover|cover image|imagen de portada");
    await pausa(1500, 2500);
    hay = await p.hay("input[type=file]");
  }
  if (!hay) throw new Error("no encuentro dónde subir la portada");
  const { root } = await cdp.enviar("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await cdp.enviar("DOM.querySelector", { nodeId: root.nodeId, selector: "input[type=file]" });
  await cdp.enviar("DOM.setFileInputFiles", { nodeId, files: [archivo] });
  await pausa(4000, 6000);
  // Algunos editores abren un diálogo para recortar: se acepta.
  await p.pulsarTexto("^(siguiente|next|listo|hecho|done|aplicar|apply|guardar|save)$").catch(() => {});
  await pausa(2000, 3000);
}

async function urlDelArticulo(p) {
  return p.evaluar(`
    if (location.href.includes("/pulse/")) return location.href.split("?")[0];
    const a = [...document.querySelectorAll("a[href*='/pulse/']")].find((e) => e.offsetParent !== null);
    return a ? a.href.split("?")[0] : "";`).catch(() => "");
}

async function publicarUno(p, cdp, a) {
  await avisarFlow(a.id, "publicando");
  await p.ir(`${LINKEDIN}/article/new/`);
  const dentro = async () => !/\/(login|checkpoint|authwall|uas\/login|signup)/.test(await p.url())
    && !(await p.hay("input#username, input[name='session_key']"));
  if (!(await dentro())) {
    if (!(await esperarSesion(p, "LinkedIn", dentro))) throw new Error("no se inició sesión en LinkedIn a tiempo");
    await p.ir(`${LINKEDIN}/article/new/`);
  }
  await pausa(4000, 6000);
  await franja(p, `Flow · Escribiendo el artículo «${a.titulo.slice(0, 60)}»… no toques esta ventana.`);
  await escribirTitulo(p, cdp, a.titulo);
  await escribirCuerpo(p, cdp, a.cuerpo, a.html);
  let sinPortada = "";
  if (a.imagen) {
    try {
      await ponerPortada(p, cdp, a.imagen, a.id);
    } catch (e) {
      sinPortada = e.message;
      log(`  portada: ${e.message} (sigo sin portada)`);
    }
  }
  await pausa(3000, 4000); // que LinkedIn guarde el borrador
  await quitarFranja(p);
  // «Siguiente» abre el diálogo de compartir; ahí está «Publicar».
  if (!(await p.pulsarTexto("^(siguiente|next|publicar|publish)$"))) throw new Error("no encuentro el botón Siguiente/Publicar");
  await pausa(3000, 5000);
  await p.evaluar(`
    const d = [...document.querySelectorAll("[role=dialog]")].find((e) => e.offsetParent !== null);
    const b = d && [...d.querySelectorAll("button")].find((e) => /^(publicar|publish)$/i.test((e.innerText || "").trim()) && !e.disabled);
    if (b) b.click();
    return !!b;`).catch(() => false);
  // Esperar a que LinkedIn confirme: la página del artículo, un enlace /pulse/ o un aviso de publicado.
  for (let i = 0; i < 40; i += 1) {
    await pausa(1500);
    const url = await urlDelArticulo(p);
    if (url) return { url, sinPortada };
    const confirmado = await p.evaluar(`return /(art[ií]culo|article).{0,40}(publicad|published)|se ha publicado|has been published/i.test(document.body.innerText || "")`).catch(() => false);
    if (confirmado) return { url: "", sinPortada };
  }
  const foto = await p.captura().catch(() => "");
  if (foto) fs.writeFileSync(path.join(DIR, "descargas", `fallo-${a.id}.png`), Buffer.from(foto, "base64"));
  throw new Error("LinkedIn no confirmó la publicación (queda como borrador en tus artículos de LinkedIn)");
}

async function publicarArticulos(p, cdp, articulos) {
  let hechos = 0;
  for (const a of articulos) {
    // Si un intento anterior se quedó a medias, puede que saliera: mejor que lo mire Roberto.
    if (a.intentos >= 1) {
      await avisarFlow(a.id, "fallo", { error: "un intento anterior se cortó; mira en LinkedIn si salió antes de repetir" }).catch(() => {});
      continue;
    }
    try {
      log(`LinkedIn: publicando «${a.titulo}»…`);
      const { url, sinPortada } = await publicarUno(p, cdp, a);
      await avisarFlow(a.id, "publicado", { url });
      hechos += 1;
      log(`  publicado ${url || "(sin enlace)"}${sinPortada ? ` · sin portada: ${sinPortada}` : ""}`);
    } catch (e) {
      log(`  no se pudo: ${e.message}`);
      await avisarFlow(a.id, "fallo", { error: e.message }).catch(() => {});
    }
    await pausa(5000, 9000);
  }
  return `LinkedIn: ${hechos} de ${articulos.length} artículos publicados`;
}

// ───────────────────────── principal ─────────────────────────

let enCola = [];
if (PUBLICAR) {
  enCola = (await flowRobot("")).articulos || [];
  if (!enCola.length) {
    log("Publicar: no hay artículos en cola.");
    process.exit(0);
  }
}

const { chrome, ws } = await abrirChrome();
const cdp = conectar(ws);
await cdp.listo;
await cdp.enviar("Page.enable");
await cdp.enviar("DOM.enable");
const p = pagina(cdp);
const resumen = [];
const tareas = PUBLICAR
  ? [["linkedin", (pg) => publicarArticulos(pg, cdp, enCola)]]
  : TEXTOS ? [["linkedin", textosLinkedin]] : [["linkedin", linkedin], ["instagram", instagram]];
for (const [nombre, fn] of tareas) {
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
