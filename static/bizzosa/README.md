# Sailing Bizzosa - Local Development

## Quick Start

Due to browser CORS restrictions, you need to run a local server to test the website.

Choose one of the following methods:

### Method 1: Python (Recommended)
```bash
cd static/bizzosa
python3 server.py
```
Then open: http://localhost:8000

### Method 2: PHP
```bash
cd static/bizzosa
php -S localhost:8000
```
Then open: http://localhost:8000

### Method 3: Node.js
```bash
cd static/bizzosa
npm install express
node server.js
```
Then open: http://localhost:8000

### Method 4: VS Code Live Server Extension
1. Install "Live Server" extension in VS Code
2. Right-click on index.html
3. Select "Open with Live Server"

### Method 5: Python Simple HTTP Server
```bash
cd static/bizzosa
python3 -m http.server 8000
```
Then open: http://localhost:8000

## Why is this needed?

Modern browsers block fetch requests to local files (file:// protocol) for security reasons. The i18n system uses fetch to load translation files, so a local server is required.

## Development Tips

- The server must be running from the `static/bizzosa` directory
- Default port is 8000, but you can change it if needed
- Press Ctrl+C to stop the server
- Changes to files are reflected immediately (just refresh the browser)