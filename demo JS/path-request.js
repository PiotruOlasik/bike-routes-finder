const overpassUrl = 'https://overpass-api.de/api/interpreter';

const query = `
[out:json][timeout:25];
area["name"="Toruń"][admin_level=8];
(
  way["highway"~"cycleway|path|footway|residential|service|track|living_street"](area);
);
out body;
>;
out skel qt;
`;

fetch(overpassUrl, {
  method: 'POST',
  body: query
})
  .then(res => res.json())
  .then(data => {
    // Filtrujemy tylko elementy typu "way"
    const ways = data.elements.filter(el => el.type === "way");

    // Pokazujemy tylko way w konsoli
    console.log(ways);
  })
  .catch(err => {
    console.error("Błąd pobierania danych: ", err);
  });


