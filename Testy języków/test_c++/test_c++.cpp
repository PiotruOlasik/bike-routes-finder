#include <iostream>
#include <fstream>
#include <string>
#include <map>
#include <unordered_map>
#include <vector>
#include <queue>
#include <functional>
#include <cmath>
#include <curl/curl.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;
using int64 = int64_t;

struct Node {
    double lat;
    double lon;
};

struct Edge {
    int64 to;
    double weight;
};

// Bufor do przechwytywania odpowiedzi curl
static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    ((std::string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

// Funkcja do pobierania danych przez HTTP POST (Overpass API)
std::string fetchOverpassData(const std::string& query) {
    curl_global_init(CURL_GLOBAL_DEFAULT);
    CURL* curl = curl_easy_init();
    std::string readBuffer;

    if (curl) {
        curl_easy_setopt(curl, CURLOPT_URL, "https://overpass-api.de/api/interpreter");
        curl_easy_setopt(curl, CURLOPT_POST, 1L);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, query.c_str());
        curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)query.size());
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 60L);

        struct curl_slist* headers = NULL;
        headers = curl_slist_append(headers, "Content-Type: application/x-www-form-urlencoded");
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

        CURLcode res = curl_easy_perform(curl);

        long http_code = 0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
        std::cout << "HTTP status: " << http_code << std::endl;

        if (res != CURLE_OK) {
            std::cerr << "curl_easy_perform() failed: " << curl_easy_strerror(res) << std::endl;
            readBuffer.clear();
        }
        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);
    }
    else {
        std::cerr << "curl_easy_init() failed\n";
    }

    curl_global_cleanup();
    return readBuffer;
}


// Obliczanie odległości euklidesowej (na potrzeby grafu; wartości w stopniach)
double distance(double lat1, double lon1, double lat2, double lon2) {
    return std::sqrt((lat1 - lat2) * (lat1 - lat2) + (lon1 - lon2) * (lon1 - lon2));
}

// Znajdź najbliższy węzeł
int64 findNearestNode(double lat, double lon, const std::unordered_map<int64, Node>& nodes) {
    int64 nearestId = -1;
    double minDist = 1e18;
    for (const auto& kv : nodes) {
        const int64 id = kv.first;
        const Node& node = kv.second;
        double dist = distance(lat, lon, node.lat, node.lon);
        if (dist < minDist) {
            minDist = dist;
            nearestId = id;
        }
    }
    return nearestId;
}

// Algorytm Dijkstry 
std::vector<int64> dijkstra(const std::unordered_map<int64, std::vector<Edge>>& graph, int64 start, int64 end) {
    std::unordered_map<int64, double> dist;
    std::unordered_map<int64, int64> prev;

    for (const auto& kv : graph) {
        dist[kv.first] = 1e18;
    }
    if (!dist.count(start)) dist[start] = 1e18;
    if (!dist.count(end)) dist[end] = 1e18;

    using PQItem = std::pair<double, int64>;
    std::priority_queue<PQItem, std::vector<PQItem>, std::greater<PQItem>> pq;

    dist[start] = 0.0;
    pq.push({ 0.0, start });

    while (!pq.empty()) {
        auto [curDist, u] = pq.top();
        pq.pop();
        if (curDist > dist[u]) continue;
        if (u == end) break;

        auto it = graph.find(u);
        if (it == graph.end()) continue;

        for (const auto& edge : it->second) {
            double nd = curDist + edge.weight;
            if (!dist.count(edge.to) || nd < dist[edge.to]) {
                dist[edge.to] = nd;
                prev[edge.to] = u;
                pq.push({ nd, edge.to });
            }
        }
    }

    std::vector<int64> path;
    if (!dist.count(end) || dist[end] >= 1e18) return path;

    int64 at = end;
    path.push_back(at);
    while (at != start) {
        if (!prev.count(at)) {
            path.clear();
            return path;
        }
        at = prev[at];
        path.push_back(at);
    }
    std::reverse(path.begin(), path.end());
    return path;
}

// Budowanie GeoJSON z trasy
json buildGeoJSONPath(const std::vector<int64>& path, const std::unordered_map<int64, Node>& nodes) {
    json coords = json::array();
    for (int64 id : path) {
        auto it = nodes.find(id);
        if (it == nodes.end()) continue;
        const Node& n = it->second;
        coords.push_back({ n.lon, n.lat });
    }

    json feature = {
        {"type", "Feature"},
        {"properties", json::object()},
        {"geometry", {
            {"type", "LineString"},
            {"coordinates", coords}
        }}
    };

    json geojson = {
        {"type", "FeatureCollection"},
        {"features", {feature}}
    };

    return geojson;
}

