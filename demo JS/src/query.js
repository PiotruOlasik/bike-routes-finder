export const overpassUrl = 'https://overpass-api.de/api/interpreter';

export const query = `
[out:json][timeout:25];
area["name"="powiat piotrkowski"][admin_level=6];
(
  way["highway"~"cycleway|path|footway|residential|service|track|living_street|unclassified|tertiary|secondary|primary"](area);
);
out body;
>;
out skel qt;
`;
