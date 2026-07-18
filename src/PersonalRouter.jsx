import { useEffect, useMemo, useState } from "react";

const ROUTER_CACHE_KEY = "personal-router-cache-v1";
const ROUTER_USAGE_KEY = "personal-router-usage-v1";
const ROUTER_PREFS_KEY = "personal-router-prefs-v1";
const ROUTER_HISTORY_KEY = "personal-router-history-v1";
const ROUTER_CACHE_TTL_MS = 20 * 60 * 1000;
const ROUTER_DAILY_LIMIT = 80;
const ROUTER_MAX_HISTORY_ITEMS = 200;

function api(path, options = {}) {
  return fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(body.error || body.message || `HTTP ${response.status}`));
    return body;
  });
}

function parseDuration(value) {
  const match = String(value || "").match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : 0;
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(Number(seconds || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

function formatDistance(meters) {
  const km = Number(meters || 0) / 1000;
  return `${km.toFixed(1)} km`;
}

function formatToll(amount, currency = "EUR") {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) return "Sin peaje";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(value);
}

function readCache() {
  try {
    const data = JSON.parse(localStorage.getItem(ROUTER_CACHE_KEY) || "{}");
    // Cleanup: Remove entries older than 24 hours
    const now = Date.now();
    const cleaned = Object.entries(data).reduce((acc, [key, entry]) => {
      if (now - Number(entry.createdAt || 0) < 24 * 60 * 60 * 1000) {
        acc[key] = entry;
      }
      return acc;
    }, {});
    if (Object.keys(cleaned).length < Object.keys(data).length) {
      writeCache(cleaned);
    }
    return cleaned;
  } catch {
    localStorage.removeItem(ROUTER_CACHE_KEY);
    return {};
  }
}

function writeCache(value) {
  try {
    const json = JSON.stringify(value);
    // Rough size check: if exceeds ~200KB, trim oldest entries
    if (json.length > 200 * 1024) {
      const entries = Object.entries(value).sort((a, b) => Number(b[1].createdAt) - Number(a[1].createdAt));
      const trimmed = Object.fromEntries(entries.slice(0, Math.floor(entries.length / 2)));
      localStorage.setItem(ROUTER_CACHE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(ROUTER_CACHE_KEY, json);
    }
  } catch (err) {
    // Storage quota exceeded or disabled
    localStorage.removeItem(ROUTER_CACHE_KEY);
  }
}

function readUsage() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTER_USAGE_KEY) || "{}");
    if (parsed.day !== today) return { day: today, calls: 0 };
    return { day: today, calls: Number(parsed.calls || 0) };
  } catch {
    return { day: today, calls: 0 };
  }
}

function bumpUsage() {
  const usage = readUsage();
  const next = { ...usage, calls: usage.calls + 1 };
  localStorage.setItem(ROUTER_USAGE_KEY, JSON.stringify(next));
  return next;
}

function defaultPrefs() {
  return {
    timeVsToll: "time",
    maxExtraMinutes: 15,
    maxTollEur: 15,
    maxDistanceKm: 600,
  };
}

function readPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTER_PREFS_KEY) || "{}");
    return {
      ...defaultPrefs(),
      ...parsed,
    };
  } catch {
    return defaultPrefs();
  }
}

function writePrefs(value) {
  localStorage.setItem(ROUTER_PREFS_KEY, JSON.stringify(value));
}

function readDecisionHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTER_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDecisionHistory(items) {
  try {
    localStorage.setItem(ROUTER_HISTORY_KEY, JSON.stringify(items.slice(-ROUTER_MAX_HISTORY_ITEMS)));
  } catch (err) {
    // Storage quota exceeded, silently fail
  }
}

function routeCacheKey(origin, destination) {
  const hourBucket = new Date().toISOString().slice(0, 13);
  return `${origin.trim().toLowerCase()}|${destination.trim().toLowerCase()}|${hourBucket}`;
}

