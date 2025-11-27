export const overpassUrl = 'https://overpass-api.de/api/interpreter';

export const query = `
[out:json][timeout:25];
area["name"="Toruń"][admin_level=8];
(
  way["highway"~"cycleway|path|footway|residential|service|track|living_street"](area);
);
out body;
>;
out skel qt;
`;
