FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root prisma schema (needed for prisma generate)
COPY prisma/ ./prisma/

# Copy pre-compiled worker (dist/ is compiled locally)
COPY worker/package.json ./
COPY worker/dist/ ./dist/

# Install production deps only (no compilation needed)
RUN npm install --omit=dev --ignore-scripts

# Generate Prisma client for linux target
RUN npx prisma generate --schema=../prisma/schema.prisma

CMD ["node", "dist/index.js"]
