<?php
/**
 * SMTP Connection Diagnostic Script
 * Tests various SMTP configurations to find working settings
 */

header('Content-Type: application/json');

// Test configurations for Aruba
$configs = [
    [
        'name' => 'Aruba SSL (smtps.aruba.it:465)',
        'host' => 'smtps.aruba.it',
        'port' => 465,
        'secure' => 'ssl'
    ],
    [
        'name' => 'Aruba TLS (smtp.aruba.it:587)',
        'host' => 'smtp.aruba.it',
        'port' => 587,
        'secure' => 'tls'
    ],
    [
        'name' => 'Aruba Plain (smtp.aruba.it:25)',
        'host' => 'smtp.aruba.it',
        'port' => 25,
        'secure' => 'none'
    ],
    [
        'name' => 'Aruba SSL Alt (smtp.aruba.it:465)',
        'host' => 'smtp.aruba.it',
        'port' => 465,
        'secure' => 'ssl'
    ]
];

$results = [];

foreach ($configs as $config) {
    $result = [
        'config' => $config['name'],
        'host' => $config['host'],
        'port' => $config['port'],
        'secure' => $config['secure']
    ];
    
    // Test basic TCP connection
    $timeout = 5;
    $errorNo = null;
    $errorStr = null;
    
    if ($config['secure'] === 'ssl') {
        $socket = @fsockopen('ssl://' . $config['host'], $config['port'], $errorNo, $errorStr, $timeout);
    } else {
        $socket = @fsockopen($config['host'], $config['port'], $errorNo, $errorStr, $timeout);
    }
    
    if ($socket) {
        $result['connection'] = 'SUCCESS';
        $result['response'] = fgets($socket, 512);
        fclose($socket);
        
        // Test with stream_socket_client (more modern approach)
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            ]
        ]);
        
        if ($config['secure'] === 'ssl') {
            $stream = @stream_socket_client(
                "ssl://{$config['host']}:{$config['port']}",
                $errno2,
                $errstr2,
                $timeout,
                STREAM_CLIENT_CONNECT,
                $context
            );
        } else {
            $stream = @stream_socket_client(
                "tcp://{$config['host']}:{$config['port']}",
                $errno2,
                $errstr2,
                $timeout,
                STREAM_CLIENT_CONNECT,
                $context
            );
        }
        
        if ($stream) {
            $result['stream_connection'] = 'SUCCESS';
            
            // Try to get greeting
            $greeting = fgets($stream, 512);
            if ($greeting && strpos($greeting, '220') === 0) {
                $result['smtp_greeting'] = trim($greeting);
                
                // Send EHLO
                fputs($stream, "EHLO " . gethostname() . "\r\n");
                $ehlo_response = '';
                while ($line = fgets($stream, 512)) {
                    $ehlo_response .= $line;
                    if (substr($line, 3, 1) == ' ') break;
                }
                $result['ehlo_response'] = 'Received';
                
                // For TLS, try STARTTLS
                if ($config['secure'] === 'tls') {
                    fputs($stream, "STARTTLS\r\n");
                    $tls_response = fgets($stream, 512);
                    if (strpos($tls_response, '220') === 0) {
                        $result['starttls'] = 'SUCCESS';
                    } else {
                        $result['starttls'] = 'FAILED: ' . trim($tls_response);
                    }
                }
            }
            
            fputs($stream, "QUIT\r\n");
            fclose($stream);
        } else {
            $result['stream_connection'] = "FAILED: $errstr2 ($errno2)";
        }
    } else {
        $result['connection'] = "FAILED: $errorStr ($errorNo)";
    }
    
    $results[] = $result;
}

// Also check if mail() function is available
$mailFunction = [
    'function_exists' => function_exists('mail'),
    'sendmail_path' => ini_get('sendmail_path'),
    'smtp' => ini_get('SMTP'),
    'smtp_port' => ini_get('smtp_port')
];

// Check server environment
$serverInfo = [
    'hostname' => gethostname(),
    'server_addr' => $_SERVER['SERVER_ADDR'] ?? 'unknown',
    'php_version' => phpversion(),
    'openssl' => extension_loaded('openssl') ? 'enabled' : 'disabled',
    'sockets' => extension_loaded('sockets') ? 'enabled' : 'disabled',
    'allow_url_fopen' => ini_get('allow_url_fopen') ? 'enabled' : 'disabled'
];

// Test DNS resolution
$dnsResults = [];
foreach (['smtp.aruba.it', 'smtps.aruba.it'] as $host) {
    $ip = gethostbyname($host);
    $dnsResults[$host] = ($ip !== $host) ? $ip : 'DNS resolution failed';
}

echo json_encode([
    'timestamp' => date('Y-m-d H:i:s'),
    'connection_tests' => $results,
    'mail_function' => $mailFunction,
    'server_info' => $serverInfo,
    'dns_resolution' => $dnsResults,
    'recommendation' => getRecommendation($results)
], JSON_PRETTY_PRINT);

function getRecommendation($results) {
    foreach ($results as $result) {
        if (isset($result['smtp_greeting']) && isset($result['stream_connection']) && $result['stream_connection'] === 'SUCCESS') {
            return "Use configuration: {$result['config']} (Host: {$result['host']}, Port: {$result['port']}, Security: {$result['secure']})";
        }
    }
    
    // Check if any connection worked
    foreach ($results as $result) {
        if (isset($result['connection']) && $result['connection'] === 'SUCCESS') {
            return "Partial success with: {$result['config']} - may need authentication adjustments";
        }
    }
    
    return "No SMTP configurations working. Check firewall rules or contact hosting provider about SMTP restrictions.";
}