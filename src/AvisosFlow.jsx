import { useEffect, useState } from "react";

// Avisos que genera Flow por su cuenta (avisos-flow.mjs): conversaciones donde aportar, ideas,
// borradores esperando, enlaces rotos, MiBØ y el robot. Van encima de los avisos de n8n.

const fecha = (iso) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca");
const ETIQUETA = {
  conversacion: "Conversación",
  ideas: "Ideas",
  borradores: "Borradores",
  web: "Web",
  mibo: "MiBØ",
  robot: "Robot",
};
const PESTANA = { visibilidad: "Abrir VISIBILIDAD", mivoz: "Abrir MI VOZ", stats: "Abrir ESTADÍSTICAS" };

function Aviso({ a, api, recargar, ir }) {
  const [abierto, setAbierto] = useState(a.tipo === "conversacion" && a.estado === "nuevo");
  const [respuesta, setRespuesta] = useState(a.respuesta || "");
  const [copiado, setCopiado] = useState(false);
  const marcar = async (estado) => {
    await api(`/avisos-flow/${a.id}`, { method: "PATCH", body: JSON.stringify(respuesta !== a.respuesta ? { estado, respuesta } : { estado }) });
    recargar();
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(respuesta);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <article className={`avf-aviso ${a.tipo} ${a.estado}`}>
      <header onClick={() => setAbierto(!abierto)}>
        <span className="avf-tipo">{ETIQUETA[a.tipo] || a.tipo}</span>
        <div>
          <b>{a.titulo}</b>
          <small>{a.texto?.split("\n")[0]} · {fecha(a.fecha)}</small>
        </div>
        <span>{abierto ? "▾" : "▸"}</span>
      </header>
      {abierto && (
        <div className="avf-cuerpo">
          {a.texto?.includes("\n") && <pre>{a.texto}</pre>}
          {a.cita && <blockquote>{a.cita}</blockquote>}
          {a.tipo === "conversacion" && (
            <label>
              Respuesta preparada {a.modo === "mencion_suave" ? `(menciona ${a.producto})` : "(sin mencionar nada tuyo)"} · la publicas tú
              <textarea rows={7} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
            </label>
          )}
          <div className="vis-acciones">
            {a.url && <a className="button ghost" href={a.url} target="_blank" rel="noreferrer">{a.tipo === "web" ? "Abrir enlace" : "Abrir conversación"}</a>}
            {a.tipo === "conversacion" && <button type="button" className="button ghost" onClick={copiar}>{copiado ? "Copiada" : "Copiar respuesta"}</button>}
            {a.ir && PESTANA[a.ir] && <button type="button" className="button ghost" onClick={() => ir(a.ir)}>{PESTANA[a.ir]}</button>}
            {a.estado === "nuevo" ? (
              <>
                <button type="button" className="button" onClick={() => marcar("hecho")}>{a.tipo === "conversacion" ? "Contestado" : "Hecho"}</button>
                <button type="button" className="button ghost" onClick={() => marcar("descartado")}>Descartar</button>
              </>
            ) : (
              <button type="button" className="button ghost" onClick={() => marcar("nuevo")}>Volver a abrir</button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default function AvisosFlow({ api, ir }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [verHechos, setVerHechos] = useState(false);
  const [vez, setVez] = useState(0);
  const recargar = () => setVez((v) => v + 1);

  useEffect(() => {
    let vivo = true;
    api("/avisos-flow").then((r) => vivo && setDatos(r)).catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [api, vez]);

  const revisar = async () => {
    setRevisando(true);
    setError("");
    try {
      await api("/avisos-flow/revisar", { method: "POST", body: JSON.stringify({ web: true }) });
      recargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setRevisando(false);
    }
  };

  const nuevos = (datos?.avisos || []).filter((a) => a.estado === "nuevo");
  const viejos = (datos?.avisos || []).filter((a) => a.estado !== "nuevo");

  return (
    <section className="avf">
      <div className="est-panel-cab">
        <h3>De Flow {nuevos.length > 0 && <span className="avf-cuenta">{nuevos.length}</span>}</h3>
        <div className="vis-acciones">
          <small className="est-pie">
            Revisado {fecha(datos?.ultimaVuelta)} · web {fecha(datos?.ultimaWeb)}{datos && !datos.reddit ? " · Reddit sin conectar" : ""}
          </small>
          <button type="button" className="button ghost" onClick={revisar} disabled={revisando}>{revisando ? "Revisando… (unos minutos)" : "Revisar ahora"}</button>
        </div>
      </div>
      {error && <div className="publication-feedback error">{error}</div>}
      {datos && !nuevos.length && <p className="est-vacio">Nada pendiente. Flow mira cada 2 horas foros, ideas, borradores y MiBØ, y la web una vez por semana.</p>}
      <div className="avf-lista">
        {nuevos.map((a) => <Aviso key={`${a.id}-${a.estado}`} a={a} api={api} recargar={recargar} ir={ir} />)}
      </div>
      {viejos.length > 0 && (
        <button type="button" className="avf-ver" onClick={() => setVerHechos(!verHechos)}>
          {verHechos ? "Ocultar" : "Ver"} los últimos hechos y descartados ({viejos.length})
        </button>
      )}
      {verHechos && <div className="avf-lista">{viejos.map((a) => <Aviso key={`${a.id}-${a.estado}`} a={a} api={api} recargar={recargar} ir={ir} />)}</div>}
    </section>
  );
}
