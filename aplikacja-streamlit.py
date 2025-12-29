 
import streamlit as st
import osmnx as ox
import networkx as nx
import folium
from streamlit_folium import st_folium
import json
import math
from typing import List, Tuple


# --- LOGIKA GENERATORA (Twoje funkcje) ---

def calculate_square_corners(start_lon: float, start_lat: float, side_length: float) -> List[Tuple[float, float]]:
    R = 6371000
    corners = []
    current_lon, current_lat = start_lon, start_lat
    bearings = [0, 90, 180, 270]
    for bearing in bearings:
        corners.append((current_lon, current_lat))
        lat_rad, lon_rad = math.radians(current_lat), math.radians(current_lon)
        bearing_rad = math.radians(bearing)
        angular_distance = side_length / R
        new_lat_rad = math.asin(math.sin(lat_rad) * math.cos(angular_distance) +
                                math.cos(lat_rad) * math.sin(angular_distance) * math.cos(bearing_rad))
        new_lon_rad = lon_rad + math.atan2(math.sin(bearing_rad) * math.sin(angular_distance) * math.cos(lat_rad),
                                           math.cos(angular_distance) - math.sin(lat_rad) * math.sin(new_lat_rad))
        current_lon, current_lat = math.degrees(new_lon_rad), math.degrees(new_lat_rad)
    return corners


def find_path_avoiding_edges(G, start_node, end_node, forbidden_edges):
    temp_G = G.copy()
    for u, v in list(temp_G.edges()):
        if (u, v) in forbidden_edges or (v, u) in forbidden_edges:
            temp_G.remove_edge(u, v)
    try:
        return nx.shortest_path(temp_G, start_node, end_node, weight='length')
    except nx.NetworkXNoPath:
        return nx.shortest_path(G, start_node, end_node, weight='length')


def find_circular_route(G, corners):
    corner_nodes = [ox.nearest_nodes(G, lon, lat) for lon, lat in corners]
    route_segments = []
    used_edges = set()
    for i in range(len(corner_nodes)):
        start, end = corner_nodes[i], corner_nodes[(i + 1) % len(corner_nodes)]
        try:
            segment = find_path_avoiding_edges(G, start, end, used_edges)
            route_segments.extend(segment[:-1])
            for u, v in zip(segment[:-1], segment[1:]):
                used_edges.add((u, v));
                used_edges.add((v, u))
        except:
            return []
    if route_segments: route_segments.append(route_segments[0])
    return route_segments


# --- LOGIKA CLEANERA (Twoje funkcje) ---

def clean_line_coordinates(coordinates):
    if not coordinates: return []
    # Usunięcie duplikatów obok siebie
    cleaned = [coordinates[0]]
    for i in range(1, len(coordinates)):
        if coordinates[i] != coordinates[i - 1]:
            cleaned.append(coordinates[i])
    # Usunięcie backtrackingu (A-B-A)
    final = []
    i = 0
    while i < len(cleaned):
        final.append(cleaned[i])
        found = False
        for j in range(i + 2, min(i + 15, len(cleaned))):
            if cleaned[i] == cleaned[j]:
                i = j
                found = True
                break
        if not found: i += 1
    return final


# --- INTERFEJS UŻYTKOWNIKA ---

st.set_page_config(page_title="Bike Route Planner", layout="wide")
st.title("🚲 Generator Trasy Rowerowej")

with st.sidebar:
    st.header("⚙️ Ustawienia")
    dist_km = st.slider("Docelowa długość (km)", 5, 100, 20)
    lat = st.number_input("Szerokość (Lat)", value=50.2859, format="%.4f")
    lon = st.number_input("Długość (Lon)", value=18.9549, format="%.4f")

    st.divider()
    clean_option = st.checkbox("Wyczyść trasę (Backtracking)", value=True)
    generate_btn = st.button("🚀 Wyznacz Trasę", type="primary")

if generate_btn:
    with st.spinner("Pobieranie danych z OpenStreetMap..."):
        # Obliczenie boku kwadratu (proporcja ok. 0.65 z Twojego kodu)
        side_m = (dist_km * 1000 * 0.65) / 4
        corners = calculate_square_corners(lon, lat, side_m)

        try:
            G = ox.graph_from_point((lat, lon), dist=side_m * 1.5, network_type="bike")
            route_nodes = find_circular_route(G, corners)

            if route_nodes:
                # Wyciąganie współrzędnych
                nodes_df, _ = ox.graph_to_gdfs(G)
                raw_coords = [[nodes_df.loc[n].y, nodes_df.loc[n].x] for n in route_nodes]

                if clean_option:
                    # Konwersja na [lon, lat] dla Twojego cleanera
                    clean_input = [[c[1], c[0]] for c in raw_coords]
                    cleaned = clean_line_coordinates(clean_input)
                    display_coords = [[c[1], c[0]] for c in cleaned]
                else:
                    display_coords = raw_coords

                # Statystyki
                # Pobieramy atrybuty krawędzi bezpośrednio z grafu G dla ścieżki route_nodes
                edge_lengths = ox.routing.route_to_gdf(G, route_nodes)['length']
                real_dist = edge_lengths.sum() / 1000

                c1, c2 = st.columns(2)
                c1.metric("Rzeczywista długość", f"{real_dist:.2f} km")
                c2.metric("Liczba punktów GPS", len(display_coords))

                # Wyświetlanie mapy
                m = folium.Map(location=[lat, lon], zoom_start=13)
                folium.PolyLine(display_coords, color="#2ecc71", weight=5, opacity=0.8).add_to(m)
                folium.Marker([lat, lon], popup="Start/Meta", icon=folium.Icon(color='green', icon='play')).add_to(m)

                st_folium(m, width=800, height=600, returned_objects=[])

                # Export
                geojson_out = {
                    "type": "FeatureCollection",
                    "features": [{
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": [[c[1], c[0]] for c in display_coords]},
                        "properties": {"length": real_dist}
                    }]
                }
                st.download_button("💾 Pobierz GeoJSON", json.dumps(geojson_out), "trasa.geojson")

            else:
                st.error("Nie udało się zamknąć pętli. Spróbuj innej lokalizacji.")
        except Exception as e:
            st.error(f"Błąd mapy: {e}")

