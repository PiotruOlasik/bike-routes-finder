import { haversineDistance } from './haversine.js';

export function buildGraphForDijkstra(osmData) {
  const nodes = new Map();
  const graph = {};

  for (const el of osmData.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

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

// POPRAWIONA funkcja sprawdzająca połączenia
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

// DODATKOWA funkcja - znajdź składowe spójne
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
  
  return components;
}