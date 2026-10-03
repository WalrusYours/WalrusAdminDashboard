# Standalone build, context = this folder:  docker build -t walrus-dashboard walrus-dashboard-client/
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# The official nginx image renders /etc/nginx/templates/*.template with envsubst at start,
# so WALRUS_UPSTREAM is set by compose, not baked into the image.
FROM nginx:1.27-alpine
ENV WALRUS_UPSTREAM=http://walrus:8080
COPY deploy/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
