# syntax=docker/dockerfile:1

# ----------------------------
# Build stage
# ----------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copy dependency metadata first for better layer caching.
COPY package.json package-lock.json ./

# Reproducible dependency install.
RUN npm ci

# Copy application source.
COPY . .

# Expected to produce /app/dist.
RUN npm run build


# ----------------------------
# Runtime stage
# ----------------------------
FROM nginxinc/nginx-unprivileged:1.30.5

# Replace default nginx configuration.
COPY --chown=nginx:nginx nginx.conf /etc/nginx/nginx.conf

# Copy built static assets.
COPY --from=build --chown=nginx:nginx /app/dist/ /usr/share/nginx/html/

EXPOSE 8080