# Base image
FROM node:18 AS base
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json ./
RUN rm -rf node_modules package-lock.json && npm install
COPY . .
# Install dependency build untuk canvas & sharp
RUN apt-get update && apt-get install -y python3 make g++ libvips-dev libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev && ln -sf /usr/bin/python3 /usr/bin/python && npm ci
# Install dependencies (pastikan semua yang dibutuhkan)

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runner
FROM node:18 AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3000

# Create user
RUN addgroup --gid 1001 nodejs && adduser --uid 1001 --gid 1001 --disabled-password --gecos "" nextjs

# Copy node_modules
COPY --from=builder /app/node_modules ./node_modules

# Copy built files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js

# Create required dirs
RUN mkdir -p public/tickets public/uploads public/certificates public/generated-tickets \
 && chown -R 1001:1001 /app/public \
 && chmod -R 755 /app/public \
 && chmod -R u+w /app/public/tickets /app/public/uploads /app/public/certificates /app/public/generated-tickets 

# Install timezone data and set timezone BEFORE switching user
RUN apt-get update && apt-get install -y tzdata && cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime && echo "Asia/Jakarta" > /etc/timezone
ENV TZ=Asia/Jakarta

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
