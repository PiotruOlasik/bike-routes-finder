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

export function areConnected(graph, start, end) {
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
