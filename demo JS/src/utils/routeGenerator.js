import fs from 'fs';
import dijkstra from 'dijkstrajs';
import { haversineDistance } from './haversine.js';

/**
 * Oblicza wierzchołki kwadratu o podanej długości boku
 * @param {number} startLon - Długość geograficzna punktu startowego
 * @param {number} startLat - Szerokość geograficzna punktu startowego
 * @param {number} sideLength - Długość boku kwadratu w metrach
 * @returns {Array<Array<number>>} Tablica współrzędnych [lon, lat] wierzchołków
 */
function calculateSquareCorners(startLon, startLat, sideLength) {
  const R = 6371000; // Promień Ziemi w metrach
  const corners = [];
  let currentLon = startLon;
  let currentLat = startLat;

  // Kierunki: północ → wschód → południe → zachód
  const bearings = [0, 90, 180, 270];

  for (const bearing of bearings) {
    corners.push([currentLon, currentLat]);

    // Konwersja na radiany
    const latRad = (currentLat * Math.PI) / 180;
    const lonRad = (currentLon * Math.PI) / 180;
    const bearingRad = (bearing * Math.PI) / 180;

    // Odległość kątowa
    const angularDistance = sideLength / R;

    // Nowa szerokość geograficzna
    const newLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
    );

    // Nowa długość geograficzna
    const newLonRad = lonRad + Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(newLatRad)
    );

    currentLon = (newLonRad * 180) / Math.PI;
    currentLat = (newLatRad * 180) / Math.PI;
  }

  return corners;
}

/**
 * Oblicza obwód kwadratu i długość boku na podstawie docelowej długości trasy
 * @param {number} targetRouteLength - Docelowa długość trasy w metrach
 * @param {number} proportionDenominator - Mianownik proporcji (dla 10:X)
 * @returns {Object} { squarePerimeter, sideLength }
 */
function calculateSquareDimensions(targetRouteLength, proportionDenominator) {
  // Obwód kwadratu = (proportion_denominator/10) * długość_trasy
  const squarePerimeter = (proportionDenominator / 10) * targetRouteLength;

  // Długość boku kwadratu = obwód / 4
  const sideLength = squarePerimeter / 4;

  return { squarePerimeter, sideLength };
}

/**
 * Znajduje najbliższy węzeł w grafie dla danego punktu
 * @param {number} lon - Długość geograficzna
 * @param {number} lat - Szerokość geograficzna
 * @param {Map} nodes - Mapa węzłów
 * @returns {number|null} ID najbliższego węzła
 */
