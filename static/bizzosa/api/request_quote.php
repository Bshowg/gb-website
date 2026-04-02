<?php
/**
 * POST /api/request_quote.php
 * Create a booking request and send notifications
 */

require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/config/helpers.php';
require_once __DIR__ . '/config/SMTPMailer.php';

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
        'package_type', 'start_date', 'end_date', 'guests', 'total_price'
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
        // Get total price from frontend (already calculated with discounts)
        $totalPrice = isset($data['total_price']) ? floatval($data['total_price']) : 0;
        
        // Validate price is provided and reasonable
        if ($totalPrice <= 0) {
            throw new Exception('Invalid price provided');
        }
        
        // Get extras data from frontend
        $extrasJson = [];
        if (isset($data['extras']) && is_array($data['extras'])) {
            $extrasJson = $data['extras'];
        }
        
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
            'language' => $data['language'] ?? 'it',
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

            
            $errorMessage .= ' | Data: ' . json_encode($bookingData);
            $errorMessage .= ' | PDO Error: ' . json_encode($errorDetails['pdo_error']);
            $errorMessage .= ' | Error Code: ' . $errorDetails['code'];
            
            
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
 * Send booking notification email using SMTP
 */
function sendBookingNotification($booking) {
    try {
        $mailer = new SMTPMailer();
        $language = $booking['language'] ?? 'it';
        
        // Prepare admin email content
        $adminSubject = "Nuova Richiesta Prenotazione - " . $booking['id'];
        
        $adminMessage = "
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .booking-details { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
                .detail-row { margin: 10px 0; padding: 10px; background: white; border-radius: 3px; }
                .label { font-weight: bold; color: #1e3a5f; }
                h2 { color: #1e3a5f; }
                h3 { color: #4a90e2; margin-top: 20px; }
                ul { margin: 10px 0; padding-left: 20px; }
                li { margin: 5px 0; }
            </style>
        </head>
        <body>
            <h2>Nuova Richiesta di Prenotazione</h2>
            <div class='booking-details'>
                <div class='detail-row'>
                    <span class='label'>ID Prenotazione:</span> {$booking['id']}
                </div>
                <div class='detail-row'>
                    <span class='label'>Pacchetto:</span> {$booking['package_type']}
                </div>
                <div class='detail-row'>
                    <span class='label'>Data Inizio:</span> {$booking['start_date']}
                </div>
                <div class='detail-row'>
                    <span class='label'>Data Fine:</span> {$booking['end_date']}
                </div>
                <div class='detail-row'>
                    <span class='label'>Numero Ospiti:</span> {$booking['guests']}
                </div>";
        
        // Add destination
        if (!empty($booking['destinations_json'])) {
            $destinations = json_decode($booking['destinations_json'], true);
            if (!empty($destinations[0])) {
                $adminMessage .= "
                <div class='detail-row'>
                    <span class='label'>Destinazione:</span> {$destinations[0]}
                </div>";
            }
        }
        
        // Add extras if present
        if (!empty($booking['extras_json'])) {
            $extras = json_decode($booking['extras_json'], true);
            if (!empty($extras)) {
                $adminMessage .= "
                <div class='detail-row'>
                    <span class='label'>Servizi Extra Richiesti:</span><br>
                    <ul>";
                foreach ($extras as $extra) {
                    if (isset($extra['special_text']) && !empty($extra['special_text'])) {
                        $adminMessage .= "<li><strong>{$extra['name']}:</strong> {$extra['special_text']}</li>";
                    } else {
                        $adminMessage .= "<li>{$extra['name']}</li>";
                    }
                }
                $adminMessage .= "</ul>
                </div>";
            }
        }
        
        $adminMessage .= "
                <div class='detail-row'>
                    <span class='label'>Prezzo Charter:</span> <strong>€ {$booking['total_price']}</strong>
                </div>
                
                <h3>Informazioni Cliente</h3>
                <div class='detail-row'>
                    <span class='label'>Email Cliente:</span> <a href='mailto:{$booking['customer_email']}'>{$booking['customer_email']}</a>
                </div>
            </div>
            <p style='margin-top: 20px; font-size: 12px; color: #666;'>
                Questa email è stata generata automaticamente dal sistema di prenotazione Sailing Bizzosa.
            </p>
        </body>
        </html>";
        
        // Send admin email to Gmail account
        $adminSent = $mailer->sendMail(
            ADMIN_EMAIL, 
            $adminSubject, 
            $adminMessage, 
            $booking['customer_email']  // Reply-to customer
        );
        
        if (!$adminSent) {
            error_log("Failed to send admin email: " . $mailer->getLastError());
        }
        
        // Prepare customer confirmation email based on language
        if ($language === 'en') {
            $customerSubject = "Booking Request Confirmation - Sailing Bizzosa";
            
            $customerMessage = "
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    h2 { color: #1e3a5f; }
                    .booking-box { 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 30px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }
                    .detail { margin: 10px 0; }
                    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 14px; color: #666; }
                </style>
            </head>
            <body>
                <h2>Thank you for your booking request!</h2>
                
                <p>Hello,</p>
                <p>We have received your booking request and will contact you as soon as possible to confirm availability and payment details.</p>
                
                <div class='booking-box'>
                    <h3 style='color: white; margin-top: 0;'>Your booking details:</h3>
                    <div class='detail'><strong>Booking ID:</strong> {$booking['id']}</div>
                    <div class='detail'><strong>Package:</strong> {$booking['package_type']}</div>
                    <div class='detail'><strong>Start date:</strong> {$booking['start_date']}</div>
                    <div class='detail'><strong>End date:</strong> {$booking['end_date']}</div>
                    <div class='detail'><strong>Number of guests:</strong> {$booking['guests']}</div>
                    <div class='detail'><strong>Estimated price:</strong> € {$booking['total_price']}</div>
                </div>
                
                <p>If you have questions or need to modify your request, don't hesitate to contact us:</p>
                <ul>
                    <li>Email: <a href='mailto:info@sailingbizzosa.it'>info@sailingbizzosa.it</a></li>
                    <li>Phone: +39 393 4830048</li>
                    <li>WhatsApp: <a href='https://wa.me/393934830048'>+39 393 4830048</a></li>
                </ul>
                
                <div class='footer'>
                    <p>Best regards,<br>
                    <strong>The Sailing Bizzosa Team</strong></p>
                    <p>Porto ESAOM CESA, Portoferraio (LI), Italy</p>
                    <p style='font-size: 12px;'>
                        This is an automatic email. Please do not reply directly to this message.
                    </p>
                </div>
            </body>
            </html>";
        } else {
            // Italian (default)
            $customerSubject = "Conferma Richiesta - Sailing Bizzosa";
            
            $customerMessage = "
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    h2 { color: #1e3a5f; }
                    .booking-box { 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 30px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }
                    .detail { margin: 10px 0; }
                    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 14px; color: #666; }
                </style>
            </head>
            <body>
                <h2>Grazie per la tua richiesta di prenotazione!</h2>
                
                <p>Ciao,</p>
                <p>Abbiamo ricevuto la tua richiesta di prenotazione e ti contatteremo al più presto per confermare la disponibilità e i dettagli del pagamento.</p>
                
                <div class='booking-box'>
                    <h3 style='color: white; margin-top: 0;'>I tuoi dettagli di prenotazione:</h3>
                    <div class='detail'><strong>ID Prenotazione:</strong> {$booking['id']}</div>
                    <div class='detail'><strong>Pacchetto:</strong> {$booking['package_type']}</div>
                    <div class='detail'><strong>Data inizio:</strong> {$booking['start_date']}</div>
                    <div class='detail'><strong>Data fine:</strong> {$booking['end_date']}</div>
                    <div class='detail'><strong>Numero ospiti:</strong> {$booking['guests']}</div>
                    <div class='detail'><strong>Prezzo stimato:</strong> € {$booking['total_price']}</div>
                </div>
                
                <p>Se hai domande o necessiti di modificare la tua richiesta, non esitare a contattarci:</p>
                <ul>
                    <li>Email: <a href='mailto:info@sailingbizzosa.it'>info@sailingbizzosa.it</a></li>
                    <li>Telefono: +39 393 4830048</li>
                    <li>WhatsApp: <a href='https://wa.me/393934830048'>+39 393 4830048</a></li>
                </ul>
                
                <div class='footer'>
                    <p>Cordiali saluti,<br>
                    <strong>Il Team di Sailing Bizzosa</strong></p>
                    <p>Porto ESAOM CESA, Portoferraio (LI), Italia</p>
                    <p style='font-size: 12px;'>
                        Questa è un'email automatica. Per favore non rispondere direttamente a questo messaggio.
                    </p>
                </div>
            </body>
            </html>";
        }
        
        // Send customer confirmation email if email provided
        $customerSent = true;
        if (!empty($booking['customer_email'])) {
            $customerSent = $mailer->sendMail(
                $booking['customer_email'], 
                $customerSubject, 
                $customerMessage,
                SMTP_FROM_EMAIL  // Reply-to info@sailingbizzosa.it
            );
            
            if (!$customerSent) {
                error_log("Failed to send customer email: " . $mailer->getLastError());
            }
        }
        
        return $adminSent || $customerSent;  // Return true if at least one email was sent
        
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