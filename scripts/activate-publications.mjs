import publicationWorkflow from "./publication-workflows.mjs";

const n8nUrl = String(process.env.N8N_URL || "").replace(/\/+$/, "");
const n8nApiKey = process.env.N8N_API_KEY || "";

if (!n8nUrl || !n8nApiKey) {
  console.error("Missing N8N_URL or N8N_API_KEY. Set them and run: npm run activate:publications");
  process.exit(1);
}

async function n8n(pathname, options = {}) {
  const response = await fetch(`${n8nUrl}/api/v1${pathname}`, {
    ...options,
    headers: {
      "X-N8N-API-KEY": n8nApiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!response.ok) throw new Error(body?.message || `n8n responded ${response.status}`);
  return body;
}

function normalizeWorkflow(workflow) {
  const copy = structuredClone(workflow);
  delete copy.id;
  delete copy.versionId;
  delete copy.active;
  delete copy.activeVersionId;
  return copy;
}

console.log(`Checking n8n for workflow "${publicationWorkflow.name}"...`);
const existingResponse = await n8n("/workflows?limit=100");
const existing = (existingResponse?.data || []).find((item) => item.name === publicationWorkflow.name);

let saved;
if (existing) {
  console.log(`Updating existing workflow ${existing.id}...`);
  saved = await n8n(`/workflows/${encodeURIComponent(existing.id)}`, {
    method: "PUT",
    body: JSON.stringify(normalizeWorkflow(publicationWorkflow)),
  });
} else {
  console.log("Creating workflow...");
  saved = await n8n("/workflows", {
    method: "POST",
    body: JSON.stringify(normalizeWorkflow(publicationWorkflow)),
  });
}

const workflowId = saved?.id || existing?.id;
if (!workflowId) throw new Error("n8n did not return a workflow id");

console.log(`Activating workflow ${workflowId}...`);
await n8n(`/workflows/${encodeURIComponent(workflowId)}/activate`, {
  method: "POST",
  body: "{}",
});

console.log("Publication webhooks activated:");
for (const path of [
  "publicar-instagram",
  "publicar-youtube",
  "publicar-linkedin",
  "publicar-tiktok",
  "publicar-pinterest",
  "publicar-blog",
]) {
  console.log(`- ${n8nUrl}/webhook/${path}`);
}
