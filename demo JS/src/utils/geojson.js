/**
 * Buduje prosty GeoJSON z trasą i metadanymi
 * @param {Array} path - Tablica ID węzłów trasy
 * @param {Map} nodes - Mapa węzłów z współrzędnymi
 * @param {number} totalDistance - Całkowita długość trasy w metrach
 * @param {Object} routeMetadata - Metadane trasy (opcjonalnie)
 * @param {string} bikeType - Typ roweru (opcjonalnie)
 * @param {Object} evaluation - Ocena trasy (opcjonalnie)
 * @returns {Object} GeoJSON FeatureCollection
 */
export function buildGeoJSONPath(path, nodes, totalDistance, routeMetadata = null, bikeType = null, evaluation = null) {
  const coords = path.map(id => {
    const n = nodes.get(parseInt(id));
    return [n.lon, n.lat];
  });

  const properties = {
    distance_km: totalDistance / 1000,
  };

  // Dodaj metadane jeśli są dostępne
  if (routeMetadata) {
    properties.surfaces = routeMetadata.surfaces;
    properties.unique_surfaces = [...new Set(routeMetadata.surfaces)];
    properties.highways = [...new Set(routeMetadata.highways)];
    properties.segments_count = routeMetadata.segments.length;
    
    // Statystyki nawierzchni
    const surfaceCounts = {};
    routeMetadata.surfaces.forEach(s => {
      surfaceCounts[s] = (surfaceCounts[s] || 0) + 1;
    });
    properties.surface_statistics = surfaceCounts;
  }

  // Dodaj informacje o typie roweru
  if (bikeType) {
    properties.bike_type = bikeType;
  }

  // Dodaj ocenę trasy
  if (evaluation) {
    properties.evaluation = {
      suitable: evaluation.suitable,
      status: evaluation.status,
      message: evaluation.message,
      not_allowed_surfaces: evaluation.notAllowedSurfaces || [],
      all_surfaces: evaluation.allSurfaces || []
    };
    
    // Dodaj dodatkowe informacje z oceny
    if (evaluation.unknownSurfaces !== undefined) {
      properties.evaluation.unknown_segments = evaluation.unknownSurfaces;
      properties.evaluation.total_segments = evaluation.totalSegments;
    }
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties,
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    ],
  };
}

/**
 * NOWA funkcja - buduje szczegółowy GeoJSON z osobnymi segmentami
 * Każdy segment trasy jest osobną feature z własnymi metadanymi
 * @param {Array} path - Tablica ID węzłów trasy
 * @param {Map} nodes - Mapa węzłów z współrzędnymi
 * @param {Object} routeMetadata - Metadane trasy
 * @param {number} totalDistance - Całkowita długość trasy w metrach
 * @param {string} bikeType - Typ roweru (opcjonalnie)
 * @param {Object} evaluation - Ocena trasy (opcjonalnie)
 * @returns {Object} GeoJSON FeatureCollection z wieloma features
 */
export function buildDetailedGeoJSON(path, nodes, routeMetadata, totalDistance, bikeType = null, evaluation = null) {
  const features = [];

  // Feature #1: Główna linia trasy
  const mainCoords = path.map(id => {
    const n = nodes.get(parseInt(id));
    return [n.lon, n.lat];
  });

  features.push({
    type: 'Feature',
    properties: {
      type: 'main_route',
      distance_km: totalDistance / 1000,
      bike_type: bikeType,
      segments_count: routeMetadata.segments.length,
      evaluation: evaluation
    },
    geometry: {
      type: 'LineString',
      coordinates: mainCoords
    }
  });

  // Features #2-N: Każdy segment jako osobna feature
  if (routeMetadata && routeMetadata.segments) {
    routeMetadata.segments.forEach((segment, index) => {
      const fromNode = nodes.get(parseInt(segment.from));
      const toNode = nodes.get(parseInt(segment.to));

      if (fromNode && toNode) {
        features.push({
          type: 'Feature',
          properties: {
            type: 'segment',
            segment_index: index,
            surface: segment.surface,
            highway: segment.highway,
            width: segment.width,
            lit: segment.lit,
            smoothness: segment.smoothness,
            name: segment.name,
            way_id: segment.wayId
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [fromNode.lon, fromNode.lat],
              [toNode.lon, toNode.lat]
            ]
          }
        });
      }
    });
  }

  return {
    type: 'FeatureCollection',
    features
  };
}

/**
 * DODATKOWA funkcja pomocnicza - tworzy uproszczony GeoJSON tylko z punktami start/koniec
 * @param {Array} path - Tablica ID węzłów trasy
 * @param {Map} nodes - Mapa węzłów z współrzędnymi
 * @returns {Object} GeoJSON FeatureCollection z punktami
 */
export function buildStartEndPoints(path, nodes) {
  if (path.length < 2) return null;

  const startNode = nodes.get(parseInt(path[0]));
  const endNode = nodes.get(parseInt(path[path.length - 1]));

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          type: 'start',
          name: 'Punkt startowy'
        },
        geometry: {
          type: 'Point',
          coordinates: [startNode.lon, startNode.lat]
        }
      },
      {
        type: 'Feature',
        properties: {
          type: 'end',
          name: 'Punkt końcowy'
        },
        geometry: {
          type: 'Point',
          coordinates: [endNode.lon, endNode.lat]
        }
      }
    ]
  };
}