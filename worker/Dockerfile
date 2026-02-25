FROM node:20-slim

# Prisma 5.x requires openssl on Debian slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root prisma schema
COPY prisma/ ./prisma/

# Copy worker files
COPY worker/package.json ./worker/package.json
COPY worker/tsconfig.json ./worker/tsconfig.json
COPY worker/src/ ./worker/src/

WORKDIR /app/worker

RUN npm install
RUN npx prisma generate --schema=../prisma/schema.prisma
RUN npm run build

CMD ["node", "dist/index.js"]
