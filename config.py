from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "planner.db"

# В сутках всегда 48 слотов
SLOTS_PER_DAY = 48
SLOT_MINUTES = 30

# Активное время: с 16-го слота (08:00) до 48-го (23:30)
DAY_START_SLOT = 16
DAY_END_SLOT = 48

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