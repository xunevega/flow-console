import { useEffect, useState } from "react";

// Pantalla de Visibilidad: Flow propone qué escribir, escribe el borrador, y al aprobarlo
// lo publica en el blog, avisa a los buscadores y deja preparada una versión para cada red.
// El trabajo lo hace el servidor (visibilidad.mjs); aquí solo se enseña y se aprueba.

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "");
const manana = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Redes que Flow puede programar en el calendario (las demás se copian y se publican a mano).
const PROGRAMABLES = { linkedin: "LinkedIn" };

function Estado({ ok, si, no }) {
  return <span className={`vis-estado ${ok ? "ok" : "mal"}`}>{ok ? si : no}</span>;
}

function Version({ red, nombre, textoVersion, titulo, api, avisar }) {
  const [dia, setDia] = useState(manana);
  const [hora, setHora] = useState("10:00");
  const [hecho, setHecho] = useState("");
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoVersion);
      setHecho("Copiado");
    } catch {
      setHecho("No se pudo copiar");
    }
  };
  const programar = async () => {
    try {
      await api("/calendar/tasks", {
        method: "POST",
        body: JSON.stringify({ title: `${nombre}: ${titulo}`.slice(0, 180), notes: textoVersion, dueDate: dia, time: hora, project: PROGRAMABLES[red] }),
      });
      setHecho(`Programado el ${dia} a las ${hora}`);
    } catch (error) {
      avisar(error.message, true);
    }
  };
  return (
    <article className="vis-version">
      <header>
        <b>{nombre}</b>
        <div>
          <button type="button" className="button ghost" onClick={copiar}>Copiar</button>
        </div>
      </header>
      <pre>{textoVersion}</pre>
      {PROGRAMABLES[red] && (
        <div className="vis-programar">
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          <button type="button" className="button ghost" onClick={programar}>Programar en el calendario</button>
        </div>
      )}
      {hecho && <small>{hecho}</small>}
    </article>
  );
}

