FROM node:20-slim
RUN npm install -g pnpm@9

WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN cd apps/web && pnpm build

EXPOSE 3000
CMD ["sh", "-c", "cd apps/web && npx next start -p 3000"]