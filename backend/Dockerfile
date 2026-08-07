FROM python:3.11-slim

WORKDIR /app

# Copy files needed for dependency resolution
COPY pyproject.toml README.md ./

# Create a dummy app directory so pip install . succeeds and caches dependencies
RUN mkdir app && touch app/__init__.py \
    && pip install --no-cache-dir . \
    && pip install --no-cache-dir "bcrypt<5"

# Now copy the rest of the application
COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
