# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create uploads directories
RUN mkdir -p uploads/modified

# Expose ports for API, client, and admin servers
EXPOSE 3000 3001 4000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]

