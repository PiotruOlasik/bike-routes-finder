import fetch from 'node-fetch';
import { overpassUrl, query } from './query.js';
import { buildGraphForDijkstra } from './utils/graph.js';
import { 
  generateRouteForProportion, 
  saveBestRoute, 
  printComparisonTable 
} from './utils/routeGenerator.js';

/**
 * Główny program - Generator okrężnych tras rowerowych w kształcie kwadratu
 */
async function main() {
  try {
    // ==================== KONFIGURACJA ====================
    const config = {
      targetRouteLength: 10000,  // Docelowa długość trasy w metrach (10 km)
      startLat: 51.4668,         // Szerokość geograficzna punktu startowego
      startLon: 19.5710,         // Długość geograficzna punktu startowego
      
      // Proporcje do przetestowania: stosunek długość_trasy : obwód_kwadratu
      // 10:7 = zwarta trasa (mniejszy kwadrat, dłuższe obejście)
      // 10:6 = rozległa trasa (większy kwadrat, krótsze obejście)
      proportions: [
        { value: 7.0, name: "10:7" },
        { value: 6.5, name: "10:6.5" },
        { value: 6.0, name: "10:6" }
      ]
    };
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 GENERATOR OKRĘŻNYCH TRAS ROWEROWYCH (KWADRAT)`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📏 Docelowa długość trasy: ${config.targetRouteLength / 1000} km`);
    console.log(`📍 Punkt startowy: ${config.startLat}, ${config.startLon}`);
    console.log(`🔢 Liczba proporcji do testu: ${config.proportions.length}`);
    console.log(`${'='.repeat(60)}\n`);

    // ==================== KROK 1: Pobierz dane OSM ====================
    console.log('🌍 KROK 1: Pobieram dane z Overpass API...');
    const response = await fetch(overpassUrl, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
    });

    if (!response.ok) {
      throw new Error(`Błąd pobierania: ${response.statusText}`);
    }

    const osmData = await response.json();
    console.log('    ✅ Dane OSM pobrane pomyślnie');
    console.log(`    📊 Elementów: ${osmData.elements.length}\n`);

    // ==================== KROK 2: Zbuduj graf ====================
    console.log('🔨 KROK 2: Buduję graf z metadanymi...');
    const { nodes, graph, wayMetadata } = buildGraphForDijkstra(osmData);
    console.log(`    ✅ Graf zbudowany`);
    console.log(`    📍 Węzłów: ${nodes.size}`);
    console.log(`    🔗 Krawędzi: ${Object.keys(graph).length}\n`);

    // ==================== KROK 3: Generuj trasy dla różnych proporcji ====================
    console.log('🎲 KROK 3: Testuję różne proporcje...\n');
    const allResults = [];
    
    for (const proportion of config.proportions) {
      const result = await generateRouteForProportion(
        graph,
        nodes,
        config.startLon,
        config.startLat,
        config.targetRouteLength,
        proportion.value,
        proportion.name
      );
      
      allResults.push(result);
    }

    // ==================== KROK 4: Porównaj wyniki ====================
    console.log('\n📊 KROK 4: Porównuję wyniki...');
    const bestResult = printComparisonTable(allResults, config.targetRouteLength);

    // ==================== KROK 5: Zapisz najlepszą trasę ====================
    if (bestResult) {
      console.log('\n💾 KROK 5: Zapisuję najlepszą trasę...');
      const outputFile = saveBestRoute(
        bestResult, 
        config.startLon, 
        config.startLat, 
        allResults
      );
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ GOTOWE! Trasa wygenerowana');
      console.log('='.repeat(60));
      console.log(`📁 Plik: ${outputFile}`);
      console.log(`📏 Długość: ${(bestResult.actualLength / 1000).toFixed(1)} km`);
      console.log(`🎯 Dokładność: ${(100 - bestResult.lengthDifferencePercent).toFixed(1)}%`);
      console.log(`🔢 Proporcja: 10:${bestResult.proportionDenominator}`);
      console.log(`📐 Obwód kwadratu: ${(bestResult.squarePerimeter / 1000).toFixed(1)} km`);
      console.log(`📏 Bok kwadratu: ${(bestResult.sideLength / 1000).toFixed(2)} km`);
      console.log('='.repeat(60));
      
      console.log('\n💡 DALSZE KROKI:');
      console.log('   1. Otwórz plik w geojson.io:');
      console.log('      → Przeciągnij best_circular_route.geojson na https://geojson.io');
      console.log('   2. Lub otwórz w QGIS/innej aplikacji GIS');
      console.log('   3. Możesz wyczyścić duplikaty (opcjonalnie):');
      console.log('      → Użyj funkcji cleanBestCircularRoute() z routeCleaner.js\n');
    } else {
      console.log('\n❌ Nie udało się wygenerować żadnej trasy');
      console.log('💡 Możliwe przyczyny:');
      console.log('   - Brak połączenia drogowego w tym obszarze');
      console.log('   - Zbyt duża odległość do pokonania');
      console.log('   - Graf jest fragmentaryczny\n');
      console.log('🔧 Spróbuj:');
      console.log('   - Zmienić punkt startowy (config.startLat, config.startLon)');
      console.log('   - Zmienić docelową długość trasy (config.targetRouteLength)');
      console.log('   - Dodać więcej proporcji do testu (config.proportions)\n');
    }

  } catch (err) {
    console.error('\n❌ BŁĄD:', err.message);
    console.error('Stack trace:', err.stack);
    process.exit(1);
  }
}

// Uruchom program
main();