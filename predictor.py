from collections import Counter
from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Block

def get_predicted_category(db: Session, target_date: date, slot: int) -> str:
    """
    Предсказывает категорию для слота, анализируя историю за 14 дней до target_date.
    """
    # Смотрим на 14 дней назад от запрашиваемой даты
    lookback_date = target_date - timedelta(days=14)
    
    stmt = select(Block.category).where(
        Block.block_date >= lookback_date,
        Block.block_date < target_date,
        Block.slot_index == slot
    )
    categories = list(db.scalars(stmt))
    
    # Если истории нет — используем базовые правила (сон и работа)
    if not categories:
        hour = slot // 2
        if hour >= 23 or hour < 7:
            return "rest"
        elif 9 <= hour < 18:
            return "work"
        else:
            return "rest"
            
    # Возвращаем самую частую категорию в этот слот времени
    return Counter(categories).most_common(1)[0][0]


def generate_future_grid(db: Session, target_date: date) -> list[dict]:
    """Генерирует предсказания на весь день (48 слотов)."""
    predictions = []
    for slot in range(48):
        category = get_predicted_category(db, target_date, slot)
        predictions.append({
            "slot_index": slot,
            "category": category
        })
    return predictions