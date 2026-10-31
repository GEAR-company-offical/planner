import random
from collections import Counter, defaultdict
from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from models import Block

def get_target_distribution(db: Session, target_date: date) -> dict[str, float]:
    """
    Вычисляет твою индивидуальную 'золотую середину' (идеальные пропорции)
    на основе последних 14 дней.
    """
    lookback_date = target_date - timedelta(days=14)
    stmt = select(Block.category).where(
        Block.block_date >= lookback_date,
        Block.block_date <= target_date  # <--- БЫЛО < target_date
    )
    categories = list(db.scalars(stmt))
    
    if not categories:
        # Если истории нет, задаем базовую здоровую норму
        return {
            "work": 0.30, "learning": 0.10, "exercise": 0.10, 
            "social": 0.10, "rest": 0.35, "chores": 0.05
        }
    
    # Считаем, сколько процентов времени занимает каждая категория
    counts = Counter(categories)
    total = sum(counts.values())
    return {cat: count / total for cat, count in counts.items()}

def get_historical_mode(db: Session, target_date: date, slot: int) -> str | None:
    """Смотрит, что ты обычно делал в этот слот времени."""
    lookback_date = target_date - timedelta(days=14)
    stmt = select(Block.category).where(
        Block.block_date >= lookback_date,
        Block.block_date <= target_date, # <--- БЫЛО < target_date
        Block.slot_index == slot
    )
    categories = list(db.scalars(stmt))
    if not categories:
        return None
    return Counter(categories).most_common(1)[0][0]

def generate_smart_grid(db: Session, target_date: date) -> list[dict]:
    """Генерирует предсказания, балансируя день к 'золотой середине'."""
    target_dist = get_target_distribution(db, target_date)
    all_categories = list(target_dist.keys())
    
    generated_slots = []
    current_counts = defaultdict(int)
    
    for slot in range(48):
        historical_cat = get_historical_mode(db, target_date, slot)
        
        # Вычисляем веса для каждой категории на этот слот
        weights = []
        for cat in all_categories:
            # 1. Базовый вес (насколько часто эта категория вообще встречается)
            weight = target_dist.get(cat, 0.01)
            
            # 2. Бонус за историчность (если мы обычно делали это в это время)
            if historical_cat == cat:
                weight *= 3.0
                
            # 3. Балансировка (Deficit). Если категории в сгенерированном дне 
            # стало слишком много по сравнению с целью, штрафуем её.
            current_ratio = current_counts[cat] / (slot + 1)
            if current_ratio > target_dist.get(cat, 0):
                weight *= 0.3  # Штраф за перебор
                
            weights.append(weight)
            
        # Нормализуем веса, чтобы они давали в сумме 1.0
        total_weight = sum(weights)
        if total_weight == 0:
            weights = [1/len(all_categories)] * len(all_categories)
        else:
            weights = [w / total_weight for w in weights]
            
        # Выбираем категорию на основе вероятностей
        chosen_cat = random.choices(all_categories, weights=weights, k=1)[0]
        
        current_counts[chosen_cat] += 1
        generated_slots.append({
            "slot_index": slot,
            "category": chosen_cat
        })
        
    return generated_slots


def calculate_day_score(db: Session, target_date: date) -> dict:
    """
    Считает баланс за скользящее окно в 7 дней (включая target_date).
    Сравнивает реальное распределение с целевым.
    """
    # 1. Окно: 7 дней (текущий + 6 дней назад)
    start_date = target_date - timedelta(days=6)
    
    stmt = select(Block.category).where(
        Block.block_date >= start_date,
        Block.block_date <= target_date
    )
    categories = list(db.scalars(stmt))
    
    if not categories:
        return {"score": 0, "total_blocks": 0}

    # 2. Считаем реальное распределение за неделю
    counts = Counter(categories)
    total = len(categories)
    actual_dist = {cat: count / total for cat, count in counts.items()}

    # 3. Получаем целевое распределение (на основе истории до этой недели)
    target_dist = get_target_distribution(db, start_date)

    # 4. Считаем разницу (Mean Absolute Error)
    all_cats = set(actual_dist.keys()) | set(target_dist.keys())
    diff = 0.0
    for cat in all_cats:
        diff += abs(actual_dist.get(cat, 0.0) - target_dist.get(cat, 0.0))

    # diff от 0 (идеально) до 2.0 (полностью наоборот)
    score = max(0, int(100 * (1 - (diff / 2.0))))

    return {
        "score": score,
        "total_blocks": total
    }