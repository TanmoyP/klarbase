# Single-service production image: builds the client, runs the server,
# which serves client/dist statically (same origin => no CORS).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY core/package.json core/
COPY server/package.json server/
COPY client/package.json client/
RUN npm install
COPY core core
COPY client client
RUN npm run build -w @klar/client

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
COPY server server
RUN cd server && npx prisma generate
EXPOSE 3000
# migrate then serve (idempotent; safe on every boot)
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node src/index.js"]
