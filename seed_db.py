"""Скрипт для заполнения базы тестовыми данными за прошедшую неделю."""
import random
from datetime import date, timedelta

from database import SessionLocal, init_db
from models import Block

def seed_data():
    init_db()
    db = SessionLocal()
    today = date.today()

    # Удаляем старые тестовые данные (на всякий случай), кроме сегодняшнего дня
    db.query(Block).filter(Block.block_date < today).delete()
    db.commit()

    print("Генерация данных за последние 7 дней...")

    # Проходим по 7 дням назад
    for i in range(1, 8):
        target_date = today - timedelta(days=i)
        
        for slot in range(48):
            hour = slot // 2
            
            # 1. СОН (с 23:30 до 07:00) - всегда rest
            if hour >= 23 or hour < 7:
                category = "rest"
                # 90% шанс, что мы это залогировали (иногда просто проспали и не отметили)
                if random.random() < 0.10:
                    continue 
            
            # 2. УТРО (07:00 - 09:00) - зарядка, завтрак, рутина
            elif 7 <= hour < 9:
                category = random.choices(
                    ["chores", "exercise", "rest"], 
                    weights=[0.5, 0.3, 0.2]
                )[0]
                
            # 3. РАБОЧИЙ ДЕНЬ (09:00 - 17:00) - работа, иногда перерывы
            elif 9 <= hour < 17:
                # В обед (13:00-14:00) отдыхаем или едим
                if hour == 13:
                    category = "chores"
                else:
                    category = random.choices(
                        ["work", "learning", "rest"], 
                        weights=[0.75, 0.15, 0.10]
                    )[0]
                    
            # 4. ВЕЧЕР (17:00 - 23:00) - спорт, друзья, отдых
            else:
                category = random.choices(
                    ["social", "exercise", "rest", "learning"], 
                    weights=[0.25, 0.25, 0.35, 0.15]
                )[0]

            # 5. СЛУЧАЙНЫЕ ПРОПУСКИ (10% шанс, что ты забыл залогировать блок)
            # Увеличиваем шанс пропуска вечером, если это не сон
            if category != "rest" and random.random() < 0.15:
                continue

            # Добавляем блок в базу
            block = Block(
                block_date=target_date,
                slot_index=slot,
                category=category
            )
            db.add(block)

    db.commit()
    db.close()
    print("Готово! База заполнена тестовыми данными.")

if __name__ == "__main__":
    seed_data()