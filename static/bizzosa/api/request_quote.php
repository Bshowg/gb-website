<?php
/**
 * POST /api/request_quote.php
 * Create a booking request and send notifications
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
logRequest('request_quote', 'POST', $_POST);

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
    $requiredFields = [
        'package_type', 'start_date', 'end_date', 'guests'
    ];
    
    $errors = validateRequired($data, $requiredFields);
    
    if (!empty($errors)) {
        errorResponse('Validation errors: ' . implode(', ', $errors));
    }
    
    /* Validate email
    if (!validateEmail($data['customer_email'])) {
        errorResponse('Invalid email address');
    }*/
    
    // Validate dates
    if (!validateDate($data['start_date']) || !validateDate($data['end_date'])) {
        errorResponse('Invalid date format. Use YYYY-MM-DD');
    }
    
    // Validate package type
    $validPackages = ['DAY_SAIL', 'DAILY_CHARTER', 'WEEKLY_CHARTER'];
    if (!in_array($data['package_type'], $validPackages)) {
        errorResponse('Invalid package type');
    }
    
    $db = Database::getInstance();
    
    // Start transaction
    $db->beginTransaction();
    
    try {
        // First, calculate the quote to get the total price
        $days = daysBetween($data['start_date'], $data['end_date']);
        
        // Calculate base price (simplified version - reuse logic from quote.php)
        $defaultPricePerDay = [
            'DAY_SAIL' => PRICE_DAY_SAIL,
            'DAILY_CHARTER' => PRICE_DAILY_CHARTER_PER_DAY,
            'WEEKLY_CHARTER' => PRICE_WEEKLY_CHARTER_PER_DAY
        ];
        
        $basePrice = $defaultPricePerDay[$data['package_type']] * $days;
        
        // Apply weekly discount if applicable
        if ($data['package_type'] === 'WEEKLY_CHARTER' && $days >= 7) {
            $basePrice = $basePrice * (1 - WEEKLY_DISCOUNT);
        }
        
        // Calculate extras (simplified)
        $extrasTotal = 0;
        $extrasJson = [];
        
        if (isset($data['extras']) && is_array($data['extras'])) {
            $extrasJson = $data['extras'];
            // In production, calculate actual extras total
            // For now, use a simplified calculation
            $extrasTotal = count($data['extras']) * 50; // Placeholder
        }
        
        $totalPrice = $basePrice + $extrasTotal;
        
        // Generate UUID for primary key
        $bookingId = generateUUID();
        
        // Prepare destination as single value in JSON format
        $destinationsJson = json_encode([$data['destination'] ?? '']);
        
        // Prepare booking data matching your table structure
        $bookingData = [
            'id' => $bookingId,
            'package_type' => $data['package_type'],
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
            'guests' => intval($data['guests']),
            'destinations_json' => $destinationsJson,
            'extras_json' => json_encode($extrasJson),
            'total_price' => $totalPrice,
            'customer_email' => $data['customer_email'] ?? '',
            'status' => 'PENDING'
        ];
        
        // Insert booking
        $result = $db->insert('bookings', $bookingData);
        
        if (!$result) {
            // Get detailed error information
            $errorDetails = $db->getErrorDetails();
            $errorMessage = 'Failed to create booking. ';
            
            // Add the main error message
            if ($errorDetails['message']) {
                $errorMessage .= 'Database error: ' . $errorDetails['message'];
            }
            
            // In development mode, add more details
            if (ENVIRONMENT === 'development') {
                $errorMessage .= ' | Data: ' . json_encode($bookingData);
                $errorMessage .= ' | PDO Error: ' . json_encode($errorDetails['pdo_error']);
                $errorMessage .= ' | Error Code: ' . $errorDetails['code'];
            }
            
            error_log("Booking insert failed: " . $errorMessage);
            error_log("Booking data: " . json_encode($bookingData));
            throw new Exception($errorMessage);
        }
        
        // Commit transaction
        $db->commit();
        
        // Send email notification (async in production)
        $emailSent = sendBookingNotification($bookingData);
        
        // Generate WhatsApp link
        $whatsappLink = generateWhatsAppLink($bookingData);
        
        // Return success response
        successResponse([
            'booking_id' => $bookingId,
            'id' => $bookingId,
            'status' => 'pending',
            'total_price' => round($totalPrice, 2),
            'currency' => 'EUR',
            'email_sent' => $emailSent,
            'whatsapp_link' => $whatsappLink,
            'message' => 'Your booking request has been received. We will contact you shortly.'
        ]);
        
    } catch (Exception $e) {
        // Rollback transaction on error
        $db->rollback();
        throw $e;
    }
    
} catch (Exception $e) {
    if (ENVIRONMENT === 'development') {
        errorResponse('Server error: ' . $e->getMessage(), 500);
    } else {
        errorResponse('An error occurred while processing your request', 500);
    }
}

