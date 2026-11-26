FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY sensor.js server.js csv.js history.js operator.js ./
COPY operator ./operator
ENV SENSOR_HOST=0.0.0.0 SENSOR_PORT=8080 ENABLE_PASSIVE_PROBE_SENSOR=false ENABLE_SENSOR_DASHBOARD=false
USER node
EXPOSE 8080
CMD ["node", "server.js"]
