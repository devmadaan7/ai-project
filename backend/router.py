"""Wayfinder routing, timetable options, and explainable demo pricing."""
from __future__ import annotations
import networkx as nx
from typing import List, Dict, Optional
from datetime import datetime, date, time
from graph_builder import build_graph, haversine

FESTIVE_WINDOWS = [
    (1, 10, 1, 20, "Pongal / Sankranti", 1.15),
    (3, 1, 3, 20, "Holi period", 1.12),
    (8, 10, 8, 25, "Independence / Onam period", 1.10),
    (10, 15, 11, 15, "Diwali / festive season", 1.25),
    (12, 20, 12, 31, "Christmas / New Year", 1.20),
    (1, 1, 1, 5, "New Year", 1.15),
]
PERIODS = {
    "morning": (5, 12), "afternoon": (12, 17),
    "evening": (17, 21), "night": (21, 5),
}

def _is_festive(d: date):
    for sm, sd, em, ed, name, surge in FESTIVE_WINDOWS:
        if date(d.year, sm, sd) <= d <= date(d.year, em, ed):
            return True, surge, name
    return False, 1.0, ""

def _parse_time(value):
    if not value or value in ("Flexible", "—", "-"):
        return None
    try:
        return datetime.strptime(value[:5], "%H:%M").time()
    except (ValueError, TypeError):
        return None

def _in_period(value, period):
    if not period or period == "any":
        return True
    t = _parse_time(value)
    if not t:
        return period == "any"
    h = t.hour
    if period == "night":
        return h >= 21 or h < 5
    bounds = PERIODS.get(period)
    return bool(bounds and bounds[0] <= h < bounds[1])

def apply_dynamic_pricing(base_cost, base_duration, mode, travel_date=None, depart_time=None):
    """Transparent estimates; these are not live operator fares or traffic feeds."""
    travel_date = travel_date or date.today()
    t = depart_time if isinstance(depart_time, time) else _parse_time(depart_time)
    cost_mult, dur_factor, factors = 1.0, 1.0, []
    festive, surge, festive_name = _is_festive(travel_date)
    if festive:
        cost_mult *= surge
        factors.append(f"{festive_name} demand estimate +{int((surge-1)*100)}%")
    if travel_date.weekday() >= 5:
        cost_mult *= 1.10
        factors.append("Weekend demand estimate +10%")
    elif travel_date.weekday() == 4:
        cost_mult *= 1.05
        factors.append("Friday demand estimate +5%")
    peak = bool(t and ((7 <= t.hour < 11) or (17 <= t.hour < 21)))
    if peak and mode in ("cab", "road", "bus"):
        cost_mult *= 1.08 if mode == "bus" else 1.12
        factors.append("Peak-hour demand estimate")
    if mode in ("cab", "road", "bus"):
        # Broad seasonal monsoon allowance; no live weather is consulted.
        if travel_date.month in (6, 7, 8, 9):
            dur_factor *= 1.10
            cost_mult *= 1.03
            factors.append("Monsoon road-delay allowance +10% time")
        if travel_date.weekday() < 5:
            dur_factor *= 1.06
            factors.append("Weekday traffic allowance +6% time")
        if peak:
            dur_factor *= 1.18
            factors.append("Rush-hour traffic allowance +18% time")
    if mode == "cab":
        cost_mult *= 1.05
        factors.append("Outstation cab platform allowance +5%")
    adjusted_cost = int(round((float(base_cost) * cost_mult) / 10) * 10)
    adjusted_duration = max(1, int(round(float(base_duration) * dur_factor)))
    return {"cost": adjusted_cost, "duration": adjusted_duration,
            "cost_multiplier": round(cost_mult, 3),
            "duration_multiplier": round(dur_factor, 3),
            "factors": factors}

