import random
from collections import Counter, defaultdict
from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from models import Block


def get_target_distribution(db: Session, target_date: date) -> dict[str, float]:
    lookback_date = target_date - timedelta(days=14)
    stmt = select(Block.category).where(
        Block.block_date >= lookback_date,
        Block.block_date <= target_date
    )
    categories = list(db.scalars(stmt))
    
    if not categories:
        return {
            "work": 0.30, "learning": 0.10, "exercise": 0.10, 
            "social": 0.10, "rest": 0.35, "chores": 0.05
        }
    
    counts = Counter(categories)
    total = sum(counts.values())
    return {cat: count / total for cat, count in counts.items()}


def get_historical_mode(db: Session, target_date: date, slot: int) -> str | None:
    lookback_date = target_date - timedelta(days=14)
    stmt = select(Block.category).where(
        Block.block_date >= lookback_date,
        Block.block_date <= target_date,
        Block.slot_index == slot
    )
    categories = list(db.scalars(stmt))
    if not categories:
        return None
    return Counter(categories).most_common(1)[0][0]


def generate_smart_grid(db: Session, target_date: date) -> list[dict]:
    db.expire_all() # Сбрасываем кэш перед генерацией
    target_dist = get_target_distribution(db, target_date)
    all_categories = list(target_dist.keys())
    
    generated_slots = []
    current_counts = defaultdict(int)
    
    for slot in range(48):
        historical_cat = get_historical_mode(db, target_date, slot)
        
        weights = []
        for cat in all_categories:
            weight = target_dist.get(cat, 0.01)
            if historical_cat == cat:
                weight *= 3.0
            current_ratio = current_counts[cat] / (slot + 1)
            if current_ratio > target_dist.get(cat, 0):
                weight *= 0.3
            weights.append(weight)
            
        total_weight = sum(weights)
        if total_weight == 0:
            weights = [1/len(all_categories)] * len(all_categories)
        else:
            weights = [w / total_weight for w in weights]
            
        chosen_cat = random.choices(all_categories, weights=weights, k=1)[0]
        
        current_counts[chosen_cat] += 1
        generated_slots.append({
            "slot_index": slot,
            "category": chosen_cat
        })
        
    return generated_slots


def calculate_day_score(db: Session, target_date: date) -> dict:
    db.expire_all() # Сбрасываем кэш перед подсчетом
    start_date = target_date - timedelta(days=6)
    
    stmt = select(Block.category).where(
        Block.block_date >= start_date,
        Block.block_date <= target_date
    )
    categories = list(db.scalars(stmt))
    
    if not categories:
        return {"score": 0, "total_blocks": 0}

    counts = Counter(categories)
    total = len(categories)
    actual_dist = {cat: count / total for cat, count in counts.items()}
    target_dist = get_target_distribution(db, start_date)

    all_cats = set(actual_dist.keys()) | set(target_dist.keys())
    diff = sum(abs(actual_dist.get(cat, 0.0) - target_dist.get(cat, 0.0)) for cat in all_cats)
    score = max(0, int(100 * (1 - (diff / 2.0))))

    return {"score": score, "total_blocks": total}


def get_chart_data(db: Session, target_date: date) -> dict:
    db.expire_all()
    start_date = target_date - timedelta(days=6)
    
    stmt = select(Block.category).where(
        Block.block_date >= start_date,
        Block.block_date <= target_date
    )
    categories = list(db.scalars(stmt))
    counts = Counter(categories)
    
    history = []
    for i in range(7):
        d = start_date + timedelta(days=i)
        day_blocks = list(db.scalars(select(Block.category).where(Block.block_date == d)))
        if day_blocks:
            day_counts = Counter(day_blocks)
            total = len(day_blocks)
            actual = {cat: count / total for cat, count in day_counts.items()}
            target = get_target_distribution(db, d)
            diff = sum(abs(actual.get(c, 0) - target.get(c, 0)) for c in set(actual) | set(target))
            score = max(0, int(100 * (1 - (diff / 2.0))))
        else:
            score = 0
        history.append({"date": d.strftime("%d.%m"), "score": score, "has_data": len(day_blocks) > 0})

    return {"distribution": dict(counts), "history": history}



def get_calendar_heatmap(db: Session, end_date: date, days: int = 120) -> list[dict]:
    """Генерирует данные для GitHub-style календаря."""
    db.expire_all()
    start_date = end_date - timedelta(days=days)
    
    stmt = select(Block).where(
        Block.block_date >= start_date,
        Block.block_date <= end_date
    )
    blocks = list(db.scalars(stmt))
    
    # Группируем блоки по датам
    blocks_by_date = defaultdict(list)
    for b in blocks:
        blocks_by_date[b.block_date].append(b.category)

    result = []
    current_date = start_date
    while current_date <= end_date:
        day_cats = blocks_by_date.get(current_date, [])
        
        if day_cats:
            counts = Counter(day_cats)
            # Доминирующая категория
            dominant = counts.most_common(1)[0][0]
            total = len(day_cats)
            
            # Считаем скор именно для этого дня
            actual = {cat: count / total for cat, count in counts.items()}
            target = get_target_distribution(db, current_date)
            diff = sum(abs(actual.get(c, 0) - target.get(c, 0)) for c in set(actual) | set(target))
            score = max(0, int(100 * (1 - (diff / 2.0))))
        else:
            dominant = None
            total = 0
            score = 0

        result.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "dominant": dominant,
            "filled": total,
            "score": score
        })
        current_date += timedelta(days=1)

    return result