FROM node:20

WORKDIR /app

# Copy root prisma schema
COPY prisma/ ./prisma/

# Copy worker files
COPY worker/package.json ./worker/package.json
COPY worker/tsconfig.json ./worker/tsconfig.json
COPY worker/src/ ./worker/src/

WORKDIR /app/worker

RUN npm install --ignore-scripts
RUN npx prisma generate --schema=../prisma/schema.prisma
RUN npm run build

CMD ["node", "dist/index.js"]