class WayfinderRouter:
    def __init__(self):
        self.G = build_graph()

    def heuristic(self, a, b):
        if a not in self.G or b not in self.G: return 0
        n1, n2 = self.G.nodes[a], self.G.nodes[b]
        return haversine(n1["lat"], n1["lon"], n2["lat"], n2["lon"]) / 800 * 60

    def _route_from_segments(self, origin, destination, segments, travel_date, prefer):
        total_cost = sum(s["cost"] for s in segments)
        total_duration = sum(s["duration_min"] for s in segments)
        total_distance = sum(s["distance_km"] for s in segments)
        modes = list(dict.fromkeys(s["mode"] for s in segments))
        factors = list(dict.fromkeys(x for s in segments for x in s.get("pricing_factors", [])))
        dep = segments[0].get("meta", {}).get("dep", "—") if segments else "—"
        arr = segments[-1].get("meta", {}).get("arr", "—") if segments else "—"
        return {
            "summary": f"{origin} → {destination} ({' + '.join(m.title() for m in modes)})",
            "origin": self.G.nodes[segments[0]["from_id"]]["name"] if segments else origin,
            "destination": self.G.nodes[segments[-1]["to_id"]]["name"] if segments else destination,
            "total_duration_min": total_duration, "total_duration_hr": round(total_duration/60, 1),
            "total_cost": total_cost, "total_distance_km": round(total_distance, 1),
            "modes": modes, "segments": segments,
            "stops": [segments[0]["from"]] + [s["to"] for s in segments] if segments else [],
            "pricing_factors": factors, "travel_date": travel_date.isoformat(),
            "departure_time": dep, "arrival_time": arr,
            "data_status": "estimated demo data"
        }

    def _segment(self, u, v, data, td, prefer="balanced"):
        meta = dict(data.get("meta") or {})
        dep = _parse_time(meta.get("dep"))
        dyn = apply_dynamic_pricing(data.get("base_cost", data["cost"]),
                                    data.get("base_duration", data["duration"]),
                                    data["mode"], td, dep)
        return {"from": self.G.nodes[u]["name"], "to": self.G.nodes[v]["name"],
                "from_id": u, "to_id": v, "mode": data["mode"],
                "duration_min": dyn["duration"], "cost": dyn["cost"],
                "base_cost": data.get("base_cost", data["cost"]),
                "distance_km": data["distance"], "meta": meta,
                "pricing_factors": dyn["factors"]}

    def find_routes(self, origin, destination, max_routes=12, prefer="balanced",
                    travel_date=None, depart_time=None, depart_match="after", mode="all",
                    time_period="any", max_price=None):
        origin, destination = origin.lower().strip(), destination.lower().strip()
        if origin not in self.G or destination not in self.G or origin == destination:
            return []
        try: td = datetime.strptime(travel_date, "%Y-%m-%d").date() if travel_date else date.today()
        except ValueError: td = date.today()
        requested_t = _parse_time(depart_time)
        def matches_requested_time(value):
            scheduled = _parse_time(value)
            if not requested_t or not scheduled:
                return True
            scheduled_minutes = scheduled.hour * 60 + scheduled.minute
            requested_minutes = requested_t.hour * 60 + requested_t.minute
            if depart_match == "after":
                return scheduled_minutes >= requested_minutes
            tolerance = int(depart_match)
            difference = abs(scheduled_minutes - requested_minutes)
            difference = min(difference, 1440 - difference)
            return difference <= tolerance
        modes_allowed = {"train", "flight", "bus", "cab", "road"}
        if mode and mode != "all":
            modes_allowed = {mode}
        routes = []
        # Preserve every direct timetable entry: this is the key fix for multiple departures.
        for key, data in (self.G.get_edge_data(origin, destination) or {}).items():
            if data["mode"] not in modes_allowed: continue
            meta = data.get("meta") or {}
            if not _in_period(meta.get("dep"), time_period): continue
            scheduled_t = _parse_time(meta.get("dep"))
            if not matches_requested_time(meta.get("dep")): continue
            actual_t = scheduled_t or requested_t
            seg = self._segment(origin, destination, data, td, prefer)
            route = self._route_from_segments(self.G.nodes[origin]["name"],
                                               self.G.nodes[destination]["name"], [seg], td, prefer)
            route["departure_time"] = meta.get("dep", "Flexible")
            route["arrival_time"] = meta.get("arr", "—")
            if max_price is not None and route["total_cost"] > max_price: continue
            routes.append(route)

        # Also offer a few multi-leg paths. Never claim a multi-leg route is a
        # direct departure; all segments and their individual timing are shown.
        if mode == "all":
            def weight(u, v, edges):
                scores=[]
                for d in edges.values():
                    seg=self._segment(u,v,d,td,prefer)
                    if prefer == "time": score=seg["duration_min"]
                    elif prefer == "cost": score=seg["cost"]
                    else: score=seg["duration_min"] + seg["cost"]/8
                    scores.append(score)
                return min(scores) if scores else 1e9
            try:
                paths = nx.shortest_simple_paths(
                    nx.DiGraph((u,v) for u,v in self.G.edges()), origin, destination,
                    weight=lambda u,v,edata: weight(u,v,self.G.get_edge_data(u,v) or {})
                )
                for path in paths:
                    if len(path) <= 2: continue
                    segs=[]
                    for u,v in zip(path,path[1:]):
                        edges=self.G.get_edge_data(u,v) or {}
                        candidates=[]
                        for d in edges.values():
                            if d["mode"] not in modes_allowed: continue
                            s=self._segment(u,v,d,td,prefer)
                            score=s["duration_min"] if prefer=="time" else s["cost"] if prefer=="cost" else s["duration_min"]+s["cost"]/8
                            candidates.append((score,s))
                        if not candidates:
                            segs=[]; break
                        segs.append(min(candidates,key=lambda x:x[0])[1])
                    if not segs: continue
                    route=self._route_from_segments(self.G.nodes[origin]["name"],self.G.nodes[destination]["name"],segs,td,prefer)
                    route["data_status"]="estimated multi-leg route; verify before travel"
                    if max_price is not None and route["total_cost"] > max_price: continue
                    if time_period != "any" and not _in_period(route["departure_time"],time_period): continue
                    route_t = _parse_time(route["departure_time"])
                    if not matches_requested_time(route["departure_time"]): continue
                    if all(r["summary"] != route["summary"] or r["departure_time"] != route["departure_time"] for r in routes):
                        routes.append(route)
                    if len(routes) >= max_routes*3: break
            except (nx.NetworkXNoPath, nx.NodeNotFound, StopIteration):
                pass
        def score(r):
            route_t = _parse_time(r.get("departure_time"))
            if requested_t and route_t:
                route_minutes = route_t.hour * 60 + route_t.minute
                requested_minutes = requested_t.hour * 60 + requested_t.minute
                if depart_match == "after":
                    return (0, route_minutes)
                distance = abs(route_minutes - requested_minutes)
                return (0, min(distance, 1440 - distance))
            if prefer == "time": return (1, r["total_duration_min"])
            if prefer == "cost": return (1, r["total_cost"])
            return (1, r["total_duration_min"] + r["total_cost"]/8)
        routes.sort(key=score)
        # Keep options across times, don't collapse routes with the same mode.
        return routes[:max_routes]

    def list_cities(self):
        return [{"id": n, "name": d["name"], "lat": d["lat"], "lon": d["lon"],
                 "state": d.get("state",""), "states": d.get("states",[]),
                 "location_type": d.get("location_type","city")}
                for n,d in sorted(self.G.nodes(data=True), key=lambda x:x[1]["name"])]

router = WayfinderRouter()
