import fs from 'fs';
import fetch from 'node-fetch';
import dijkstra from 'dijkstrajs';
import path from 'path';

import { overpassUrl, query } from './query.js';
import { buildGraphForDijkstra, findNearestNode, areConnected, findConnectedComponents } from './utils/graph.js';
import { buildGeoJSONPath } from './utils/geojson.js';
import { haversineDistance } from './utils/haversine.js';

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

    const startLat =   51.46681902975696;
    const startLon = 19.571030370525943;

    const endLat = 51.46722369065393;
    const endLon =  19.601921146542217;

    const startNode = findNearestNode(startLat, startLon, nodes);
    const endNode = findNearestNode(endLat, endLon, nodes);

    console.log('Start node:', startNode);
    console.log('End node:', endNode);

    if (!startNode || !endNode) {
      console.log('Nie znaleziono węzłów start/meta.');
      return;
    }

    // Sprawdź czy węzły są w grafie
    const startKey = String(startNode);
    const endKey = String(endNode);
    console.log(`Węzeł startowy ma ${Object.keys(graph[startKey] || {}).length} połączeń`);
    console.log(`Węzeł końcowy ma ${Object.keys(graph[endKey] || {}).length} połączeń`);

    // Analiza składowych spójnych (opcjonalnie - może trwać długo dla dużych grafów)
    console.log('\nAnaliza składowych spójnych...');
    const components = findConnectedComponents(graph);
    console.log(`Graf ma ${components.length} składowych spójnych`);
    
    // Znajdź w której składowej są nasze węzły
    let startComponent = -1;
    let endComponent = -1;
    
    for (let i = 0; i < components.length; i++) {
      if (components[i].has(startKey)) startComponent = i;
      if (components[i].has(endKey)) endComponent = i;
    }
    
    console.log(`Węzeł startowy jest w składowej ${startComponent} (rozmiar: ${components[startComponent]?.size || 0})`);
    console.log(`Węzeł końcowy jest w składowej ${endComponent} (rozmiar: ${components[endComponent]?.size || 0})`);

    if (startComponent !== endComponent) {
      console.log('\n⚠️  PROBLEM: Węzły są w różnych składowych spójnych!');
      console.log('To oznacza, że drogi nie są połączone w danych OSM.');
      console.log('Możliwe przyczyny:');
      console.log('1. Zbyt restrykcyjne filtry w zapytaniu Overpass');
      console.log('2. Fizyczna przerwa w infrastrukturze rowerowej');
      console.log('3. Niewystarczający obszar zapytania');
      return;
    }

    console.log('\nWęzły są w tej samej składowej spójnej');
    console.log('Sprawdzam połączenia szczegółowo...');
    
    if (!areConnected(graph, startKey, endKey)) {
      console.log('Węzły nie są połączone w grafie (sprawdzenie awaryjne).');
      return;
    }

    console.log('Obliczam trasę...');
    const pathNodes = dijkstra.find_path(graph, startKey, endKey);

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
      totalDistance += haversineDistance(a.lat, a.lon, b.lat, b.lon);
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