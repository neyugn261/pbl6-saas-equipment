FROM node:24-bookworm-slim

WORKDIR /workspace
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.26.0
COPY . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter "./apps/**" --if-present build

ENV NODE_ENV=production
CMD ["node", "apps/api-gateway/dist/main.js"]
