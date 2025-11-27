import osmnx as ox

G = ox.graph_from_place("Chorzów, Poland", network_type="bike")
edges = ox.graph_to_gdfs(G, nodes=False, edges=True)

#wypisanie dostępnych atrybutów
print(edges.columns)

#filtrowanie po drogach rowerowych
cycleways = edges[edges["highway"] == "cycleway"]
print("Ilość dróg rowerowych:", len(cycleways))
-----------------------------------------------------------------
import osmnx as ox
import json
import random

bike_type = "szosowy"

bike_surface_rules = {
    "miejski": ["asphalt", "paving_stones", "concrete"],
    "trekkingowy": ["asphalt", "concrete", "gravel"],
    "górski": ["asphalt", "concrete", "gravel", "dirt", "ground", "sand"],
    "szosowy": ["asphalt", "concrete"]
}

G = ox.graph_from_place("Chorzów, Polska", network_type="bike")

#orig = random.choice(list(G.nodes()))
#dest = random.choice(list(G.nodes()))

start_lon, start_lat =  18.9687, 50.2903   #współrzędne początka i końca Alei Harcerskiej - drogi która rzekomo ma atrybut surface = paving_stones
end_lon, end_lat = 18.9808, 50.2910       #program zwraca, że ma unknown, ale to bardziej problem osm niż naszego programu

orig = ox.nearest_nodes(G, start_lon, start_lat)
dest = ox.nearest_nodes(G, end_lon, end_lat)

path = ox.shortest_path(G, orig, dest, weight="length")

nodes, edges = ox.graph_to_gdfs(G)


#wyciąganie krawędzi i trasy
route_edges = []
route_length = 0
surfaces_on_route = set()

for u, v in zip(path[:-1], path[1:]):
    edge_data = G.get_edge_data(u, v)

    # graf multi-edge -> wybieramy pierwszy wariant
    edge = edge_data[min(edge_data.keys())]

    route_edges.append(edge)

    # długość - tym razem działa i działa dobrze xddd
    route_length += edge.get("length", 0)

    #nawierzchnia
    surface = edge.get("surface", "unknown")
    if isinstance(surface, list):
        surfaces_on_route.update(surface)
    else:
        surfaces_on_route.add(surface)

print("Nawierzchnie na trasie:", surfaces_on_route)
print("Długość trasy (m):", round(route_length, 2))


allowed_surfaces = bike_surface_rules[bike_type]

not_allowed = [s for s in surfaces_on_route if s not in allowed_surfaces and s != "unknown"]

unique_surfaces = set(surfaces_on_route)

if unique_surfaces == {"unknown"}:
    print("⚠️ Trasa może być nieodpowiednia. Brak danych o całości trasy (unknown).")
elif not_allowed:
    print(f"❌ Trasa NIE jest odpowiednia dla roweru typu: {bike_type}")
    print("Niedozwolone nawierzchnie:", not_allowed)
else:
    print(f"✅ Trasa jest odpowiednia dla roweru typu: {bike_type}")


route_coords = [(nodes.loc[node].x, nodes.loc[node].y) for node in path]

geojson = {
    "type": "FeatureCollection",
    "features": [{
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": route_coords
        },
        "properties": {
            "bike_type": bike_type,
            "length_m": round(route_length, 2),
            "surfaces": list(surfaces_on_route)
        }
    }]
}

with open("route_chorzow.geojson", "w") as f:
    json.dump(geojson, f, ensure_ascii=False, indent=2)


----------------------------------------------------------------------
import requests
import geopandas as gpd
from shapely.geometry import LineString

# Zapytanie do Overpass API (z włączeniem geometrii)
query = """
[out:json][timeout:25];
area["name"="Chorzów"]->.searchArea;
(
  way["highway"="cycleway"](area.searchArea);
);
out geom;
"""

url = "https://overpass-api.de/api/interpreter"
response = requests.get(url, params={'data': query})
data = response.json()

elements = [e for e in data["elements"] if e["type"] == "way"]

rows = []
for e in elements:
    # niektóre drogi nie mają pełnej geometrii – pomijamy je
    if "geometry" not in e:
        continue
    coords = [(pt["lon"], pt["lat"]) for pt in e["geometry"]]
    props = e.get("tags", {})
    rows.append({
        "geometry": LineString(coords),
        "highway": props.get("highway"),
        "surface": props.get("surface"),
        "width": props.get("width"),
        "lit": props.get("lit"),
        "smoothness": props.get("smoothness"),
        "name": props.get("name"),
    })

# Tworzenie GeoDataFrame
gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")

print(gdf)

# Sprawdzenie, jakie typy nawierzchni (surface) występują
print("
Typy nawierzchni (surface):")
print(gdf["surface"].value_counts(dropna=False))

------------------------------------------------------------------
 