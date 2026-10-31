from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session


import crud
from config import CATEGORIES, SLOTS_PER_DAY, STATIC_DIR, DAY_START_SLOT
from database import get_db, init_db
from schemas import BlockCreate, BlockRead, BlockUpdate, DayGrid
from predictor import generate_smart_grid, calculate_day_score, get_chart_data, get_calendar_heatmap


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Day Logger", version="0.5.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/meta")
def meta():
    return {"categories": CATEGORIES, "slots_per_day": SLOTS_PER_DAY}


@app.post("/blocks", response_model=BlockRead, status_code=201)
def create_block(payload: BlockCreate, db: Session = Depends(get_db)):
    try:
        return crud.create_block(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.get("/blocks", response_model=list[BlockRead])
def list_blocks(
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    return crud.list_blocks(db, date_from, date_to, category)


@app.get("/days/{target_date}", response_model=DayGrid)
def get_day(target_date: date, db: Session = Depends(get_db)):
    return crud.get_day_grid(db, target_date)


@app.patch("/blocks/{block_id}", response_model=BlockRead)
def update_block(block_id: int, payload: BlockUpdate, db: Session = Depends(get_db)):
    block = crud.update_block(db, block_id, payload)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


@app.delete("/blocks/{block_id}", status_code=204)
def delete_block(block_id: int, db: Session = Depends(get_db)):
    if not crud.delete_block(db, block_id):
        raise HTTPException(status_code=404, detail="Block not found")


@app.get("/predict/{target_date}")
def get_predictions(target_date: date, db: Session = Depends(get_db)):
    return generate_smart_grid(db, target_date)


@app.get("/score/{target_date}")
def get_score(target_date: date, db: Session = Depends(get_db)):
    return calculate_day_score(db, target_date)


@app.get("/charts/{target_date}")
def get_charts(target_date: date, db: Session = Depends(get_db)):
    return get_chart_data(db, target_date)

@app.get("/calendar/{end_date}")
def get_calendar(end_date: date, db: Session = Depends(get_db)):
    return get_calendar_heatmap(db, end_date)


def _check_is_past(target_date: date, slot_index: int):
    if slot_index < DAY_START_SLOT:
        raise HTTPException(status_code=400, detail="Cannot log night time (00:00-08:00)")
    # ... остальная логика