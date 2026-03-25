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

define('DB_HOST', 'gianmd-bizzosa.db.tb-hosting.com'); // Change to your Register.it MySQL server (e.g., 'mysql.register.it')
define('DB_NAME', 'sailing_bizzosa'); // Your Register.it database name
define('DB_USER', 'gianmd_bizzosa'); // Your Register.it database username
define('DB_PASS', 'malleolo92'); // Your Register.it database password
define('DB_CHARSET', 'utf8mb4');

// Application settings
define('SITE_URL', 'http://localhost:8000');
define('API_URL', SITE_URL . '/api');

// Email configuration
define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_PORT', 587);
define('SMTP_USER', 'your_email@gmail.com');
define('SMTP_PASS', 'your_email_password');
define('SMTP_FROM_EMAIL', 'info@sailingbizzosa.it');
define('SMTP_FROM_NAME', 'Sailing Bizzosa');

// Admin notification email
define('ADMIN_EMAIL', 'admin@sailingbizzosa.it');

// WhatsApp configuration
define('WHATSAPP_PHONE', '393331234567'); // Without + sign

// Pricing configuration (in EUR)
define('PRICE_DAY_SAIL', 800);
define('PRICE_DAILY_CHARTER_PER_DAY', 700);
define('PRICE_WEEKLY_CHARTER_PER_DAY', 600);
define('WEEKLY_DISCOUNT', 0.20); // 20% discount for weekly

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