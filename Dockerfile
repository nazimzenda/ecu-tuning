# Node.js 22 LTS (Node 18 reached end-of-life in April 2025)
FROM node:22-alpine

WORKDIR /app

# Install Nginx and tini (PID 1 init for signal forwarding and zombie reaping)
RUN apk add --no-cache nginx tini

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application files
COPY . .

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create uploads directories (ephemeral fallback) and the Railway volume path
RUN mkdir -p uploads/modified /app/data/uploads/modified /run/nginx

# Expose port 8080 for Railway (Nginx reverse proxy)
EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

# Run tini as PID 1 so signals reach the Node process and zombies are reaped.
ENTRYPOINT ["/sbin/tini", "--"]

# nginx daemonizes, then scripts/start-all.js supervises the three Node servers
# and exits the container if any of them dies (instead of silently serving 502s).
CMD ["sh", "-c", "nginx -t && nginx && exec node scripts/start-all.js"]

# Both the API process and nginx must answer for the container to be healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -q --spider http://localhost:4000/ && wget -q --spider http://localhost:8080/healthz || exit 1
