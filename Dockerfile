# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install Nginx
RUN apk add --no-cache nginx

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create uploads directories
RUN mkdir -p uploads/modified

# Create Nginx run directory
RUN mkdir -p /run/nginx

# Expose ports for Nginx reverse proxy and Node servers
EXPOSE 8080 3000 3001 4000

# Set environment to production
ENV NODE_ENV=production

# Start Nginx and all three Node servers
CMD sh -c "nginx -g 'daemon off;' & node server.js & node client-server.js & node admin-server.js & wait"

