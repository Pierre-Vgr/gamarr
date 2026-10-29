# ---- Frontend build ----
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Backend runtime ----
FROM node:20-bookworm-slim AS backend
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src ./src
COPY --from=frontend-build /app/frontend/dist ./public

ENV NODE_ENV=production \
    DATA_DIR=/data \
    STATIC_DIR=/app/public \
    PORT=3000

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "src/server.js"]
