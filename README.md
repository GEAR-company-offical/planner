Понял. Вот README без тройных обратных кавычек — можно копировать целиком сразу.

# Day Logger — Smart Time Block Planner

Day Logger is a personal time-tracking application built around 30-minute time blocks. Unlike conventional loggers that merely record past activity, Day Logger analyzes historical patterns and generates context-aware predictions for upcoming blocks, aiming to maintain a balanced distribution across work, rest, exercise, and other categories.

**Live demo:** [https://planner-dutb.onrender.com](https://planner-dutb.onrender.com)

---

## Key Features

- **48-slot daily grid** — Each day is divided into 48 half-hour slots, presented as a scrollable horizontal timeline with mouse-wheel navigation.
- **ML-driven predictions** — A Random Forest classifier (`scikit-learn`) predicts the most likely category for future blocks based on day of week, hour, and the preceding block.
- **Day Balance scoring** — The system computes a target distribution from recent history and evaluates the current day on a 0–100 scale, indicating how closely it aligns with the user's "golden mean."
- **Visual analytics** — Four interactive charts (Chart.js) display category distribution, balance history, hourly activity, and day-of-week patterns.
- **Theme system** — Four color schemes (Midnight, Nord, Light, Matrix) persisted in `localStorage`.
- **Frictionless UX** — A single click records a block; no extra fields such as "energy level" or "status" are required.
- **Active window** — Only the hours from 08:00 to 24:00 are considered active and used in analytics and predictions; nighttime (00:00–08:00) is excluded so that sleep is not misclassified as rest.

---

## Technology Stack

- **Backend:** Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic
- **Database:** SQLite (migration to PostgreSQL planned)
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (CSS variables for theming), Chart.js
- **Machine Learning:** scikit-learn (Random Forest), joblib
- **DevOps:** Docker, Render
- **Testing:** Pytest, HTTPX

---

## Architecture and Prediction Algorithm

The prediction pipeline consists of two layers:

1. **ML model** (`train_model.py`) — A Random Forest classifier is trained on historical blocks using three features: day of week, hour of day, and the encoded category of the previous block. The trained model and its label encoder are serialized to `model.pkl`.

2. **Balancing and constraints** (`predictor.py`) — At inference time, the model's predicted probabilities are adjusted by:
   - a **deficit penalty** that discourages over-representation of any category relative to the target distribution;
   - an **anti-repetition rule** that suppresses three identical consecutive blocks;
   - a **fallback heuristic** if the model file is unavailable.

The target distribution itself is derived from the last 14 days of activity, excluding nighttime hours (00:00–08:00). This ensures that the algorithm learns from active periods only and does not misinterpret sleep as "rest."

---

## Project Structure

    planner/
    ├── app.py                  # FastAPI application entry point
    ├── config.py               # Constants: slot counts, active window, categories
    ├── database.py             # SQLAlchemy engine and session factory
    ├── models.py               # Block ORM model
    ├── schemas.py              # Pydantic request/response schemas
    ├── crud.py                 # Database operations
    ├── predictor.py            # ML inference + balancing logic
    ├── train_model.py          # Model training script
    ├── seed_v2.py              # Realistic 60-day data generator
    ├── requirements.txt
    ├── Dockerfile
    ├── static/
    │   ├── index.html          # SPA shell
    │   ├── style.css           # Themes and layout
    │   └── app.js              # Frontend logic and charts
    └── tests/
        └── test_blocks.py      # API tests

---

## Local Setup

### Prerequisites

- Python 3.10+
- Git

### Steps

    git clone https://github.com/GEAR-company-offical/planner.git
    cd planner
    python -m venv .venv

    # Windows:
    .\.venv\Scripts\Activate.ps1

    # macOS/Linux:
    source .venv/bin/activate

    pip install -r requirements.txt

**Optional: generate realistic historical data**

    python seed_v2.py

**Train the ML model**

    python train_model.py

**Run the application**

    uvicorn app:app --reload

The application will be available at `http://127.0.0.1:8000`.

---

## Docker

    docker build -t day-logger .
    docker run -p 8000:8000 day-logger

---

## Testing

    pytest -v

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/meta` | Categories and slot count |
| POST | `/blocks` | Create a time block |
| GET | `/blocks` | List blocks (filterable) |
| GET | `/days/{date}` | Full day grid (48 slots) |
| PATCH | `/blocks/{id}` | Update a block |
| DELETE | `/blocks/{id}` | Delete a block |
| GET | `/predict/{date}` | ML predictions for a date |
| GET | `/score/{date}` | Day balance score |
| GET | `/charts/{date}` | Chart data (distribution, history) |
| GET | `/calendar/{date}` | 120-day heatmap data |
| GET | `/analytics/{date}` | Hourly and day-of-week analytics |

---

## Roadmap

- [ ] Migrate from SQLite to PostgreSQL for persistent storage on Render.
- [ ] Telegram bot for 30-minute reminders and one-tap logging.
- [ ] Collect a real user dataset and retrain the model with additional features (e.g., transition sequences, time since last break).
- [ ] CI/CD pipeline via GitHub Actions.

---

## License

This project is intended for educational and personal use.