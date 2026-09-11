FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY docker/entrypoint.sh /entrypoint.sh
COPY --from=build /app/dist ./dist
RUN chmod +x /entrypoint.sh
RUN mkdir -p /data/layouts
EXPOSE 8080
ENV STATIC_DIR=/app/dist \
    DATA_DIR=/data \
    MQTT_HOST=localhost \
    MQTT_PORT=1883 \
    MQTT_PATH=/mqtt \
    MQTT_TLS=false \
    MQTT_USER= \
    MQTT_PASSWORD=
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/mqtt-bridge.mjs"]
