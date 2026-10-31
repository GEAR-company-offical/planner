# Day Logger — Smart Time Block Planner

## Overview

Day Logger is a personal time-tracking application built around 30-minute time blocks. Unlike conventional loggers that merely record past activity, Day Logger analyzes historical patterns and generates context-aware predictions for upcoming blocks, aiming to maintain a balanced distribution across work, rest, exercise, and other categories.

The application is available as a live demo: [https://planner-dutb.onrender.com](https://planner-dutb.onrender.com)

## Key Features

- **48-slot daily grid**: Each day is divided into 48 half-hour slots, presented as a scrollable horizontal timeline with mouse-wheel navigation.
- **ML-driven predictions**: A Random Forest classifier (`scikit-learn`) predicts the most likely category for future blocks based on day of week, hour, and the preceding block.
- **Day Balance scoring**: The system computes a target distribution from recent history and evaluates the current day on a 0–100 scale, indicating how closely it aligns with the user’s “golden mean.”
- **Visual analytics**: Four interactive charts (Chart.js) display category distribution, balance history, hourly activity, and day-of-week patterns.
- **Theme system**: Four color schemes (Midnight, Nord, Light, Matrix) persisted in `localStorage`.
- **Frictionless UX**: A single click records a block; no extra fields such as “energy level” or “status” are required.

## Technology Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic
- **Database**: SQLite (migration to PostgreSQL planned)
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 (CSS variables for theming), Chart.js
- **Machine Learning**: scikit-learn (Random Forest), joblib
- **DevOps**: Docker, Render
- **Testing**: Pytest, HTTPX

## Architecture and Prediction Algorithm

The prediction pipeline consists of two layers:

1. **ML model** (`train_model.py`): A Random Forest classifier is trained on historical blocks using three features — day of week, hour of day, and the encoded category of the previous block. The trained model and its label encoder are serialized to `model.pkl`.
2. **Balancing and constraints** (`predictor.py`): At inference time, the model’s predicted probabilities are adjusted by:
   - a **deficit penalty** that discourages over-representation of any category relative to the target distribution;
   - an **anti-repetition rule** that suppresses three identical consecutive blocks;
   - a **fallback heuristic** if the model file is unavailable.

The target distribution itself is derived from the last 14 days of activity, excluding nighttime hours (00:00–08:00). This ensures that the algorithm learns from active periods only and does not misinterpret sleep as “rest.”

## Local Setup

### Prerequisites

- Python 3.10+
- Git

### Steps

```bash
git clone https://github.com/GEAR-company-offical/planner.git
cd planner

python -m venv .venv
# Windows:
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt