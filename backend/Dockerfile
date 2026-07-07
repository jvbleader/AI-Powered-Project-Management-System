FROM python:3.11-slim

WORKDIR /app

COPY . .
RUN pip install --no-cache-dir . \
  && pip install --no-cache-dir "bcrypt<5"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
