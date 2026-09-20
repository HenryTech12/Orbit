FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY orbit_app/requirements.txt orbit_app/requirements.txt
RUN pip install --no-cache-dir -r orbit_app/requirements.txt

COPY . .

EXPOSE 8000
CMD ["python", "orbit_app/manage.py", "runserver", "0.0.0.0:8000"]
