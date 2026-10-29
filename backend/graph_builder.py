"""
Builds the multi-modal transport graph for Wayfinder AI.
"""

import json
from pathlib import Path
import networkx as nx
from math import radians, sin, cos, sqrt, atan2

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def load_json(name: str):
    path = DATA_DIR / name
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_graph() -> nx.MultiDiGraph:
    G = nx.MultiDiGraph()

    cities = load_json("cities.json")
    for city in cities:
        G.add_node(
            city["id"],
            name=city["name"],
            lat=city["lat"],
            lon=city["lon"],
            type=city.get("location_type", "city"),
            state=city.get("state", ""),
            states=city.get("states", []),
        )

    def add_edge(src, dst, mode, duration_min, cost_inr, distance_km=None, meta=None):
        if src not in G or dst not in G:
            return
        if distance_km is None:
            distance_km = haversine(
                G.nodes[src]["lat"], G.nodes[src]["lon"],
                G.nodes[dst]["lat"], G.nodes[dst]["lon"],
            )
        G.add_edge(
            src, dst,
            mode=mode,
            duration=duration_min,
            cost=cost_inr,
            base_cost=cost_inr,
            base_duration=duration_min,
            distance=round(distance_km, 1),
            meta=meta or {},
        )

    for t in load_json("trains.json"):
        meta = {
            "train_no": t.get("train_no"),
            "name": t.get("name"),
            "class": t.get("class"),
            "dep": t.get("dep", ""),
            "arr": t.get("arr", ""),
        }
        add_edge(t["from"], t["to"], "train", t["duration_min"], t["cost"], meta=meta)
        if t.get("bidirectional", True):
            rev_meta = {**meta, "dep": t.get("arr", "").replace("+1", "").replace("+2", ""), "arr": t.get("dep", "")}
            add_edge(t["to"], t["from"], "train", t["duration_min"], t["cost"], meta=rev_meta)

    for f in load_json("flights.json"):
        meta = {
            "airline": f.get("airline"),
            "flight_no": f.get("flight_no"),
            "dep": f.get("dep", ""),
            "arr": f.get("arr", ""),
        }
        add_edge(f["from"], f["to"], "flight", f["duration_min"], f["cost"], meta=meta)
        if f.get("bidirectional", True):
            rev_meta = {**meta, "dep": f.get("arr", ""), "arr": f.get("dep", "")}
            add_edge(f["to"], f["from"], "flight", f["duration_min"], f["cost"], meta=rev_meta)

    for b in load_json("buses.json"):
        meta = {
            "operator": b.get("operator"),
            "type": b.get("type", ""),
            "dep": b.get("dep", ""),
            "arr": b.get("arr", ""),
        }
        add_edge(b["from"], b["to"], "bus", b["duration_min"], b["cost"], meta=meta)
        if b.get("bidirectional", True):
            rev_meta = {**meta, "dep": b.get("arr", "").replace("+1", ""), "arr": b.get("dep", "")}
            add_edge(b["to"], b["from"], "bus", b["duration_min"], b["cost"], meta=rev_meta)

    for c in load_json("cabs.json"):
        meta = {
            "operator": c.get("operator"),
            "vehicle": c.get("vehicle", "Sedan"),
            "dep": c.get("dep", "Flexible"),
            "arr": c.get("arr", ""),
        }
        add_edge(c["from"], c["to"], "cab", c["duration_min"], c["cost"], meta=meta)
        if c.get("bidirectional", True):
            add_edge(c["to"], c["from"], "cab", c["duration_min"], c["cost"], meta=meta)

    road_pairs = [
        ("chennai", "bangalore", 350, 6.5),
        ("bangalore", "hyderabad", 570, 9.0),
        ("hyderabad", "mumbai", 710, 12.0),
        ("mumbai", "pune", 150, 3.5),
        ("delhi", "jaipur", 280, 5.0),
        ("delhi", "chandigarh", 250, 4.5),
        ("kolkata", "bhubaneswar", 440, 8.0),
        ("delhi", "agra", 230, 4.0),
    ]
    for a, b, dist, hours in road_pairs:
        mins = int(hours * 60)
        cost = int(dist * 10)
        meta = {"type": "self-drive", "dep": "Flexible", "arr": ""}
        add_edge(a, b, "road", mins, cost, dist, meta=meta)
        add_edge(b, a, "road", mins, cost, dist, meta=meta)

    # Connect every newly added state/UT capital to the established demo network.
    # These are estimated road-planning links, not verified roads or schedules.
    core_nodes = {"chennai", "bangalore", "hyderabad", "mumbai", "pune", "delhi",
                  "jaipur", "chandigarh", "kolkata", "bhubaneswar", "kochi",
                  "ahmedabad", "goa", "lucknow", "varanasi"}
    existing_pairs = {tuple(sorted((u, v))) for u, v, d in G.edges(data=True)
                      if d.get("mode") in ("road", "cab")}
    for city_id in list(G.nodes):
        if city_id in core_nodes:
            continue
        source = G.nodes[city_id]
        distances = []
        for other_id in core_nodes:
            if other_id not in G or other_id == city_id:
                continue
            target = G.nodes[other_id]
            km = haversine(source["lat"], source["lon"], target["lat"], target["lon"])
            distances.append((km, other_id))
        for km, other_id in sorted(distances)[:2]:
            pair = tuple(sorted((city_id, other_id)))
            if pair in existing_pairs:
                continue
            road_km = max(25, km * 1.28)
            duration = int((road_km / 55) * 60)
            cost = int(road_km * 11)
            meta = {"type": "estimated road connection", "dep": "Flexible", "arr": "",
                    "data_status": "estimated"}
            add_edge(city_id, other_id, "road", duration, cost, road_km, meta)
            add_edge(other_id, city_id, "road", duration, cost, road_km, meta)
            existing_pairs.add(pair)

    return G


if __name__ == "__main__":
    G = build_graph()
    print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
