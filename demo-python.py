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

import osmnx as ox
import json
import math
import networkx as nx
from typing import List, Tuple, Dict
import matplotlib.pyplot as plt

def calculate_square_corners(start_lon: float, start_lat: float, side_length: float) -> List[Tuple[float, float]]:
    """
    Oblicza wierzchołki kwadratu o podanej długości boku.
    """
    R = 6371000  # Promień Ziemi w metrach

    corners = []
    current_lon, current_lat = start_lon, start_lat

    # Kierunki: północ → wschód → południe → zachód
    bearings = [0, 90, 180, 270]

    for bearing in bearings:
        corners.append((current_lon, current_lat))

        # Konwersja na radiany
        lat_rad = math.radians(current_lat)
        lon_rad = math.radians(current_lon)
        bearing_rad = math.radians(bearing)

        # Odległość kątowa
        angular_distance = side_length / R

        # Nowa szerokość geograficzna
        new_lat_rad = math.asin(
            math.sin(lat_rad) * math.cos(angular_distance) +
            math.cos(lat_rad) * math.sin(angular_distance) * math.cos(bearing_rad)
        )

        # Nowa długość geograficzna
        new_lon_rad = lon_rad + math.atan2(
            math.sin(bearing_rad) * math.sin(angular_distance) * math.cos(lat_rad),
            math.cos(angular_distance) - math.sin(lat_rad) * math.sin(new_lat_rad)
        )

        current_lon, current_lat = math.degrees(new_lon_rad), math.degrees(new_lat_rad)

    return corners

def calculate_square_dimensions(target_route_length: float, proportion_denominator: float) -> Tuple[float, float]:
    """
    Oblicza obwód kwadratu i długość boku na podstawie docelowej długości trasy.
    Stosunek: długość_trasy : obwód_kwadratu = 10 : proportion_denominator
    """
    # Obwód kwadratu = (proportion_denominator/10) * długość_trasy
    square_perimeter = (proportion_denominator / 10) * target_route_length

    # Długość boku kwadratu = obwód / 4
    side_length = square_perimeter / 4

    return square_perimeter, side_length

def find_circular_route(G, corners: List[Tuple[float, float]]) -> List[int]:
    """
    Znajduje okrężną trasę przez wszystkie wierzchołki bez powtarzania ścieżek.
    """
    # Znajdź najbliższe węzły dla każdego wierzchołka
    corner_nodes = []
    for lon, lat in corners:
        node = ox.nearest_nodes(G, lon, lat)
        corner_nodes.append(node)

    # Znajdź ścieżki między kolejnymi wierzchołkami
    route_segments = []
    used_edges = set()

    for i in range(len(corner_nodes)):
        start_node = corner_nodes[i]
        end_node = corner_nodes[(i + 1) % len(corner_nodes)]

        # Znajdź najkrótszą ścieżkę unikając już użytych krawędzi
        try:
            segment = find_path_avoiding_edges(G, start_node, end_node, used_edges)
            if segment:
                route_segments.extend(segment[:-1])  # Bez ostatniego (będzie pierwszym następnego)
                # Dodaj użyte krawędzie do zbioru
                for u, v in zip(segment[:-1], segment[1:]):
                    used_edges.add((u, v))
                    used_edges.add((v, u))  # Dodaj też w przeciwnym kierunku
            else:
                print(f"Ostrzeżenie: Nie znaleziono ścieżki między wierzchołkami {i} i {(i+1)%len(corner_nodes)}")
                return []

        except nx.NetworkXNoPath:
            print(f"Błąd: Brak ścieżki między wierzchołkami {i} i {(i+1)%len(corner_nodes)}")
            return []

    # Dodaj ostatni węzeł aby zamknąć pętlę
    route_segments.append(route_segments[0])

    return route_segments

