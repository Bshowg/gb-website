#!/bin/bash
# Start PHP development server for Sailing Bizzosa

echo "Starting PHP development server for Sailing Bizzosa..."
echo "Server will be available at: http://localhost:8000"
echo "Press Ctrl+C to stop the server"

# Change to the bizzosa directory and start PHP server
cd "$(dirname "$0")"
php -S localhost:8000