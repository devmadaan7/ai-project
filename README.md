# Wayfinder AI — upgraded demo

This is an updated version of the supplied Wayfinder AI project. It keeps the existing HTML/CSS/JavaScript frontend and FastAPI backend structure.

## What's changed

- Added all 28 Indian states and all 8 union territories to `data/india_states.json`.
- Expanded `data/cities.json` to include the existing demo cities and state/UT capitals.
- Added `/states` endpoint and state labels in city dropdowns.
- Preserved multiple direct flight/train/bus departures as separate search results rather than collapsing each route to one preferred edge.
- Added filters for transport mode, departure window, preferred departure time, time matching (at/after, within ±30 minutes, or within ±60 minutes), and maximum budget.
- Added date-based estimate factors: approximate festive periods, Friday/weekend demand, peak-hour demand, rush-hour traffic, weekday road traffic, monsoon road-delay allowance, and cab platform allowance.
- Added estimated road connections so state capitals can be included in route planning even when no sample timetable exists.
- Added a clear demo-data disclosure in results.

## Run locally

Requirements: Python 3.10+ recommended.

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

Windows PowerShell:
```powershell
.venv\Scripts\Activate.ps1
```

Windows Command Prompt:
```bat
.venv\Scripts\activate.bat
```

macOS/Linux:
```bash
source .venv/bin/activate
```

Install and start:
```bash
pip install -r requirements.txt
python main.py
```

Open http://127.0.0.1:8000 in your browser.

## Useful endpoints

- `GET /api/health`
- `GET /cities`
- `GET /states`
- `GET /route?origin=chennai&destination=bangalore&travel_date=2026-11-02`
- `GET /route?origin=chennai&destination=bangalore&mode=train&time_period=morning&travel_date=2026-11-02`

Supported `mode`: `all`, `flight`, `train`, `bus`, `cab`, `road`.
Supported `time_period`: `any`, `morning`, `afternoon`, `evening`, `night`.
- Optional `depart_time=HH:MM` plus `depart_match=after|30|60` lets you filter by a preferred departure time.

## Important limitations

This remains a demo/planning project, not a live booking engine. The JSON schedules and fares are sample data and may be inaccurate or outdated. Festive periods, traffic, monsoon delays, and price changes are transparent heuristics—not live traffic, weather, holiday-calendar, inventory, or operator-price feeds. Added road links are approximate estimates. Verify schedules, fares, availability, and route details with official operators before travelling. Real booking requires official provider APIs and appropriate credentials.
