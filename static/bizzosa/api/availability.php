<?php
/**
 * GET /api/availability.php
 * Returns blocked periods and pricing for calendar
 */

require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/config/helpers.php';

// Set CORS headers
setCorsHeaders();

// Check rate limiting
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if (!checkRateLimit($clientIp)) {
    errorResponse('Rate limit exceeded. Please try again later.', 429);
}

// Log request
logRequest('availability', 'GET', $_GET);

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

try {
    $db = Database::getInstance();
    
    // Get optional date range parameters
    $startDate = $_GET['start_date'] ?? date('Y-m-d');
    $endDate = $_GET['end_date'] ?? date('Y-m-d', strtotime('+1 year'));
    
    // Validate dates
    if (!validateDate($startDate) || !validateDate($endDate)) {
        errorResponse('Invalid date format. Use YYYY-MM-DD');
    }
    
    // Get blocked periods
    $sql = "SELECT id, start_date, end_date, reason 
            FROM blocked_periods 
            WHERE end_date >= :start_date 
            AND start_date <= :end_date
            ORDER BY start_date";
    
    $blockedPeriods = $db->select($sql, [
        'start_date' => $startDate,
        'end_date' => $endDate
    ]);
    
    // Get confirmed bookings (also blocked)
    $sql = "SELECT 
                id,
                check_in_date as start_date, 
                check_out_date as end_date,
                'Booking' as reason
            FROM bookings 
            WHERE status IN ('confirmed', 'pending')
            AND check_out_date >= :start_date 
            AND check_in_date <= :end_date
            ORDER BY check_in_date";
    
    $bookings = $db->select($sql, [
        'start_date' => $startDate,
        'end_date' => $endDate
    ]);
    
    // Get daily prices for the period
    $sql = "SELECT date, price 
            FROM daily_prices 
            WHERE date BETWEEN :start_date AND :end_date
            ORDER BY date";
    
    $dailyPrices = $db->select($sql, [
        'start_date' => $startDate,
        'end_date' => $endDate
    ]);
    
    // Format daily prices as key-value pairs
    $pricesMap = [];
    foreach ($dailyPrices as $price) {
        $pricesMap[$price['date']] = floatval($price['price']);
    }
    
    // Get current season pricing (if no specific daily prices)
    $defaultPrices = [
        'low_season' => 600,  // Oct-Apr
        'mid_season' => 700,  // May, Sep
        'high_season' => 800  // Jun-Aug
    ];
    
    // Combine all blocked dates
    $allBlockedDates = [];
    
    foreach ($blockedPeriods as $period) {
        $current = new DateTime($period['start_date']);
        $end = new DateTime($period['end_date']);
        
        while ($current <= $end) {
            $allBlockedDates[] = $current->format('Y-m-d');
            $current->modify('+1 day');
        }
    }
    
    foreach ($bookings as $booking) {
        $current = new DateTime($booking['start_date']);
        $end = new DateTime($booking['end_date']);
        
        while ($current <= $end) {
            $dateStr = $current->format('Y-m-d');
            if (!in_array($dateStr, $allBlockedDates)) {
                $allBlockedDates[] = $dateStr;
            }
            $current->modify('+1 day');
        }
    }
    
    // Return response
    successResponse([
        'blocked_periods' => $blockedPeriods,
        'bookings' => $bookings,
        'blocked_dates' => array_unique($allBlockedDates),
        'daily_prices' => $pricesMap,
        'default_prices' => $defaultPrices,
        'date_range' => [
            'start' => $startDate,
            'end' => $endDate
        ]
    ]);
    
} catch (Exception $e) {
    if (ENVIRONMENT === 'development') {
        errorResponse('Database error: ' . $e->getMessage(), 500);
    } else {
        errorResponse('An error occurred while fetching availability', 500);
    }
}