<?php
/**
 * POST /api/quote.php
 * Calculate quote based on booking parameters
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
logRequest('quote', 'POST', $_POST);

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

try {
    // Get JSON input
    $data = getJsonInput();
    
    if (!$data) {
        errorResponse('Invalid JSON data');
    }
    
    // Validate required fields
    $requiredFields = ['package_type', 'start_date', 'end_date', 'guests'];
    $errors = validateRequired($data, $requiredFields);
    
    if (!empty($errors)) {
        errorResponse('Validation errors: ' . implode(', ', $errors));
    }
    
    // Validate data types and formats
    if (!validateDate($data['start_date'])) {
        errorResponse('Invalid start date format. Use YYYY-MM-DD');
    }
    
    if (!validateDate($data['end_date'])) {
        errorResponse('Invalid end date format. Use YYYY-MM-DD');
    }
    
    // Validate package type - Updated for 2 packages
    $validPackages = ['DAILY_CHARTER', 'WEEKLY_CHARTER'];
    if (!in_array($data['package_type'], $validPackages)) {
        errorResponse('Invalid package type');
    }
    
    // Validate guest count
    $guests = intval($data['guests']);
    $maxGuests = [
        'DAILY_CHARTER' => MAX_GUESTS_DAILY_CHARTER,
        'WEEKLY_CHARTER' => MAX_GUESTS_WEEKLY_CHARTER
    ];
    
    if ($guests < 1 || $guests > $maxGuests[$data['package_type']]) {
        errorResponse('Invalid number of guests for selected package');
    }
    
    // Calculate days
    $days = daysBetween($data['start_date'], $data['end_date']);
    
    // Validate package duration - Updated for new rules
    switch ($data['package_type']) {
        case 'DAILY_CHARTER':
            if ($days < MIN_DAILY_CHARTER_DAYS || $days > MAX_DAILY_CHARTER_DAYS) {
                errorResponse('Daily charter must be between ' . MIN_DAILY_CHARTER_DAYS . ' and ' . MAX_DAILY_CHARTER_DAYS . ' days');
            }
            break;
        case 'WEEKLY_CHARTER':
            if ($days < MIN_WEEKLY_CHARTER_DAYS) {
                errorResponse('Weekly charter must be at least ' . MIN_WEEKLY_CHARTER_DAYS . ' nights');
            }
            break;
    }
    
    $db = Database::getInstance();
    
    // Check availability
    $sql = "SELECT COUNT(*) as conflicts FROM (
                SELECT id FROM blocked_periods 
                WHERE start_date <= :end_date 
                AND end_date >= :start_date
                UNION
                SELECT id FROM bookings 
                WHERE status IN ('confirmed', 'pending')
                AND check_in_date <= :end_date2 
                AND check_out_date >= :start_date2
            ) as blocked";
    
    $result = $db->selectOne($sql, [
        'start_date' => $data['start_date'],
        'end_date' => $data['end_date'],
        'start_date2' => $data['start_date'],
        'end_date2' => $data['end_date']
    ]);
    
    if ($result['conflicts'] > 0) {
        errorResponse('Selected dates are not available');
    }
    
    // Calculate base price
    $basePrice = 0;
    
    // Get daily prices for the period
    $sql = "SELECT date, price FROM daily_prices 
            WHERE date BETWEEN :start_date AND :end_date
            ORDER BY date";
    
    $dailyPrices = $db->select($sql, [
        'start_date' => $data['start_date'],
        'end_date' => $data['end_date']
    ]);
    
    // Create price map
    $priceMap = [];
    foreach ($dailyPrices as $dp) {
        $priceMap[$dp['date']] = floatval($dp['price']);
    }
    
    // Calculate base price based on package and dates
    $defaultPricePerDay = [
        'DAILY_CHARTER' => PRICE_DAILY_CHARTER_PER_DAY,
        'WEEKLY_CHARTER' => PRICE_WEEKLY_CHARTER_PER_DAY
    ];
    
    // Calculate total for each day
    $current = new DateTime($data['start_date']);
    $end = new DateTime($data['end_date']);
    
    while ($current <= $end) {
        $dateStr = $current->format('Y-m-d');
        $dayPrice = isset($priceMap[$dateStr]) 
            ? $priceMap[$dateStr] 
            : $defaultPricePerDay[$data['package_type']];
        
        $basePrice += $dayPrice;
        $current->modify('+1 day');
    }
    
    // Apply weekly discount if applicable
    if ($data['package_type'] === 'WEEKLY_CHARTER' && $days >= 7) {
        $basePrice = $basePrice * (1 - WEEKLY_DISCOUNT);
    }
    
    // Calculate extras total
    $extrasTotal = 0;
    $selectedExtras = [];
    
    if (isset($data['extras']) && is_array($data['extras'])) {
        $extraIds = array_map('intval', $data['extras']);
        
        if (!empty($extraIds)) {
            $placeholders = implode(',', array_fill(0, count($extraIds), '?'));
            $sql = "SELECT * FROM extras WHERE id IN ($placeholders) AND is_active = 1";
            
            $extras = $db->select($sql, $extraIds);
            
            // If no extras in database, use defaults
            if (empty($extras)) {
                // Use the mock data from getDefaultExtras function
                $allExtras = getDefaultExtras('it');
                $extras = array_filter($allExtras, function($e) use ($extraIds) {
                    return in_array($e['id'], $extraIds);
                });
            }
            
            foreach ($extras as $extra) {
                $extraCost = 0;
                $price = floatval($extra['price']);
                
                switch ($extra['price_type'] ?? 'flat') {
                    case 'per_day':
                        $extraCost = $price * $days;
                        break;
                    case 'per_person':
                        $extraCost = $price * $guests;
                        break;
                    case 'per_trip':
                    case 'per_night':
                    case 'flat':
                    default:
                        $extraCost = $price;
                        break;
                }
                
                $extrasTotal += $extraCost;
                $selectedExtras[] = [
                    'id' => $extra['id'],
                    'name' => $extra['name'] ?? $extra['name_it'] ?? 'Extra',
                    'price' => $price,
                    'price_type' => $extra['price_type'] ?? 'flat',
                    'total' => $extraCost
                ];
            }
        }
    }
    
    // Calculate final total
    $totalPrice = $basePrice + $extrasTotal;
    
    // Return quote
    successResponse([
        'package_type' => $data['package_type'],
        'start_date' => $data['start_date'],
        'end_date' => $data['end_date'],
        'days' => $days,
        'guests' => $guests,
        'base_price' => round($basePrice, 2),
        'extras_total' => round($extrasTotal, 2),
        'total_price' => round($totalPrice, 2),
        'selected_extras' => $selectedExtras,
        'currency' => 'EUR',
        'quote_valid_until' => date('Y-m-d', strtotime('+7 days'))
    ]);
    
} catch (Exception $e) {
    if (ENVIRONMENT === 'development') {
        errorResponse('Server error: ' . $e->getMessage(), 500);
    } else {
        errorResponse('An error occurred while calculating the quote', 500);
    }
}

/**
 * Get default extras (reuse from extras.php)
 */
function getDefaultExtras($lang) {
    return [
        ['id' => 1, 'name_it' => 'Imbarco/Sbarco Porto di Salivoli', 'price' => 150.00, 'price_type' => 'per_trip'],
        ['id' => 2, 'name_it' => 'Tender', 'price' => 50.00, 'price_type' => 'flat'],
        ['id' => 3, 'name_it' => 'Fuoribordo Tender', 'price' => 120.00, 'price_type' => 'flat'],
        ['id' => 4, 'name_it' => 'Servizio Pranzo a Bordo', 'price' => 30.00, 'price_type' => 'per_person'],
        ['id' => 5, 'name_it' => 'Servizio Aperitivo a Bordo', 'price' => 15.00, 'price_type' => 'per_person'],
        ['id' => 6, 'name_it' => 'Pernottamento Extra in Porto', 'price' => 150.00, 'price_type' => 'per_night'],
        ['id' => 7, 'name_it' => 'Pernottamento Extra in Rada', 'price' => 300.00, 'price_type' => 'per_night']
    ];
}