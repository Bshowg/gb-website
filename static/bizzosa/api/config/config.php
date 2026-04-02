<?php
/**
 * Configuration file for Sailing Bizzosa API
 */

// Environment (development, production)
define('ENVIRONMENT', 'development');

// Database configuration for Register.it
// To find these values in Register.it:
// 1. Log into your Register.it control panel
// 2. Go to "Hosting Linux" → "Gestione Database MySQL"
// 3. You'll find: Server MySQL (host), Nome Database, Nome Utente
// 4. The password is what you set when creating the database
// 
// Typically for Register.it:
// - DB_HOST: Usually something like 'mysql.register.it' or 'sqlXXX.register.it' 
//   (NOT 'localhost' for external connections)
// - DB_NAME: Your database name (e.g., 'Sql123456_1')
// - DB_USER: Your database username (often same as DB_NAME)
// - DB_PASS: The password you created for the database

define('DB_HOST', '31.11.39.161'); // Change to your Register.it MySQL server (e.g., 'mysql.register.it')
define('DB_NAME', 'Sql1929190_1'); // Your Register.it database name
define('DB_USER', 'Sql1929190'); // Your Register.it database username
define('DB_PASS', 'Bizzosa26_'); // Your Register.it database password
define('DB_CHARSET', 'utf8mb4');

// Application settings
define('SITE_URL', 'http://localhost:8000');
define('API_URL', SITE_URL . '/api');

// Email configuration - Aruba SMTP
// Try alternative settings: smtps.aruba.it with SSL on port 465
define('SMTP_HOST', 'smtps.aruba.it'); // Alternative: smtp.aruba.it
define('SMTP_PORT', 465); // Alternative: 587 for TLS, 465 for SSL, 25 for plain
define('SMTP_USER', 'info@sailingbizzosa.it');
define('SMTP_PASS', 'Bizzosa26_'); // IMPORTANT: Update with actual password
define('SMTP_FROM_EMAIL', 'info@sailingbizzosa.it');
define('SMTP_FROM_NAME', 'Sailing Bizzosa');
define('SMTP_SECURE', 'ssl'); // Use 'tls' for port 587 or 'ssl' for port 465

// Admin notification email (your Gmail account)
define('ADMIN_EMAIL', 'flpp.bettarini@gmail.com'); // IMPORTANT: Update with your Gmail address

// WhatsApp configuration
define('WHATSAPP_PHONE', '393331234567'); // Without + sign

// Pricing configuration (in EUR)
define('PRICE_DAY_SAIL', 200);
define('PRICE_DAILY_CHARTER_PER_DAY', 200);
define('PRICE_WEEKLY_CHARTER_PER_DAY', 150);
define('WEEKLY_DISCOUNT', 0.10); // 20% discount for weekly

// Business rules - Updated for 2 packages
define('MAX_GUESTS_DAILY_CHARTER', 8);
define('MAX_GUESTS_WEEKLY_CHARTER', 8);
define('MIN_DAILY_CHARTER_DAYS', 1);
define('MAX_DAILY_CHARTER_DAYS', 3);
define('MIN_WEEKLY_CHARTER_DAYS', 3);

// Security
define('API_RATE_LIMIT', 100); // Requests per minute
define('CORS_ALLOWED_ORIGINS', [
    'http://localhost:8000',
    'http://localhost:3000',
    'https://sailingbizzosa.it'
]);

// Timezone
date_default_timezone_set('Europe/Rome');

// Error reporting
if (ENVIRONMENT === 'development') {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    error_reporting(0);
    ini_set('display_errors', 0);
}

// Session configuration
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_secure', ENVIRONMENT === 'production' ? 1 : 0);