/**
 * Send booking notification email
 */
function sendBookingNotification($booking) {
    try {
        // Email content
        $subject = "New Booking Request - " . $booking['id'];
        
        $message = "
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; }
                .booking-details { background: #f5f5f5; padding: 20px; border-radius: 5px; }
                .detail-row { margin: 10px 0; }
                .label { font-weight: bold; }
            </style>
        </head>
        <body>
            <h2>New Booking Request</h2>
            <div class='booking-details'>
                <div class='detail-row'>
                    <span class='label'>Booking ID:</span> {$booking['id']}
                </div>
                <div class='detail-row'>
                    <span class='label'>Package:</span> {$booking['package_type']}
                </div>
                <div class='detail-row'>
                    <span class='label'>Start Date:</span> {$booking['start_date']}
                </div>
                <div class='detail-row'>
                    <span class='label'>End Date:</span> {$booking['end_date']}
                </div>
                <div class='detail-row'>
                    <span class='label'>Guests:</span> {$booking['guests']}
                </div>
                <div class='detail-row'>
                    <span class='label'>Total Price:</span> € {$booking['total_price']}
                </div>
                <hr>
                <h3>Customer Information</h3>
                <div class='detail-row'>
                    <span class='label'>Email:</span> {$booking['customer_email']}
                </div>
            </div>
        </body>
        </html>
        ";
        
        // Headers for HTML email
        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-type:text/html;charset=UTF-8\r\n";
        $headers .= "From: " . SMTP_FROM_EMAIL . "\r\n";
        $headers .= "Reply-To: " . $booking['customer_email'] . "\r\n";
        
        // Send to admin
        $adminSent = mail(ADMIN_EMAIL, $subject, $message, $headers);
        
        // Send confirmation to customer
        $customerSubject = "Booking Confirmation - Sailing Bizzosa";
        $customerMessage = "
        <html>
        <body>
            <h2>Thank you for your booking request!</h2>
            <p>We have received your booking request (ID: {$booking['id']}) and will contact you shortly to confirm availability and payment details.</p>
            <p><strong>Your booking details:</strong></p>
            <ul>
                <li>Package: {$booking['package_type']}</li>
                <li>Start date: {$booking['start_date']}</li>
                <li>End date: {$booking['end_date']}</li>
                <li>Number of guests: {$booking['guests']}</li>
                <li>Estimated total: € {$booking['total_price']}</li>
            </ul>
            <p>If you have any questions, please don't hesitate to contact us.</p>
            <p>Best regards,<br>Sailing Bizzosa Team</p>
        </body>
        </html>
        ";
        
        $customerSent = mail($booking['customer_email'], $customerSubject, $customerMessage, $headers);
        
        return $adminSent && $customerSent;
        
    } catch (Exception $e) {
        error_log("Email sending failed: " . $e->getMessage());
        return false;
    }
}

/**
 * Generate WhatsApp link for booking
 */
function generateWhatsAppLink($booking) {
    $phone = WHATSAPP_PHONE;
    
    $message = "Ciao! Vorrei confermare la mia richiesta di prenotazione:\n";
    $message .= "📋 ID: {$booking['id']}\n";
    $message .= "📦 Pacchetto: {$booking['package_type']}\n";
    $message .= "📅 Dal {$booking['start_date']} al {$booking['end_date']}\n";
    $message .= "👥 {$booking['guests']} ospiti\n";
    $message .= "💶 Totale: €{$booking['total_price']}";
    
    $encodedMessage = urlencode($message);
    
    return "https://wa.me/{$phone}?text={$encodedMessage}";
}