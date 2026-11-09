FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Chromium for the Score Card Sharing API (prints the Safety Score Report page as a PDF).
# Playwright's installer runs its own Node, which needs libatomic1 (not in the slim image);
# --with-deps then adds Chromium's libraries. Done before the app code is copied, so code changes
# reuse this layer instead of downloading Chromium again; `pip install .` keeps this Playwright.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "playwright>=1.48" \
    && playwright install --with-deps chromium

COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

COPY alembic.ini ./
COPY alembic ./alembic

EXPOSE 8000

# Apply migrations, then start the API. Hosts such as Render set PORT; local Docker uses 8000.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
