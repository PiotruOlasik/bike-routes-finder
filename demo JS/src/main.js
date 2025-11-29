import fs from 'fs';
import fetch from 'node-fetch';
import dijkstra from 'dijkstrajs';
import path from 'path';

import { overpassUrl, query } from './query.js';
import { 
  buildGraphForDijkstra, 
  findNearestNode, 
  areConnected, 
  findConnectedComponents,
  extractRouteMetadata 
} from './utils/graph.js';
import { buildGeoJSONPath, buildDetailedGeoJSON } from './utils/geojson.js';
import { haversineDistance } from './utils/haversine.js';
import { evaluateRoute, bikeTypes } from './utils/bikeRules.js';

async function main() {
  try {
    // ============================================
    // KONFIGURACJA - ZMIEŃ TUTAJ
    // ============================================
    const bikeType = 'szosowy'; // Opcje: 'miejski', 'trekkingowy', 'górski', 'szosowy'
    const saveDetailedGeoJSON = true; // Czy zapisać szczegółowy GeoJSON z segmentami
    
    // Współrzędne start i meta - ZMIEŃ NA SWOJE
    const startLat = 51.46681902975696;
    const startLon = 19.571030370525943;
    const endLat = 51.46722369065393;
    const endLon = 19.601921146542217;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚴 PLANOWANIE TRASY ROWEROWEJ`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Typ roweru: ${bikeType}`);
    console.log(`Start: ${startLat}, ${startLon}`);
    console.log(`Meta:  ${endLat}, ${endLon}`);
    console.log(`${'='.repeat(60)}\n`);

    // ============================================
    // KROK 1: Pobierz dane z Overpass API
    // ============================================
    console.log('📡 KROK 1: Pobieram dane z Overpass API...');
    const response = await fetch(overpassUrl, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
    });

    if (!response.ok) {
      throw new Error(`Błąd pobierania: ${response.statusText}`);
    }

    const osmData = await response.json();
    console.log('   ✅ Dane OSM pobrane pomyślnie');
    console.log(`   📊 Elementów: ${osmData.elements.length}`);

    // Zapisz surowe dane (opcjonalnie, do debugowania)
    fs.writeFileSync('osm_raw.json', JSON.stringify(osmData, null, 2));
    console.log('   💾 Zapisano osm_raw.json\n');

    // ============================================
    // KROK 2: Buduj graf z metadanymi
    // ============================================
    console.log('🔨 KROK 2: Buduję graf z metadanymi...');
    const { nodes, graph, wayMetadata } = buildGraphForDijkstra(osmData);
    console.log(`   ✅ Graf zbudowany`);
    console.log(`   🔵 Węzłów: ${nodes.size}`);
    console.log(`   🔗 Krawędzi (węzłów z połączeniami): ${Object.keys(graph).length}`);
    console.log(`   📋 Metadanych dróg: ${wayMetadata.size}\n`);

    // ============================================
    // KROK 3: Znajdź najbliższe węzły
    // ============================================
    console.log('🎯 KROK 3: Szukam najbliższych węzłów do punktów start/meta...');
    const startNode = findNearestNode(startLat, startLon, nodes);
    const endNode = findNearestNode(endLat, endLon, nodes);

    if (!startNode || !endNode) {
      console.log('   ❌ Nie znaleziono węzłów start/meta.');
      console.log('   💡 Spróbuj zmienić współrzędne lub poszerzyć obszar zapytania.');
      return;
    }

    console.log(`   ✅ Węzeł startowy: ${startNode}`);
    console.log(`   ✅ Węzeł końcowy: ${endNode}\n`);

    // ============================================
    // KROK 4: Sprawdź połączenia węzłów
    // ============================================
    const startKey = String(startNode);
    const endKey = String(endNode);
    
    console.log('🔗 KROK 4: Sprawdzam połączenia węzłów...');
    const startConnections = Object.keys(graph[startKey] || {}).length;
    const endConnections = Object.keys(graph[endKey] || {}).length;
    
    console.log(`   🔵 Węzeł startowy ma ${startConnections} połączeń`);
    console.log(`   🔵 Węzeł końcowy ma ${endConnections} połączeń`);

    if (startConnections === 0 || endConnections === 0) {
      console.log('   ⚠️  UWAGA: Jeden z węzłów nie ma połączeń!');
    }
    console.log('');

    // ============================================
    // KROK 5: Analiza składowych spójnych
    // ============================================
    console.log('🧩 KROK 5: Analiza składowych spójnych...');
    const components = findConnectedComponents(graph);
    console.log(`   📊 Graf ma ${components.length} składowych spójnych`);
    
    // Pokaż informacje o największych składowych
    console.log('   📋 Największe składowe:');
    for (let i = 0; i < Math.min(5, components.length); i++) {
      console.log(`      ${i + 1}. Składowa: ${components[i].size} węzłów`);
    }
    
    // Znajdź w której składowej są nasze węzły
    let startComponent = -1;
    let endComponent = -1;
    
    for (let i = 0; i < components.length; i++) {
      if (components[i].has(startKey)) startComponent = i;
      if (components[i].has(endKey)) endComponent = i;
    }
    
    console.log(`   🎯 Węzeł startowy jest w składowej #${startComponent + 1} (rozmiar: ${components[startComponent]?.size || 0})`);
    console.log(`   🎯 Węzeł końcowy jest w składowej #${endComponent + 1} (rozmiar: ${components[endComponent]?.size || 0})`);

    if (startComponent !== endComponent) {
      console.log('\n   ⚠️  PROBLEM: Węzły są w różnych składowych spójnych!');
      console.log('   ❌ To oznacza, że drogi nie są połączone w danych OSM.');
      console.log('   💡 Możliwe przyczyny:');
      console.log('      1. Zbyt restrykcyjne filtry w zapytaniu Overpass');
      console.log('      2. Fizyczna przerwa w infrastrukturze rowerowej');
      console.log('      3. Niewystarczający obszar zapytania');
      console.log('      4. Błędy w danych OpenStreetMap');
      return;
    }

    console.log('   ✅ Węzły są w tej samej składowej spójnej\n');

    // ============================================
    // KROK 6: Weryfikacja połączenia BFS
    // ============================================
    console.log('🔍 KROK 6: Weryfikacja połączenia (BFS)...');
    if (!areConnected(graph, startKey, endKey)) {
      console.log('   ❌ Węzły nie są połączone w grafie (sprawdzenie awaryjne).');
      return;
    }
    console.log('');

    // ============================================
    // KROK 7: Oblicz najkrótszą trasę (Dijkstra)
    // ============================================
    console.log('🗺️  KROK 7: Obliczam najkrótszą trasę (algorytm Dijkstry)...');
    const pathNodes = dijkstra.find_path(graph, startKey, endKey);

    if (!pathNodes || pathNodes.length === 0) {
      console.log('   ❌ Nie znaleziono trasy.');
      return;
    }

    console.log(`   ✅ Znaleziono trasę!`);
    console.log(`   📊 Trasa zawiera ${pathNodes.length} węzłów\n`);

    // ============================================
    // KROK 8: Oblicz długość trasy
    // ============================================
    console.log('📏 KROK 8: Obliczam długość trasy...');
    let totalDistance = 0;
    for (let i = 0; i < pathNodes.length - 1; i++) {
      const a = nodes.get(parseInt(pathNodes[i]));
      const b = nodes.get(parseInt(pathNodes[i + 1]));
      totalDistance += haversineDistance(a.lat, a.lon, b.lat, b.lon);
    }

    console.log(`   ✅ Długość trasy: ${(totalDistance / 1000).toFixed(3)} km`);
    console.log(`   📊 Średnia długość segmentu: ${(totalDistance / (pathNodes.length - 1)).toFixed(1)} m\n`);

    // ============================================
    // KROK 9: Wydobądź metadane trasy
    // ============================================
    console.log('🔍 KROK 9: Analizuję nawierzchnię i metadane...');
    const routeMetadata = extractRouteMetadata(pathNodes, wayMetadata);
    
    const uniqueSurfaces = [...new Set(routeMetadata.surfaces)];
    const uniqueHighways = [...new Set(routeMetadata.highways)];
    
    console.log(`   📋 Nawierzchnie na trasie (${uniqueSurfaces.length}):`);
    uniqueSurfaces.forEach(s => {
      const count = routeMetadata.surfaces.filter(x => x === s).length;
      const percentage = ((count / routeMetadata.surfaces.length) * 100).toFixed(1);
      console.log(`      - ${s}: ${count} segmentów (${percentage}%)`);
    });
    
    console.log(`   📋 Typy dróg (${uniqueHighways.length}): ${uniqueHighways.join(', ')}\n`);

    // ============================================
    // KROK 10: Oceń trasę pod kątem typu roweru
    // ============================================
    console.log('⚖️  KROK 10: Oceniam trasę pod kątem typu roweru...');
    const evaluation = evaluateRoute(routeMetadata.surfaces, bikeType);
    console.log(`   ${evaluation.message}`);
    
    if (evaluation.notAllowedSurfaces && evaluation.notAllowedSurfaces.length > 0) {
      console.log(`   ❌ Niedozwolone nawierzchnie: ${evaluation.notAllowedSurfaces.join(', ')}`);
    }
    
    if (evaluation.unknownSurfaces) {
      const percentage = ((evaluation.unknownSurfaces / evaluation.totalSegments) * 100).toFixed(1);
      console.log(`   ⚠️  Segmentów z nieznaną nawierzchnią: ${evaluation.unknownSurfaces}/${evaluation.totalSegments} (${percentage}%)`);
    }
    
    if (evaluation.allSurfaces && evaluation.allSurfaces.length > 0) {
      console.log(`   ✅ Dozwolone nawierzchnie na trasie: ${evaluation.allSurfaces.join(', ')}`);
    }
    console.log('');

    // ============================================
    // KROK 11: Zapisz pliki GeoJSON
    // ============================================
    console.log('💾 KROK 11: Zapisuję pliki GeoJSON...');
    
    // Prosty GeoJSON (główna trasa)
    const routeGeoJSON = buildGeoJSONPath(
      pathNodes, 
      nodes, 
      totalDistance, 
      routeMetadata, 
      bikeType, 
      evaluation
    );
    const outputPath = path.join(process.cwd(), 'public', 'route_cycleway.geojson');
    fs.writeFileSync(outputPath, JSON.stringify(routeGeoJSON, null, 2));
    console.log('   ✅ route_cycleway.geojson - prosty GeoJSON z trasą');

    // Szczegółowy GeoJSON (z segmentami)
    if (saveDetailedGeoJSON) {
      const detailedGeoJSON = buildDetailedGeoJSON(
        pathNodes, 
        nodes, 
        routeMetadata, 
        totalDistance, 
        bikeType, 
        evaluation
      );
      const detailedPath = path.join(process.cwd(), 'public', 'route_detailed.geojson');
      fs.writeFileSync(detailedPath, JSON.stringify(detailedGeoJSON, null, 2));
      console.log('   ✅ route_detailed.geojson - szczegółowy GeoJSON z segmentami');
    }

    // ============================================
    // PODSUMOWANIE
    // ============================================
    console.log(`\n${'='.repeat(60)}`);
    console.log('✨ GOTOWE! Podsumowanie:');
    console.log(`${'='.repeat(60)}`);
    console.log(`🚲 Typ roweru:        ${bikeType}`);
    console.log(`📏 Długość trasy:     ${(totalDistance / 1000).toFixed(3)} km`);
    console.log(`🔵 Węzłów na trasie:  ${pathNodes.length}`);
    console.log(`📊 Segmentów:         ${routeMetadata.segments.length}`);
    console.log(`🛣️  Nawierzchnie:      ${uniqueSurfaces.join(', ')}`);
    console.log(`${evaluation.status === 'success' ? '✅' : evaluation.status === 'warning' ? '⚠️' : '❌'} Status:           
      ${evaluation.status.toUpperCase()}`);
    console.log(`${'='.repeat(60)}`);
    console.log('💡 Otwórz public/map.html w przeglądarce, aby zobaczyć trasę!\n');

  } catch (err) {
    console.error('\n❌ BŁĄD:', err.message);
    console.error('Stack trace:', err.stack);
  }
}

main();