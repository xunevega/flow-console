import { defineRailway, github, project, service, volume } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "flow-console";
export default defineRailway(() => {
  // Aquí viven todos los datos de Flow (publicaciones, calendario, tokens renovados).
  const datos = volume("flow-console-datos", { region: "sfo", sizeMB: 5000 });
  const flowConsole = service("flow-console", {
    source: github("xunevega/flow-console", { branch: "cursor/funcionalidad-real", checkSuites: false }),
    build: { buildCommand: "npm run build", buildEnvironment: "V3", builder: "RAILPACK" },
    start: "node server.mjs",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { "sfo": 1 },
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 3 },
    volumeMounts: { "/data": datos },
  });

  return project("flow-console", {
    variables: { managed: false },
    resources: [flowConsole, datos],
  });
});
