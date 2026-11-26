// Public, read-only editorial signals. Headlines are evidence of coverage, not proof of popularity.
const FUENTES = [
 {id:"trends",nombre:"Google Trends España",url:"https://trends.google.com/trending/rss?geo=ES",tipo:"tendencia",formato:"rss"},
 {id:"hn",nombre:"Hacker News",url:"https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25",tipo:"conversacion",formato:"hn"},
 {id:"google_news_tech",nombre:"Google Noticias · Tecnología",url:"https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=es&gl=ES&ceid=ES:es",tipo:"actualidad",formato:"rss"},
 {id:"google_news_science",nombre:"Google Noticias · Ciencia",url:"https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=es&gl=ES&ceid=ES:es",tipo:"actualidad",formato:"rss"},
 {id:"google_news_business",nombre:"Google Noticias · Economía",url:"https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=es&gl=ES&ceid=ES:es",tipo:"actualidad",formato:"rss"},
 {id:"reddit",nombre:"Reddit · tecnología",url:"https://www.reddit.com/r/technology/hot.json?limit=15",tipo:"conversacion",formato:"reddit"}
];
const limpiar=s=>String(s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
const campo=(s,k)=>limpiar(s.match(new RegExp("<"+k+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+k+">","i"))?.[1]);
const urlValida=s=>{try{const u=new URL(s);return u.protocol==="https:"||u.protocol==="http:"?u.href:"";}catch{return "";}};
const fechaValida=s=>{const t=Date.parse(s);return Number.isFinite(t)?new Date(t).toISOString():null;};
export function extraerSenales(f,body){
 let filas=[];
 if(f.formato==="rss"){
   if(!/<(?:rss|feed)\b/i.test(body))throw Error("La respuesta no es un feed RSS");
   filas=[...body.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(([,item])=>({titulo:campo(item,"title"),url:campo(item,"link"),fecha:campo(item,"pubDate"),metrica:campo(item,"ht:approx_traffic")||null,detalle:campo(item,"source")}));
 }else if(f.formato==="hn"){
   const j=JSON.parse(body);if(!Array.isArray(j.hits))throw Error("Respuesta HN inválida");
   filas=j.hits.map(x=>({titulo:x.title,url:"https://news.ycombinator.com/item?id="+x.objectID,fecha:x.created_at,metrica:Number.isFinite(x.points)?x.points+" puntos; "+(x.num_comments||0)+" comentarios":null}));
 }else if(f.formato==="reddit"){
   const j=JSON.parse(body);if(!Array.isArray(j.data?.children))throw Error("Respuesta Reddit inválida");
   filas=j.data.children.map(({data:x})=>({titulo:x.title,url:"https://www.reddit.com"+x.permalink,fecha:x.created_utc?new Date(x.created_utc*1000).toISOString():null,metrica:Number.isFinite(x.score)?x.score+" puntos; "+(x.num_comments||0)+" comentarios":null}));
 }
 return filas.map(x=>({...x,titulo:limpiar(x.titulo).slice(0,250),url:urlValida(x.url),fecha:fechaValida(x.fecha),fuente:f.nombre,tipo:f.tipo})).filter(x=>x.titulo&&x.url).slice(0,20);
}
export async function investigarEditorial({fetcher=fetch}={}){
 const resultados=await Promise.all(FUENTES.map(async f=>{
   const consultado=new Date().toISOString();
   try{
     const r=await fetcher(f.url,{headers:{"User-Agent":"FlowConsole/1.0 (editorial research)","Accept":"application/rss+xml, application/json, text/xml, */*"},signal:AbortSignal.timeout(18000)});
     if(!r.ok)throw Error("HTTP "+r.status);
     const filas=extraerSenales(f,await r.text());
     return {id:f.id,nombre:f.nombre,consultado,estado:filas.length?"ok":"sin_resultados",cantidad:filas.length,filas};
   }catch(e){return {id:f.id,nombre:f.nombre,consultado,estado:"error",cantidad:0,error:String(e.message).slice(0,200),filas:[]};}
 }));
 const senales=resultados.flatMap(r=>r.filas).map((x,i)=>({...x,id:"s"+(i+1)}));
 return {fuentes:resultados.map(({filas,...r})=>r),senales};
}
