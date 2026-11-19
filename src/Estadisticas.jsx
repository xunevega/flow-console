import { useEffect, useMemo, useState } from "react";

// Pantalla de Estadísticas: se carga sola y junta todos los canales.
// El servidor hace el trabajo (estadisticas.mjs); aquí solo se enseña.

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTOS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const n = (v) => new Intl.NumberFormat("es-ES").format(Math.round(Number(v) || 0));

const NOMBRES_METRICAS = {
  impresiones: "impresiones",
  alcance: "alcance",
  visualizaciones: "visualizaciones",
  visualizacionesMes: "vistas este mes",
  minutosMes: "min vistos",
  lecturas: "lecturas",
  guardados: "guardados",
  clics: "clics",
  clicsWeb: "clics a la web",
  me_gusta: "me gusta",
  likes: "likes",
  comentarios: "comentarios",
  compartidos: "compartidos",
  interacciones: "interacciones",
  visitas_perfil: "visitas al perfil",
  seguidores: "seguidores",
};

const CAMPOS_MANUALES = ["alcance", "impresiones", "visualizaciones", "me_gusta", "comentarios", "compartidos", "guardados", "interacciones", "clics", "visitas_perfil", "seguidores"];

function Diferencia({ actual, anterior }) {
  if (anterior === undefined || anterior === null) return <small className="est-dif">&nbsp;</small>;
  const a = Number(actual) || 0;
  const b = Number(anterior) || 0;
  if (!a && !b) return <small className="est-dif">sin datos el mes anterior</small>;
  if (!b) return <small className="est-dif sube">nuevo este mes</small>;
  const pct = Math.round(((a - b) / b) * 100);
  return (
    <small className={`est-dif ${pct > 0 ? "sube" : pct < 0 ? "baja" : ""}`}>
      {pct > 0 ? "+" : ""}{pct} % vs mes anterior ({n(b)})
    </small>
  );
}

function Tarjeta({ titulo, valor, anterior, nota }) {
  return (
    <article className="est-tarjeta">
      <span>{titulo}</span>
      <strong>{valor === null || valor === undefined ? "—" : n(valor)}</strong>
      {nota ? <small className="est-dif">{nota}</small> : <Diferencia actual={valor} anterior={anterior} />}
    </article>
  );
}

function Barras({ filas, clave = "visitas", etiqueta = "canal" }) {
  const max = Math.max(1, ...filas.map((f) => Number(f[clave]) || 0));
  if (!filas.length) return <p className="est-vacio">Todavía no hay datos este mes.</p>;
  return (
    <div className="est-barras">
      {filas.map((f) => (
        <div className="est-barra" key={f[etiqueta]}>
          <span title={f[etiqueta]}>{f[etiqueta]}</span>
          <div><i style={{ width: `${Math.max(2, ((Number(f[clave]) || 0) / max) * 100)}%` }} /></div>
          <b>{n(f[clave])}</b>
        </div>
      ))}
    </div>
  );
}

function GraficoAnio({ anio, mesActual }) {
  const max = Math.max(1, ...anio.map((m) => m.visitas || 0));
  return (
    <div className="est-anio">
      {anio.map((m) => (
        <div key={m.mes} className={m.mes === mesActual ? "actual" : ""} title={`${MESES[m.mes - 1]}: ${n(m.visitas)} visitas`}>
          <b>{m.visitas ? n(m.visitas) : ""}</b>
          <i style={{ height: `${Math.max(3, ((m.visitas || 0) / max) * 100)}%` }} />
          <span>{MESES_CORTOS[m.mes - 1]}</span>
        </div>
      ))}
    </div>
  );
}

function resumenMetricas(m = {}, visitasWeb) {
  const partes = Object.entries(m)
    .filter(([k, v]) => NOMBRES_METRICAS[k] && Number(v) > 0)
    .slice(0, 4)
    .map(([k, v]) => `${n(v)} ${NOMBRES_METRICAS[k]}`);
  if (visitasWeb) partes.unshift(`${n(visitasWeb)} visitas a la web`);
  return partes.join(" · ") || "sin números todavía";
}

function leerArchivo(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result || ""));
    lector.onerror = () => rechazar(new Error("No se pudo leer el archivo"));
    lector.readAsDataURL(archivo);
  });
}

