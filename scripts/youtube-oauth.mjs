const clientId = String(process.env.YOUTUBE_CLIENT_ID || "").trim();
const clientSecret = String(process.env.YOUTUBE_CLIENT_SECRET || "").trim();
const redirectUri = String(process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/oauth2callback").trim();
const scope = "https://www.googleapis.com/auth/youtube.upload";
const command = process.argv[2] || "url";

function requireCredentials() {
  if (!clientId || !clientSecret) {
    throw new Error("Faltan YOUTUBE_CLIENT_ID y YOUTUBE_CLIENT_SECRET en el entorno.");
  }
}

function authUrl() {
  requireCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function tokenFromCode(code) {
  requireCredentials();
  if (!code) throw new Error("Pasa el code como segundo argumento: npm run youtube:oauth-token -- \"CODE\"");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error_description || result.error || `Google OAuth respondió ${response.status}`);
  }
  return result;
}

try {
  if (command === "url") {
    console.log(authUrl());
  } else if (command === "token") {
    const result = await tokenFromCode(process.argv[3]);
    if (!result.refresh_token) {
      console.log(JSON.stringify(result, null, 2));
      console.error("\nGoogle no devolvió refresh_token. Revoca el acceso de la app o vuelve a ejecutar con prompt=consent.");
      process.exitCode = 1;
    } else {
      console.log(`YOUTUBE_REFRESH_TOKEN=${result.refresh_token}`);
    }
  } else {
    throw new Error("Comando no reconocido. Usa: url | token");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
