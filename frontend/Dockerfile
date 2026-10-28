FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci
COPY frontend ./frontend
ARG VITE_API_BASE_URL=/api
ARG VITE_APPID_CLIENT_ID
ARG VITE_APPID_DISCOVERY_ENDPOINT
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APPID_CLIENT_ID=$VITE_APPID_CLIENT_ID \
    VITE_APPID_DISCOVERY_ENDPOINT=$VITE_APPID_DISCOVERY_ENDPOINT
RUN npm run build -w frontend

FROM nginx:1.30.6-alpine3.24-slim
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
