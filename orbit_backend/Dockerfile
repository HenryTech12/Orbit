FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    sed \
    && rm -rf /var/lib/apt/lists/*

COPY orbit_app/requirements.txt .

# Remove Django==6.1.1 line from requirements.txt inside container and install compatible range
RUN sed -i '/^Django==/d' requirements.txt && \
    pip install --no-cache-dir "Django>=5.2,<6.1" -r requirements.txt

COPY . .

WORKDIR /app/orbit_app

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
