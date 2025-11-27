import fs from 'fs';
import fetch from 'node-fetch';
import dijkstra from 'dijkstrajs';
import path from 'path';

import { overpassUrl, query } from './query.js';
import { buildGraphForDijkstra, findNearestNode, areConnected } from './utils/graph.js';
import { buildGeoJSONPath } from './utils/geojson.js';

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

    console.log('Obliczam trasę...');
    const pathNodes = dijkstra.find_path(graph, String(startNode), String(endNode));

    if (!pathNodes || pathNodes.length === 0) {
      console.log('Nie znaleziono trasy.');
      return;
    }

    console.log(`Trasa zawiera ${pathNodes.length} węzłów.`);

    // Oblicz długość trasy
    let totalDistance = 0;
    for (let i = 0; i < pathNodes.length - 1; i++) {
      const a = nodes.get(parseInt(pathNodes[i]));
      const b = nodes.get(parseInt(pathNodes[i + 1]));
      totalDistance +=
        Math.sqrt(
          (a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2
        ); // możesz zostawić haversine jeśli wolisz
    }

    console.log(`Długość trasy: ${(totalDistance / 1000).toFixed(3)} km`);

    const routeGeoJSON = buildGeoJSONPath(pathNodes, nodes, totalDistance);
    const outputPath = path.join(process.cwd(), 'public', 'route_cycleway.geojson');
    fs.writeFileSync(outputPath, JSON.stringify(routeGeoJSON, null, 2));

    console.log('Zapisano route_cycleway.geojson');
  } catch (err) {
    console.error('Błąd:', err);
  }
}

main();
