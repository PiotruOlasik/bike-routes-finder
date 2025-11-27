export function buildGeoJSONPath(path, nodes, totalDistance) {
  const coords = path.map(id => {
    const n = nodes.get(parseInt(id));
    return [n.lon, n.lat];
  });

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          distance_km: totalDistance / 1000,
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    ],
  };
}
