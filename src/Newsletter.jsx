import { useEffect, useState } from "react";

// Newsletter (newsletter.mjs, con Brevo): suscriptores, números escritos con tu voz, prueba y envío.

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "");
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "—");

function Numero({ n, api, recargar, avisar }) {
  const [abierto, setAbierto] = useState(n.estado !== "enviado");
  const [asunto, setAsunto] = useState(n.asunto);
  const [cuerpo, setCuerpo] = useState(n.cuerpo);
  const [ocupado, setOcupado] = useState("");
  const [seguro, setSeguro] = useState(false);
  const cambiado = asunto !== n.asunto || cuerpo !== n.cuerpo;
  const guardarSiHace = async () => {
    if (cambiado) await api(`/newsletter/numeros/${n.id}`, { method: "PATCH", body: JSON.stringify({ asunto, cuerpo }) });
  };
  const hacer = async (que, fn, ok) => {
    setOcupado(que);
    try {
      await guardarSiHace();
      await fn();
      await recargar();
      avisar(ok);
    } catch (e) {
      avisar(e.message, true);
    } finally {
      setOcupado("");
      setSeguro(false);
    }
  };
  return (
    <article className={`vis-borrador ${n.estado === "enviado" ? "publicado" : ""}`}>
      <header onClick={() => setAbierto(!abierto)}>
        <div>
          <b>{n.asunto || "(sin asunto)"}</b>
          <small>{n.estado === "enviado" ? `Enviado ${fecha(n.enviado)}` : `Borrador · ${fecha(n.actualizado)}${n.prueba ? " · prueba enviada" : ""}`}</small>
        </div>
        <span>{abierto ? "▾" : "▸"}</span>
      </header>
      {abierto && n.estado !== "enviado" && (
        <div className="vis-editor">
          <label>Asunto<input value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={120} /></label>
          <label>Texto (Markdown)<textarea rows={16} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} /></label>
          <div className="vis-acciones">
            <button type="button" className="button ghost" disabled={Boolean(ocupado)} onClick={() => hacer("prueba", () => api(`/newsletter/numeros/${n.id}/prueba`, { method: "POST" }), "Prueba enviada a tu correo.")}>
              {ocupado === "prueba" ? "Enviando…" : "Mandarme una prueba"}
            </button>
            {!seguro ? (
              <button type="button" className="button" disabled={Boolean(ocupado)} onClick={() => setSeguro(true)}>Enviar a los suscriptores</button>
            ) : (
              <>
                <button type="button" className="button" disabled={Boolean(ocupado)} onClick={() => hacer("enviar", () => api(`/newsletter/numeros/${n.id}/enviar`, { method: "POST" }), "Newsletter enviada.")}>
                  {ocupado === "enviar" ? "Enviando…" : "Sí, enviar ahora"}
                </button>
                <button type="button" className="button ghost" onClick={() => setSeguro(false)}>Cancelar</button>
              </>
            )}
            <button type="button" className="button ghost" disabled={!cambiado || Boolean(ocupado)} onClick={() => hacer("guardar", async () => {}, "Guardado.")}>Guardar</button>
            <button type="button" className="button ghost" disabled={Boolean(ocupado)} onClick={() => hacer("borrar", () => api(`/newsletter/numeros/${n.id}`, { method: "DELETE" }), "Borrador descartado.")}>Descartar</button>
          </div>
        </div>
      )}
      {abierto && n.estado === "enviado" && (
        <div className="vis-publicado">
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, font: "inherit", fontSize: 13 }}>{n.cuerpo}</pre>
          {n.lecciones?.length > 0 && <p className="est-pie">Aprendido de tus cambios: {n.lecciones.join(" · ")}</p>}
        </div>
      )}
    </article>
  );
}

export default function Newsletter({ api }) {
  const [datos, setDatos] = useState(null);
  const [notas, setNotas] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: "", error: false });
  const [vez, setVez] = useState(0);
  const avisar = (texto, error = false) => setMensaje({ texto, error });
  const recargar = async () => setVez((v) => v + 1);

  useEffect(() => {
    let vivo = true;
    api("/newsletter").then((r) => vivo && setDatos(r)).catch((e) => vivo && setMensaje({ texto: e.message, error: true }));
    return () => {
      vivo = false;
    };
  }, [api, vez]);

  const escribir = async () => {
    setOcupado(true);
    avisar("Escribiendo el número… (tarda un minuto)");
    try {
      await api("/newsletter/numeros", { method: "POST", body: JSON.stringify({ notas }) });
      setNotas("");
      await recargar();
      avisar("Borrador listo: repásalo abajo.");
    } catch (e) {
      avisar(e.message, true);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="panel est-panel">
      <div className="est-panel-cab">
        <h3>Newsletter</h3>
        {datos?.conectado && <small>{datos.suscriptores ?? "—"} suscriptores{datos.pendientes ? ` · ${datos.pendientes} sin confirmar` : ""} · envía {datos.remitente}</small>}
      </div>
      {mensaje.texto && <div className={`publication-feedback ${mensaje.error ? "error" : "success"}`}>{mensaje.texto}</div>}
      {datos && !datos.conectado && (
        <p className="est-vacio">Falta conectar Brevo: crea la cuenta en brevo.com y pega su clave (empieza por xkeysib-) con poner-clave.command.</p>
      )}
      {datos?.conectado && (
        <>
          <div className="vis-tema">
            <input placeholder="Algo que quieras contar en este número (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
            <button type="button" className="button" disabled={ocupado} onClick={escribir}>{ocupado ? "Escribiendo…" : "Escribir un número"}</button>
          </div>
          <p className="est-pie">Flow junta lo que has publicado desde el último envío, lo que cuenta MiBØ y tu voz. Lo repasas, te mandas una prueba y lo envías.</p>
          <div className="vis-borradores">
            {(datos.numeros || []).map((n) => <Numero key={`${n.id}-${n.actualizado}-${n.estado}`} n={n} api={api} recargar={recargar} avisar={avisar} />)}
          </div>
          {datos.envios?.length > 0 && (
            <table className="est-tabla">
              <thead><tr><th>Envío</th><th>Entregados</th><th>Abiertos</th><th>Clics</th><th>Bajas</th></tr></thead>
              <tbody>
                {datos.envios.map((e, i) => (
                  <tr key={i}><td>{e.asunto}<br /><small>{fecha(e.fecha)}</small></td><td>{e.entregados}</td><td>{e.abiertos} ({pct(e.abiertos, e.entregados)})</td><td>{e.clics}</td><td>{e.bajas}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
