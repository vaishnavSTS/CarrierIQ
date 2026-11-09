FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
# Chromium for the Score Card Sharing API (prints the Safety Score Report page as a PDF).
RUN playwright install --with-deps chromium

COPY alembic.ini ./
COPY alembic ./alembic

EXPOSE 8000

# Apply migrations, then start the API. Hosts such as Render set PORT; local Docker uses 8000.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
