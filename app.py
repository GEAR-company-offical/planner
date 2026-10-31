from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session

import crud
from config import CATEGORIES, STATUSES, SLOTS_PER_DAY
from database import get_db, init_db
from schemas import BlockCreate, BlockRead, BlockUpdate, DayGrid


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Time Block Planner",
    version="0.1.0",
    description="48-slot day grid with category tracking",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/meta")
def meta():
    return {
        "categories": CATEGORIES,
        "statuses": STATUSES,
        "slots_per_day": SLOTS_PER_DAY,
    }


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


@app.get("/blocks/by-slot/{target_date}/{slot}", response_model=BlockRead)
def get_block_by_slot(target_date: date, slot: int, db: Session = Depends(get_db)):
    if not 0 <= slot < SLOTS_PER_DAY:
        raise HTTPException(status_code=422, detail="slot must be 0..47")
    block = crud.get_block_by_slot(db, target_date, slot)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


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