// --- Global Variables (I hope I declared everything!) ---
let map;
let routeData = [];
let animationFrameId = null; // This is for smooth animation, not old-school setInterval!
let vehicleMarker;
let routePolyline; // The full path on the map
let drawnPathPolyline; // The red line showing where we've been

let currentPosition = null; // The vehicle's current interpolated position
let simulationStartTime = null; // When we hit play!

let totalDurationMs = 0; // Total time the route is supposed to take

// --- Math Functions (Stealing these from Stack Overflow, lol) ---

/**
 * Calculates distance in kilometers between two points. Essential for speed calculation!
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km - standard value!
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculates the bearing (angle/direction) from A to B. This makes the car rotate!
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
    const p1 = { lat: lat1, lon: lon1 };
    const p2 = { lat: lat2, lon: lon2 };
    const dLon = (p2.lon - p1.lon) * (Math.PI / 180);
    const latA = p1.lat * (Math.PI / 180);
    const latB = p2.lat * (Math.PI / 180);
    const y = Math.sin(dLon) * Math.cos(latB);
    const x = Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(dLon);
    let bearing = Math.atan2(y, x) * (180 / Math.PI);
    return (bearing + 360) % 360; // Make sure it's between 0 and 360 degrees
}

// --- Main Simulation Engine ---

/**
 * This runs on every frame to move the car smoothly (interpolation magic!).
 */
function animateVehicle(timestamp) {
    if (!simulationStartTime) {
        simulationStartTime = timestamp;
    }

    const elapsedMs = timestamp - simulationStartTime;
    
    // Total time that has passed since the start of our route data
    const totalTimeElapsedData = new Date(routeData[0].timestamp).getTime() + elapsedMs;

    // --- Check if we're done ---
    const endTime = new Date(routeData[routeData.length - 1].timestamp).getTime();
    if (totalTimeElapsedData >= endTime) {
        cancelAnimationFrame(animationFrameId); // Stop the loop!
        animationFrameId = null;
        document.getElementById('toggleButton').textContent = '🔄 Restart';
        currentPosition = routeData[routeData.length - 1];
        updateMarker(currentPosition, currentPosition, currentPosition); // Set final position
        return;
    }
    
    // --- Find the current route segment (p1 -> p2) ---
    let prevIndex = 0;
    let nextIndex = 1;
    let timeProgress_01 = 0; // How far along we are from p1 to p2 (0.0 to 1.0)

    for (let i = 0; i < routeData.length - 1; i++) {
        const t1 = new Date(routeData[i].timestamp).getTime();
        const t2 = new Date(routeData[i + 1].timestamp).getTime();
        
        if (totalTimeElapsedData >= t1 && totalTimeElapsedData <= t2) {
            prevIndex = i;
            nextIndex = i + 1;
            const segmentDuration = t2 - t1;
            const segmentElapsed = totalTimeElapsedData - t1;
            timeProgress_01 = segmentElapsed / segmentDuration; // Calculate progress!
            break;
        }
    }
    
    const p1 = routeData[prevIndex];
    const p2 = routeData[nextIndex];

    // --- Linearly Interpolate Position and Time ---
    // This makes the movement smooth between the dense manual points!
    const newLat = p1.latitude + (p2.latitude - p1.latitude) * timeProgress_01;
    const newLon = p1.longitude + (p2.longitude - p1.longitude) * timeProgress_01;
    const newTimestampMs = new Date(p1.timestamp).getTime() + (new Date(p2.timestamp).getTime() - new Date(p1.timestamp).getTime()) * timeProgress_01;

    const newPosition = {
        latitude: newLat,
        longitude: newLon,
        timestamp: new Date(newTimestampMs).toISOString()
    };
    
    // Send the new position and the segment points to update the map and UI
    updateMarker(newPosition, p1, p2);
    
    // Keep the loop going!
    animationFrameId = requestAnimationFrame(animateVehicle);
}

/**
 * Moves the car icon, rotates it, and updates the UI stats.
 */
function updateMarker(newPos, prevRoutePoint, nextRoutePoint) {
    const latlng = [newPos.latitude, newPos.longitude];
    
    // 1. Move the Car!
    vehicleMarker.setLatLng(latlng);
    
    // 2. Rotate the Car! 🤩
    if (prevRoutePoint && nextRoutePoint) {
        // Calculate the direction of the road segment
        const bearing = calculateBearing(prevRoutePoint.latitude, prevRoutePoint.longitude, nextRoutePoint.latitude, nextRoutePoint.longitude);
        
        const iconElement = vehicleMarker.getElement();
        if (iconElement) {
            // Because our PNG icon points UP (0 degrees), we apply the calculated bearing directly!
            // This is how we make it look like the car is following the road perfectly!
            iconElement.style.transform += ` rotate(${bearing}deg)`; 
        }
    }
    
    // 3. Draw the red path traveled!
    const currentPath = drawnPathPolyline.getLatLngs();
    // Only add a new point if we've moved a little bit (prevents a massive path array)
    if (currentPath.length === 0 || calculateDistance(currentPath.slice(-1)[0].lat, currentPath.slice(-1)[0].lng, newPos.latitude, newPos.longitude) > 0.0005) {
        drawnPathPolyline.addLatLng(latlng);
    }
    
    // 4. Update the coordinates, speed, and time display!
    updateMetadata(newPos, currentPosition); 
    
    // 5. Keep the map centered on the car (so we don't lose it!)
    map.setView(latlng, map.getZoom(), { animate: true, duration: 0.1 });
    
    // Update the current position for the next frame's calculation
    currentPosition = newPos;
}

