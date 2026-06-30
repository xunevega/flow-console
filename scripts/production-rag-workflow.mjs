const valuationPrompt = `Eres el clasificador barato de entrada para una base RAG privada.

Devuelve SOLO JSON válido con esta forma exacta:
{
  "tipo": "ejemplo_copy" | "spec" | "nota" | "prompt_previo",
  "proyecto": "generador-contenido",
  "resumen": "2 líneas máximo",
  "utilidad_rag": "alta" | "media" | "baja",
  "aviso": "duplicado/sensible/otro aviso" | null,
  "sugerencia_chunking": "por secciones" | "por párrafos" | "documento completo" | "por chunks" | "descripcion + OCR",
  "tags": ["etiquetas breves"],
  "topics": ["temas que debe recordar el generador"],
  "textPreferences": ["preferencias de texto/voz/estructura"],
  "styleTags": ["etiquetas de estilo reutilizables"],
  "promptHints": ["pistas útiles para montar futuros prompts"],
  "authorProfile": "si aplica: perfil intelectual/público agregado",
  "stanceTags": ["si aplica: postura, ideas, ideología o políticas visibles, con prudencia"],
  "evidenceNotes": ["si aplica: señales breves usadas para inferir el perfil"],
  "confidence": "alta" | "media" | "baja",
  "duplicate_of": null,
  "similarity": null
}

Si input.url_profile.kind es "youtube_channel" o "social_profile", NO lo trates como un documento sin texto.
Trátalo como perfil/fuente pública en conjunto. No analices video por video ni post por post.
Si reconoces la cuenta/persona por conocimiento público suficiente, extrae un perfil agregado útil para el generador: temas recurrentes, escuela de pensamiento, postura política/económica si es pública, tono, estilo retórico, audiencia probable, obsesiones y límites de confianza.
Si no reconoces la fuente y no hay contenido, devuelve confidence "baja", pero aun así genera tags mínimos desde URL/handle y un promptHint indicando qué búsqueda haría falta. No respondas "metadatos insuficientes" salvo que sea imposible inferir incluso el nombre/handle.
No presentes opiniones inferidas como hechos privados. Usa etiquetas prudentes y evidencia breve.

Si input.url_profile.kind es "visual_gallery" o "image_url", clasifica el material para ayudar al generador de imagen.
No lo trates como página de lectura. Extrae styleTags y promptHints útiles: tema visual, composición, paleta, técnica aparente, textura, atmósfera, figuras, símbolos, encuadre y nivel de detalle.
Si la descripción humana menciona un artista, ilustrador o movimiento, úsala como orientación para tags visuales.
Si el referente es un artista vivo, evita una fórmula de copia literal tipo "in the style of [artista]"; transforma la referencia en descriptores visuales neutrales que sirvan para prompts.
Para galerías visuales con buena intención de prompt, favorece tipo "prompt_previo", utilidad_rag "alta" o "media" y sugerencia_chunking "descripcion + OCR" si no hay texto largo.

La descripción/context_description es una ayuda humana para orientar la valoración, no sustituye al material subido.
Si la descripción contiene una fórmula o frase extremadamente clara y condensada, conviértela en tags, stanceTags o promptHints. Ejemplo: "Laissez faire, laissez passer" implica tags como laissez-faire, liberalismo económico, libre mercado, anti-intervencionismo.
No alargues una descripción que ya funciona como tag; úsala para clasificar mejor.

Detecta datos sensibles como NIF, emails, teléfonos, direcciones, credenciales, tokens o datos de facturación.
Si parece material de marca/copy/spec/prompt útil, no lo descartes; solo avisa.
No inventes duplicados concretos si no tienes evidencia en el input.`;

