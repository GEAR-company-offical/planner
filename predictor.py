from collections import Counter, defaultdict
from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from models import Block
from config import DAY_START_SLOT, DAY_END_SLOT

def get_target_distribution(db: Session, target_date: date) -> dict[str, float]:
    lookback_date = target_date - timedelta(days=14)
    stmt = select(Block.category).where(
        Block.block_date >= lookback_date,
        Block.block_date <= target_date,
        Block.slot_index >= DAY_START_SLOT # Игнорируем ночь
    )
    categories = list(db.scalars(stmt))
    
    if not categories:
        return {"work": 0.35, "learning": 0.10, "exercise": 0.15, "social": 0.10, "rest": 0.25, "chores": 0.05}
    
    counts = Counter(categories)
    total = sum(counts.values())
    return {cat: count / total for cat, count in counts.items()}

def get_context_features(db: Session, target_date: date) -> dict:
    """Собирает исторические данные для контекста."""
    lookback_date = target_date - timedelta(days=14)
    stmt = select(Block).where(
        Block.block_date >= lookback_date,
        Block.block_date < target_date,
        Block.slot_index >= DAY_START_SLOT
    )
    blocks = list(db.scalars(stmt))
    
    # 1. Что обычно делаем в этот слот времени
    slot_history = defaultdict(list)
    # 2. Что обычно делаем в этот день недели
    dow_history = defaultdict(list)
    # 3. Матрица переходов (что идет после чего)
    transitions = defaultdict(Counter)
    
    prev_cat = None
    for b in sorted(blocks, key=lambda x: (x.block_date, x.slot_index)):
        slot_history[b.slot_index].append(b.category)
        dow_history[b.block_date.weekday()].append(b.category)
        if prev_cat:
            transitions[prev_cat][b.category] += 1
        prev_cat = b.category
        
    return {
        "slot_modes": {s: Counter(cats).most_common(1)[0][0] for s, cats in slot_history.items()},
        "dow_modes": {d: Counter(cats).most_common(1)[0][0] for d, cats in dow_history.items()},
        "transitions": transitions
    }

def generate_smart_grid(db: Session, target_date: date) -> list[dict]:
    db.expire_all()
    target_dist = get_target_distribution(db, target_date)
    features = get_context_features(db, target_date)
    all_categories = list(target_dist.keys())
    
    generated_slots = []
    current_counts = defaultdict(int)
    
    # Добавляем пустые слоты для ночи (чтобы индексы совпадали с БД)
    for i in range(DAY_START_SLOT):
        generated_slots.append({"slot_index": i, "category": "rest"})

    prev_cat = None
    prev_prev_cat = None
    target_dow = target_date.weekday()

    for slot in range(DAY_START_SLOT, DAY_END_SLOT):
        scores = {}
        for cat in all_categories:
            score = 0.0
            
            # 1. Дефицит (Balancing) - самый важный фактор
            current_ratio = current_counts[cat] / ((slot - DAY_START_SLOT) + 1)
            deficit = target_dist.get(cat, 0) - current_ratio
            score += deficit * 10.0  # Сильный вес для баланса

            # 2. Исторический режим для этого времени (например, 09:00 = work)
            if features["slot_modes"].get(slot) == cat:
                score += 3.0

            # 3. Контекст дня недели (суббота утром != вторник утром)
            if features["dow_modes"].get(target_dow) == cat:
                score += 1.5
            
            # 4. Матрица переходов (если до этого был work, то дальше?)
            if prev_cat and features["transitions"][prev_cat].get(cat):
                transition_prob = features["transitions"][prev_cat][cat] / sum(features["transitions"][prev_cat].values())
                score += transition_prob * 2.0

            # 5. Анти-повторение (нельзя ставить 3 одинаковых блока подряд)
            if prev_cat == cat and prev_prev_cat == cat:
                score -= 5.0
            
            # Небольшой шум, чтобы дни не были абсолютно идентичными
            score += (hash((slot, cat, str(target_date))) % 100) / 1000.0
            
            scores[cat] = score

        # Выбираем категорию с максимальным счетом
        chosen_cat = max(scores, key=scores.get)
        
        current_counts[chosen_cat] += 1
        generated_slots.append({"slot_index": slot, "category": chosen_cat})
        
        prev_prev_cat = prev_cat
        prev_cat = chosen_cat
        
    return generated_slots

def calculate_day_score(db: Session, target_date: date) -> dict:
    db.expire_all()
    start_date = target_date - timedelta(days=6)
    
    stmt = select(Block.category).where(
        Block.block_date >= start_date,
        Block.block_date <= target_date,
        Block.slot_index >= DAY_START_SLOT
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
        Block.block_date <= target_date,
        Block.slot_index >= DAY_START_SLOT
    )
    categories = list(db.scalars(stmt))
    counts = Counter(categories)
    
    history = []
    for i in range(7):
        d = start_date + timedelta(days=i)
        day_blocks = list(db.scalars(select(Block.category).where(
            Block.block_date == d, Block.slot_index >= DAY_START_SLOT
        )))
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
    db.expire_all()
    start_date = end_date - timedelta(days=days)
    
    stmt = select(Block).where(
        Block.block_date >= start_date,
        Block.block_date <= end_date,
        Block.slot_index >= DAY_START_SLOT
    )
    blocks = list(db.scalars(stmt))
    blocks_by_date = defaultdict(list)
    for b in blocks:
        blocks_by_date[b.block_date].append(b.category)

    result = []
    current_date = start_date
    while current_date <= end_date:
        day_cats = blocks_by_date.get(current_date, [])
        if day_cats:
            counts = Counter(day_cats)
            dominant = counts.most_common(1)[0][0]
            total = len(day_cats)
            actual = {cat: count / total for cat, count in counts.items()}
            target = get_target_distribution(db, current_date)
            diff = sum(abs(actual.get(c, 0) - target.get(c, 0)) for c in set(actual) | set(target))
            score = max(0, int(100 * (1 - (diff / 2.0))))
        else:
            dominant, total, score = None, 0, 0

        result.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "dominant": dominant,
            "filled": total,
            "score": score
        })
        current_date += timedelta(days=1)
    return result