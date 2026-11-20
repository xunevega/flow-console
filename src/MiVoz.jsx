import { useEffect, useState } from "react";

// Mi voz: cómo escribe Roberto (ejemplos, reglas y lo aprendido de sus correcciones) y lo que
// MiBØ cuenta desde el Mac (proyectos e imágenes). Sustituye a AÑADIR y CORREGIR.

const fecha = (iso) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca");

export default function MiVoz({ api }) {
  const [voz, setVoz] = useState(null);
  const [mibo, setMibo] = useState(null);
  const [reglas, setReglas] = useState("");
  const [ejemplo, setEjemplo] = useState("");
  const [donde, setDonde] = useState("");
  const [url, setUrl] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [leccion, setLeccion] = useState("");
  const [proyecto, setProyecto] = useState("");
  const [mensaje, setMensaje] = useState({ texto: "", error: false });
  const [vez, setVez] = useState(0);

  const avisar = (texto, error = false) => setMensaje({ texto, error });
  const recargar = () => setVez((v) => v + 1);

  useEffect(() => {
    let vivo = true;
    Promise.all([api("/mivoz"), api("/mibo")])
      .then(([v, m]) => {
        if (!vivo) return;
        setVoz(v);
        setReglas(v.reglas || "");
        setMibo(m);
      })
      .catch((e) => vivo && setMensaje({ texto: e.message, error: true }));
    return () => {
      vivo = false;
    };
  }, [api, vez]);

  const hacer = async (fn, ok) => {
    try {
      await fn();
      recargar();
      if (ok) avisar(ok);
    } catch (error) {
      avisar(error.message, true);
    }
  };

  const proyectos = mibo?.contexto?.proyectos || [];
  const imagenes = (mibo?.imagenes || []).filter((i) => !proyecto || i.proyecto === proyecto);
  const conImagenes = [...new Set((mibo?.imagenes || []).map((i) => i.proyecto).filter(Boolean))];

  return (
    <main className="stats-workspace">
      <section className="stats-shell est vis">
        <header className="est-cabecera">
          <div>
            <span className="eyebrow">Mi voz</span>
            <h2>Que todo lo que escribe Flow suene a ti</h2>
          </div>
        </header>
        <p className="est-frase">
          Lo de aquí entra en todo lo que escribe Flow: artículos, publicaciones y versiones para cada red.
          Cuando corriges un borrador antes de publicarlo, Flow saca la lección solo y la apunta abajo.
        </p>
        {mensaje.texto && <div className={`publication-feedback ${mensaje.error ? "error" : "success"}`}>{mensaje.texto}</div>}
        {!voz && !mensaje.error && <p className="est-vacio">Cargando…</p>}

        {voz && (
          <>
            <section className="panel est-panel">
              <div className="est-panel-cab"><h3>Reglas</h3></div>
              <p className="est-pie">Lo que sí y lo que no, con tus palabras. Una por línea.</p>
              <textarea rows={6} value={reglas} onChange={(e) => setReglas(e.target.value)} placeholder={"Nada de frases de gurú ni de «potenciar».\nHablo de procesos reales, con ejemplos.\nSin preguntas retóricas al principio."} />
              <div className="vis-acciones">
                <button type="button" className="button" disabled={reglas === voz.reglas} onClick={() => hacer(() => api("/mivoz/reglas", { method: "PUT", body: JSON.stringify({ reglas }) }), "Reglas guardadas.")}>Guardar reglas</button>
              </div>
            </section>

            <section className="panel est-panel">
              <div className="est-panel-cab"><h3>Textos tuyos que te gustan</h3><small>{voz.ejemplos.length}/20</small></div>
              <p className="est-pie">Pega posts, párrafos o artículos que hayas escrito tú. Flow imita el tono, no el tema.</p>
              <textarea rows={6} value={ejemplo} onChange={(e) => setEjemplo(e.target.value)} placeholder="Pega aquí un texto tuyo…" />
              <div className="vis-tema">
                <input placeholder="De dónde es (LinkedIn, blog…), opcional" value={donde} onChange={(e) => setDonde(e.target.value)} />
                <button type="button" className="button" disabled={ejemplo.trim().length < 80} onClick={() => hacer(async () => {
                  await api("/mivoz/ejemplos", { method: "POST", body: JSON.stringify({ texto: ejemplo, donde }) });
                  setEjemplo("");
                  setDonde("");
                }, "Ejemplo añadido.")}>Añadir ejemplo</button>
              </div>
              <div className="vis-tema">
                <input placeholder="…o la dirección de un texto tuyo (artículo del blog, post público…)" value={url} onChange={(e) => setUrl(e.target.value)} />
                <button type="button" className="button" disabled={!/^https?:\/\/\S+\.\S+/.test(url.trim()) || leyendo} onClick={async () => {
                  setLeyendo(true);
                  await hacer(async () => {
                    await api("/mivoz/ejemplos", { method: "POST", body: JSON.stringify({ url: url.trim(), donde }) });
                    setUrl("");
                  }, "Texto leído y añadido.");
                  setLeyendo(false);
                }}>{leyendo ? "Leyendo…" : "Leer y añadir"}</button>
              </div>
              <div className="vis-lista">
                {voz.ejemplos.map((e) => (
                  <article key={e.id}>
                    <p>{e.texto.length > 320 ? `${e.texto.slice(0, 320)}…` : e.texto}</p>
                    <small>{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.donde || "enlace"}</a> : (e.donde || "sin origen")} · {fecha(e.fecha)}</small>
                    <button type="button" className="button ghost" onClick={() => hacer(() => api(`/mivoz/ejemplos/${e.id}`, { method: "DELETE" }))}>Quitar</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel est-panel">
              <div className="est-panel-cab"><h3>Lo aprendido de tus correcciones</h3><small>{voz.lecciones.length}/40</small></div>
              {!voz.lecciones.length && <p className="est-vacio">Todavía nada. Aparecerán cuando cambies un borrador antes de publicarlo.</p>}
              <div className="vis-lista">
                {voz.lecciones.map((l) => (
                  <article key={l.id}>
                    <p>{l.texto}</p>
                    <small>{l.donde ? `de «${l.donde}»` : ""} · {fecha(l.fecha)}</small>
                    <button type="button" className="button ghost" onClick={() => hacer(() => api(`/mivoz/lecciones/${l.id}`, { method: "DELETE" }))}>Quitar</button>
                  </article>
                ))}
              </div>
              <div className="vis-tema">
                <input placeholder="Añadir una lección a mano…" value={leccion} onChange={(e) => setLeccion(e.target.value)} />
                <button type="button" className="button ghost" disabled={!leccion.trim()} onClick={() => hacer(async () => {
                  await api("/mivoz/lecciones", { method: "POST", body: JSON.stringify({ texto: leccion }) });
                  setLeccion("");
                })}>Añadir</button>
              </div>
            </section>

            <section className="panel est-panel">
              <div className="est-panel-cab">
                <h3>Desde MiBØ</h3>
                <small>{mibo?.conectado ? `Último envío: ${fecha(mibo?.contexto?.recibido)}` : "MiBØ sin conectar"}</small>
              </div>
              <p className="est-pie">Lo que llevas entre manos y las imágenes recientes de cada proyecto. Flow lo usa para proponer y escribir.</p>
              {!proyectos.length && <p className="est-vacio">MiBØ todavía no ha mandado nada.</p>}
              {proyectos.length > 0 && (
                <div className="vis-proyectos">
                  {proyectos.map((p) => (
                    <details key={p.nombre}>
                      <summary><b>{p.nombre}</b>{p.estado ? <small> · {p.estado}</small> : null}</summary>
                      {p.que && <p>{p.que}</p>}
                      {p.siguiente && <p><small>Siguiente:</small> {p.siguiente}</p>}
                      {p.notas?.length > 0 && <ul>{p.notas.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                    </details>
                  ))}
                </div>
              )}
              {(mibo?.imagenes || []).length > 0 && (
                <>
                  <div className="est-filtros">
                    <button type="button" className={!proyecto ? "activo" : ""} onClick={() => setProyecto("")}>Todas</button>
                    {conImagenes.map((p) => <button type="button" key={p} className={proyecto === p ? "activo" : ""} onClick={() => setProyecto(p)}>{p}</button>)}
                  </div>
                  <div className="vis-imagenes">
                    {imagenes.map((i) => (
                      <figure key={i.id}>
                        <img src={`/api/mibo/imagenes/${i.id}`} alt={i.nombre} loading="lazy" />
                        <figcaption>{i.proyecto} · {fecha(i.fecha)}</figcaption>
                        <button type="button" className="button ghost" onClick={() => hacer(() => api(`/mibo/imagenes/${i.id}`, { method: "DELETE" }))}>Quitar</button>
                      </figure>
                    ))}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
