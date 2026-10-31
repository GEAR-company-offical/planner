from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Category = Literal["work", "learning", "exercise", "social", "rest", "chores"]
Status = Literal["done", "skipped", "planned"]


class BlockCreate(BaseModel):
    block_date: date
    slot_index: int = Field(..., ge=0, le=47)
    category: Category
    status: Status = "done"
    energy: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = Field(None, max_length=500)


class BlockUpdate(BaseModel):
    category: Optional[Category] = None
    status: Optional[Status] = None
    energy: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None


class BlockRead(BaseModel):
    id: int
    block_date: date
    slot_index: int
    category: Category
    status: Status
    energy: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class SlotView(BaseModel):
    slot_index: int
    block: Optional[BlockRead]


class DayGrid(BaseModel):
    date: date
    slots: list[SlotView]
    filled_count: int