function findNearestNodeInGraph(lon, lat, nodes) {
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

/**
 * Znajduje ścieżkę unikając zakazanych krawędzi
 * @param {Object} graph - Graf
 * @param {number} startNode - ID węzła startowego
 * @param {number} endNode - ID węzła końcowego
 * @param {Set<string>} forbiddenEdges - Zbiór zakazanych krawędzi
 * @returns {Array<number>|null} Tablica ID węzłów lub null
 */
function findPathAvoidingEdges(graph, startNode, endNode, forbiddenEdges) {
  // Tworzymy tymczasowy graf bez zakazanych krawędzi
  const tempGraph = {};
  
  for (const node in graph) {
    tempGraph[node] = {};
    for (const neighbor in graph[node]) {
      const edgeKey1 = `${node}-${neighbor}`;
      const edgeKey2 = `${neighbor}-${node}`;
      
      if (!forbiddenEdges.has(edgeKey1) && !forbiddenEdges.has(edgeKey2)) {
        tempGraph[node][neighbor] = graph[node][neighbor];
      }
    }
  }

  try {
    const path = dijkstra.find_path(tempGraph, startNode.toString(), endNode.toString());
    return path.map(id => parseInt(id));
  } catch (error) {
    console.log('Ostrzeżenie: Używam alternatywnej ścieżki (może powtarzać niektóre odcinki)');
    try {
      const path = dijkstra.find_path(graph, startNode.toString(), endNode.toString());
      return path.map(id => parseInt(id));
    } catch (err) {
      return null;
    }
  }
}

/**
 * Znajduje okrężną trasę przez wszystkie wierzchołki bez powtarzania ścieżek
 * @param {Object} graph - Graf
 * @param {Map} nodes - Mapa węzłów
 * @param {Array<Array<number>>} corners - Współrzędne wierzchołków kwadratu
 * @returns {Array<number>} Tablica ID węzłów trasy lub pusta tablica
 */
function findCircularRoute(graph, nodes, corners) {
  // Znajdź najbliższe węzły dla każdego wierzchołka
  const cornerNodes = corners.map(([lon, lat]) => 
    findNearestNodeInGraph(lon, lat, nodes)
  );

  // Znajdź ścieżki między kolejnymi wierzchołkami
  const routeSegments = [];
  const usedEdges = new Set();

  for (let i = 0; i < cornerNodes.length; i++) {
    const startNode = cornerNodes[i];
    const endNode = cornerNodes[(i + 1) % cornerNodes.length];

    const segment = findPathAvoidingEdges(graph, startNode, endNode, usedEdges);
    
    if (!segment || segment.length === 0) {
      console.log(`Ostrzeżenie: Nie znaleziono ścieżki między wierzchołkami ${i} i ${(i + 1) % cornerNodes.length}`);
      return [];
    }

    // Dodaj segment bez ostatniego węzła (będzie pierwszym następnego)
    routeSegments.push(...segment.slice(0, -1));
    
    // Dodaj użyte krawędzie do zbioru
    for (let j = 0; j < segment.length - 1; j++) {
      usedEdges.add(`${segment[j]}-${segment[j + 1]}`);
      usedEdges.add(`${segment[j + 1]}-${segment[j]}`);
    }
  }

  // Dodaj ostatni węzeł aby zamknąć pętlę
  routeSegments.push(routeSegments[0]);

  return routeSegments;
}

/**
 * Oblicza całkowitą długość trasy
 * @param {Object} graph - Graf
 * @param {Array<number>} path - Tablica ID węzłów
 * @param {Map} nodes - Mapa węzłów
 * @returns {number} Długość trasy w metrach
 */
function calculateRouteLength(graph, path, nodes) {
  let totalLength = 0;
  
  for (let i = 0; i < path.length - 1; i++) {
    const u = path[i].toString();
    const v = path[i + 1].toString();
    
    if (graph[u] && graph[u][v]) {
      totalLength += graph[u][v];
    }
  }

  return totalLength;
}

/**
 * Generuje trasę dla danej proporcji
 * @param {Object} graph - Graf
 * @param {Map} nodes - Mapa węzłów
 * @param {number} startLon - Długość geograficzna startu
 * @param {number} startLat - Szerokość geograficzna startu
 * @param {number} targetRouteLength - Docelowa długość trasy w metrach
 * @param {number} proportionDenominator - Mianownik proporcji
 * @param {string} proportionName - Nazwa proporcji (np. "10:7")
 * @returns {Object|null} Wynik generowania trasy lub null
 */
async function generateRouteForProportion(
  graph, 
  nodes, 
  startLon, 
  startLat, 
  targetRouteLength, 
  proportionDenominator, 
  proportionName
) {
  console.log(`\n--- Generowanie trasy dla proporcji 10:${proportionDenominator} ---`);
  
  // Oblicz wymiary kwadratu
  const { squarePerimeter, sideLength } = calculateSquareDimensions(
    targetRouteLength, 
    proportionDenominator
  );
  
  console.log(`Proporcja: 10:${proportionDenominator}`);
  console.log(`Obwód kwadratu: ${(squarePerimeter / 1000).toFixed(1)} km`);
  console.log(`Długość boku kwadratu: ${sideLength.toFixed(0)} m`);
  
  // Wygeneruj wierzchołki kwadratu
  const corners = calculateSquareCorners(startLon, startLat, sideLength);
  
  // Znajdź okrężną trasę
  const routeNodes = findCircularRoute(graph, nodes, corners);
  
  if (!routeNodes || routeNodes.length === 0) {
    console.log(`Nie udało się znaleźć kompletnej trasy dla proporcji 10:${proportionDenominator}`);
    return null;
  }
  
  // Oblicz rzeczywistą długość trasy
  const actualRouteLength = calculateRouteLength(graph, routeNodes, nodes);
  
  // Oblicz różnicę względem docelowej długości
  const lengthDifference = Math.abs(actualRouteLength - targetRouteLength);
  const lengthDifferencePercent = (lengthDifference / targetRouteLength) * 100;
  
  // Konwersja na współrzędne
  const routeCoords = routeNodes.map(nodeId => {
    const node = nodes.get(nodeId);
    return [node.lat, node.lon];
  });
  
  const result = {
    proportionName,
    proportionDenominator,
    targetLength: targetRouteLength,
    actualLength: actualRouteLength,
    squarePerimeter,
    sideLength,
    corners,
    routeNodes,
    routeCoords,
    lengthDifference,
    lengthDifferencePercent,
    success: true
  };
  
  console.log(`Rzeczywista długość trasy: ${(actualRouteLength / 1000).toFixed(1)} km`);
  console.log(`Różnica względem docelowej: ${(lengthDifference / 1000).toFixed(1)} km (${lengthDifferencePercent.toFixed(1)}%)`);
  
  return result;
}

/**
 * Zapisuje najlepszą trasę do pliku GeoJSON
 * @param {Object} bestResult - Wynik najlepszej trasy
 * @param {number} startLon - Długość geograficzna startu
 * @param {number} startLat - Szerokość geograficzna startu
 * @param {Array<Object>} allResults - Wszystkie wyniki tras
 * @returns {string|undefined} Nazwa pliku wyjściowego lub undefined
 */
function saveBestRoute(bestResult, startLon, startLat, allResults) {
  if (!bestResult) {
    console.log('Brak udanych tras do zapisania');
    return;
  }
  
  const outputFile = 'best_circular_route.geojson';
  
  // Tworzymy listę punktów wierzchołków kwadratu
  const cornerFeatures = bestResult.corners.map(([lon, lat], i) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [lon, lat]
    },
    properties: {
      name: `Wierzchołek ${i}`,
      description: `Wierzchołek kwadratu ${i}`,
      'marker-color': '#FF0000',
      'marker-symbol': i
    }
  }));
  
  // Tworzymy opis z porównaniem wszystkich proporcji
  let comparisonText = 'Porównanie proporcji:\n';
  for (const result of allResults) {
    if (result && result.success) {
      comparisonText += `10:${result.proportionDenominator}: ${(result.actualLength / 1000).toFixed(1)}km (różnica: ${result.lengthDifferencePercent.toFixed(1)}%)\n`;
    }
  }
  
  const geojsonData = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: bestResult.routeCoords.map(([lat, lon]) => [lon, lat])
        },
        properties: {
          name: `Okrężna trasa rowerowa - proporcja 10:${bestResult.proportionDenominator}`,
          length_m: Math.round(bestResult.actualLength),
          description: `Ścieżka rowerowa ${(bestResult.actualLength / 1000).toFixed(1)}km zaczynająca się i kończąca w tym samym punkcie. ${comparisonText}`,
          start_point: `${startLon}, ${startLat}`,
          target_length: `${(bestResult.targetLength / 1000).toFixed(1)} km`,
          proportion: `10:${bestResult.proportionDenominator}`,
          length_difference_percent: Math.round(bestResult.lengthDifferencePercent * 10) / 10,
          stroke: '#0000FF',
          'stroke-width': 4
        }
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [startLon, startLat]
        },
        properties: {
          name: 'Punkt startowy/końcowy',
          description: `Współrzędne: ${startLon.toFixed(6)}, ${startLat.toFixed(6)}`,
          'marker-color': '#00FF00',
          'marker-symbol': 'circle'
        }
      },
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [...bestResult.corners, bestResult.corners[0]]
        },
        properties: {
          name: 'Kształt kwadratu',
          description: `Teoretyczny kształt kwadratu ${(bestResult.squarePerimeter / 1000).toFixed(1)}km (4 x ${(bestResult.sideLength / 1000).toFixed(1)}km)`,
          stroke: '#FF0000',
          'stroke-width': 2,
          'stroke-dasharray': '5,5'
        }
      },
      ...cornerFeatures
    ]
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(geojsonData, null, 2));
  
  console.log(`\nNajlepsza trasa zapisana do: ${outputFile}`);
  return outputFile;
}

