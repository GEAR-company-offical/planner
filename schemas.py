from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["work", "learning", "exercise", "social", "rest", "chores"]


class BlockCreate(BaseModel):
    block_date: date
    slot_index: int = Field(..., ge=0, le=47)
    category: Category


class BlockUpdate(BaseModel):
    category: Category


class BlockRead(BaseModel):
    id: int
    block_date: date
    slot_index: int
    category: Category
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class SlotView(BaseModel):
    slot_index: int
    block: BlockRead | None


class DayGrid(BaseModel):
    date: date
    slots: list[SlotView]
    filled_count: int