const prepareValuation = `const body = $json.body || $json;
const content = String(body.content || body.text || body.material || '').slice(0, 60000);
const projectHint = body.project_hint || body.proyecto_hint || 'inferir';
const inputType = body.input_type || body.tipo_material || 'Texto';
const file = body.file || null;
const sourceName = file?.name || body.url || inputType;
const urlProfile = body.url_profile || null;
const profileGoal = body.profile_goal || urlProfile?.profileGoal || '';
const acquisitionInstruction = body.acquisition_instruction || urlProfile?.instruction || '';
const expectedSchema = body.expected_schema || {};
const description = String(body.context_description || body.description || body.descripcion || '').trim().slice(0, 1200);

return [{
  json: {
    input: body,
    anthropic_body: {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1800,
      temperature: 0,
      system: ${JSON.stringify(valuationPrompt)},
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: [
            'PROYECTO SUGERIDO: ' + projectHint,
            'TIPO DE ENTRADA: ' + inputType,
            'FUENTE: ' + sourceName,
            'URL: ' + (body.url || ''),
            'URL_PROFILE: ' + JSON.stringify(urlProfile || null),
            'PROFILE_GOAL: ' + profileGoal,
            'SHOULD_SEARCH_WEB: ' + Boolean(body.should_search_web || urlProfile?.shouldSearchWeb),
            'INSTRUCCION_DE_ADQUISICION: ' + acquisitionInstruction,
            'DESCRIPCION_DE_AYUDA_NO_SUSTITUTIVA: ' + (description || '(vacía)'),
            'ESQUEMA_ESPERADO_FLOW_CONSOLE: ' + JSON.stringify(expectedSchema),
            '',
            'CONTENIDO:',
            content || '(sin texto extraído; si es perfil/canal, usa URL, handle, nombre visible, instrucciones y conocimiento público prudente si reconoces la fuente)'
          ].join('\\n') }
        ]
      }]
    }
  }
}];`;

const parseValuation = `const raw = String($json.content?.[0]?.text || $json.text || '').replace(/\\\`\\\`\\\`json|\\\`\\\`\\\`/gi, '').trim();
const match = raw.match(/\\{[\\s\\S]*\\}/);
let parsed;
try { parsed = JSON.parse(match?.[0] || raw); }
catch (error) { throw new Error('Claude Haiku no devolvió JSON válido: ' + raw.slice(0, 400)); }

const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const strings = (value, limit = 12) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit) : [];
const assessment = {
  tipo: oneOf(parsed.tipo, ['ejemplo_copy', 'spec', 'nota', 'prompt_previo'], 'nota'),
  proyecto: oneOf(parsed.proyecto, ['generador-contenido'], 'generador-contenido'),
  resumen: String(parsed.resumen || '').slice(0, 1200),
  utilidad_rag: oneOf(parsed.utilidad_rag, ['alta', 'media', 'baja'], 'media'),
  aviso: parsed.aviso ? String(parsed.aviso).slice(0, 1200) : null,
  sugerencia_chunking: oneOf(parsed.sugerencia_chunking, ['por secciones', 'por párrafos', 'documento completo', 'por chunks', 'descripcion + OCR'], 'por párrafos'),
  tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).filter(Boolean).slice(0, 12) : [],
  topics: strings(parsed.topics || parsed.temas),
  textPreferences: strings(parsed.textPreferences || parsed.preferencias_texto || parsed.preferencias),
  styleTags: strings(parsed.styleTags || parsed.estilos || parsed.style_tags),
  promptHints: strings(parsed.promptHints || parsed.prompt_hints || parsed.hints_prompt),
  authorProfile: String(parsed.authorProfile || parsed.perfil_autor || parsed.perfil || '').slice(0, 1600),
  stanceTags: strings(parsed.stanceTags || parsed.stance_tags || parsed.tags_postura),
  evidenceNotes: strings(parsed.evidenceNotes || parsed.evidence_notes || parsed.evidencias, 6),
  confidence: oneOf(parsed.confidence || parsed.confianza, ['alta', 'media', 'baja'], ''),
  duplicate_of: parsed.duplicate_of || null,
  similarity: Number(parsed.similarity || 0) || null
};

return [{ json: { ok: true, assessment, valoracion: assessment } }];`;

