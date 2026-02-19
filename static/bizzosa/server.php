<?php
/**
 * PHP Built-in server for local development
 * Run with: php -S localhost:8000
 * Then open: http://localhost:8000
 */

// Set CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Route to the requested file
$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);

if ($path === '/') {
    $path = '/index.html';
}

$file = __DIR__ . $path;

if (file_exists($file) && !is_dir($file)) {
    // Determine content type
    $ext = pathinfo($file, PATHINFO_EXTENSION);
    $content_types = [
        'html' => 'text/html',
        'css' => 'text/css',
        'js' => 'application/javascript',
        'json' => 'application/json',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'svg' => 'image/svg+xml',
        'mp4' => 'video/mp4'
    ];
    
    $content_type = $content_types[$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $content_type);
    
    readfile($file);
} else {
    http_response_code(404);
    echo "File not found";
}