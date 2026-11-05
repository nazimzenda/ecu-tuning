# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install Nginx and tini (PID 1 init for signal forwarding and zombie reaping)
RUN apk add --no-cache nginx tini

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create uploads directories (for ephemeral storage fallback)
RUN mkdir -p uploads/modified

# Create data directory for Railway Volume mount
# When Railway Volume is attached, it mounts to /app/data
# and this directory will be replaced with persistent storage
RUN mkdir -p /app/data/uploads/modified

# Create Nginx run directory
RUN mkdir -p /run/nginx

# Expose port 8080 for Railway (Nginx reverse proxy)
EXPOSE 8080

# Set environment to production
ENV NODE_ENV=production
ENV PORT=8080

# Run tini as PID 1 so signals reach the shell and zombie processes are reaped
ENTRYPOINT ["/sbin/tini", "--"]

# NOTE: intentionally no USER directive - the container runs as root because
# nginx needs root to bind ports and manage its worker processes. All Node
# processes are reaped by tini (PID 1) above.

# Start Nginx and all three Node servers with error output
CMD sh -c "nginx -t && nginx && sleep 2 && node server.js & node client-server.js & node admin-server.js & wait"

# Nginx must answer on 8080 for the container to be healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q --spider http://localhost:8080/ || exit 1

