"""Скрипт для генерации реалистичных данных за последние 60 дней (с 08:00 до 24:00)."""
import random
from datetime import date, timedelta

from database import SessionLocal, init_db
from models import Block
from config import DAY_START_SLOT, DAY_END_SLOT

def seed_data():
    init_db()
    db = SessionLocal()
    today = date.today()

    # Очищаем базу полностью перед новой генерацией
    db.query(Block).delete()
    db.commit()

    print("Генерация реалистичных данных за последние 60 дней...")

    # Проходим по 60 дням назад
    for i in range(1, 61):
        target_date = today - timedelta(days=i)
        dow = target_date.weekday() # 0 = Понедельник, 6 = Воскресенье

        # Генерируем только с 16 слота (08:00) по 47 (23:30)
        for slot in range(DAY_START_SLOT, DAY_END_SLOT):
            hour = slot // 2
            
            # 10% шанс, что мы забыли залогировать блок (пропуск в данных)
            if random.random() < 0.10:
                continue

            category = "rest"

            # ===== БУДНИЕ ДНИ (Пн-Пт) =====
            if dow < 5: 
                if 8 <= hour < 9:
                    # Утро: рутина, зарядка, завтрак
                    category = random.choices(["chores", "exercise", "rest"], weights=[0.5, 0.3, 0.2])[0]
                elif 9 <= hour < 13 or 14 <= hour < 18:
                    # Рабочий день (до и после обеда)
                    category = random.choices(["work", "work", "work", "learning", "rest"], weights=[0.6, 0.2, 0.1, 0.05, 0.05])[0]
                elif hour == 13:
                    # Обед
                    category = "chores" 
                elif 18 <= hour < 20:
                    # Вечер после работы: дела, спорт, встречи
                    category = random.choices(["chores", "exercise", "social"], weights=[0.4, 0.4, 0.2])[0]
                else:
                    # Поздний вечер: отдых или учеба
                    category = random.choices(["rest", "learning", "social"], weights=[0.5, 0.3, 0.2])[0]
            
            # ===== ВЫХОДНЫЕ (Сб-Вс) =====
            else: 
                if 8 <= hour < 12:
                    # Утро выходного дня: отсыпаемся или делаем дела
                    category = random.choices(["rest", "chores"], weights=[0.6, 0.4])[0]
                elif 12 <= hour < 18:
                    # День: гуляем, общаемся
                    category = random.choices(["social", "exercise", "learning", "chores"], weights=[0.4, 0.3, 0.2, 0.1])[0]
                else:
                    # Вечер выходного: расслабляемся
                    category = random.choices(["rest", "social"], weights=[0.7, 0.3])[0]

            # ===== ДОБАВЛЯЕМ "ГРЕШКИ" ДЛЯ АЛГОРИТМА =====
            # Среда — день жесткого овертайма (алгоритм должен понять, что это перебор)
            if dow == 2 and 9 <= hour < 21: 
                category = "work" if hour != 13 else "chores"
            
            # Пятница — день прокрастинации (алгоритм должен понять, что не хватает работы)
            if dow == 4 and 9 <= hour < 18: 
                category = random.choices(["rest", "social", "learning"], weights=[0.5, 0.3, 0.2])[0]

            # Сохраняем блок в базу
            block = Block(
                block_date=target_date,
                slot_index=slot,
                category=category
            )
            db.add(block)

    db.commit()
    db.close()
    print("Готово! База заполнена данными за 60 дней (только с 08:00 до 24:00).")

if __name__ == "__main__":
    seed_data()