function FormularioManual({ inicial, onGuardar, onCancelar, guardando }) {
  const [e, setE] = useState(inicial);
  const cambiar = (patch) => setE((x) => ({ ...x, ...patch }));
  return (
    <form
      className="est-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        onGuardar(e);
      }}
    >
      <div className="est-form-fila">
        <label>Red
          <select value={e.canal} onChange={(ev) => cambiar({ canal: ev.target.value })}>
            <option>Instagram</option>
            <option>LinkedIn</option>
          </select>
        </label>
        <label>Qué es
          <select value={e.tipo} onChange={(ev) => cambiar({ tipo: ev.target.value })}>
            <option value="publicacion">Una publicación</option>
            <option value="mes">Resumen del mes</option>
          </select>
        </label>
        <label>Fecha
          <input type="date" value={e.fecha} onChange={(ev) => cambiar({ fecha: ev.target.value })} />
        </label>
      </div>
      {e.tipo !== "mes" && (
        <div className="est-form-fila">
          <label className="ancho">Título o primeras palabras
            <input value={e.titulo || ""} onChange={(ev) => cambiar({ titulo: ev.target.value })} />
          </label>
          <label className="ancho">Enlace (opcional)
            <input value={e.url || ""} onChange={(ev) => cambiar({ url: ev.target.value })} placeholder="https://www.instagram.com/p/..." />
          </label>
        </div>
      )}
      <div className="est-form-numeros">
        {CAMPOS_MANUALES.map((k) => (
          <label key={k}>{NOMBRES_METRICAS[k]}
            <input
              inputMode="numeric"
              value={e.metricas?.[k] ?? ""}
              onChange={(ev) => cambiar({ metricas: { ...e.metricas, [k]: ev.target.value.replace(/[^\d]/g, "") } })}
            />
          </label>
        ))}
      </div>
      <div className="est-form-acciones">
        <button type="button" className="button ghost" onClick={onCancelar}>Cancelar</button>
        <button className="button primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
      </div>
    </form>
  );
}

const ESTADO_TEXTO = { ok: "Conectado", error: "Falla", sin_conectar: "Sin conectar" };

