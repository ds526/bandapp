 ---- deps stage: compile native deps (better-sqlite3) ----
FROM node:20-slim AS deps
WORKDIR /app

# python3/make/g++ are needed to build better-sqlite3's native binding if a
# prebuilt binary isn't available for this platform/arch. They stay in this
# stage only - the runtime image below never sees them.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# ---- runtime stage: just node + the app ----
FROM node:20-slim
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
# DB_PATH left unset - server/db/index.js defaults it to /app/data/bandlist.db,
# which lines up with the volume mounted below.

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "server/index.js"]
