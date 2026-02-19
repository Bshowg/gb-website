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
            'name' => $lang === 'it' ? 'Skipper Professionista' : 'Professional Skipper',
            'description' => $lang === 'it' 
                ? 'Skipper esperto per la navigazione' 
                : 'Experienced skipper for navigation',
            'price' => 200.00,
            'price_type' => 'per_day',
            'is_active' => true
        ],
        [
            'id' => 2,
            'name' => $lang === 'it' ? 'Hostess di Bordo' : 'Onboard Hostess',
            'description' => $lang === 'it' 
                ? 'Servizio di hostess professionale' 
                : 'Professional hostess service',
            'price' => 150.00,
            'price_type' => 'per_day',
            'is_active' => true
        ],
        [
            'id' => 3,
            'name' => $lang === 'it' ? 'Cuoco a Bordo' : 'Onboard Chef',
            'description' => $lang === 'it' 
                ? 'Chef professionista per i pasti' 
                : 'Professional chef for meals',
            'price' => 250.00,
            'price_type' => 'per_day',
            'is_active' => true
        ],
        [
            'id' => 4,
            'name' => $lang === 'it' ? 'Tender con Motore' : 'Tender with Engine',
            'description' => $lang === 'it' 
                ? 'Gommone tender 3.5m con motore 15HP' 
                : '3.5m tender dinghy with 15HP engine',
            'price' => 100.00,
            'price_type' => 'per_day',
            'is_active' => true
        ],
        [
            'id' => 5,
            'name' => $lang === 'it' ? 'Stand Up Paddle (SUP)' : 'Stand Up Paddle (SUP)',
            'description' => $lang === 'it' 
                ? 'Tavola SUP con pagaia e kit sicurezza' 
                : 'SUP board with paddle and safety kit',
            'price' => 50.00,
            'price_type' => 'per_day',
            'is_active' => true
        ],
        [
            'id' => 6,
            'name' => $lang === 'it' ? 'Attrezzatura Snorkeling' : 'Snorkeling Equipment',
            'description' => $lang === 'it' 
                ? 'Set completo maschera, boccaglio e pinne' 
                : 'Complete set with mask, snorkel and fins',
            'price' => 20.00,
            'price_type' => 'per_person',
            'is_active' => true
        ],
        [
            'id' => 7,
            'name' => $lang === 'it' ? 'Cambusa Premium' : 'Premium Galley',
            'description' => $lang === 'it' 
                ? 'Rifornimento cambusa con prodotti selezionati' 
                : 'Galley provisioning with selected products',
            'price' => 300.00,
            'price_type' => 'flat',
            'is_active' => true
        ],
        [
            'id' => 8,
            'name' => $lang === 'it' ? 'Trasferimento Aeroporto' : 'Airport Transfer',
            'description' => $lang === 'it' 
                ? 'Transfer da/per aeroporto di Pisa o Firenze' 
                : 'Transfer from/to Pisa or Florence airport',
            'price' => 150.00,
            'price_type' => 'per_trip',
            'is_active' => true
        ],
        [
            'id' => 9,
            'name' => $lang === 'it' ? 'Pulizia Finale' : 'Final Cleaning',
            'description' => $lang === 'it' 
                ? 'Pulizia professionale a fine noleggio' 
                : 'Professional cleaning at end of charter',
            'price' => 150.00,
            'price_type' => 'flat',
            'is_active' => true
        ],
        [
            'id' => 10,
            'name' => $lang === 'it' ? 'Biancheria e Asciugamani' : 'Linen and Towels',
            'description' => $lang === 'it' 
                ? 'Set completo biancheria letto e bagno' 
                : 'Complete bed linen and bathroom set',
            'price' => 25.00,
            'price_type' => 'per_person',
            'is_active' => true
        ]
    ];
    
    return $extras;
}