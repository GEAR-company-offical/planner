from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "planner.db"

SLOTS_PER_DAY = 48
SLOT_MINUTES = 30

CATEGORIES = [
    "work",
    "learning",
    "exercise",
    "social",
    "rest",
    "chores",
]

STATUSES = ["done", "skipped", "planned"]