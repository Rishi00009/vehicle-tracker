// --- Global Variables ---
let map;
let routeData = [];
let animationFrameId = null;
let vehicleMarker;
let routePolyline;
let drawnPathPolyline;
let currentPosition = null;
let simulationStartTime = null;

// --- Configuration ---
const MAPTILER_API_KEY = 'NebpWhfRjG47rqyXjvhn'; // 🔑 API key
const MAPTILER_MAP_ID = 'streets-v2';
const START_COORD = [78.08272, 10.95761]; // Karur
const END_COORD = [78.15530, 11.04150];   // Paramathi Velur
const TOTAL_SIMULATION_MINUTES = 5;       // Adjust speed (smaller = faster)

// --- Math Utilities ---
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x =
    Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// --- Route Fetching ---
async function fetchRouteFromAPI() {
  const profile = 'driving';
  const apiUrl = `https://api.maptiler.com/routing/${profile}/${START_COORD.join(',')};${END_COORD.join(',')}.geojson?key=${MAPTILER_API_KEY}`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();

    if (!data.features || !data.features[0]) throw new Error('No route data found');
    const geometry = data.features[0].geometry.coordinates;
    const intervalMs = (TOTAL_SIMULATION_MINUTES * 60 * 1000) / (geometry.length - 1);
    const startTime = new Date();

    return geometry.map((coord, i) => ({
      latitude: coord[1],
      longitude: coord[0],
      timestamp: new Date(startTime.getTime() + i * intervalMs).toISOString()
    }));
  } catch (err) {
    console.error(err);
    alert('Failed to fetch route. Using fallback.');
    return [
      { latitude: START_COORD[1], longitude: START_COORD[0], timestamp: new Date().toISOString() },
      { latitude: END_COORD[1], longitude: END_COORD[0], timestamp: new Date(Date.now() + 60000).toISOString() }
    ];
  }
}

// --- Simulation ---
function animateVehicle(timestamp) {
  if (!simulationStartTime) simulationStartTime = timestamp;
  const elapsedMs = timestamp - simulationStartTime;
  const totalStart = new Date(routeData[0].timestamp).getTime();
  const totalEnd = new Date(routeData[routeData.length - 1].timestamp).getTime();
  const currentTime = totalStart + elapsedMs;

  if (currentTime >= totalEnd) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    document.getElementById('toggleButton').textContent = '🔄 Restart';
    return;
  }

  let prev, next;
  for (let i = 0; i < routeData.length - 1; i++) {
    const t1 = new Date(routeData[i].timestamp).getTime();
    const t2 = new Date(routeData[i + 1].timestamp).getTime();
    if (currentTime >= t1 && currentTime <= t2) {
      prev = routeData[i];
      next = routeData[i + 1];
      break;
    }
  }

  if (!prev || !next) return;

  const progress =
    (currentTime - new Date(prev.timestamp).getTime()) /
    (new Date(next.timestamp).getTime() - new Date(prev.timestamp).getTime());

  const newLat = prev.latitude + (next.latitude - prev.latitude) * progress;
  const newLon = prev.longitude + (next.longitude - prev.longitude) * progress;

  const newPos = {
    latitude: newLat,
    longitude: newLon,
    timestamp: new Date(currentTime).toISOString()
  };

  updateMarker(newPos, prev, next);
  animationFrameId = requestAnimationFrame(animateVehicle);
}

function updateMarker(newPos, prev, next) {
  const latlng = [newPos.latitude, newPos.longitude];
  vehicleMarker.setLatLng(latlng);

  if (prev && next) {
    const bearing = calculateBearing(prev.latitude, prev.longitude, next.latitude, next.longitude);
    const iconElement = vehicleMarker.getElement();
    if (iconElement) {
      iconElement.style.transform = `rotate(${bearing - 90}deg)`; // ✅ Correct alignment
    }
  }

  drawnPathPolyline.addLatLng(latlng);
  updateMetadata(newPos, currentPosition);
  map.panTo(latlng, { animate: true, duration: 0.2 });
  currentPosition = newPos;
}

function updateMetadata(current, previous) {
  const coordEl = document.getElementById('currentCoordinate');
  const timestampEl = document.getElementById('currentTimestamp');
  const elapsedEl = document.getElementById('elapsedTime');
  const speedEl = document.getElementById('currentSpeed');

  coordEl.textContent = `${current.latitude.toFixed(6)}, ${current.longitude.toFixed(6)}`;
  timestampEl.textContent = new Date(current.timestamp).toLocaleTimeString();

  if (previous) {
    const dist = calculateDistance(previous.latitude, previous.longitude, current.latitude, current.longitude);
    const timeDiff = (new Date(current.timestamp) - new Date(previous.timestamp)) / 3600000;
    const speed = (timeDiff > 0 ? dist / timeDiff : 0).toFixed(1);
    speedEl.textContent = speed;
  }

  const start = new Date(routeData[0].timestamp);
  const elapsed = (new Date(current.timestamp) - start) / 1000;
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = Math.floor(elapsed % 60);
  elapsedEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Simulation Controls ---
function toggleSimulation() {
  const button = document.getElementById('toggleButton');
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    button.textContent = '▶️ Play Simulation';
    return;
  }

  if (currentPosition && currentPosition.latitude === routeData[routeData.length - 1].latitude) {
    currentPosition = routeData[0];
    drawnPathPolyline.setLatLngs([[currentPosition.latitude, currentPosition.longitude]]);
    vehicleMarker.setLatLng([currentPosition.latitude, currentPosition.longitude]);
    updateMetadata(currentPosition, null);
  }

  simulationStartTime = null;
  animationFrameId = requestAnimationFrame(animateVehicle);
  button.textContent = '⏸️ Pause Simulation';
}

// --- Map Initialization ---
function initMap() {
  const start = [routeData[0].latitude, routeData[0].longitude];
  map = L.map('map').setView(start, 13);

  L.tileLayer(`https://api.maptiler.com/maps/${MAPTILER_MAP_ID}/{z}/{x}/{y}.png?key=${MAPTILER_API_KEY}`, {
    tileSize: 512,
    zoomOffset: -1,
    attribution: '&copy; MapTiler & OpenStreetMap contributors'
  }).addTo(map);

  const routeCoords = routeData.map(p => [p.latitude, p.longitude]);
  routePolyline = L.polyline(routeCoords, { color: 'gray', weight: 3, dashArray: '5,5', opacity: 0.5 }).addTo(map);
  drawnPathPolyline = L.polyline([start], { color: 'red', weight: 5 }).addTo(map);

  const vehicleIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/2972/2972185.png',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    className: 'vehicle-icon'
  });

  vehicleMarker = L.marker(start, { icon: vehicleIcon }).addTo(map);
  currentPosition = routeData[0];
  updateMetadata(currentPosition, null);

  document.getElementById('toggleButton').addEventListener('click', toggleSimulation);
  map.fitBounds(routePolyline.getBounds());
}

// --- Start Simulation ---
async function startSimulation() {
  routeData = await fetchRouteFromAPI();
  initMap();
}

startSimulation();
