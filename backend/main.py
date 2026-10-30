"""
Wayfinder AI – FastAPI backend
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parent))

from router import router as wayfinder

app = FastAPI(
    title="Wayfinder AI",
    description="Multi-modal travel planner for India with dynamic pricing + real timings",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


class RouteRequest(BaseModel):
    origin: str
    destination: str
    prefer: str = "balanced"
    max_routes: int = 40
    travel_date: Optional[str] = None
    depart_time: Optional[str] = None
    depart_match: str = "after"
    mode: str = "all"
    time_period: str = "any"
    max_price: Optional[int] = None


@app.get("/cities")
def get_cities():
    return wayfinder.list_cities()


@app.get("/states")
def get_states():
    import json
    data_file = Path(__file__).resolve().parent.parent / "data" / "india_states.json"
    return json.loads(data_file.read_text(encoding="utf-8"))


@app.get("/route")
def get_route(
    origin: str = Query(...),
    destination: str = Query(...),
    prefer: str = Query("balanced"),
    max_routes: int = Query(40, ge=1, le=100),
    travel_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    depart_time: Optional[str] = Query(None, description="HH:MM"),
    depart_match: str = Query("after", pattern="^(after|30|60)$"),
    mode: str = Query("all", pattern="^(all|flight|train|bus|cab|road)$"),
    time_period: str = Query("any", pattern="^(any|morning|afternoon|evening|night)$"),
    max_price: Optional[int] = Query(None, ge=0),
):
    routes = wayfinder.find_routes(
        origin=origin,
        destination=destination,
        max_routes=max_routes,
        prefer=prefer,
        travel_date=travel_date,
        depart_time=depart_time,
        depart_match=depart_match,
        mode=mode,
        time_period=time_period,
        max_price=max_price,
    )
    if not routes:
        raise HTTPException(
            status_code=404,
            detail=f"No route found between '{origin}' and '{destination}'",
        )
    return {
        "origin": origin,
        "destination": destination,
        "prefer": prefer,
        "travel_date": travel_date,
        "mode": mode,
        "time_period": time_period,
        "count": len(routes),
        "routes": routes,
    }


@app.post("/route")
def post_route(req: RouteRequest):
    return get_route(
        origin=req.origin,
        destination=req.destination,
        prefer=req.prefer,
        max_routes=req.max_routes,
        travel_date=req.travel_date,
        depart_time=req.depart_time,
        depart_match=req.depart_match,
        mode=req.mode,
        time_period=req.time_period,
        max_price=req.max_price,
    )


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "3.0.0"}


# Serve frontend
@app.get("/")
async def serve_index():
    return FileResponse(FRONTEND / "index.html")


@app.get("/style.css")
async def serve_css():
    return FileResponse(FRONTEND / "style.css", media_type="text/css")


@app.get("/app.js")
async def serve_js():
    return FileResponse(FRONTEND / "app.js", media_type="application/javascript")


app.mount("/static", StaticFiles(directory=str(FRONTEND)), name="static")


if __name__ == "__main__":
    import uvicorn
    print("=" * 55)
    print("  Wayfinder AI is running!")
    print("  Open in browser →  http://127.0.0.1:8000")
    print("=" * 55)
    uvicorn.run(app, host="127.0.0.1", port=8000)
