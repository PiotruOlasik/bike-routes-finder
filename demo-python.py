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

G = ox.graph_from_place("Chorzów, Polska", network_type="bike")

#orig = random.choice(list(G.nodes()))
#dest = random.choice(list(G.nodes()))

start_lon, start_lat =18.950313, 50.306321 #Rynek
end_lon, end_lat =  18.996935, 50.288647 #Wesołe miasteczko Legendia

orig = ox.nearest_nodes(G, start_lon, start_lat)
dest = ox.nearest_nodes(G, end_lon, end_lat)

path = ox.shortest_path(G, orig, dest, weight="length")

#route_length = ox.routing.route_length(G, path) to nie działa - potrzebny inny sposób na wyznaczenie długosci trasy

# konwersja trasy na współrzędne
nodes, edges = ox.graph_to_gdfs(G)
route_coords = [(nodes.loc[node].y, nodes.loc[node].x) for node in path]

with open("route_chorzow.geojson", "w") as f:
    json.dump({
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [(lon, lat) for lat, lon in route_coords]
            },
            "properties": {"length_m": 1234}
        }]
    }, f)

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
 