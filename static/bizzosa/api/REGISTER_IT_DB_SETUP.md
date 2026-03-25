# Register.it Database Configuration Guide

## Step 1: Access Your Register.it Control Panel

1. Go to https://www.register.it
2. Click "Area Clienti" (Customer Area)
3. Login with your credentials
4. Select your hosting service

## Step 2: Find Your Database Details

1. In the control panel, navigate to:
   - **"Hosting Linux"** → **"Gestione Database MySQL"**
   - Or look for **"Database MySQL"** section

2. Here you'll find:
   - **Server MySQL / Host**: Something like `mysql.register.it` or `sql123.register.it`
   - **Nome Database**: Your database name (e.g., `Sql123456_1`)
   - **Nome Utente**: Your database username (often the same as database name)
   - **Password**: The password you set when creating the database

## Step 3: Create Database Tables

### Option A: Using phpMyAdmin (Recommended)
1. Click on **"phpMyAdmin"** in your Register.it control panel
2. Select your database from the left sidebar
3. Click on the **"SQL"** tab
4. Copy and paste the contents of `/api/database/schema.sql`
5. Click **"Esegui"** (Execute)

### Option B: Using PHP Script
1. Upload all files to your Register.it hosting
2. Navigate to: `https://yourdomain.com/bizzosa/api/database/setup.php`
3. This will automatically create all necessary tables

## Step 4: Update Configuration File

Edit `/api/config/config.php` with your Register.it details:

```php
// Your actual Register.it database configuration
define('DB_HOST', 'mysql.register.it'); // or your specific SQL server
define('DB_NAME', 'Sql123456_1'); // Your database name from Register.it
define('DB_USER', 'Sql123456_1'); // Your username (often same as DB name)
define('DB_PASS', 'YourPasswordHere'); // Your database password
```

## Step 5: Update Other Settings

Also update these settings in `config.php`:

```php
// Change to production when going live
define('ENVIRONMENT', 'production');

// Your actual domain
define('SITE_URL', 'https://yourdomain.com');

// Your email settings (if using Register.it email)
define('SMTP_HOST', 'smtp.register.it');
define('SMTP_PORT', 587);
define('SMTP_USER', 'your-email@yourdomain.com');
define('SMTP_PASS', 'your-email-password');
```

## Important Notes for Register.it:

1. **Host is NOT localhost**: Register.it uses external MySQL servers, so never use 'localhost'
2. **Database Prefix**: Register.it often prefixes databases with "Sql" followed by numbers
3. **Connection Limits**: Register.it may have connection limits, so ensure your code closes connections properly
4. **PHP Version**: Check your PHP version in Register.it panel (minimum PHP 7.4 required)
5. **SSL/HTTPS**: Register.it provides free SSL certificates - activate it for security

## Troubleshooting

### Common Connection Errors:

1. **"Access denied for user"**
   - Double-check username and password
   - Ensure you're using the full username (including prefix)

2. **"Can't connect to MySQL server"**
   - Verify the host address (not localhost!)
   - Check if your IP needs to be whitelisted

3. **"Unknown database"**
   - Confirm database name including any prefix
   - Make sure database exists in your Register.it panel

### Test Connection:

Create a test file `test-db.php`:

```php
<?php
$host = 'mysql.register.it'; // Your host
$dbname = 'YourDBName';
$user = 'YourUsername';
$pass = 'YourPassword';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass);
    echo "✅ Database connection successful!";
} catch(PDOException $e) {
    echo "❌ Connection failed: " . $e->getMessage();
}
?>
```

Upload and access it via browser to test the connection.

## Security Reminder

⚠️ **Never commit real database credentials to Git!**

Before deploying:
1. Remove any test files
2. Set `ENVIRONMENT` to 'production'
3. Use strong passwords
4. Regularly backup your database through Register.it panel