from datetime import date as date_type

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from config import SLOTS_PER_DAY
from models import Block
from schemas import BlockCreate, BlockUpdate, BlockRead, SlotView, DayGrid


def create_block(db: Session, data: BlockCreate) -> Block:
    block = Block(**data.model_dump())
    db.add(block)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ValueError(
            f"Slot {data.slot_index} on {data.block_date} already exists"
        )
    db.refresh(block)
    return block


def get_block_by_slot(db: Session, target: date_type, slot: int) -> Block | None:
    stmt = select(Block).where(
        Block.block_date == target, Block.slot_index == slot
    )
    return db.scalars(stmt).first()


def update_block(db: Session, block_id: int, data: BlockUpdate) -> Block | None:
    block = db.get(Block, block_id)
    if not block:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(block, key, value)
    db.commit()
    db.refresh(block)
    return block


def delete_block(db: Session, block_id: int) -> bool:
    block = db.get(Block, block_id)
    if not block:
        return False
    db.delete(block)
    db.commit()
    return True


def list_blocks(
    db: Session,
    date_from: date_type | None = None,
    date_to: date_type | None = None,
    category: str | None = None,
) -> list[Block]:
    stmt = select(Block)
    if date_from:
        stmt = stmt.where(Block.block_date >= date_from)
    if date_to:
        stmt = stmt.where(Block.block_date <= date_to)
    if category:
        stmt = stmt.where(Block.category == category)
    stmt = stmt.order_by(Block.block_date, Block.slot_index)
    return list(db.scalars(stmt))


def get_day_grid(db: Session, target: date_type) -> DayGrid:
    blocks = list(
        db.scalars(
            select(Block)
            .where(Block.block_date == target)
            .order_by(Block.slot_index)
        )
    )
    by_slot = {b.slot_index: b for b in blocks}
    slots = [
        SlotView(
            slot_index=i,
            block=BlockRead.model_validate(by_slot[i]) if i in by_slot else None,
        )
        for i in range(SLOTS_PER_DAY)
    ]
    return DayGrid(date=target, slots=slots, filled_count=len(blocks))