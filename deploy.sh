#!/bin/bash

# Configuration
PROJECT_DIR="~/mafia-voting-app"

echo "🚀 Starting Deployment..."

# Navigate to project directory
cd $PROJECT_DIR || { echo "❌ Directory $PROJECT_DIR not found"; exit 1; }

# Pull the latest images from Docker Hub
echo "📥 Pulling latest images..."
docker-compose pull

# Restart services with new images
echo "🔄 Restarting containers..."
docker-compose up -d --remove-orphans

# Cleanup unused images to save disk space
echo "🧹 Cleaning up old images..."
docker image prune -f

echo "✅ Deployment complete!"
