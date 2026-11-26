// Aggregate actual pageview sequences by visit, never merge separate visits of a visitor.
export function resumirRecorridos(actividades) {
  const visitas=new Map();
  for(const filas of actividades) for(const e of filas){
    if(Number(e.eventType)!==1 || !e.visitId || typeof e.urlPath!=="string" || !e.urlPath.startsWith("/") || !Number.isFinite(Date.parse(e.createdAt)))continue;
    const ruta=e.urlPath.split("?")[0].split("#")[0];
    const v=visitas.get(e.visitId)||[];
    v.push({ruta,fecha:e.createdAt}); visitas.set(e.visitId,v);
  }
  const recorridos=new Map(),salidas=new Map();
  for(const v of visitas.values()){
    v.sort((a,b)=>Date.parse(a.fecha)-Date.parse(b.fecha));
    const paginas=v.map(x=>x.ruta);
    const clave=JSON.stringify(paginas);
    const r=recorridos.get(clave)||{paginas,visitas:0};r.visitas++;recorridos.set(clave,r);
    const ultima=paginas.at(-1);
    const s=salidas.get(ultima)||{ruta:ultima,visitas:0,unaPagina:0};s.visitas++;if(paginas.length===1)s.unaPagina++;salidas.set(ultima,s);
  }
  return {visitas:visitas.size,recorridos:[...recorridos.values()].sort((a,b)=>b.visitas-a.visitas),salidas:[...salidas.values()].sort((a,b)=>b.visitas-a.visitas)};
}
export async function consultarRecorridos(get,desde,hasta){
  try{
    const r=await get("/sessions",{startAt:desde,endAt:hasta,page:1,pageSize:50});
    if(!Array.isArray(r?.data))throw Error("Formato de sesiones no reconocido");
    const ids=[...new Set(r.data.map(x=>x.id).filter(x=>typeof x==="string"&&/^[a-zA-Z0-9-]+$/.test(x)))].slice(0,50);
    const actividades=[];let fallos=0;
    for(let i=0;i<ids.length;i+=5){
      const lote=await Promise.allSettled(ids.slice(i,i+5).map(id=>get("/sessions/"+encodeURIComponent(id)+"/activity",{startAt:desde,endAt:hasta})));
      for(const x of lote){if(x.status==="fulfilled"&&Array.isArray(x.value))actividades.push(x.value);else fallos++;}
    }
    const resumen=resumirRecorridos(actividades);
    return {...resumen,estado:fallos?"parcial":"ok",sesionesConsultadas:actividades.length,sesionesTotales:Number.isFinite(Number(r.count))?Number(r.count):null,fallos,limitado:r.count==null||Number(r.count)>ids.length||fallos>0};
  }catch(e){return {estado:"error",detalle:String(e.message).slice(0,250),recorridos:[],salidas:[]};}
}
