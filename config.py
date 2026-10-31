from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "planner.db"

# Новые рамки: с 08:00 (16-й слот) до 24:00 (48-й слот)
DAY_START_SLOT = 16
DAY_END_SLOT = 48
SLOTS_PER_DAY = DAY_END_SLOT - DAY_START_SLOT  # Будет 32
SLOT_MINUTES = 30

CATEGORIES = [
    "work",
    "learning",
    "exercise",
    "social",
    "rest",
    "chores",
]

STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)