export default function Estadisticas({ api, Antiguo }) {
  const hoy = new Date();
  const [year, setYear] = useState(hoy.getFullYear());
  const [month, setMonth] = useState(hoy.getMonth() + 1);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState("Todo");
  const [formulario, setFormulario] = useState(null);
  const [trabajando, setTrabajando] = useState("");
  const [entradas, setEntradas] = useState([]);

  const [peticion, setPeticion] = useState({ fresco: false, vez: 0 });
  const [vezEntradas, setVezEntradas] = useState(0);
  const cargar = (fresco = false) => setPeticion((p) => ({ fresco, vez: p.vez + 1 }));
  const cargarEntradas = () => setVezEntradas((v) => v + 1);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError("");
      try {
        const r = await api(`/estadisticas?year=${year}&month=${month}${peticion.fresco ? "&fresco=1" : ""}`);
        if (vivo) setDatos(r);
      } catch (e) {
        if (vivo) setError(e.message);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [api, year, month, peticion]);

  useEffect(() => {
    let vivo = true;
    api("/estadisticas/manual")
      .then((r) => vivo && setEntradas(r.entradas || []))
      .catch(() => vivo && setEntradas([]));
    return () => {
      vivo = false;
    };
  }, [api, vezEntradas]);

  const esMesActual = year === hoy.getFullYear() && month === hoy.getMonth() + 1;
  function mover(delta) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    if (y > hoy.getFullYear() || (y === hoy.getFullYear() && m > hoy.getMonth() + 1)) return;
    setYear(y);
    setMonth(m);
  }

  const contenido = useMemo(() => datos?.contenido || [], [datos]);
  const canalesContenido = useMemo(() => ["Todo", ...new Set(contenido.map((c) => c.canal))], [contenido]);
  const visibles = filtro === "Todo" ? contenido : contenido.filter((c) => c.canal === filtro);

  async function subirLinkedin(archivo) {
    if (!archivo) return;
    setTrabajando("linkedin");
    setError("");
    setAviso("");
    try {
      const r = await api("/estadisticas/linkedin", { method: "POST", body: JSON.stringify({ archivo: await leerArchivo(archivo) }) });
      setAviso(`LinkedIn importado: ${r.publicaciones} publicaciones y ${r.meses} ${r.meses === 1 ? "mes" : "meses"}.`);
      cargar(true);
      cargarEntradas();
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando("");
    }
  }

  async function subirCaptura(archivo) {
    if (!archivo) return;
    setTrabajando("captura");
    setError("");
    setAviso("");
    try {
      const imagen = await leerArchivo(archivo);
      const r = await api("/estadisticas/captura", { method: "POST", body: JSON.stringify({ imagen, tipo: archivo.type }) });
      setFormulario({ ...r.leido, origen: "captura" });
      setAviso("He leído la captura. Revisa los números y guarda.");
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando("");
    }
  }

  async function guardarManual(entrada) {
    setTrabajando("guardar");
    setError("");
    try {
      await api("/estadisticas/manual", { method: "POST", body: JSON.stringify(entrada) });
      setFormulario(null);
      setAviso("Guardado.");
      cargar(true);
      cargarEntradas();
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando("");
    }
  }

  async function borrarManual(entrada) {
    if (!window.confirm(`¿Quitar «${entrada.titulo || entrada.canal}» de las estadísticas?`)) return;
    try {
      await api(`/estadisticas/manual/${entrada.id}`, { method: "DELETE" });
      cargar(true);
      cargarEntradas();
    } catch (e) {
      setError(e.message);
    }
  }

  const f = datos?.fuentes || {};
  const web = datos?.web;
  const redes = datos?.redes || {};
  const googleClics = (datos?.google?.clics || 0) + (datos?.bing?.clics || 0);
  const googleAnt = datos?.google || datos?.bing
    ? (datos?.google?.anterior?.clics || 0) + (datos?.bing?.anterior?.clics || 0)
    : undefined;

  const conexiones = [
    { id: "ga4", nombre: "Google Analytics", estado: f.ga4?.estado, detalle: f.ga4?.detalle },
    { id: "umami", nombre: "Umami (visitas sin cookies)", estado: f.umami?.estado, detalle: f.umami?.detalle },
    { id: "searchConsole", nombre: "Google Search Console", estado: f.searchConsole?.estado, detalle: f.searchConsole?.estado === "ok" && !datos?.google?.impresiones ? "Conectado. Google tarda unos días en dar los primeros datos." : f.searchConsole?.detalle },
    { id: "bing", nombre: "Bing", estado: f.bing?.estado, detalle: f.bing?.detalle },
    {
      id: "pinterest",
      nombre: "Pinterest",
      estado: f.pinterest?.estado,
      detalle: f.pinterest?.estado === "ok" && !datos?.pinterestRenovable ? "Funciona, pero el token caduca cada 30 días." : f.pinterest?.detalle,
      accion: !datos?.pinterestRenovable ? { texto: "Que se renueve solo", href: "/oauth/pinterest/start" } : null,
    },
    {
      id: "youtube",
      nombre: "YouTube",
      estado: f.youtube?.estado,
      detalle: f.youtube?.detalle,
      accion: f.youtube?.estado !== "ok" ? { texto: "Conectar YouTube", href: "/oauth/youtube/start" } : null,
    },
    { id: "blog", nombre: "Blog", estado: f.blog?.estado, detalle: f.blog?.detalle },
  ];

  return (
    <main className="stats-workspace">
      <section className="stats-shell est">
        <header className="est-cabecera">
          <div>
            <span className="eyebrow">Estadísticas</span>
            <h2>{MESES[month - 1]} {year}</h2>
          </div>
          <div className="est-nav">
            <button type="button" className="button ghost" onClick={() => mover(-1)} aria-label="Mes anterior">‹</button>
            <button type="button" className="button ghost" onClick={() => mover(1)} disabled={esMesActual} aria-label="Mes siguiente">›</button>
            <button type="button" className="button ghost" onClick={() => cargar(true)} disabled={cargando}>{cargando ? "Cargando…" : "Actualizar"}</button>
          </div>
        </header>

        {(error || aviso) && <div className={`publication-feedback ${error ? "error" : "success"}`}>{error || aviso}</div>}

        {!datos && cargando && <p className="est-vacio">Juntando los números de todos los canales…</p>}

        {datos && (
          <>
            <p className="est-frase">{datos.frase}</p>

            <section className="est-tarjetas">
              <Tarjeta titulo={`Visitas a la web${web ? ` · ${web.origen}` : ""}`} valor={web?.visitas ?? null} anterior={web?.anterior?.visitas} />
              <Tarjeta titulo="Personas distintas" valor={web?.personas ?? null} anterior={web?.anterior?.personas} />
              <Tarjeta titulo="Clics desde Google y Bing" valor={datos.google || datos.bing ? googleClics : null} anterior={googleAnt} />
              <Tarjeta titulo="Publicaciones del mes" valor={datos.publicaciones} nota="de todos los canales" />
            </section>

            <section className="est-redes">
              <article>
                <header><b>Pinterest</b>{redes.pinterest?.parcial && <small>últimos 90 días</small>}{redes.pinterest?.deMemoria && <small>guardado</small>}</header>
                {redes.pinterest ? (
                  <ul>
                    <li><strong>{n(redes.pinterest.impresiones)}</strong> impresiones</li>
                    <li><strong>{n(redes.pinterest.guardados)}</strong> guardados</li>
                    <li><strong>{n(redes.pinterest.clics)}</strong> clics en pines</li>
                    <li><strong>{n(redes.pinterest.clicsWeb)}</strong> clics a la web</li>
                  </ul>
                ) : <p>{f.pinterest?.detalle || "Sin datos de este mes."}</p>}
              </article>
              <article>
                <header><b>YouTube</b></header>
                {redes.youtube ? (
                  redes.youtube.sinAnalitica ? (
                    <ul><li><strong>{n(redes.youtube.suscriptoresTotales)}</strong> suscriptores</li></ul>
                  ) : (
                    <ul>
                      <li><strong>{n(redes.youtube.visualizaciones)}</strong> visualizaciones</li>
                      <li><strong>{n(redes.youtube.minutos)}</strong> minutos vistos</li>
                      <li><strong>{n(redes.youtube.likes)}</strong> likes</li>
                      <li><strong>{redes.youtube.suscriptores >= 0 ? "+" : ""}{n(redes.youtube.suscriptores)}</strong> suscriptores</li>
                    </ul>
                  )
                ) : (
                  <p>{f.youtube?.detalle || "Sin conectar."} <a href="/oauth/youtube/start">Conectar YouTube</a></p>
                )}
              </article>
              <article>
                <header><b>Instagram</b><small>a mano</small></header>
                {redes.instagram ? (
                  <ul>
                    {["alcance", "visualizaciones", "me_gusta", "guardados", "visitas_perfil"].filter((k) => redes.instagram[k]).map((k) => (
                      <li key={k}><strong>{n(redes.instagram[k])}</strong> {NOMBRES_METRICAS[k]}</li>
                    ))}
                    <li><strong>{n(redes.instagram.publicaciones)}</strong> publicaciones apuntadas</li>
                  </ul>
                ) : <p>Sube una captura de las estadísticas de Instagram y Flow lee los números.</p>}
                <label className="button ghost est-subir">
                  {trabajando === "captura" ? "Leyendo…" : "Subir captura"}
                  <input type="file" accept="image/*" hidden onChange={(ev) => { subirCaptura(ev.target.files?.[0]); ev.target.value = ""; }} />
                </label>
              </article>
              <article>
                <header><b>LinkedIn</b><small>con el Excel</small></header>
                {redes.linkedin ? (
                  <ul>
                    <li><strong>{n(redes.linkedin.impresiones)}</strong> impresiones</li>
                    <li><strong>{n(redes.linkedin.interacciones)}</strong> interacciones</li>
                    <li><strong>{n(redes.linkedin.publicaciones)}</strong> publicaciones</li>
                  </ul>
                ) : <p>LinkedIn → Ver todas las analíticas → Contenido → Exportar. Sube aquí ese Excel.</p>}
                <label className="button ghost est-subir">
                  {trabajando === "linkedin" ? "Importando…" : "Subir Excel"}
                  <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(ev) => { subirLinkedin(ev.target.files?.[0]); ev.target.value = ""; }} />
                </label>
              </article>
            </section>

            {formulario && (
              <section className="panel est-panel">
                <h3>Revisa y guarda</h3>
                <FormularioManual inicial={formulario} guardando={trabajando === "guardar"} onGuardar={guardarManual} onCancelar={() => setFormulario(null)} />
              </section>
            )}

            <section className="panel est-panel">
              <div className="est-panel-cab">
                <h3>Qué publicaste y qué trajo</h3>
                <div className="est-filtros">
                  {canalesContenido.map((c) => (
                    <button type="button" key={c} className={c === filtro ? "activo" : ""} onClick={() => setFiltro(c)}>{c}</button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormulario({ canal: "Instagram", tipo: "publicacion", fecha: new Date().toISOString().slice(0, 10), titulo: "", url: "", metricas: {} })}
                  >+ Añadir a mano</button>
                </div>
              </div>
              {visibles.length ? (
                <div className="est-contenido">
                  {visibles.map((c) => (
                    <article key={`${c.canal}-${c.id}`}>
                      {c.imagen ? <img src={c.imagen} alt="" loading="lazy" /> : <div className="est-sin-imagen">{c.canal.slice(0, 2)}</div>}
                      <div>
                        <a href={c.url || undefined} target="_blank" rel="noreferrer">{c.titulo}</a>
                        <small>{c.canal} · {c.fecha ? new Date(`${c.fecha}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "sin fecha"}{c.manual ? ` · ${c.origen}` : ""}{c.sinDatos ? " · Pinterest aún no da sus números" : ""}</small>
                      </div>
                      <span>{resumenMetricas(c.metricas, c.visitasWeb)}</span>
                    </article>
                  ))}
                </div>
              ) : <p className="est-vacio">No hay publicaciones con datos en este mes.</p>}
            </section>

            <section className="est-columnas">
              <section className="panel est-panel">
                <h3>De dónde llegan a la web</h3>
                <Barras filas={web?.canales || []} />
              </section>
              <section className="panel est-panel">
                <h3>Qué leen</h3>
                <Barras
                  filas={(web?.paginas || []).slice(0, 8).map((p) => ({ canal: p.titulo && !/^aeternal/i.test(p.titulo) ? p.titulo : p.ruta, visitas: p.vistas }))}
                />
              </section>
              <section className="panel est-panel">
                <h3>Qué buscan</h3>
                {datos.google?.consultas?.length || datos.bing?.consultas?.length ? (
                  <table className="est-tabla">
                    <thead><tr><th>Búsqueda</th><th>Clics</th><th>Veces vista</th></tr></thead>
                    <tbody>
                      {(datos.google?.consultas || []).map((q) => <tr key={`g-${q.texto}`}><td>{q.texto}</td><td>{n(q.clics)}</td><td>{n(q.impresiones)}</td></tr>)}
                      {(datos.bing?.consultas || []).map((q) => <tr key={`b-${q.texto}`}><td>{q.texto} <small>Bing</small></td><td>{n(q.clics)}</td><td>{n(q.impresiones)}</td></tr>)}
                    </tbody>
                  </table>
                ) : <p className="est-vacio">{f.searchConsole?.estado === "ok" ? "Google todavía no ha dado datos de búsquedas. Tarda unos días desde que se verifica la web." : "Search Console sin conectar."}</p>}
              </section>
            </section>

            <section className="panel est-panel">
              <h3>Visitas a la web en {year}</h3>
              <GraficoAnio anio={datos.anio || []} mesActual={month} />
            </section>

            <section className="panel est-panel">
              <h3>Conexiones</h3>
              <div className="est-conexiones">
                {conexiones.map((c) => (
                  <div key={c.id} className={`est-conexion ${c.estado || ""}`}>
                    <b>{c.nombre}</b>
                    <span>{ESTADO_TEXTO[c.estado] || "—"}</span>
                    {c.detalle && <small>{c.detalle}</small>}
                    {c.accion && <a className="button ghost" href={c.accion.href}>{c.accion.texto}</a>}
                  </div>
                ))}
              </div>
            </section>

            {entradas.length > 0 && (
              <details className="panel est-panel">
                <summary>Datos apuntados a mano ({entradas.length})</summary>
                <table className="est-tabla">
                  <thead><tr><th>Fecha</th><th>Red</th><th>Qué</th><th>Números</th><th /></tr></thead>
                  <tbody>
                    {entradas.map((e) => (
                      <tr key={e.id}>
                        <td>{e.fecha}</td>
                        <td>{e.canal}</td>
                        <td>{e.tipo === "mes" ? "Resumen del mes" : e.titulo || "Publicación"}</td>
                        <td>{resumenMetricas(e.metricas)}</td>
                        <td className="est-acciones">
                          <button type="button" className="button ghost" onClick={() => setFormulario(e)}>Editar</button>
                          <button type="button" className="button ghost" onClick={() => borrarManual(e)}>Quitar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            {Antiguo && (
              <details className="panel est-panel">
                <summary>Enlaces con seguimiento (UTM) y registro antiguo</summary>
                <Antiguo />
              </details>
            )}

            <p className="est-pie">Actualizado {new Date(datos.generado).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Flow guarda los números cada día para que quede historial.</p>
          </>
        )}
      </section>
    </main>
  );
}
