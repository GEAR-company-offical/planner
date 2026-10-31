"""Скрипт для обучения ML-модели (Random Forest)."""
import joblib
import pandas as pd
from sqlalchemy import select
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from config import BASE_DIR
from database import SessionLocal
from models import Block

MODEL_PATH = BASE_DIR / "model.pkl"

def train():
    db = SessionLocal()
    stmt = select(Block).order_by(Block.block_date, Block.slot_index)
    blocks = list(db.scalars(stmt))
    db.close()

    if len(blocks) < 50:
        print("Недостаточно данных для обучения (нужно хотя бы 50 блоков).")
        return

    # Подготавливаем данные
    data = []
    for b in blocks:
        data.append({
            "dow": b.block_date.weekday(),
            "hour": b.slot_index // 2,
            "category": b.category
        })
    
    df = pd.DataFrame(data)
    
    # Кодируем целевую переменную (категории в числа)
    le = LabelEncoder()
    df["target"] = le.fit_transform(df["category"])
    
    # Создаем признак "предыдущая категория"
    df["prev_category"] = df["target"].shift(1).fillna(-1).astype(int)

    # Признаки (X) и цель (y)
    X = df[["dow", "hour", "prev_category"]]
    y = df["target"]

    # Обучаем Random Forest
    print(f"Обучение модели на {len(df)} примерах...")
    model = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
    model.fit(X, y)

    # Сохраняем модель и энкодер
    joblib.dump({"model": model, "encoder": le}, MODEL_PATH)
    print(f"Модель сохранена в {MODEL_PATH}")

if __name__ == "__main__":
    train()