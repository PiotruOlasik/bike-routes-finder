import { haversineDistance } from './haversine.js';

/**
 * Rozszerzona funkcja budująca graf z dodatkowymi metadanymi o drogach
 * @param {Object} osmData - Dane z Overpass API
 * @returns {Object} { nodes, graph, wayMetadata }
 */
export function buildGraphForDijkstra(osmData) {
  const nodes = new Map();
  const graph = {};
  const wayMetadata = new Map(); // Przechowuje metadane o drogach

  // Zbierz wszystkie węzły
  for (const el of osmData.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  // Buduj graf z metadanymi
  for (const el of osmData.elements) {
    if (el.type === 'way' && el.nodes.length >= 2) {
      const tags = el.tags || {};
      
      // Zbierz metadane drogi
      const metadata = {
        highway: tags.highway,
        surface: tags.surface || 'unknown',
        width: tags.width,
        lit: tags.lit,
        smoothness: tags.smoothness,
        name: tags.name,
        wayId: el.id
      };

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

        // Zapisz metadane dla krawędzi (w obie strony)
        const edgeKey = `${keyA}-${keyB}`;
        const edgeKeyReverse = `${keyB}-${keyA}`;
        wayMetadata.set(edgeKey, metadata);
        wayMetadata.set(edgeKeyReverse, metadata);
      }
    }
  }

  return { nodes, graph, wayMetadata };
}

/**
 * NOWA funkcja wydobywająca metadane dla całej trasy
 * @param {Array} pathNodes - Tablica ID węzłów trasy
 * @param {Map} wayMetadata - Mapa metadanych krawędzi
 * @returns {Object} { surfaces, highways, segments }
 */
export function extractRouteMetadata(pathNodes, wayMetadata) {
  const routeMetadata = {
    surfaces: [],
    highways: [],
    segments: []
  };

  for (let i = 0; i < pathNodes.length - 1; i++) {
    const edgeKey = `${pathNodes[i]}-${pathNodes[i + 1]}`;
    const metadata = wayMetadata.get(edgeKey);

    if (metadata) {
      routeMetadata.surfaces.push(metadata.surface);
      routeMetadata.highways.push(metadata.highway);
      routeMetadata.segments.push({
        from: pathNodes[i],
        to: pathNodes[i + 1],
        surface: metadata.surface,
        highway: metadata.highway,
        width: metadata.width,
        lit: metadata.lit,
        smoothness: metadata.smoothness,
        name: metadata.name,
        wayId: metadata.wayId
      });
    } else {
      // Brak metadanych dla tego segmentu
      routeMetadata.surfaces.push('unknown');
      routeMetadata.highways.push('unknown');
      routeMetadata.segments.push({
        from: pathNodes[i],
        to: pathNodes[i + 1],
        surface: 'unknown',
        highway: 'unknown'
      });
    }
  }

  return routeMetadata;
}

/**
 * Znajduje najbliższy węzeł do podanych współrzędnych
 * @param {number} lat - Szerokość geograficzna
 * @param {number} lon - Długość geograficzna
 * @param {Map} nodes - Mapa węzłów
 * @returns {number|null} ID najbliższego węzła
 */
export function findNearestNode(lat, lon, nodes) {
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
 * Sprawdza czy dwa węzły są połączone w grafie (BFS)
 * @param {Object} graph - Graf
 * @param {string} start - ID węzła początkowego
 * @param {string} end - ID węzła końcowego
 * @returns {boolean} Czy węzły są połączone
 */
export function areConnected(graph, start, end) {
  // Sprawdź czy węzły istnieją w grafie
  if (!graph[start] || !graph[end]) {
    console.log(`Węzeł ${!graph[start] ? start : end} nie istnieje w grafie`);
    return false;
  }

  const visited = new Set();
  const queue = [start];
  visited.add(start);
  
  let iterations = 0;
  const maxIterations = 100000; // Zabezpieczenie przed nieskończoną pętlą

  while (queue.length > 0 && iterations < maxIterations) {
    iterations++;
    const node = queue.shift();
    
    if (node === end) {
      console.log(`Połączenie znalezione po ${iterations} iteracjach`);
      return true;
    }

    const neighbors = graph[node];
    if (neighbors) {
      for (const neighbor in neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    
    // Progress info co 10000 iteracji
    if (iterations % 10000 === 0) {
      console.log(`Sprawdzono ${iterations} węzłów, odwiedzono ${visited.size}, kolejka: ${queue.length}`);
    }
  }
  
  console.log(`Nie znaleziono połączenia po ${iterations} iteracjach (odwiedzono ${visited.size} węzłów)`);
  return false;
}

/**
 * Znajduje wszystkie składowe spójne w grafie
 * @param {Object} graph - Graf
 * @returns {Array<Set>} Tablica składowych spójnych
 */
export function findConnectedComponents(graph) {
  const visited = new Set();
  const components = [];
  
  for (const node in graph) {
    if (!visited.has(node)) {
      const component = new Set();
      const queue = [node];
      
      while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        
        visited.add(current);
        component.add(current);
        
        for (const neighbor in graph[current] || {}) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
      
      components.push(component);
    }
  }
  
  // Sortuj składowe od największej do najmniejszej
  components.sort((a, b) => b.size - a.size);
  
  return components;
}