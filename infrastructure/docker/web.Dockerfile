FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@11.26.0
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter web build

FROM nginx:1.27-alpine
COPY infrastructure/nginx/demo.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
