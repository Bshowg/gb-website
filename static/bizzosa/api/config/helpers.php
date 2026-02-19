<?php
/**
 * Helper functions for the API
 */

/**
 * Send JSON response
 */
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

/**
 * Send error response
 */
function errorResponse($message, $statusCode = 400) {
    jsonResponse([
        'error' => true,
        'message' => $message
    ], $statusCode);
}

/**
 * Send success response
 */
function successResponse($data = [], $message = 'Success') {
    jsonResponse([
        'success' => true,
        'message' => $message,
        'data' => $data
    ]);
}

/**
 * Validate required fields
 */
function validateRequired($data, $requiredFields) {
    $errors = [];
    foreach ($requiredFields as $field) {
        if (!isset($data[$field]) || empty($data[$field])) {
            $errors[] = "Field '$field' is required";
        }
    }
    return $errors;
}

/**
 * Validate email
 */
function validateEmail($email) {
    return filter_var($email, FILTER_VALIDATE_EMAIL);
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function validateDate($date) {
    $d = DateTime::createFromFormat('Y-m-d', $date);
    return $d && $d->format('Y-m-d') === $date;
}

/**
 * Calculate number of days between dates
 */
function daysBetween($startDate, $endDate) {
    $start = new DateTime($startDate);
    $end = new DateTime($endDate);
    $interval = $start->diff($end);
    return $interval->days + 1; // Include both start and end day
}

/**
 * Set CORS headers
 */
function setCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    
    if (in_array($origin, CORS_ALLOWED_ORIGINS)) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    } else if (ENVIRONMENT === 'development') {
        header("Access-Control-Allow-Origin: *");
    }
    
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

/**
 * Sanitize input
 */
function sanitizeInput($input) {
    if (is_array($input)) {
        return array_map('sanitizeInput', $input);
    }
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}

/**
 * Get POST data as JSON
 */
function getJsonInput() {
    $json = file_get_contents('php://input');
    $data = json_decode($json, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        return null;
    }
    
    return sanitizeInput($data);
}

/**
 * Simple rate limiting
 */
function checkRateLimit($identifier) {
    $cacheFile = sys_get_temp_dir() . '/rate_limit_' . md5($identifier);
    $limit = API_RATE_LIMIT;
    $window = 60; // 1 minute
    
    $data = [];
    if (file_exists($cacheFile)) {
        $data = json_decode(file_get_contents($cacheFile), true);
    }
    
    $now = time();
    $data = array_filter($data, function($timestamp) use ($now, $window) {
        return ($now - $timestamp) < $window;
    });
    
    if (count($data) >= $limit) {
        return false;
    }
    
    $data[] = $now;
    file_put_contents($cacheFile, json_encode($data));
    
    return true;
}

/**
 * Log API request
 */
function logRequest($endpoint, $method, $data = []) {
    if (ENVIRONMENT === 'development') {
        $logData = [
            'timestamp' => date('Y-m-d H:i:s'),
            'endpoint' => $endpoint,
            'method' => $method,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            'data' => $data
        ];
        
        $logFile = __DIR__ . '/../../logs/api_' . date('Y-m-d') . '.log';
        $logDir = dirname($logFile);
        
        if (!is_dir($logDir)) {
            mkdir($logDir, 0777, true);
        }
        
        file_put_contents($logFile, json_encode($logData) . PHP_EOL, FILE_APPEND);
    }
}