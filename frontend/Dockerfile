# Build context: the project root (see docker-compose.yml), because the build publishes
# LICENSE from outside frontend/ as /LICENSE.txt. The wiki, privacy policy and patch notes
# are separate sites (wiki., privacy. and patch.arabdev.site) and are not part of this image.
FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY LICENSE /app/LICENSE
RUN npm run build

FROM nginx:1.29-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
