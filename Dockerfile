FROM node:22-alpine

WORKDIR /app

# Install runtime deps first so this layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy sources and produce dist/.
COPY . .
RUN npm run build

EXPOSE 8080
CMD ["./node_modules/.bin/http-server", "dist", "-p", "8080", "-c-1"]
