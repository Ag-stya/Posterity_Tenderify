FROM node:20-slim
RUN npm install -g pnpm@9
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN cd apps/worker && npx nest build

VOLUME /root/.cache
CMD ["node", "apps/worker/dist/main.js"]