<?php
/**
 * GET /api/extras.php
 * Returns available extras/services
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
logRequest('extras', 'GET', $_GET);

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

try {
    $db = Database::getInstance();
    
    // Get language parameter (default to Italian)
    $lang = isset($_GET['lang']) && in_array($_GET['lang'], ['it', 'en']) 
            ? $_GET['lang'] 
            : 'it';
    
    // Get all active extras
    $sql = "SELECT * FROM extras WHERE is_active = 1 ORDER BY sort_order, id";
    $extras = $db->select($sql);
    
    // If no extras in database, return default extras
    if (empty($extras)) {
        $extras = getDefaultExtras($lang);
    } else {
        // Use database extras but translate if needed
        foreach ($extras as &$extra) {
            $extra['price'] = floatval($extra['price']);
            $extra['is_active'] = (bool)$extra['is_active'];
            
            // If translation is stored in database
            if (isset($extra['name_' . $lang])) {
                $extra['name'] = $extra['name_' . $lang];
            }
            if (isset($extra['description_' . $lang])) {
                $extra['description'] = $extra['description_' . $lang];
            }
        }
    }
    
    // Return response
    successResponse([
        'extras' => $extras,
        'language' => $lang
    ]);
    
} catch (Exception $e) {
    if (ENVIRONMENT === 'development') {
        errorResponse('Database error: ' . $e->getMessage(), 500);
    } else {
        errorResponse('An error occurred while fetching extras', 500);
    }
}

/**
 * Get default extras if database is empty
 */
function getDefaultExtras($lang) {
    $extras = [
        [
            'id' => 1,
            'name' => $lang === 'it' ? 'Imbarco/Sbarco Porto di Salivoli' : 'Embarkation/Disembarkation Port of Salivoli',
            'description' => $lang === 'it' 
                ? 'Servizio imbarco o sbarco presso Porto di Salivoli (LI)' 
                : 'Embarkation or disembarkation service at Port of Salivoli (LI)',
            'price' => 150.00,
            'price_type' => 'per_trip',
            'is_active' => true
        ],
        [
            'id' => 2,
            'name' => $lang === 'it' ? 'Tender' : 'Tender',
            'description' => $lang === 'it' 
                ? 'Gommone tender per trasferimenti' 
                : 'Tender dinghy for transfers',
            'price' => 50.00,
            'price_type' => 'flat',
            'is_active' => true
        ],
        [
            'id' => 3,
            'name' => $lang === 'it' ? 'Fuoribordo Tender' : 'Tender Outboard Motor',
            'description' => $lang === 'it' 
                ? 'Motore fuoribordo per tender' 
                : 'Outboard motor for tender',
            'price' => 120.00,
            'price_type' => 'flat',
            'is_active' => true
        ],
        [
            'id' => 4,
            'name' => $lang === 'it' ? 'Servizio Pranzo a Bordo' : 'Onboard Lunch Service',
            'description' => $lang === 'it' 
                ? 'Pranzo completo preparato e servito a bordo' 
                : 'Complete lunch prepared and served onboard',
            'price' => 30.00,
            'price_type' => 'per_person',
            'is_active' => true
        ],
        [
            'id' => 5,
            'name' => $lang === 'it' ? 'Servizio Aperitivo a Bordo' : 'Onboard Aperitif Service',
            'description' => $lang === 'it' 
                ? 'Aperitivo con stuzzichini servito a bordo' 
                : 'Aperitif with appetizers served onboard',
            'price' => 15.00,
            'price_type' => 'per_person',
            'is_active' => true
        ],
        [
            'id' => 6,
            'name' => $lang === 'it' ? 'Pernottamento Extra in Porto' : 'Extra Night in Port',
            'description' => $lang === 'it' 
                ? 'Notte aggiuntiva in porto - checkout ore 9:00' 
                : 'Additional night in port - checkout at 9:00 AM',
            'price' => 150.00,
            'price_type' => 'per_night',
            'is_active' => true
        ],
        [
            'id' => 7,
            'name' => $lang === 'it' ? 'Pernottamento Extra in Rada' : 'Extra Night at Anchor',
            'description' => $lang === 'it' 
                ? 'Notte aggiuntiva in rada - sbarco ore 9:00' 
                : 'Additional night at anchor - disembarkation at 9:00 AM',
            'price' => 300.00,
            'price_type' => 'per_night',
            'is_active' => true
        ]
    ];
    
    return $extras;
}