/**
 * Wyświetla tabelę porównawczą wszystkich proporcji
 * @param {Array<Object>} allResults - Wszystkie wyniki tras
 * @param {number} targetLength - Docelowa długość trasy w metrach
 * @returns {Object|null} Najlepszy wynik lub null
 */
function printComparisonTable(allResults, targetLength) {
  console.log('\n' + '='.repeat(80));
  console.log('PORÓWNANIE WSZYSTKICH PROPORCJI');
  console.log('='.repeat(80));
  console.log(`${'Proporcja'.padEnd(12)} ${'Długość trasy'.padEnd(15)} ${'Różnica'.padEnd(12)} ${'Odchylenie'.padEnd(12)} ${'Status'.padEnd(10)}`);
  console.log('-'.repeat(80));
  
  const successfulResults = [];
  
  for (const result of allResults) {
    if (result && result.success) {
      successfulResults.push(result);
      const status = 'SUKCES';
      console.log(
        `10:${result.proportionDenominator.toString().padEnd(10)} ` +
        `${(result.actualLength / 1000).toFixed(1).padStart(6)} km     ` +
        `${(result.lengthDifference / 1000).toFixed(1).padStart(5)} km     ` +
        `${result.lengthDifferencePercent.toFixed(1).padStart(5)}%       ` +
        `${status.padEnd(10)}`
      );
    } else {
      const proportion = result ? result.proportionDenominator : '?';
      console.log(`10:${proportion.toString().padEnd(10)} ${'-'.padEnd(15)} ${'-'.padEnd(12)} ${'-'.padEnd(12)} ${'BRAK'.padEnd(10)}`);
    }
  }
  
  console.log('-'.repeat(80));
  
  if (successfulResults.length > 0) {
    // Znajdź najlepszy wynik (najmniejsza różnica)
    const bestResult = successfulResults.reduce((best, current) => 
      current.lengthDifferencePercent < best.lengthDifferencePercent ? current : best
    );
    
    console.log(`\nNAJLEPSZA PROPORCJA: 10:${bestResult.proportionDenominator}`);
    console.log(`Długość trasy: ${(bestResult.actualLength / 1000).toFixed(1)} km`);
    console.log(`Różnica względem docelowej (${(targetLength / 1000).toFixed(1)} km): ${(bestResult.lengthDifference / 1000).toFixed(1)} km (${bestResult.lengthDifferencePercent.toFixed(1)}%)`);
    
    return bestResult;
  } else {
    console.log('\nŻadna proporcja nie wygenerowała udanej trasy');
    return null;
  }
}

export {
  calculateSquareCorners,
  calculateSquareDimensions,
  findCircularRoute,
  calculateRouteLength,
  generateRouteForProportion,
  saveBestRoute,
  printComparisonTable
};