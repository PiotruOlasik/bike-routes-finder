import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import dijkstra from 'dijkstrajs';

const overpassUrl = 'https://overpass-api.de/api/interpreter';

//Pobieramy różne typy dróg, nie tylko "cycleway"
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

//Budowanie grafu dla Dijkstry
function buildGraphForDijkstra(osmData) {
  const nodes = new Map();
  const graph = {};

  // Zapisz węzły
  for (const el of osmData.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  //Utwórz krawędzie (dwukierunkowe)
  for (const el of osmData.elements) {
    if (el.type === 'way' && el.nodes.length >= 2) {
      for (let i = 0; i < el.nodes.length - 1; i++) {
        const a = el.nodes[i];
        const b = el.nodes[i + 1];
        const nodeA = nodes.get(a);
        const nodeB = nodes.get(b);
        if (!nodeA || !nodeB) continue;

        const dist = Math.sqrt(
          Math.pow(nodeA.lat - nodeB.lat, 2) + Math.pow(nodeA.lon - nodeB.lon, 2)
        );

        if (!graph[a]) graph[a] = {};
        if (!graph[b]) graph[b] = {};

        graph[a][b] = dist;
        graph[b][a] = dist;
      }
    }
  }

  return { nodes, graph };
}

//Znajdź najbliższy węzeł
function findNearestNode(lat, lon, nodes) {
  let nearestId = null;
  let minDist = Infinity;
  for (const [id, node] of nodes.entries()) {
    const dist = Math.sqrt(Math.pow(node.lat - lat, 2) + Math.pow(node.lon - lon, 2));
    if (dist < minDist) {
      minDist = dist;
      nearestId = id;
    }
  }
  return nearestId;
}

//Sprawdzenie, czy start i meta są w tym samym komponencie grafu (BFS)
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

//Tworzenie GeoJSON z listy węzłów
function buildGeoJSONPath(path, nodes) {
  const coords = path.map(id => {
    const n = nodes.get(parseInt(id));
    return [n.lon, n.lat];
  });
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    ],
  };
}

//Główna funkcja
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

    const rawOutputPath = path.resolve('osm_raw.json');
    fs.writeFileSync(rawOutputPath, JSON.stringify(osmData, null, 2));
    console.log('Zapisano surowe dane do', rawOutputPath);

    const { nodes, graph } = buildGraphForDijkstra(osmData);
    console.log(`Węzłów: ${nodes.size}, Połączeń: ${Object.keys(graph).length}`);

    //Punkty start/meta
    const startLat = 53.01379;
    const startLon = 18.60413;

    const endLat = 53.01147;
    const endLon = 18.61330;

    const startNode = findNearestNode(startLat, startLon, nodes);
    const endNode = findNearestNode(endLat, endLon, nodes);

    console.log('Start node:', startNode, nodes.get(startNode));
    console.log('End node:', endNode, nodes.get(endNode));

    if (!startNode || !endNode) {
      console.log('Nie znaleziono węzłów start/meta.');
      return;
    }

    //Sprawdzenie, czy w ogóle istnieje połączenie
    console.log('Sprawdzam, czy węzły są połączone...');
    if (!areConnected(graph, String(startNode), String(endNode))) {
      console.log('Start i meta nie są połączone w grafie (inne komponenty).');
      return;
    }

    //Używanie Dijkstry
    console.log('Szukam najkrótszej trasy...');
    const pathNodes = dijkstra.find_path(graph, String(startNode), String(endNode));

    if (!pathNodes || pathNodes.length === 0) {
      console.log('Nie znaleziono ścieżki między punktami.');
      return;
    }

    console.log(`Znaleziono trasę o długości: ${pathNodes.length} węzłów.`);

    const routeGeoJSON = buildGeoJSONPath(pathNodes, nodes);
    const outputPath = path.resolve('route_cycleway.geojson');
    fs.writeFileSync(outputPath, JSON.stringify(routeGeoJSON, null, 2));
    console.log('Zapisano trasę do', outputPath);
  } catch (err) {
    console.error('Błąd:', err);
  }
}

main();
