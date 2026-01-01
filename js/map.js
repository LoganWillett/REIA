import { money } from "./calcs.js";

const GEO_CACHE_KEY = "reia_geo_cache_v1";

function loadCache(){
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function saveCache(cache){
  localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
}

/**
 * Nominatim is public and limited. We only call it on explicit button clicks.
 * See usage policy for limits and identifying headers. Browsers send default UA; we
 * rely on Referer and local caching to reduce load. 
 */
export async function geocode(query, setStatus){
  const q = (query ?? "").trim();
  if (!q) return null;

  const cache = loadCache();
  if (cache[q]) return cache[q];

  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q);
  setStatus?.("Geocoding…");
  const res = await fetch(url, { headers: { "Accept": "application/json" }});
  if (!res.ok) throw new Error("Geocoding failed: " + res.status);
  const data = await res.json();
  const hit = data?.[0];
  if (!hit) return null;

  const out = { lat: Number(hit.lat), lng: Number(hit.lon), displayName: hit.display_name };
  cache[q] = out;
  saveCache(cache);
  return out;
}

export function initMap(el, setStatus){
  if (!window.L) {
    setStatus?.("Leaflet failed to load (check internet / CSP).", true);
    return null;
  }

  const map = L.map(el).setView([44.0582, -121.3153], 11); // default: Central OR
  // Use the official OSM tile URL and keep attribution visible. 
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const marker = L.marker([44.0582, -121.3153], { draggable: true }).addTo(map);

  return { map, marker };
}

export function setMarker(ctx, lat, lng){
  if (!ctx) return;
  ctx.marker.setLatLng([lat, lng]);
  ctx.map.setView([lat, lng], 15);
}