def find_path_avoiding_edges(G, start_node: int, end_node: int, forbidden_edges: set) -> List[int]:
    """
    Znajduje ścieżkę unikającą zakazanych krawędzi.
    """
    # Tworzymy tymczasowy graf bez zakazanych krawędzi
    temp_G = G.copy()

    # Usuwamy zakazane krawędzie
    for u, v in list(temp_G.edges()):
        if (u, v) in forbidden_edges or (v, u) in forbidden_edges:
            temp_G.remove_edge(u, v)

    # Znajdź najkrótszą ścieżkę w tymczasowym grafie
    try:
        path = nx.shortest_path(temp_G, start_node, end_node, weight='length')
        return path
    except nx.NetworkXNoPath:
        # Jeśli nie ma ścieżki, spróbuj znaleźć jakąkolwiek ścieżkę w oryginalnym grafie
        print("Ostrzeżenie: Używam alternatywnej ścieżki (może powtarzać niektóre odcinki)")
        return nx.shortest_path(G, start_node, end_node, weight='length')

def calculate_route_length(G, path: List[int]) -> float:
    """
    Oblicza całkowitą długość trasy.
    """
    total_length = 0
    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]
        if G.has_edge(u, v):
            edge_data = G.get_edge_data(u, v)
            if edge_data:
                # Pobierz długość pierwszego dostępnego segmentu
                length = list(edge_data.values())[0].get('length', 0)
                total_length += length

    return total_length

def get_user_input() -> Tuple[float, float, float]:
    """
    Pobiera od użytkownika długość trasy i współrzędne startowe.
    """
    print("=== Generator trasy rowerowej w kształcie kwadratu ===")
    print("Program utworzy kilka kwadratów w różnych proporcjach i wybierze najlepiej dopasowany")
    print()

    # Pobierz długość trasy
    while True:
        try:
            route_length_km = float(input("Podaj docelową długość trasy (w kilometrach): "))
            if route_length_km <= 0:
                print("Długość trasy musi być większa od 0!")
                continue
            break
        except ValueError:
            print("Proszę podać poprawną liczbę!")

    # Pobierz współrzędne lub użyj domyślnych
    use_default = input("Czy chcesz użyć domyślnej lokalizacji? (t/n): ").lower().strip()

    if use_default == 't' or use_default == 'tak':
        start_lon, start_lat = 18.9549, 50.2859
        print(f"Użyto domyślnej lokalizacji")
    else:
        while True:
            try:
                start_lon = float(input("Podaj długość geograficzną startową: "))
                start_lat = float(input("Podaj szerokość geograficzną startową: "))
                break
            except ValueError:
                print("Proszę podać poprawne współrzędne!")

    return route_length_km * 1000, start_lon, start_lat  # Zwraca w metrach

