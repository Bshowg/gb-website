<?php
/**
 * Email Testing Script
 * Tests SMTP connection and email sending functionality
 */

require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/SMTPMailer.php';
require_once __DIR__ . '/config/helpers.php';

// Set CORS headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    echo json_encode(['success' => false, 'message' => 'Invalid JSON data']);
    exit;
}

$testType = $input['test_type'] ?? 'simple';
$toEmail = $input['to_email'] ?? '';
$subject = $input['subject'] ?? 'Test Email';
$message = $input['message'] ?? 'This is a test message';

// Validate email
if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Invalid email address']);
    exit;
}

try {
    $mailer = new SMTPMailer();
    $results = [];
    
    if ($testType === 'simple') {
        // Simple test - just send one email
        $htmlMessage = "
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .header { background: #667eea; color: white; padding: 20px; border-radius: 10px; }
                .content { background: #f5f5f5; padding: 20px; margin-top: 20px; border-radius: 10px; }
                .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class='header'>
                <h2>Test Email SMTP - Sailing Bizzosa</h2>
            </div>
            <div class='content'>
                <p><strong>Messaggio di Test:</strong></p>
                <p>" . nl2br(htmlspecialchars($message)) . "</p>
                <hr>
                <p><strong>Dettagli Tecnici:</strong></p>
                <ul>
                    <li>SMTP Host: " . SMTP_HOST . "</li>
                    <li>Porta: " . SMTP_PORT . "</li>
                    <li>Sicurezza: " . SMTP_SECURE . "</li>
                    <li>Da: " . SMTP_FROM_EMAIL . "</li>
                    <li>A: " . $toEmail . "</li>
                    <li>Data/Ora: " . date('d/m/Y H:i:s') . "</li>
                </ul>
            </div>
            <div class='footer'>
                <p>Questo è un messaggio di test generato dal sistema di testing SMTP.</p>
            </div>
        </body>
        </html>";
        
        $sent = $mailer->sendMail($toEmail, $subject, $htmlMessage);
        
        if ($sent) {
            echo json_encode([
                'success' => true,
                'message' => 'Email inviata con successo!',
                'details' => [
                    'to' => $toEmail,
                    'subject' => $subject,
                    'smtp_host' => SMTP_HOST,
                    'smtp_port' => SMTP_PORT,
                    'from' => SMTP_FROM_EMAIL,
                    'timestamp' => date('c')
                ]
            ]);
        } else {
            echo json_encode([
                'success' => false,
                'message' => 'Invio email fallito',
                'error' => $mailer->getLastError(),
                'details' => [
                    'smtp_host' => SMTP_HOST,
                    'smtp_port' => SMTP_PORT,
                    'smtp_user' => SMTP_USER
                ]
            ]);
        }
        
    } else if ($testType === 'full') {
        // Full test - simulate a booking notification
        $testBooking = [
            'id' => 'TEST-' . uniqid(),
            'package_type' => 'WEEKLY_CHARTER',
            'start_date' => date('Y-m-d', strtotime('+7 days')),
            'end_date' => date('Y-m-d', strtotime('+14 days')),
            'guests' => 6,
            'destinations_json' => json_encode(['Elba']),
            'extras_json' => json_encode([
                ['name' => 'Skipper', 'price' => 200],
                ['name' => 'Richieste Speciali', 'special_text' => 'Test richiesta speciale']
            ]),
            'total_price' => 4200,
            'customer_email' => $toEmail,
            'status' => 'TEST'
        ];
        
        // Test Admin Email
        $adminSubject = "[TEST] Nuova Richiesta Prenotazione - " . $testBooking['id'];
        $adminMessage = createAdminEmailHTML($testBooking);
        
        $adminSent = $mailer->sendMail(
            ADMIN_EMAIL,
            $adminSubject,
            $adminMessage,
            $toEmail
        );
        
        $results['admin_email'] = [
            'sent' => $adminSent,
            'to' => ADMIN_EMAIL,
            'error' => $adminSent ? null : $mailer->getLastError()
        ];
        
        // Test Customer Email
        $customerSubject = "[TEST] Conferma Richiesta - Sailing Bizzosa";
        $customerMessage = createCustomerEmailHTML($testBooking);
        
        $customerSent = $mailer->sendMail(
            $toEmail,
            $customerSubject,
            $customerMessage,
            SMTP_FROM_EMAIL
        );
        
        $results['customer_email'] = [
            'sent' => $customerSent,
            'to' => $toEmail,
            'error' => $customerSent ? null : $mailer->getLastError()
        ];
        
        // Determine overall success
        $success = $adminSent || $customerSent;
        
        echo json_encode([
            'success' => $success,
            'message' => $success ? 
                'Test completato. Controlla le caselle email.' : 
                'Test fallito. Verifica la configurazione SMTP.',
            'details' => $results,
            'config' => [
                'smtp_host' => SMTP_HOST,
                'smtp_port' => SMTP_PORT,
                'smtp_secure' => SMTP_SECURE,
                'from_email' => SMTP_FROM_EMAIL,
                'admin_email' => ADMIN_EMAIL
            ]
        ]);
    }
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Errore durante il test',
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
}

/**
 * Create Admin Email HTML for testing
 */
function createAdminEmailHTML($booking) {
    $destinations = json_decode($booking['destinations_json'], true);
    $extras = json_decode($booking['extras_json'], true);
    
    $html = "
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .test-banner { background: #f59e0b; color: white; padding: 10px; text-align: center; font-weight: bold; }
            .booking-details { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .detail-row { margin: 10px 0; padding: 10px; background: white; border-radius: 3px; }
            .label { font-weight: bold; color: #1e3a5f; }
        </style>
    </head>
    <body>
        <div class='test-banner'>⚠️ QUESTO È UN TEST - NON È UNA VERA PRENOTAZIONE ⚠️</div>
        <h2>Test Email - Nuova Richiesta di Prenotazione</h2>
        <div class='booking-details'>
            <div class='detail-row'>
                <span class='label'>ID Test:</span> {$booking['id']}
            </div>
            <div class='detail-row'>
                <span class='label'>Pacchetto:</span> {$booking['package_type']}
            </div>
            <div class='detail-row'>
                <span class='label'>Date:</span> {$booking['start_date']} - {$booking['end_date']}
            </div>
            <div class='detail-row'>
                <span class='label'>Ospiti:</span> {$booking['guests']}
            </div>";
    
    if (!empty($extras)) {
        $html .= "<div class='detail-row'><span class='label'>Servizi Extra:</span><ul>";
        foreach ($extras as $extra) {
            if (isset($extra['special_text'])) {
                $html .= "<li>{$extra['name']}: {$extra['special_text']}</li>";
            } else {
                $html .= "<li>{$extra['name']}</li>";
            }
        }
        $html .= "</ul></div>";
    }
    
    $html .= "
            <div class='detail-row'>
                <span class='label'>Prezzo Test:</span> € {$booking['total_price']}
            </div>
        </div>
        <p style='color: #f59e0b; font-weight: bold;'>
            Questa è un'email di test per verificare la configurazione SMTP.
        </p>
    </body>
    </html>";
    
    return $html;
}

/**
 * Create Customer Email HTML for testing
 */
function createCustomerEmailHTML($booking) {
    return "
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .test-banner { background: #f59e0b; color: white; padding: 10px; text-align: center; font-weight: bold; }
            h2 { color: #1e3a5f; }
            .booking-box { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                border-radius: 10px;
                margin: 20px 0;
            }
            .detail { margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class='test-banner'>⚠️ QUESTO È UN TEST - NON È UNA VERA PRENOTAZIONE ⚠️</div>
        <h2>Test Email - Conferma Richiesta</h2>
        
        <p>Questo è un messaggio di test per verificare il sistema di invio email.</p>
        
        <div class='booking-box'>
            <h3 style='color: white;'>Dettagli Test Prenotazione:</h3>
            <div class='detail'><strong>ID Test:</strong> {$booking['id']}</div>
            <div class='detail'><strong>Pacchetto:</strong> {$booking['package_type']}</div>
            <div class='detail'><strong>Date:</strong> {$booking['start_date']} - {$booking['end_date']}</div>
            <div class='detail'><strong>Ospiti:</strong> {$booking['guests']}</div>
            <div class='detail'><strong>Prezzo Test:</strong> € {$booking['total_price']}</div>
        </div>
        
        <p style='color: #f59e0b; font-weight: bold;'>
            Se ricevi questa email, il sistema SMTP funziona correttamente!
        </p>
        
        <p>
            <strong>Configurazione Attuale:</strong><br>
            SMTP Host: " . SMTP_HOST . "<br>
            Porta: " . SMTP_PORT . " (" . SMTP_SECURE . ")<br>
            Email Mittente: " . SMTP_FROM_EMAIL . "
        </p>
    </body>
    </html>";
}