const prepareIngestion = `const body = $json.body || $json;
const document = body.document || {};
const assessment = body.assessment || document.metadata?.assessment || {};
const raw = String(document.content || body.input?.text || '').trim();
if (!raw) throw new Error('No hay texto extraído para crear embeddings. En PDF, revisa extracción de texto en Flow Console.');

const chunking = String(body.chunking || assessment.sugerencia_chunking || 'por párrafos');
const hardLimit = 1800;
const softLimit = chunking === 'documento completo' ? 6000 : chunking === 'por secciones' ? 2200 : 1400;

function splitSections(text) {
  if (chunking === 'documento completo' && text.length <= 6000) return [text];
  const units = chunking === 'por secciones'
    ? text.split(/\\n(?=#{1,4}\\s|[A-ZÁÉÍÓÚÑ][^\\n]{3,80}\\n)/g)
    : text.split(/\\n{2,}/g);
  const chunks = [];
  let buffer = '';
  const push = () => {
    const clean = buffer.trim();
    if (clean) chunks.push(clean);
    buffer = '';
  };
  for (const unit of units.map((value) => value.trim()).filter(Boolean)) {
    if ((buffer + '\\n\\n' + unit).trim().length > softLimit) push();
    if (unit.length > hardLimit) {
      for (let index = 0; index < unit.length; index += softLimit) chunks.push(unit.slice(index, index + softLimit).trim());
    } else {
      buffer = buffer ? buffer + '\\n\\n' + unit : unit;
    }
  }
  push();
  return chunks.length ? chunks : [text.slice(0, softLimit)];
}

const chunks = splitSections(raw).slice(0, 200).map((content, index) => ({
  index,
  content,
  metadata: {
    chunking,
    source: 'n8n-rag-ingestar',
    assessment
  }
}));

return [{
  json: {
    document,
    assessment,
    chunks,
    embedding_body: {
      model: 'text-embedding-3-small',
      input: chunks.map((chunk) => [document.title || document.nombre || 'Documento RAG', ...(document.tags || []), chunk.content].join('\\n')),
      dimensions: 1024
    }
  }
}];`;

const attachEmbeddings = `const data = Array.isArray($json.data) ? $json.data : [];
if (!data.length) throw new Error('OpenAI no devolvió embeddings');
const chunks = ($json.chunks || []).map((chunk, index) => ({
  ...chunk,
  embedding: data[index]?.embedding
}));
if (chunks.some((chunk) => !Array.isArray(chunk.embedding))) throw new Error('Faltan embeddings para uno o más chunks');
return [{
  json: {
    document: $json.document,
    chunks,
    pgvector_body: {
      document: $json.document,
      chunks
    }
  }
}];`;