/**
 * Puts the calculated data into the control panel.
 */
function updateMetadata(current, previous) {
    const coordEl = document.getElementById('currentCoordinate');
    const timestampEl = document.getElementById('currentTimestamp');
    const elapsedEl = document.getElementById('elapsedTime');
    const speedEl = document.getElementById('currentSpeed');

    // Update basic stats
    coordEl.textContent = `${current.latitude.toFixed(6)}, ${current.longitude.toFixed(6)}`;
    timestampEl.textContent = new Date(current.timestamp).toLocaleTimeString();

    if (previous) {
        const timeDiff_ms = new Date(current.timestamp) - new Date(previous.timestamp);
        const distance_km = calculateDistance(
            previous.latitude, previous.longitude,
            current.latitude, current.longitude
        );

        // Calculate Speed (Distance / Time)
        const timeDiff_h = timeDiff_ms / 3600000; // Convert ms to hours
        const speed_kmh = timeDiff_h > 0 ? (distance_km / timeDiff_h).toFixed(2) : '0.00';
        speedEl.textContent = speed_kmh;
        
        // Calculate Elapsed Time
        const startTime = new Date(routeData[0].timestamp);
        const elapsedTime_ms = new Date(current.timestamp) - startTime;
        const totalSeconds = Math.floor(elapsedTime_ms / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        elapsedEl.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    } else {
        // Initial values
        speedEl.textContent = '0.00';
        elapsedEl.textContent = '00:00:00';
    }
}


/**
 * Handles Play, Pause, and Restart!
 */
function toggleSimulation() {
    const button = document.getElementById('toggleButton');

    // If it's running, STOP!
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        simulationStartTime = null; 
        button.textContent = '▶️ Play Simulation';
        return;
    }

    // If it finished, let's reset to the start!
    if (currentPosition && routeData.length > 0 && 
        currentPosition.latitude === routeData[routeData.length - 1].latitude && 
        currentPosition.longitude === routeData[routeData.length - 1].longitude) {
        
        currentPosition = routeData[0];
        // Clear the red path
        drawnPathPolyline.setLatLngs([[currentPosition.latitude, currentPosition.longitude]]);
        
        const initialCenter = [routeData[0].latitude, routeData[0].longitude];
        vehicleMarker.setLatLng(initialCenter);
        updateMetadata(currentPosition, null); // Reset stats
    }
    
    // START/RESUME! 🚀
    simulationStartTime = null; 
    animationFrameId = requestAnimationFrame(animateVehicle);
    button.textContent = '⏸️ Pause Simulation';
}

/**
 * Sets up the map, the initial polylines, and the car icon.
 */
async function initMap() {
    // Get the start point to center the map!
    const initialCenter = [routeData[0].latitude, routeData[0].longitude];
    
    // Initialize the map with a good zoom level for the route
    map = L.map('map').setView(initialCenter, 13); // Zoom 13 is good for driving!

    // Calculate total time for the progress bar logic
    const startTime = new Date(routeData[0].timestamp).getTime();
    const endTime = new Date(routeData[routeData.length - 1].timestamp).getTime();
    totalDurationMs = endTime - startTime;

    // Use standard OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // 1. Draw the full planned route (the gray line)
    const fullRouteCoords = routeData.map(p => [p.latitude, p.longitude]);
    routePolyline = L.polyline(fullRouteCoords, {
        color: 'gray',
        weight: 3,
        opacity: 0.5,
        dashArray: '5, 5'
    }).addTo(map);
    
    // 2. The red line showing where the car has traveled (starts empty)
    drawnPathPolyline = L.polyline([initialCenter], {
        color: 'red',
        weight: 5,
        opacity: 0.9
    }).addTo(map);
    
    // 3. The awesome Car Icon! 🥳
    const vehicleIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png', // Public car icon
        iconSize: [30, 30],      
        iconAnchor: [15, 15],    // Center the icon!
        className: 'vehicle-icon'
    });
    
    // Place the car marker at the start
    vehicleMarker = L.marker(initialCenter, { 
        icon: vehicleIcon,
        autoPan: false // Let our script handle the centering
    }).addTo(map);

    // Zoom out just enough to see the whole route!
    map.fitBounds(routePolyline.getBounds());
    
    // Set the initial metadata
    currentPosition = routeData[0];
    updateMetadata(currentPosition, null);

    // Hook up the button click!
    document.getElementById('toggleButton').addEventListener('click', toggleSimulation);
}

/**
 * The function that starts everything by fetching the dummy data!
 */
async function loadData() {
    try {
        const response = await fetch('dummy-route.json'); // Go grab the data!
        routeData = await response.json();
        
        if (routeData.length > 1) { 
            initMap(); // Woohoo, data loaded, let's start the map!
        } else {
            console.error("Oops! Need at least two points in dummy-route.json!");
        }
    } catch (error) {
        console.error("Failed to load route data! Did you spell the file name right?", error);
    }
}

// LETS GO! Call the starting function!
loadData();