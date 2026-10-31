# Используем легковесный образ Python
FROM python:3.11-slim

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Сначала копируем только файл зависимостей, чтобы использовать кэш Docker
COPY requirements.txt .

# Устанавливаем зависимости
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Копируем весь остальной код проекта
COPY . .

# Открываем порт 8000 (информативно)
EXPOSE 8000

# Команда для запуска сервера. 
# Используем ${PORT:-8000}, чтобы работать и локально, и на хостинге.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]