def generate_route_for_proportion(G, start_lon: float, start_lat: float, 
                                target_route_length: float, proportion_denominator: float, 
                                proportion_name: str) -> Dict:
    """
    Generuje trasę dla danej proporcji i zwraca szczegóły.
    """
    print(f"
--- Generowanie trasy dla proporcji 10:{proportion_denominator} ---")
    
    # Oblicz wymiary kwadratu
    square_perimeter, side_length = calculate_square_dimensions(target_route_length, proportion_denominator)
    
    print(f"Proporcja: 10:{proportion_denominator}")
    print(f"Obwód kwadratu: {square_perimeter/1000:.1f} km")
    print(f"Długość boku kwadratu: {side_length:.0f} m")
    
    # Wygeneruj wierzchołki kwadratu
    corners = calculate_square_corners(start_lon, start_lat, side_length)
    
    # Znajdź okrężną trasę
    route_nodes = find_circular_route(G, corners)
    
    if not route_nodes:
        print(f"Nie udało się znaleźć kompletnej trasy dla proporcji 10:{proportion_denominator}")
        return None
    
    # Oblicz rzeczywistą długość trasy
    actual_route_length = calculate_route_length(G, route_nodes)
    
    # Oblicz różnicę względem docelowej długości
    length_difference = abs(actual_route_length - target_route_length)
    length_difference_percent = (length_difference / target_route_length) * 100
    
    # Konwersja na współrzędne
    nodes_df, edges_df = ox.graph_to_gdfs(G)
    route_coords = []
    
    for node in route_nodes:
        if node in nodes_df.index:
            lat = nodes_df.loc[node].y
            lon = nodes_df.loc[node].x
            route_coords.append((lat, lon))
    
    result = {
        'proportion_name': proportion_name,
        'proportion_denominator': proportion_denominator,
        'target_length': target_route_length,
        'actual_length': actual_route_length,
        'square_perimeter': square_perimeter,
        'side_length': side_length,
        'corners': corners,
        'route_nodes': route_nodes,
        'route_coords': route_coords,
        'length_difference': length_difference,
        'length_difference_percent': length_difference_percent,
        'success': True
    }
    
    print(f"Rzeczywista długość trasy: {actual_route_length/1000:.1f} km")
    print(f"Różnica względem docelowej: {length_difference/1000:.1f} km ({length_difference_percent:.1f}%)")
    
    return result

def save_best_route(best_result: Dict, start_lon: float, start_lat: float, all_results: List[Dict]):
    """
    Zapisuje najlepszą trasę do pliku GeoJSON wraz z informacjami porównawczymi.
    """
    if not best_result:
        print("Brak udanych tras do zapisania")
        return
    
    output_file = f"best_circular_route.geojson"
    
    # Tworzymy listę punktów wierzchołków kwadratu
    corner_features = []
    for i, (lon, lat) in enumerate(best_result['corners']):
        corner_features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
            },
            "properties": {
                "name": f"Wierzchołek {i}",
                "description": f"Wierzchołek kwadratu {i}",
                "marker-color": "#FF0000",
                "marker-symbol": i
            }
        })
    
    # Tworzymy opis z porównaniem wszystkich proporcji
    comparison_text = "Porównanie proporcji:
"
    for result in all_results:
        if result and result.get('success'):
            comparison_text += f"10:{result['proportion_denominator']}: {result['actual_length']/1000:.1f}km (różnica: {result['length_difference_percent']:.1f}%)
"
    
    geojson_data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [(lon, lat) for lat, lon in best_result['route_coords']]
                },
                "properties": {
                    "name": f"Okrężna trasa rowerowa - proporcja 10:{best_result['proportion_denominator']}",
                    "length_m": round(best_result['actual_length']),
                    "description": f"Ścieżka rowerowa {best_result['actual_length']/1000:.1f}km zaczynająca się i kończąca w tym samym punkcie. {comparison_text}",
                    "start_point": f"{start_lon}, {start_lat}",
                    "target_length": f"{best_result['target_length']/1000:.1f} km",
                    "proportion": f"10:{best_result['proportion_denominator']}",
                    "length_difference_percent": round(best_result['length_difference_percent'], 1),
                    "stroke": "#0000FF",
                    "stroke-width": 4
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [start_lon, start_lat]
                },
                "properties": {
                    "name": "Punkt startowy/końcowy",
                    "description": f"Współrzędne: {start_lon:.6f}, {start_lat:.6f}",
                    "marker-color": "#00FF00",
                    "marker-symbol": "circle"
                }
            },
            # Dodajemy linię pokazującą kształt kwadratu (dla wizualizacji)
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": best_result['corners'] + [best_result['corners'][0]]  # Zamykamy kwadrat
                },
                "properties": {
                    "name": "Kształt kwadratu",
                    "description": f"Teoretyczny kształt kwadratu {best_result['square_perimeter']/1000:.1f}km (4 x {best_result['side_length']/1000:.1f}km)",
                    "stroke": "#FF0000",
                    "stroke-width": 2,
                    "stroke-dasharray": "5,5"
                }
            }
        ] + corner_features  # Dodajemy wszystkie wierzchołki
    }
    
    with open(output_file, "w", encoding='utf-8') as f:
        json.dump(geojson_data, f, ensure_ascii=False, indent=2)
    
    print(f"
Najlepsza trasa zapisana do: {output_file}")
    return output_file

def print_comparison_table(all_results: List[Dict], target_length: float):
    """
    Wyświetla tabelę porównawczą wszystkich proporcji.
    """
    print("
" + "="*80)
    print("PORÓWNANIE WSZYSTKICH PROPORCJI")
    print("="*80)
    print(f"{'Proporcja':<12} {'Długość trasy':<15} {'Różnica':<12} {'Odchylenie':<12} {'Status':<10}")
    print("-"*80)
    
    successful_results = []
    
    for result in all_results:
        if result and result.get('success'):
            successful_results.append(result)
            status = "SUKCES"
            print(f"10:{result['proportion_denominator']:<10} {result['actual_length']/1000:6.1f} km     {result['length_difference']/1000:5.1f} km     {result['length_difference_percent']:5.1f}%       {status:<10}")
        else:
            proportion = result['proportion_denominator'] if result else '?'
            print(f"10:{proportion:<10} {'-':<15} {'-':<12} {'-':<12} {'BRAK':<10}")
    
    print("-"*80)
    
    if successful_results:
        # Znajdź najlepszy wynik (najmniejsza różnica)
        best_result = min(successful_results, key=lambda x: x['length_difference_percent'])
        
        print(f"
NAJLEPSZA PROPORCJA: 10:{best_result['proportion_denominator']}")
        print(f"Długość trasy: {best_result['actual_length']/1000:.1f} km")
        print(f"Różnica względem docelowej ({target_length/1000:.1f} km): {best_result['length_difference']/1000:.1f} km ({best_result['length_difference_percent']:.1f}%)")
        
        return best_result
    else:
        print("
Żadna proporcja nie wygenerowała udanej trasy")
        return None

def main():
    # Pobierz dane od użytkownika
    target_route_length, start_lon, start_lat = get_user_input()

    print(f"
Docelowa długość trasy: {target_route_length/1000:.1f} km")
    
    # Definiujemy różne proporcje do przetestowania
    proportions = [
        (7.0, "10:7"),
        (6.5, "10:6.5"), 
        (6.0, "10:6")
    ]
    
    # Oblicz promień obszaru do pobrania (używamy największego możliwego kwadratu dla bezpieczeństwa)
    max_side_length = calculate_square_dimensions(target_route_length, min(p[0] for p in proportions))[1]
    area_radius = max_side_length * 1.5  # 50% zapasu

    print(f"
Ładowanie mapy dróg rowerowych (promień: {area_radius/1000:.1f} km)...")
    try:
        G = ox.graph_from_point((start_lat, start_lon), dist=area_radius, network_type="bike")
        print(f"Załadowano graf z {len(G.nodes())} węzłami i {len(G.edges())} krawędziami")
    except Exception as e:
        print(f"Błąd ładowania mapy: {e}")
        return

    # Generuj trasy dla wszystkich proporcji
    all_results = []
    
    for proportion_denominator, proportion_name in proportions:
        result = generate_route_for_proportion(
            G, start_lon, start_lat, target_route_length, 
            proportion_denominator, proportion_name
        )
        all_results.append(result)

    # Porównaj wyniki i wybierz najlepszy
    best_result = print_comparison_table(all_results, target_route_length)
    
    if best_result:
        # Zapisz najlepszą trasę
        output_file = save_best_route(best_result, start_lon, start_lat, all_results)
        
        print(f"
=== PODSUMOWANIE ===")
        print(f"NAJLEPSZA PROPORCJA: 10:{best_result['proportion_denominator']}")
        print(f"Docelowa długość trasy: {target_route_length/1000:.1f} km")
        print(f"Rzeczywista długość trasy: {best_result['actual_length']/1000:.1f} km")
        print(f"Różnica: {best_result['length_difference']/1000:.1f} km ({best_result['length_difference_percent']:.1f}%)")
        print(f"Obwód kwadratu (teoretyczny): {best_result['square_perimeter']/1000:.1f} km")
        print(f"Długość boku kwadratu: {best_result['side_length']:.0f} m")
        print(f"Plik wynikowy: {output_file}")
    else:
        print("
Nie udało się wygenerować żadnej trasy. Spróbuj zmienić parametry.")

if __name__ == "__main__":
    main()
----------------------------------------------------------------------------------------------------------------------------

import json
from typing import List, Tuple

def remove_duplicate_coordinates(geojson_data: dict) -> dict:
    """
    Usuwa powtarzające się współrzędne z GeoJSON.
    """
    if "features" not in geojson_data:
        return geojson_data
    
    cleaned_features = []
    
    for feature in geojson_data["features"]:
        if feature["geometry"]["type"] == "LineString":
            # Czyszczenie współrzędnych dla LineString
            coordinates = feature["geometry"]["coordinates"]
            cleaned_coords = clean_line_coordinates(coordinates)
            feature["geometry"]["coordinates"] = cleaned_coords
            
        elif feature["geometry"]["type"] == "MultiLineString":
            # Czyszczenie współrzędnych dla MultiLineString
            cleaned_lines = []
            for line in feature["geometry"]["coordinates"]:
                cleaned_line = clean_line_coordinates(line)
                cleaned_lines.append(cleaned_line)
            feature["geometry"]["coordinates"] = cleaned_lines
        
        cleaned_features.append(feature)
    
    geojson_data["features"] = cleaned_features
    return geojson_data

def clean_line_coordinates(coordinates: List[List[float]]) -> List[List[float]]:
    """
    Czyści współrzędne linii usuwając duplikaty i backtracking.
    """
    if not coordinates:
        return coordinates
    
    # Krok 1: Usuń bezpośrednie duplikaty
    cleaned = [coordinates[0]]
    for i in range(1, len(coordinates)):
        if coordinates[i] != coordinates[i-1]:
            cleaned.append(coordinates[i])
    
    # Krok 2: Usuń backtracking (A→B→A)
    final_cleaned = remove_backtracking(cleaned)
    
    return final_cleaned

def remove_backtracking(coordinates: List[List[float]]) -> List[List[float]]:
    """
    Usuwa backtracking (fragmenty gdzie wracamy tą samą drogą).
    """
    if len(coordinates) < 3:
        return coordinates
    
    i = 0
    result = []
    
    while i < len(coordinates):
        result.append(coordinates[i])
        
        # Sprawdź czy następne punkty tworzą backtracking
        found_backtrack = False
        
        # Szukaj wzorca A→B→A
        for j in range(i + 2, min(i + 15, len(coordinates))):  # Sprawdzaj do 15 punktów do przodu
            if coordinates[i] == coordinates[j]:
                # Znaleziono backtracking - pomiń punkty od i+1 do j
                print(f"Znaleziono backtracking: pomijam {j-i-1} punktów między pozycją {i+1} a {j}")
                i = j
                found_backtrack = True
                break
        
        if not found_backtrack:
            i += 1
    
    return result

def analyze_geojson_issues(geojson_data: dict) -> dict:
    """
    Analizuje problemy w GeoJSON i zwraca raport.
    """
    issues = {
        "total_features": 0,
        "line_features": 0,
        "duplicate_segments": 0,
        "backtracking_segments": 0,
        "total_coordinates_before": 0,
        "total_coordinates_after": 0,
        "issues_found": []
    }
    
    for feature in geojson_data.get("features", []):
        issues["total_features"] += 1
        
        if feature["geometry"]["type"] in ["LineString", "MultiLineString"]:
            issues["line_features"] += 1
            
            if feature["geometry"]["type"] == "LineString":
                coords = feature["geometry"]["coordinates"]
                issues["total_coordinates_before"] += len(coords)
                
                # Analizuj problemy
                feature_issues = analyze_line_issues(coords)
                if feature_issues:
                    issues["issues_found"].extend(feature_issues)
                    issues["duplicate_segments"] += len([i for i in feature_issues if "duplicate" in i])
                    issues["backtracking_segments"] += len([i for i in feature_issues if "backtracking" in i])
    
    return issues

def analyze_line_issues(coordinates: List[List[float]]) -> List[str]:
    """
    Analizuje linię pod kątem problemów.
    """
    issues = []
    
    # Sprawdź bezpośrednie duplikaty
    for i in range(1, len(coordinates)):
        if coordinates[i] == coordinates[i-1]:
            issues.append(f"Duplicate at position {i-1}-{i}: {coordinates[i]}")
    
    # Sprawdź backtracking
    for i in range(len(coordinates) - 2):
        for j in range(i + 2, min(i + 15, len(coordinates))):
            if coordinates[i] == coordinates[j]:
                issues.append(f"Backtracking from {i} to {j}: {coordinates[i]}")
                break
    
    return issues

def clean_best_circular_route():
    """
    Czyści konkretny plik 'best_circular_route.geojson'
    """
    input_file = "best_circular_route.geojson"
    output_file = "best_circular_route_cleaned.geojson"
    
    try:
        # Wczytaj plik
        print(f"Wczytywanie pliku: {input_file}")
        with open(input_file, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)
        
        # Analizuj problemy przed czyszczeniem
        print("
=== ANALIZA PROBLEMÓW ===")
        issues_before = analyze_geojson_issues(geojson_data)
        print(f"Znalezione problemy: {len(issues_before['issues_found'])}")
        
        if issues_before['issues_found']:
            for issue in issues_before['issues_found'][:10]:  # Pokaz pierwsze 10 problemów
                print(f"  - {issue}")
            if len(issues_before['issues_found']) > 10:
                print(f"  ... i {len(issues_before['issues_found']) - 10} więcej")
        else:
            print("  Brak znalezionych problemów!")
        
        # Wyczyść dane
        print("
=== CZYSZCZENIE DANYCH ===")
        cleaned_geojson = remove_duplicate_coordinates(geojson_data)
        
        # Analizuj po czyszczeniu
        issues_after = analyze_geojson_issues(cleaned_geojson)
        
        # Zapisz wyczyszczony plik
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(cleaned_geojson, f, ensure_ascii=False, indent=2)
        
        # Raport
        print("
=== RAPORT ===")
        print(f"Przed czyszczeniem: {issues_before['total_coordinates_before']} współrzędnych")
        print(f"Po czyszczeniu: {issues_after['total_coordinates_before']} współrzędnych")
        removed_count = issues_before['total_coordinates_before'] - issues_after['total_coordinates_before']
        print(f"Usunięto: {removed_count} powtórzonych współrzędnych")
        print(f"Plik wyjściowy: {output_file}")
        
        # Pobierz plik w Colab
        try:
            from google.colab import files
            files.download(output_file)
            print("Plik został pobrany automatycznie!")
        except ImportError:
            print("Uruchomiono poza Colab - plik zapisany lokalnie")
        
        return cleaned_geojson
        
    except FileNotFoundError:
        print(f"Błąd: Nie znaleziono pliku {input_file}")
        print("Upewnij się, że plik znajduje się w tym samym katalogu")
        return None
    except Exception as e:
        print(f"Błąd podczas przetwarzania: {e}")
        return None

# Funkcja do szybkiego czyszczenia bez analizy
def quick_clean_geojson():
    """
    Szybkie czyszczenie bez szczegółowej analizy.
    """
    input_file = "best_circular_route.geojson"
    output_file = "best_circular_route_cleaned.geojson"
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)
        
        cleaned_data = remove_duplicate_coordinates(geojson_data)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(cleaned_data, f, ensure_ascii=False, indent=2)
        
        print(f"Plik wyczyszczony i zapisany jako: {output_file}")
        
        # Pobierz w Colab
        try:
            from google.colab import files
            files.download(output_file)
        except ImportError:
            pass
            
        return cleaned_data
        
    except Exception as e:
        print(f"Błąd: {e}")
        return None

# Uruchom czyszczenie
if __name__ == "__main__":
    # Użyj tej funkcji w Colab:
    clean_best_circular_route()
    
------------------------------------------------------------------------------------

 