int main() {
    // Zapytanie Overpass API z bounding boxem dla Torunia
    std::string query = R"(
[out:json][timeout:25];
(
  way["highway"~"cycleway|path|footway|residential|service|track|living_street"](53.001,18.55,53.05,18.67);
);
out body;
>;
out skel qt;
)";

    std::cout << "Pobieram dane z Overpass API...\n";
    std::string data = fetchOverpassData(query);
    if (data.empty()) {
        std::cerr << "Nie udało się pobrać danych.\n";
        return 1;
    }

    // Zapis surowych danych (opcjonalne)
    {
        std::ofstream rawFile("osm_raw.json");
        rawFile << data;
    }

    // Parsowanie JSON (bezpiecznie)
    json osmData;
    try {
        osmData = json::parse(data);
    }
    catch (const std::exception& ex) {
        std::cerr << "Błąd parsowania JSON: " << ex.what() << std::endl;
        return 1;
    }

    // Wypisywanie cech  dróg
    std::cout << "Wypisywanie cech (tagów) dróg:\n";
    for (const auto& el : osmData["elements"]) {
        if (el.contains("type") && el["type"].is_string() && el["type"] == "way") {
            std::cout << "Way ID: " << el["id"].get<int64>() << std::endl;

            if (el.contains("tags") && el["tags"].is_object()) {
                std::cout << "Tagi: " << std::endl;
                for (auto& [key, value] : el["tags"].items()) {
                    std::cout << "  " << key << " = " << value << std::endl;
                }
            }
            else {
                std::cout << "Brak tagów.\n";
            }
            std::cout << "-----------------\n";
        }
    }

    // Mapowanie węzłów
    std::unordered_map<int64, Node> nodes;
    if (osmData.contains("elements") && osmData["elements"].is_array()) {
        for (const auto& el : osmData["elements"]) {
            if (el.contains("type") && el["type"].is_string() && el["type"] == "node") {
                if (el.contains("id") && el.contains("lat") && el.contains("lon")) {
                    int64 id = el["id"].get<int64>();
                    double lat = el["lat"].get<double>();
                    double lon = el["lon"].get<double>();
                    nodes[id] = Node{ lat, lon };
                }
            }
        }
    }
    else {
        std::cerr << "JSON nie zawiera elementu 'elements' lub nie jest tablicą.\n";
        return 1;
    }

    // Budowa grafu
    std::unordered_map<int64, std::vector<Edge>> graph;
    for (const auto& el : osmData["elements"]) {
        if (el.contains("type") && el["type"].is_string() && el["type"] == "way") {
            if (el.contains("nodes") && el["nodes"].is_array() && el["nodes"].size() >= 2) {
                const auto& nids = el["nodes"];
                for (size_t i = 0; i + 1 < nids.size(); ++i) {
                    int64 a = nids[i].get<int64>();
                    int64 b = nids[i + 1].get<int64>();
                    if (nodes.find(a) == nodes.end() || nodes.find(b) == nodes.end()) continue;

                    double dist = distance(nodes[a].lat, nodes[a].lon, nodes[b].lat, nodes[b].lon);

                    graph[a].push_back(Edge{ b, dist });
                    graph[b].push_back(Edge{ a, dist });
                }
            }
        }
    }

    std::cout << "Węzłów: " << nodes.size() << ", Węzłów w grafie (z krawędziami): " << graph.size() << "\n";

    // Punkty start i meta (przykład)
    double startLat = 53.01379;
    double startLon = 18.60413;
    double endLat = 53.01147;
    double endLon = 18.61330;

    int64 startNode = findNearestNode(startLat, startLon, nodes);
    int64 endNode = findNearestNode(endLat, endLon, nodes);

    std::cout << "Start node: " << startNode << "\n";
    std::cout << "End node: " << endNode << "\n";

    if (startNode == -1 || endNode == -1) {
        std::cerr << "Nie znaleziono węzłów start/meta.\n";
        return 1;
    }

    std::cout << "Szukam najkrótszej trasy...\n";
    std::vector<int64> path = dijkstra(graph, startNode, endNode);

    if (path.empty()) {
        std::cerr << "Nie znaleziono ścieżki.\n";
        return 1;
    }

    std::cout << "Znaleziono trasę o długości: " << path.size() << " węzłów.\n";

    json routeGeoJSON = buildGeoJSONPath(path, nodes);

    {
        std::ofstream outFile("route_cycleway.geojson");
        outFile << routeGeoJSON.dump(2);
    }

    std::cout << "Zapisano trasę do route_cycleway.geojson\n";

    return 0;
}
