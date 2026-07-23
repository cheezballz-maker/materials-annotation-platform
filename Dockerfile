FROM node:22-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV ANNOTATION_WORKSPACE_PATH=/data/workspace
ENV ANNOTATION_SEED_WORKSPACE=1

WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY seed-workspace /app/seed-workspace
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
COPY README.md /app/README.md

RUN mkdir -p /data/workspace

EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
