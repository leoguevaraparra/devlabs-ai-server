FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install native dependencies for SQLite (required for Alpine Linux compatibility)
RUN apk add --no-cache python3 make g++ sqlite

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install NPM dependencies
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# Set environment to production
ENV NODE_ENV=production

# Expose the API port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
