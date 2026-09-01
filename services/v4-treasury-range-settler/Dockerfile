FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY services/v4-treasury-range-settler ./services/v4-treasury-range-settler
COPY scripts/lib ./scripts/lib
COPY deployments ./deployments
RUN chown -R node:node /app
USER node
CMD ["./node_modules/.bin/tsx", "services/v4-treasury-range-settler/src/index.ts"]
