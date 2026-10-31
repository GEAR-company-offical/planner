import random
import joblib
from collections import Counter, defaultdict
from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from models import Block
from config import DAY_START_SLOT, DAY_END_SLOT, BASE_DIR

MODEL_PATH = BASE_DIR / "model.pkl"
_ml_cache = None

def load_ml_model():
    global _ml_cache
    if _ml_cache is None:
        try:
            _ml_cache = joblib.load(MODEL_PATH)
        except FileNotFoundError:
            _ml_cache = False
    return _ml_cache

def get_target_distribution(db: Session, target_date: date) -> dict[str, float]:
    lookback_date = target_date - timedelta(days=14)
    stmt = select(Block.category).where(
        Block.block_date >= lookback_date,
        Block.block_date <= target_date,
        Block.slot_index >= DAY_START_SLOT
    )
    categories = list(db.scalars(stmt))
    if not categories:
        return {"work": 0.35, "learning": 0.10, "exercise": 0.15, "social": 0.10, "rest": 0.25, "chores": 0.05}
    counts = Counter(categories)
    total = sum(counts.values())
    return {cat: count / total for cat, count in counts.items()}

def generate_smart_grid(db: Session, target_date: date) -> list[dict]:
    db.expire_all()
    target_dist = get_target_distribution(db, target_date)
    all_categories = list(target_dist.keys())
    ml_data = load_ml_model()
    
    generated_slots = []
    current_counts = defaultdict(int)
    
    for i in range(DAY_START_SLOT):
        generated_slots.append({"slot_index": i, "category": "rest"})

    prev_cat_encoded = -1
    target_dow = target_date.weekday()

    for slot in range(DAY_START_SLOT, DAY_END_SLOT):
        hour = slot // 2
        
        probs = {}
        
        # 1. Предсказание от ML-модели (если она загружена)
        if ml_data:
            model = ml_data["model"]
            le = ml_data["encoder"]
            
            # Модель предсказывает вероятности для всех классов
            X_pred = [[target_dow, hour, prev_cat_encoded]]
            ml_probs = model.predict_proba(X_pred)[0]
            
            # Переводим индексы классов обратно в названия категорий
            for class_idx, prob in enumerate(ml_probs):
                cat_name = le.inverse_transform([class_idx])[0]
                if prob > 0.05: # Берем только значимые вероятности
                    probs[cat_name] = prob
        else:
            # Fallback: равномерное распределение, если модели нет
            probs = {cat: 1.0 for cat in all_categories}

        # 2. Балансировка (Deficit): штрафуем переборы
        for cat in list(probs.keys()):
            current_ratio = current_counts[cat] / ((slot - DAY_START_SLOT) + 1)
            target = target_dist.get(cat, 0.1)
            if current_ratio > target:
                penalty = (current_ratio - target) * 3.0
                probs[cat] = max(0.01, probs[cat] - penalty)

        # 3. Запрет на 3 одинаковых блока подряд
        if len(generated_slots) >= 2 and generated_slots[-1]["category"] == generated_slots[-2]["category"]:
            last_cat = generated_slots[-1]["category"]
            if last_cat in probs:
                probs[last_cat] *= 0.1

        # Нормализация
        total_p = sum(probs.values())
        if total_p == 0:
            probs = {cat: 1.0 / len(all_categories) for cat in all_categories}
        else:
            probs = {cat: p / total_p for cat, p in probs.items()}

        # Выбор
        chosen_cat = random.choices(list(probs.keys()), weights=list(probs.values()), k=1)[0]
        
        current_counts[chosen_cat] += 1
        generated_slots.append({"slot_index": slot, "category": chosen_cat})
        
        # Обновляем prev_cat для следующего шага
        if ml_data:
            prev_cat_encoded = ml_data["encoder"].transform([chosen_cat])[0]

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

def get_advanced_analytics(db: Session, target_date: date) -> dict:
    db.expire_all()
    start_date = target_date - timedelta(days=30) # Смотрим на месяц назад
    
    stmt = select(Block).where(
        Block.block_date >= start_date,
        Block.block_date <= target_date,
        Block.slot_index >= DAY_START_SLOT
    )
    blocks = list(db.scalars(stmt))
    
    hourly = defaultdict(lambda: defaultdict(int))
    dow_dist = defaultdict(lambda: defaultdict(int))
    
    for b in blocks:
        hour = b.slot_index // 2
        dow = b.block_date.weekday()
        hourly[hour][b.category] += 1
        dow_dist[dow][b.category] += 1
        
    return {
        "hourly": hourly,
        "dow": dow_dist
    }
















