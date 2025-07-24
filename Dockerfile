# Multi-stage Dockerfile for production optimization
FROM node:24-alpine AS base

# Install build dependencies for native modules (including USB support)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    eudev-dev \
    libusb-dev \
    pkgconfig \
    libc6-compat

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with error handling
RUN set -e; \
    echo "Starting dependency installation..."; \
    if [ -f package-lock.json ]; then \
      echo "Using package-lock.json with npm ci..."; \
      npm ci --omit=dev --verbose --no-audit || { \
        echo "npm ci failed, trying without package-lock.json..."; \
        rm -f package-lock.json; \
        npm install --omit=dev --verbose --no-audit; \
      }; \
    else \
      echo "Using npm install..."; \
      npm install --omit=dev --verbose --no-audit; \
    fi && \
    echo "Cleaning npm cache..." && \
    npm cache clean --force && \
    echo "Dependencies installed successfully!"

# Development stage
FROM base AS development
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --verbose; \
    else \
      npm install --verbose; \
    fi
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Production stage
FROM base AS production
WORKDIR /app

# Install runtime dependencies for USB support
RUN apk add --no-cache eudev libusb

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs src/ ./src/
COPY --chown=nodejs:nodejs package*.json ./

# Create directory for generated labels with proper permissions
RUN mkdir -p generated_labels && \
    chown -R nodejs:nodejs generated_labels

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]