export default {
  id: "ragPromptConsoleWebhooks",
  name: "RAG Prompt Console - Webhooks",
  active: false,
  nodes: [
    {
      parameters: { httpMethod: "POST", path: "rag/valorar", responseMode: "responseNode", options: {} },
      id: "webhook-valorar",
      name: "Webhook - valorar",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-1080, -360],
      webhookId: "rag-valorar"
    },
    {
      parameters: { jsCode: prepareValuation },
      id: "prepare-valorar",
      name: "Preparar valoración Haiku",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-820, -360]
    },
    {
      parameters: {
        method: "POST",
        url: "https://api.anthropic.com/v1/messages",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "x-api-key", value: "={{ $env.ANTHROPIC_API_KEY }}" },
            { name: "anthropic-version", value: "2023-06-01" },
            { name: "content-type", value: "application/json" }
          ]
        },
        sendBody: true,
        contentType: "json",
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.anthropic_body) }}",
        options: { timeout: 60000 }
      },
      id: "claude-haiku-valorar",
      name: "Claude Haiku - valorar",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [-560, -360]
    },
    {
      parameters: { jsCode: parseValuation },
      id: "parse-valorar",
      name: "Normalizar valoración",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-300, -360]
    },
    {
      parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: {} },
      id: "respond-valorar",
      name: "Responder valorar",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.4,
      position: [-40, -360]
    },
    {
      parameters: { httpMethod: "POST", path: "rag/ingestar", responseMode: "responseNode", options: {} },
      id: "webhook-ingestar",
      name: "Webhook - ingestar",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-1080, -80],
      webhookId: "rag-ingestar"
    },
    {
      parameters: { jsCode: prepareIngestion },
      id: "prepare-ingestar",
      name: "Trocear documento",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-820, -80]
    },
    {
      parameters: {
        method: "POST",
        url: "https://api.openai.com/v1/embeddings",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Authorization", value: "={{ 'Bearer ' + $env.OPENAI_API_KEY }}" },
            { name: "Content-Type", value: "application/json" }
          ]
        },
        sendBody: true,
        contentType: "json",
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.embedding_body) }}",
        options: { timeout: 120000 }
      },
      id: "openai-embeddings",
      name: "OpenAI embeddings 1024d",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [-560, 20]
    },
    {
      parameters: { mode: "combine", combineBy: "combineByPosition", options: {} },
      id: "merge-embedding-context",
      name: "Unir chunks y embeddings",
      type: "n8n-nodes-base.merge",
      typeVersion: 3.2,
      position: [-300, -80]
    },
    {
      parameters: { jsCode: attachEmbeddings },
      id: "attach-embeddings",
      name: "Preparar insert pgvector",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-40, -80]
    },
    {
      parameters: {
        method: "POST",
        url: "={{ $env.FLOW_CONSOLE_INTERNAL_URL + '/api/internal/rag/pgvector' }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: "Authorization", value: "={{ 'Bearer ' + $env.RAG_INTERNAL_TOKEN }}" },
            { name: "Content-Type", value: "application/json" }
          ]
        },
        sendBody: true,
        contentType: "json",
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.pgvector_body) }}",
        options: { timeout: 120000 }
      },
      id: "insert-pgvector",
      name: "Insertar en pgvector",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [220, -80]
    },
    {
      parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: {} },
      id: "respond-ingestar",
      name: "Responder ingestar",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.4,
      position: [480, -80]
    }
  ],
  connections: {
    "Webhook - valorar": { main: [[{ node: "Preparar valoración Haiku", type: "main", index: 0 }]] },
    "Preparar valoración Haiku": { main: [[{ node: "Claude Haiku - valorar", type: "main", index: 0 }]] },
    "Claude Haiku - valorar": { main: [[{ node: "Normalizar valoración", type: "main", index: 0 }]] },
    "Normalizar valoración": { main: [[{ node: "Responder valorar", type: "main", index: 0 }]] },
    "Webhook - ingestar": { main: [[{ node: "Trocear documento", type: "main", index: 0 }]] },
    "Trocear documento": {
      main: [[
        { node: "Unir chunks y embeddings", type: "main", index: 0 },
        { node: "OpenAI embeddings 1024d", type: "main", index: 0 }
      ]]
    },
    "OpenAI embeddings 1024d": { main: [[{ node: "Unir chunks y embeddings", type: "main", index: 1 }]] },
    "Unir chunks y embeddings": { main: [[{ node: "Preparar insert pgvector", type: "main", index: 0 }]] },
    "Preparar insert pgvector": { main: [[{ node: "Insertar en pgvector", type: "main", index: 0 }]] },
    "Insertar en pgvector": { main: [[{ node: "Responder ingestar", type: "main", index: 0 }]] }
  },
  settings: { executionOrder: "v1", timezone: "Europe/Madrid" },
  pinData: {},
  versionId: "rag-prompt-console-production-v1"
};
