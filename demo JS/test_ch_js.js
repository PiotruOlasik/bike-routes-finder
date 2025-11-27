import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import dijkstra from 'dijkstrajs';

const overpassUrl = 'https://overpass-api.de/api/interpreter';

// Zapytanie OSM
const query = `
[out:json][timeout:25];
area["name"="Toruń"][admin_level=8];
(
  way["highway"~"cycleway|path|footway|residential|service|track|living_street"](area);
);
out body;
>;
out skel qt;
`;

// --- FUNKCJA HAVERSINE (odległość w metrach) ---
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // promień Ziemi w metrach
  const toRad = d => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- BUDOWANIE GRAFU ---
function buildGraphForDijkstra(osmData) {
  const nodes = new Map();
  const graph = {};

  // zapisujemy węzły
  for (const el of osmData.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  // tworzymy krawędzie
  for (const el of osmData.elements) {
    if (el.type === 'way' && el.nodes.length >= 2) {
      for (let i = 0; i < el.nodes.length - 1; i++) {
        const a = el.nodes[i];
        const b = el.nodes[i + 1];
        const nodeA = nodes.get(a);
        const nodeB = nodes.get(b);

        if (!nodeA || !nodeB) continue;

        const dist = haversineDistance(nodeA.lat, nodeA.lon, nodeB.lat, nodeB.lon);

        const keyA = a.toString();
        const keyB = b.toString();

        if (!graph[keyA]) graph[keyA] = {};
        if (!graph[keyB]) graph[keyB] = {};

        graph[keyA][keyB] = dist;
        graph[keyB][keyA] = dist;

      }
    }
  }

  return { nodes, graph };
}

// --- NAJBLIŻSZY WĘZEŁ ---
function findNearestNode(lat, lon, nodes) {
  let nearestId = null;
  let minDist = Infinity;

  for (const [id, node] of nodes.entries()) {
    const dist = haversineDistance(lat, lon, node.lat, node.lon);
    if (dist < minDist) {
      minDist = dist;
      nearestId = id;
    }
  }

  return nearestId;
}

// --- SPRAWDZENIE, CZY WĘZŁY SĄ POŁĄCZONE ---
function areConnected(graph, start, end) {
  const visited = new Set();
  const queue = [start];

  while (queue.length > 0) {
    const node = queue.shift();
    if (node === end) return true;

    visited.add(node);

    for (const neighbor in graph[node] || {}) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return false;
}

// --- TWORZENIE GEOJSON ---
function buildGeoJSONPath(path, nodes, totalDistance) {
  const coords = path.map(id => {
    const n = nodes.get(parseInt(id));
    return [n.lon, n.lat];
  });

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          distance_km: totalDistance / 1000,  // dodaj dystans w km
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    ],
  };
}


// --- GŁÓWNA FUNKCJA ---
async function main() {
  try {
    console.log('Pobieram dane z Overpass API...');
    const response = await fetch(overpassUrl, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
    });

    if (!response.ok) throw new Error(`Błąd pobierania: ${response.statusText}`);

    const osmData = await response.json();
    console.log('Dane OSM pobrane.');

    fs.writeFileSync('osm_raw.json', JSON.stringify(osmData, null, 2));

    const { nodes, graph } = buildGraphForDijkstra(osmData);
    console.log(`Węzłów: ${nodes.size}, Połączeń: ${Object.keys(graph).length}`);

    // --- Punkty startu i mety ---
    const startLat = 53.01379;
    const startLon = 18.60413;

    const endLat = 53.01147;
    const endLon = 18.61330;

    const startNode = findNearestNode(startLat, startLon, nodes);
    const endNode = findNearestNode(endLat, endLon, nodes);

    console.log('Start node:', startNode);
    console.log('End node:', endNode);

    if (!startNode || !endNode) {
      console.log('Nie znaleziono węzłów start/meta.');
      return;
    }

    console.log('Sprawdzam połączenia...');
    if (!areConnected(graph, String(startNode), String(endNode))) {
      console.log('Węzły nie są połączone w grafie.');
      return;
    }

    // --- Najkrótsza trasa ---
    console.log('Obliczam trasę...');
    const pathNodes = dijkstra.find_path(graph, String(startNode), String(endNode));

    if (!pathNodes || pathNodes.length === 0) {
      console.log('Nie znaleziono trasy.');
      return;
    }

    console.log(`Trasa zawiera ${pathNodes.length} węzłów.`);

    // --- OBLICZANIE DŁUGOŚCI TRASY ---
    let totalDistance = 0;
    for (let i = 0; i < pathNodes.length - 1; i++) {
      const a = nodes.get(parseInt(pathNodes[i]));
      const b = nodes.get(parseInt(pathNodes[i + 1]));
      totalDistance += haversineDistance(a.lat, a.lon, b.lat, b.lon);
    }

    console.log(`Długość trasy: ${(totalDistance / 1000).toFixed(3)} km`);

    // --- Zapis GeoJSON ---
    const routeGeoJSON = buildGeoJSONPath(pathNodes, nodes);
    fs.writeFileSync('route_cycleway.geojson', JSON.stringify(routeGeoJSON, null, 2));

    console.log('Zapisano route_cycleway.geojson');
  } catch (err) {
    console.error('Błąd:', err);
  }
}

main();
