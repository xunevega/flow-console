const targets = [
  ["instagram", "Instagram", "publicar-instagram", -760, -440],
  ["youtube", "YouTube", "publicar-youtube", -760, -280],
  ["linkedin", "LinkedIn", "publicar-linkedin", -760, -120],
  ["tiktok", "TikTok", "publicar-tiktok", -760, 360],
  ["pinterest", "Pinterest", "publicar-pinterest", -760, 680],
  ["blog", "Blog", "publicar-blog", -760, 840],
];

const webhookNodes = targets.map(([id, name, path, x, y]) => ({
  parameters: {
    httpMethod: "POST",
    path,
    responseMode: "responseNode",
    options: {},
  },
  id: `webhook-${id}`,
  name: `Webhook - ${name}`,
  type: "n8n-nodes-base.webhook",
  typeVersion: 2.1,
  position: [x, y],
  webhookId: `flow-console-${id}`,
}));

const instagramWorkerUrl = String(process.env.INSTAGRAM_EXTERNAL_WORKER_URL || "").trim();
const instagramWorkerToken = String(process.env.INSTAGRAM_EXTERNAL_WORKER_TOKEN || "").trim();

const normalizePublicationCode = `const input = $json.body ?? $json;
const target = input.target || {};
const caption = String(input.caption || '').trim().slice(0, 2200);
if (!caption) throw new Error('El contenido es obligatorio.');
const action = ['draft', 'review', 'schedule', 'publish', 'external_flow'].includes(input.action) ? input.action : 'publish';
const selected = {
  id: String(target.id || input.targetId || 'publicacion').trim(),
  name: String(target.name || input.targetName || 'Publicacion').trim(),
  kind: String(target.kind || 'publicacion').trim(),
  webhookPath: String(target.webhookPath || '').trim(),
};
const imageUrl = String(input.imageUrl || '').trim();
const videoUrl = String(input.videoUrl || input.resourceUrl || '').trim();
return [{
  json: {
    ok: true,
    status: selected.id === 'instagram' ? 'instagram_browser_worker_received' : action === 'schedule' ? 'scheduled_for_delivery' : 'received_by_delivery_service',
    action,
    target: selected,
    deliveryMode: input.deliveryMode || (selected.id === 'instagram' ? 'browser_worker' : 'delivery_service'),
    skipMeta: selected.id === 'instagram' ? true : Boolean(input.skipMeta),
    requestedAction: input.requestedAction || input.action || action,
    publication: {
      caption,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      hasPublicResource: /^https?:\\/\\//i.test(imageUrl),
      hasPublicVideo: /^https?:\\/\\//i.test(videoUrl),
      location: String(input.location || '').trim().slice(0, 120) || null,
      tag: String(input.tag || '').trim().slice(0, 120) || null,
      audience: ['public', 'followers', 'close'].includes(input.audience) ? input.audience : 'public',
      scheduledAt: input.scheduledAt || null,
      options: {
        hideLikes: Boolean(input.options?.hideLikes),
        noComments: Boolean(input.options?.noComments),
        shareThreads: Boolean(input.options?.shareThreads),
      },
    },
    handoff: {
      mode: selected.id === 'instagram' ? 'browser_worker' : 'delivery_service',
      note: selected.id === 'instagram'
        ? 'Instagram se publica por worker externo de navegador. No usar Meta Graph.'
        : 'Flow Console entrega el payload. La publicacion real se resuelve en el servicio configurado.',
      nextStep: selected.id === 'instagram'
        ? 'El siguiente nodo llama a INSTAGRAM_EXTERNAL_WORKER_URL con caption, media y skipMeta=true.'
        : 'Conecta desde aqui el servicio real de publicacion si quieres automatizar el destino final.',
    },
    rag_memory: input.rag_memory || input.memoria_rag || null,
    source: input.source || 'flow-console',
    requestedAt: input.requestedAt || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  }
}];`;

const instagramExternalWorkerCode = `const input = $json;
const workerUrl = ${JSON.stringify(instagramWorkerUrl)};
const token = ${JSON.stringify(instagramWorkerToken)};

if (!workerUrl) {
  return [{
    json: {
      ...input,
      ok: false,
      status: 'external_worker_not_configured',
      error: 'Falta INSTAGRAM_EXTERNAL_WORKER_URL en n8n. Instagram debe publicarse con worker de navegador, no con Meta Graph.',
      handoff: {
        ...(input.handoff || {}),
        mode: 'browser_worker',
        nextStep: 'Configura un worker Playwright/Browserless/local y pon su URL en INSTAGRAM_EXTERNAL_WORKER_URL.',
      },
      processedAt: new Date().toISOString(),
    },
  }];
}

return [{
  json: {
    ...input,
    workerUrl,
    workerToken: token,
    workerPayload: {
  platform: 'instagram',
  action: 'publish',
  deliveryMode: 'browser_worker',
  skipMeta: true,
  caption: input.publication.caption,
  imageUrl: input.publication.imageUrl,
  videoUrl: input.publication.videoUrl,
  scheduledAt: input.publication.scheduledAt,
  options: input.publication.options,
  target: input.target,
  rag_memory: input.rag_memory,
  source: input.source,
  requestedAt: input.requestedAt,
    },
    processedAt: new Date().toISOString(),
  }
}];`;

const workflow = {
  name: "Publicaciones - Entradas desde Flow Console",
  nodes: [
    ...webhookNodes,
    {
      parameters: {
        jsCode: normalizePublicationCode,
      },
      id: "normalize-publication",
      name: "Recibir publicación externa",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-420, 280],
    },
    {
      parameters: {
        jsCode: normalizePublicationCode,
      },
      id: "normalize-instagram-publication",
      name: "Recibir Instagram externo",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-420, -440],
    },
    {
      parameters: {
        jsCode: instagramExternalWorkerCode,
      },
      id: "instagram-external-worker",
      name: "Instagram - worker externo",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-120, -440],
    },
    {
      parameters: {
        method: "POST",
        url: "={{ $json.workerUrl }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "authorization",
              value: "=Bearer {{ $json.workerToken }}",
            },
            {
              name: "content-type",
              value: "application/json",
            },
          ],
        },
        sendBody: true,
        contentType: "json",
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.workerPayload) }}",
        options: {
          timeout: 180000,
        },
      },
      id: "instagram-worker-http",
      name: "Llamar worker Instagram",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [180, -440],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: "={{ $json }}",
        options: {
          responseCode: 200,
        },
      },
      id: "respond-flow-console",
      name: "Responder a Flow Console",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.4,
      position: [480, 280],
    },
  ],
  connections: Object.fromEntries([
    ...targets.filter(([id]) => id !== "instagram").map(([, name]) => [
      `Webhook - ${name}`,
      { main: [[{ node: "Recibir publicación externa", type: "main", index: 0 }]] },
    ]),
    [
      "Webhook - Instagram",
      { main: [[{ node: "Recibir Instagram externo", type: "main", index: 0 }]] },
    ],
    [
      "Recibir publicación externa",
      { main: [[{ node: "Responder a Flow Console", type: "main", index: 0 }]] },
    ],
    [
      "Recibir Instagram externo",
      { main: [[{ node: "Instagram - worker externo", type: "main", index: 0 }]] },
    ],
    [
      "Instagram - worker externo",
      { main: [[{ node: "Llamar worker Instagram", type: "main", index: 0 }]] },
    ],
    [
      "Llamar worker Instagram",
      { main: [[{ node: "Responder a Flow Console", type: "main", index: 0 }]] },
    ],
  ]),
  settings: {
    executionOrder: "v1",
  },
};

export default workflow;