function decodePolyline(encoded = "") {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coordinates;
}

function representativeWaypoints(points, count = 8) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const inner = points.slice(1, -1);
  if (inner.length <= count) return inner;
  return Array.from({ length: count }, (_, index) => {
    const target = Math.round(((index + 1) * (inner.length + 1)) / (count + 1)) - 1;
    return inner[Math.max(0, Math.min(target, inner.length - 1))];
  });
}

function mapsDirUrl(route, originText, destinationText) {
  const points = decodePolyline(route?.polyline || "");
  const first = points[0];
  const last = points[points.length - 1];
  const origin = first ? `${first.lat},${first.lng}` : originText;
  const destination = last ? `${last.lat},${last.lng}` : destinationText;
  const intermediates = representativeWaypoints(points)
    .map((point) => `${point.lat},${point.lng}`)
    .join("|");
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (intermediates) params.set("waypoints", intermediates);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function tollWeightFromChoice(value) {
  return value === "toll" ? 0.75 : 0.25;
}

function scoreRoutes(routes, preference) {
  if (!routes.length) return [];
  const minDuration = Math.min(...routes.map((route) => route.durationSeconds));
  const minToll = Math.min(...routes.map((route) => route.tollAmount || 0));
  const tollWeight = tollWeightFromChoice(preference);
  const timeWeight = 1 - tollWeight;
  return routes
    .map((route) => {
      const durationFactor = route.durationSeconds / Math.max(1, minDuration);
      const tollFactor = ((route.tollAmount || 0) + 1) / (Math.max(0, minToll) + 1);
      const score = (durationFactor * timeWeight) + (tollFactor * tollWeight);
      return { ...route, score };
    })
    .sort((left, right) => left.score - right.score);
}

function applyHardCaps(routes, { maxExtraMinutes, maxTollEur, maxDistanceKm }) {
  if (!routes.length) return [];
  const fastest = Math.min(...routes.map((route) => route.durationSeconds));
  return routes.map((route) => {
    const extraMinutes = (route.durationSeconds - fastest) / 60;
    const overTime = Number.isFinite(maxExtraMinutes) && maxExtraMinutes >= 0 && extraMinutes > maxExtraMinutes;
    const overToll = Number.isFinite(maxTollEur) && maxTollEur >= 0 && (route.tollAmount || 0) > maxTollEur;
    const overDistance = Number.isFinite(maxDistanceKm) && maxDistanceKm >= 0 && (route.distanceMeters / 1000) > maxDistanceKm;
    return {
      ...route,
      rejected: overTime || overToll || overDistance,
      rejectionReason: [
        overTime ? `+${Math.ceil(extraMinutes)} min sobre el tope` : "",
        overToll ? "peaje sobre el tope" : "",
        overDistance ? "distancia sobre el tope" : "",
      ].filter(Boolean).join(" · "),
    };
  });
}

export default function PersonalRouter() {
  const prefs = useMemo(() => readPrefs(), []);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originPlaceId, setOriginPlaceId] = useState("");
  const [destinationPlaceId, setDestinationPlaceId] = useState("");
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [originLookupError, setOriginLookupError] = useState("");
  const [destinationLookupError, setDestinationLookupError] = useState("");
  const [timeVsToll, setTimeVsToll] = useState(prefs.timeVsToll);
  const [maxExtraMinutes, setMaxExtraMinutes] = useState(prefs.maxExtraMinutes);
  const [maxTollEur, setMaxTollEur] = useState(prefs.maxTollEur);
  const [maxDistanceKm, setMaxDistanceKm] = useState(prefs.maxDistanceKm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [usage, setUsage] = useState(() => readUsage());
  const [source, setSource] = useState("none");
  const [decisionReason, setDecisionReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [insight, setInsight] = useState({ text: "", action: "" });
  const [history, setHistory] = useState(() => readDecisionHistory());

  const scoredRoutes = useMemo(() => {
    const scored = scoreRoutes(routes, timeVsToll);
    const capped = applyHardCaps(scored, {
      maxExtraMinutes: Number(maxExtraMinutes),
      maxTollEur: Number(maxTollEur),
      maxDistanceKm: Number(maxDistanceKm),
    });
    return capped;
  }, [routes, timeVsToll, maxExtraMinutes, maxTollEur, maxDistanceKm]);

  const recommended = scoredRoutes.find((route) => !route.rejected) || null;
  const selectedRoute = scoredRoutes.find((route) => route.id === selectedRouteId)
    || recommended
    || scoredRoutes[0]
    || null;

  useEffect(() => {
    const query = origin.trim();
    if (query.length < 3) {
      setOriginSuggestions([]);
      setOriginLookupError("");
      return undefined;
    }
    const timer = setTimeout(() => {
      api(`/routes/autocomplete?q=${encodeURIComponent(query)}`)
        .then((payload) => {
          setOriginSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
          setOriginLookupError("");
        })
        .catch((lookupError) => {
          setOriginSuggestions([]);
          setOriginLookupError(String(lookupError.message || "No se pudo autocompletar origen"));
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [origin]);

  useEffect(() => {
    const query = destination.trim();
    if (query.length < 3) {
      setDestinationSuggestions([]);
      setDestinationLookupError("");
      return undefined;
    }
    const timer = setTimeout(() => {
      api(`/routes/autocomplete?q=${encodeURIComponent(query)}`)
        .then((payload) => {
          setDestinationSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
          setDestinationLookupError("");
        })
        .catch((lookupError) => {
          setDestinationSuggestions([]);
          setDestinationLookupError(String(lookupError.message || "No se pudo autocompletar destino"));
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [destination]);

  useEffect(() => {
    writePrefs({
      timeVsToll,
      maxExtraMinutes: Number(maxExtraMinutes),
      maxTollEur: Number(maxTollEur),
      maxDistanceKm: Number(maxDistanceKm),
    });
  }, [timeVsToll, maxExtraMinutes, maxTollEur, maxDistanceKm]);

  async function compareRoutes(event) {
    event.preventDefault();
    const cleanOrigin = origin.trim();
    const cleanDestination = destination.trim();
    if (!cleanOrigin || !cleanDestination) {
      setError("Indica origen y destino.");
      return;
    }
    if (cleanOrigin === cleanDestination) {
      setError("Origen y destino no pueden ser iguales.");
      return;
    }
    setError("");
    setLoading(true);
    const timeoutId = setTimeout(() => {
      setError("Timeout: La comparación de rutas tardó demasiado. Intenta de nuevo.");
      setLoading(false);
    }, 15000); // 15 second timeout
    
    try {
      const key = routeCacheKey(cleanOrigin, cleanDestination);
      const cache = readCache();
      const entry = cache[key];
      if (entry && Date.now() - Number(entry.createdAt || 0) < ROUTER_CACHE_TTL_MS) {
        const cachedRoutes = entry.routes || [];
        if (!cachedRoutes.length) {
          setError("No se encontraron rutas en caché. Intenta de nuevo.");
          clearTimeout(timeoutId);
          setLoading(false);
          return;
        }
        setRoutes(cachedRoutes);
        setSelectedRouteId("");
        setSource("cache");
        clearTimeout(timeoutId);
        return;
      }
      const payload = await api("/routes/compare", {
        method: "POST",
        body: JSON.stringify({
          origin: originPlaceId ? `place_id:${originPlaceId}` : cleanOrigin,
          destination: destinationPlaceId ? `place_id:${destinationPlaceId}` : cleanDestination,
          alternatives: 3,
        }),
      });
      const normalizedRoutes = (payload.routes || []).map((route, index) => ({
        id: route.id || `route-${index}`,
        durationSeconds: Number(route.durationSeconds || parseDuration(route.duration)),
        distanceMeters: Number(route.distanceMeters || 0),
        tollAmount: Number(route.tollAmount || 0),
        tollCurrency: route.tollCurrency || "EUR",
        polyline: String(route.polyline || ""),
        labels: Array.isArray(route.labels) ? route.labels : [],
      }));
      
      if (!normalizedRoutes.length) {
        setError("No se encontraron rutas. Verifica origen y destino.");
        clearTimeout(timeoutId);
        setLoading(false);
        return;
      }
      
      setRoutes(normalizedRoutes);
      setSelectedRouteId("");
      cache[key] = { createdAt: Date.now(), routes: normalizedRoutes };
      writeCache(cache);
      setUsage(bumpUsage());
      setSource("live");
    } catch (compareError) {
      const errorMsg = String(compareError.message || "No se pudo comparar rutas.");
      const userFriendlyMsg = 
        errorMsg.includes("API key not valid") ? "Error: API key inválida. Contacta al soporte." :
        errorMsg.includes("INVALID_ARGUMENT") ? "Verifica que origen y destino sean válidos." :
        errorMsg.includes("PERMISSION_DENIED") ? "Error de permisos. Contacta al soporte." :
        errorMsg.includes("NOT_FOUND") ? "Ruta no encontrada entre estos puntos." :
        errorMsg;
      setError(userFriendlyMsg);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  function openInGoogleMaps() {
    if (!selectedRoute) return;
    const normalizedReason = decisionReason === "other"
      ? String(customReason || "").trim()
      : decisionReason;
    const finalReason = normalizedReason || (selectedRoute.id === recommended?.id ? "recomendada" : "manual");
    const nextEntry = {
      ts: Date.now(),
      origin: origin.trim(),
      destination: destination.trim(),
      recommendedId: recommended?.id || "",
      selectedId: selectedRoute.id,
      reason: finalReason,
    };
    const nextHistory = [...history, nextEntry].slice(-ROUTER_MAX_HISTORY_ITEMS);
    writeDecisionHistory(nextHistory);
    setHistory(nextHistory);
    const recent = nextHistory.slice(-20);
    const repeats = recent.filter((item) => item.reason === finalReason).length;
    if (repeats >= 3) {
      if (finalReason === "quiero menos peaje" && timeVsToll !== "toll") {
        setInsight({ text: "Sueles priorizar peaje. ¿Ajusto a 'Ahorrar peaje' por defecto?", action: "prefer-toll" });
      } else if (finalReason === "quiero llegar antes" && timeVsToll !== "time") {
        setInsight({ text: "Sueles priorizar tiempo. ¿Ajusto a 'Ahorrar tiempo' por defecto?", action: "prefer-time" });
      } else if (finalReason === "demasiados km" && Number(maxDistanceKm) > 0) {
        setInsight({ text: "Repites 'demasiados km'. ¿Bajo el tope de distancia un 15%?", action: "reduce-distance" });
      } else if (finalReason === "mucho tiempo extra" && Number(maxExtraMinutes) > 0) {
        setInsight({ text: "Repites 'mucho tiempo extra'. ¿Bajo el tope de minutos extra un 20%?", action: "reduce-extra-minutes" });
      }
    }
    const url = mapsDirUrl(selectedRoute, origin, destination);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function applyInsight() {
    if (insight.action === "prefer-toll") setTimeVsToll("toll");
    if (insight.action === "prefer-time") setTimeVsToll("time");
    if (insight.action === "reduce-distance") setMaxDistanceKm((current) => Math.max(50, Math.round(Number(current || 0) * 0.85)));
    if (insight.action === "reduce-extra-minutes") setMaxExtraMinutes((current) => Math.max(0, Math.round(Number(current || 0) * 0.8)));
    setInsight({ text: "", action: "" });
  }

  const manualChoices = history.filter((item) => item.selectedId && item.selectedId !== item.recommendedId).length;

  return (
    <main className="router-shell">
      <section className="panel router-panel">
        <div className="panel-heading compact">
          <span className="section-mark blue" />
          <div>
            <strong>Enrutador personal V1</strong>
            <small>Compara rutas con tus criterios y abre Google Maps para conducir.</small>
          </div>
        </div>

        <form className="router-form" onSubmit={compareRoutes}>
          <label htmlFor="router-origin">
            Origen
            <input
              id="router-origin"
              value={origin}
              onChange={(event) => {
                setOrigin(event.target.value);
                setOriginPlaceId("");
              }}
              placeholder="Ej.: Gijón"
              autoComplete="off"
              aria-describedby={originLookupError ? "origin-error" : originPlaceId ? "origin-valid" : undefined}
            />
            {!!originSuggestions.length && (
              <div className="router-suggestions" role="listbox">
                {originSuggestions.map((item) => (
                  <button
                    key={item.placeId}
                    type="button"
                    role="option"
                    onClick={() => {
                      setOrigin(item.description);
                      setOriginPlaceId(item.placeId);
                      setOriginSuggestions([]);
                      setOriginLookupError("");
                    }}
                    aria-label={`${item.mainText || item.description}${item.secondaryText ? `, ${item.secondaryText}` : ""}`}
                  >
                    <strong>{item.mainText || item.description}</strong>
                    {item.secondaryText ? <small>{item.secondaryText}</small> : null}
                  </button>
                ))}
              </div>
            )}
            {originLookupError && <small id="origin-error" className="router-note error">{originLookupError}</small>}
            {originPlaceId && <small id="origin-valid" className="router-note ok">✓ Origen validado</small>}
          </label>
          <label htmlFor="router-destination">
            Destino
            <input
              id="router-destination"
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value);
                setDestinationPlaceId("");
              }}
              placeholder="Ej.: Madrid"
              autoComplete="off"
              aria-describedby={destinationLookupError ? "destination-error" : destinationPlaceId ? "destination-valid" : undefined}
            />
            {!!destinationSuggestions.length && (
              <div className="router-suggestions" role="listbox">
                {destinationSuggestions.map((item) => (
                  <button
                    key={item.placeId}
                    type="button"
                    role="option"
                    onClick={() => {
                      setDestination(item.description);
                      setDestinationPlaceId(item.placeId);
                      setDestinationSuggestions([]);
                      setDestinationLookupError("");
                    }}
                    aria-label={`${item.mainText || item.description}${item.secondaryText ? `, ${item.secondaryText}` : ""}`}
                  >
                    <strong>{item.mainText || item.description}</strong>
                    {item.secondaryText ? <small>{item.secondaryText}</small> : null}
                  </button>
                ))}
              </div>
            )}
            {destinationLookupError && <small id="destination-error" className="router-note error">{destinationLookupError}</small>}
            {destinationPlaceId && <small id="destination-valid" className="router-note ok">✓ Destino validado</small>}
          </label>
          <label htmlFor="router-pref">
            ¿Qué pesa más?
            <select id="router-pref" value={timeVsToll} onChange={(event) => setTimeVsToll(event.target.value)}>
              <option value="time">Ahorrar tiempo</option>
              <option value="toll">Ahorrar peaje</option>
            </select>
          </label>
          <label htmlFor="router-maxtime">
            Tope extra (min)
            <input
              id="router-maxtime"
              type="number"
              min="0"
              value={maxExtraMinutes}
              onChange={(event) => setMaxExtraMinutes(event.target.value)}
              aria-label="Máximo minutos adicionales permitidos"
            />
          </label>
          <label htmlFor="router-maxtoll">
            Tope peaje (€)
            <input
              id="router-maxtoll"
              type="number"
              min="0"
              step="0.5"
              value={maxTollEur}
              onChange={(event) => setMaxTollEur(event.target.value)}
              aria-label="Máximo peaje permitido en euros"
            />
          </label>
          <label htmlFor="router-maxdist">
            Tope distancia (km)
            <input
              id="router-maxdist"
              type="number"
              min="0"
              value={maxDistanceKm}
              onChange={(event) => setMaxDistanceKm(event.target.value)}
              aria-label="Máximo distancia permitida en kilómetros"
            />
          </label>
          <div className="router-actions">
            <button 
              className="button primary" 
              type="submit" 
              disabled={loading}
              aria-busy={loading}
              aria-label={loading ? "Comparando rutas..." : "Comparar rutas"}
            >
              {loading ? "Comparando..." : "Comparar rutas"}
            </button>
            <span 
              className={`router-usage ${usage.calls >= ROUTER_DAILY_LIMIT ? "warning" : ""}`}
              role="status"
              aria-label={`${usage.calls} de ${ROUTER_DAILY_LIMIT} llamadas en vivo usadas hoy`}
            >
              {usage.calls}/{ROUTER_DAILY_LIMIT} llamadas live hoy
            </span>
            {source !== "none" && (
              <span className="router-source" role="status">
                {source === "cache" ? "Resultado desde caché local" : "Resultado en vivo"}
              </span>
            )}
          </div>
        </form>

        {error && <div className="global-error" role="alert" aria-live="assertive">{error}</div>}

        {!!scoredRoutes.length && (
          <section className="router-results">
            {scoredRoutes.map((route, index) => {
              const selected = selectedRoute?.id === route.id;
              const recommendedRoute = recommended?.id === route.id;
              return (
                <article key={route.id} className={`router-route-card ${selected ? "selected" : ""} ${route.rejected ? "rejected" : ""}`}>
                  <header>
                    <strong>Ruta {index + 1}</strong>
                    {recommendedRoute && <span className="router-badge">Recomendada</span>}
                    {route.rejected && <span className="router-badge muted">Descartada por topes</span>}
                  </header>
                  <div className="router-route-metrics">
                    <span>{formatDuration(route.durationSeconds)}</span>
                    <span>{formatDistance(route.distanceMeters)}</span>
                    <span>{formatToll(route.tollAmount, route.tollCurrency)}</span>
                  </div>
                  <small>Score: {route.score.toFixed(3)}</small>
                  {route.rejected && <small className="router-reason">{route.rejectionReason}</small>}
                  <button className="button ghost" type="button" onClick={() => setSelectedRouteId(route.id)}>
                    Elegir esta ruta
                  </button>
                </article>
              );
            })}
          </section>
        )}

        {insight.text && (
          <div className="router-insight">
            <span>{insight.text}</span>
            <button className="button ghost" type="button" onClick={applyInsight}>Aplicar</button>
            <button className="button ghost" type="button" onClick={() => setInsight({ text: "", action: "" })}>Ignorar</button>
          </div>
        )}

        <div className="router-handoff">
          <div className="router-handoff-left">
            <p>Google Maps puede ajustar el tramo entre puntos. Se envían hasta 8 puntos intermedios representativos.</p>
            <small>Historial local: {history.length} decisiones · {manualChoices} elecciones manuales</small>
          </div>
          <div className="router-handoff-right">
            <select value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)}>
              <option value="">Motivo de elección (opcional)</option>
              <option value="recomendada">Me quedo con recomendada</option>
              <option value="quiero menos peaje">Quiero menos peaje</option>
              <option value="quiero llegar antes">Quiero llegar antes</option>
              <option value="demasiados km">Demasiados km</option>
              <option value="mucho tiempo extra">Mucho tiempo extra</option>
              <option value="other">Otro motivo</option>
            </select>
            {decisionReason === "other" && (
              <input
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                placeholder="Escribe el motivo"
              />
            )}
            <button className="button primary" type="button" onClick={openInGoogleMaps} disabled={!selectedRoute}>
              Abrir ruta elegida en Google Maps
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