function Borrador({ b, fichas, redes, api, recargar, avisar }) {
  const [abierto, setAbierto] = useState(b.estado !== "publicado");
  const [titulo, setTitulo] = useState(b.titulo);
  const [descripcion, setDescripcion] = useState(b.descripcion);
  const [cuerpo, setCuerpo] = useState(b.cuerpo);
  const [ocupado, setOcupado] = useState("");
  const cambiado = titulo !== b.titulo || descripcion !== b.descripcion || cuerpo !== b.cuerpo;
  const ficha = fichas.find((f) => f.id === b.producto);

  const guardar = async () => {
    setOcupado("guardar");
    try {
      await api(`/visibilidad/borradores/${b.id}`, { method: "PATCH", body: JSON.stringify({ titulo, descripcion, cuerpo }) });
      await recargar();
      avisar("Guardado.");
    } catch (error) {
      avisar(error.message, true);
    } finally {
      setOcupado("");
    }
  };
  const publicar = async () => {
    if (!window.confirm(`¿Publicar «${titulo}» en el blog de aeternal-flow.es?`)) return;
    setOcupado("publicar");
    try {
      if (cambiado) await api(`/visibilidad/borradores/${b.id}`, { method: "PATCH", body: JSON.stringify({ titulo, descripcion, cuerpo }) });
      const r = await api(`/visibilidad/borradores/${b.id}/publicar`, { method: "POST" });
      await recargar();
      avisar(`Publicado: ${r.url}`);
    } catch (error) {
      avisar(error.message, true);
    } finally {
      setOcupado("");
    }
  };
  const borrar = async () => {
    if (!window.confirm("¿Descartar este borrador?")) return;
    try {
      await api(`/visibilidad/borradores/${b.id}`, { method: "DELETE" });
      await recargar();
    } catch (error) {
      avisar(error.message, true);
    }
  };

  return (
    <article className={`vis-borrador ${b.estado}`}>
      <header onClick={() => setAbierto(!abierto)}>
        <div>
          <b>{b.titulo}</b>
          <small>
            {b.estado === "publicado" ? `Publicado ${fecha(b.publicado)}` : `Borrador · ${fecha(b.actualizado)}`}
            {ficha ? ` · ${ficha.nombre}` : ""}
            {b.busqueda ? ` · «${b.busqueda}»` : ""}
          </small>
        </div>
        <span>{abierto ? "▾" : "▸"}</span>
      </header>

      {abierto && b.estado !== "publicado" && (
        <div className="vis-editor">
          <label>Título<input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} /></label>
          <label>Descripción para Google <small>{descripcion.length}/160</small><textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} /></label>
          <label>Artículo (Markdown)<textarea rows={18} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} /></label>
          <div className="vis-acciones">
            <button type="button" className="button" onClick={publicar} disabled={Boolean(ocupado)}>{ocupado === "publicar" ? "Publicando…" : "Aprobar y publicar"}</button>
            <button type="button" className="button ghost" onClick={guardar} disabled={!cambiado || Boolean(ocupado)}>Guardar cambios</button>
            <button type="button" className="button ghost" onClick={borrar} disabled={Boolean(ocupado)}>Descartar</button>
          </div>
        </div>
      )}

      {abierto && b.estado === "publicado" && (
        <div className="vis-publicado">
          <p>
            <a href={b.url} target="_blank" rel="noreferrer">{b.url}</a>
            {" · "}
            {b.aviso?.estado === "ok" ? "Bing avisado" : b.aviso?.estado === "sin_clave" ? "Aviso a Bing sin configurar" : b.aviso ? `Aviso a Bing: ${b.aviso.estado}` : ""}
          </p>
          {b.errorVersiones && <p className="vis-error">No se pudieron preparar las versiones: {b.errorVersiones}</p>}
          <div className="vis-versiones">
            {Object.entries(b.versiones || {}).map(([red, t]) => (
              <Version key={red} red={red} nombre={redes[red] || red} textoVersion={t} titulo={b.titulo} api={api} avisar={avisar} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function Fichas({ fichas, api, recargar, avisar }) {
  const [lista, setLista] = useState(fichas);
  useEffect(() => setLista(fichas), [fichas]);
  const cambiar = (i, campo, valor) => setLista(lista.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  const guardar = async () => {
    try {
      await api("/visibilidad/fichas", { method: "PUT", body: JSON.stringify({ fichas: lista }) });
      await recargar();
      avisar("Fichas guardadas.");
    } catch (error) {
      avisar(error.message, true);
    }
  };
  return (
    <details className="panel est-panel vis-fichas">
      <summary>Fichas de producto · lo único que Flow puede afirmar en un artículo</summary>
      {lista.map((f, i) => (
        <fieldset key={f.id || i}>
          <div className="vis-fila">
            <label>Nombre<input value={f.nombre} onChange={(e) => cambiar(i, "nombre", e.target.value)} /></label>
            <label>Web<input value={f.url || ""} onChange={(e) => cambiar(i, "url", e.target.value)} /></label>
            <label>Demo<input value={f.demo || ""} onChange={(e) => cambiar(i, "demo", e.target.value)} /></label>
          </div>
          <label>Para quién<textarea rows={2} value={f.para || ""} onChange={(e) => cambiar(i, "para", e.target.value)} /></label>
          <label>Hechos<textarea rows={3} value={f.hechos || ""} onChange={(e) => cambiar(i, "hechos", e.target.value)} /></label>
          <button type="button" className="button ghost" onClick={() => setLista(lista.filter((_, j) => j !== i))}>Quitar</button>
        </fieldset>
      ))}
      <div className="vis-acciones">
        <button type="button" className="button ghost" onClick={() => setLista([...lista, { id: "", nombre: "", url: "", demo: "", para: "", hechos: "" }])}>Añadir ficha</button>
        <button type="button" className="button" onClick={guardar}>Guardar fichas</button>
      </div>
    </details>
  );
}

export default function Visibilidad({ api }) {
  const [datos, setDatos] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [mensaje, setMensaje] = useState({ texto: "", error: false });
  const [tema, setTema] = useState("");
  const [producto, setProducto] = useState("");
  const [vez, setVez] = useState(0);

  const avisar = (texto, error = false) => setMensaje({ texto, error });
  const recargar = () => api("/visibilidad").then(setDatos);

  useEffect(() => {
    let vivo = true;
    api("/visibilidad")
      .then((r) => vivo && setDatos(r))
      .catch((e) => vivo && setMensaje({ texto: e.message, error: true }));
    return () => {
      vivo = false;
    };
  }, [api, vez]);

  const buscarIdeas = async () => {
    setOcupado("ideas");
    avisar("");
    try {
      await api("/visibilidad/ideas", { method: "POST" });
      setVez((v) => v + 1);
    } catch (error) {
      avisar(error.message, true);
    } finally {
      setOcupado("");
    }
  };
  const escribir = async (idea) => {
    setOcupado(idea.id || "tema");
    avisar("Escribiendo el borrador… (tarda un minuto)");
    try {
      await api("/visibilidad/borradores", { method: "POST", body: JSON.stringify(idea) });
      await recargar();
      setTema("");
      avisar("Borrador listo: revísalo abajo.");
    } catch (error) {
      avisar(error.message, true);
    } finally {
      setOcupado("");
    }
  };

  const ideas = datos?.ideas || { lista: [] };
  const fichas = datos?.fichas || [];
  const nombreFicha = (id) => fichas.find((f) => f.id === id)?.nombre || "";

  return (
    <main className="stats-workspace">
      <section className="stats-shell est vis">
        <header className="est-cabecera">
          <div>
            <span className="eyebrow">Visibilidad</span>
            <h2>Que te encuentren sin vivir en las redes</h2>
          </div>
          {datos && (
            <div className="est-nav">
              <Estado ok={datos.estado.ia} si="IA lista" no="Falta IA" />
              <Estado ok={datos.estado.blog} si="Blog conectado" no="Blog sin token" />
              <Estado ok={datos.estado.indexnow} si="Aviso a Bing listo" no="Aviso a Bing sin clave" />
            </div>
          )}
        </header>

        <p className="est-frase">
          Flow mira qué se busca en Google y Bing, propone artículos que llevan a lo que haces y los escribe con los datos de tus fichas.
          Tú eliges, repasas y apruebas: Flow publica en el blog, avisa a los buscadores y te deja cada red preparada.
        </p>

        {mensaje.texto && <div className={`publication-feedback ${mensaje.error ? "error" : "success"}`}>{mensaje.texto}</div>}
        {!datos && !mensaje.error && <p className="est-vacio">Cargando…</p>}

        {datos && (
          <>
            <section className="panel est-panel">
              <div className="est-panel-cab">
                <h3>Ideas de la semana</h3>
                <button type="button" className="button ghost" onClick={buscarIdeas} disabled={Boolean(ocupado)}>
                  {ocupado === "ideas" ? "Buscando…" : "Buscar ideas nuevas"}
                </button>
              </div>
              {ideas.fecha && (
                <p className="est-pie">
                  {fecha(ideas.fecha)} · {ideas.fuentes?.busquedas || 0} búsquedas reales
                  {ideas.fuentes?.google !== "ok" ? " · Google sin datos" : ""}
                  {ideas.fuentes?.bing !== "ok" ? " · Bing sin datos" : ""}
                </p>
              )}
              {!ideas.lista?.length && <p className="est-vacio">Todavía no hay ideas. Pulsa «Buscar ideas nuevas» (Flow también lo hace solo una vez por semana).</p>}
              <div className="vis-ideas">
                {(ideas.lista || []).map((idea) => (
                  <article key={idea.id}>
                    <b>{idea.titulo}</b>
                    <small>{idea.busqueda ? `Se busca: «${idea.busqueda}»` : ""}{nombreFicha(idea.producto) ? ` · lleva a ${nombreFicha(idea.producto)}` : ""}</small>
                    <p>{idea.porque}</p>
                    <button type="button" className="button ghost" onClick={() => escribir(idea)} disabled={Boolean(ocupado)}>
                      {ocupado === idea.id ? "Escribiendo…" : "Escribir este"}
                    </button>
                  </article>
                ))}
              </div>
              <div className="vis-tema">
                <input placeholder="O escribe tu propio tema…" value={tema} onChange={(e) => setTema(e.target.value)} />
                <select value={producto} onChange={(e) => setProducto(e.target.value)}>
                  <option value="">Sin producto</option>
                  {fichas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
                <button type="button" className="button ghost" disabled={!tema.trim() || Boolean(ocupado)} onClick={() => escribir({ titulo: tema.trim(), producto })}>
                  {ocupado === "tema" ? "Escribiendo…" : "Escribir"}
                </button>
              </div>
            </section>

            <section className="panel est-panel">
              <div className="est-panel-cab"><h3>Artículos</h3></div>
              {!datos.borradores.length && <p className="est-vacio">Aún no hay borradores.</p>}
              <div className="vis-borradores">
                {datos.borradores.map((b) => (
                  <Borrador key={`${b.id}-${b.actualizado}`} b={b} fichas={fichas} redes={datos.redes || {}} api={api} recargar={recargar} avisar={avisar} />
                ))}
              </div>
            </section>

            <Fichas fichas={fichas} api={api} recargar={recargar} avisar={avisar} />
          </>
        )}
      </section>
    </main>
  );
}
