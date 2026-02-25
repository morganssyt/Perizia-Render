FROM node:20-alpine

# Prisma 5.x requires openssl on Alpine (musl libc)
RUN apk add --no-cache openssl

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
