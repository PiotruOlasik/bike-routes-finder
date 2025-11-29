export const overpassUrl = 'https://overpass-api.de/api/interpreter';

// Rozszerzone zapytanie z dodatkowymi tagami (surface, width, lit, smoothness)
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
/*
// Bardziej szczegółowe zapytanie z konkretnymi tagami
export const detailedQuery = `
[out:json][timeout:25];
area["name"="powiat piotrkowski"][admin_level=6];
(
  way["highway"~"cycleway|path|footway|residential|service|track|living_street|unclassified|tertiary|secondary|primary"](area);
);
out body tags;
>;
out skel qt;
`;
*/