# FROM node:20-slim
# RUN npm install -g pnpm@9
# RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# WORKDIR /app
# COPY . .
# RUN pnpm install --no-frozen-lockfile
# RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
# RUN cd apps/api && npx nest build

# EXPOSE 4000
# CMD sh -c "npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma && node apps/api/dist/main.js"

FROM node:20-slim
RUN npm install -g pnpm@9
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN cd apps/api && npx nest build

EXPOSE 4000
CMD sh -c "npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma && cd /app/packages/db && npx tsx src/seed.ts && cd /app && node apps/api/dist/main.js"