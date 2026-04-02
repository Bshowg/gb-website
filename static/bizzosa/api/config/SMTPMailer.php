<?php
/**
 * SMTP Mailer Class for Aruba
 * Handles email sending through Aruba SMTP server
 */

class SMTPMailer {
    private $host;
    private $port;
    private $username;
    private $password;
    private $secure;
    private $fromEmail;
    private $fromName;
    private $timeout = 30;
    private $socket;
    private $lastError = '';
    
    public function __construct() {
        $this->host = SMTP_HOST;
        $this->port = SMTP_PORT;
        $this->username = SMTP_USER;
        $this->password = SMTP_PASS;
        $this->secure = SMTP_SECURE;
        $this->fromEmail = SMTP_FROM_EMAIL;
        $this->fromName = SMTP_FROM_NAME;
    }
    
    /**
     * Send HTML email
     */
    public function sendMail($to, $subject, $htmlBody, $replyTo = null) {
        try {
            // Connect to SMTP server
            if (!$this->connect()) {
                throw new Exception("Failed to connect to SMTP server: " . $this->lastError);
            }
            
            // Authenticate
            if (!$this->authenticate()) {
                throw new Exception("SMTP authentication failed: " . $this->lastError);
            }
            
            // Send email
            if (!$this->sendEmail($to, $subject, $htmlBody, $replyTo)) {
                throw new Exception("Failed to send email: " . $this->lastError);
            }
            
            // Disconnect
            $this->disconnect();
            
            return true;
            
        } catch (Exception $e) {
            error_log("SMTPMailer Error: " . $e->getMessage());
            $this->disconnect();
            return false;
        }
    }
    
    /**
     * Connect to SMTP server
     */
    private function connect() {
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            ]
        ]);
        
        if ($this->secure === 'ssl') {
            $this->socket = @stream_socket_client(
                "ssl://{$this->host}:{$this->port}",
                $errno,
                $errstr,
                $this->timeout,
                STREAM_CLIENT_CONNECT,
                $context
            );
        } else {
            $this->socket = @stream_socket_client(
                "tcp://{$this->host}:{$this->port}",
                $errno,
                $errstr,
                $this->timeout,
                STREAM_CLIENT_CONNECT,
                $context
            );
        }
        
        if (!$this->socket) {
            $this->lastError = "Connection failed: $errstr ($errno)";
            return false;
        }
        
        // Read greeting
        $response = $this->readResponse();
        if (substr($response, 0, 3) !== '220') {
            $this->lastError = "Invalid greeting: $response";
            return false;
        }
        
        // Send EHLO
        $this->sendCommand("EHLO " . gethostname());
        $response = $this->readResponse();
        
        // Start TLS if needed
        if ($this->secure === 'tls') {
            $this->sendCommand("STARTTLS");
            $response = $this->readResponse();
            if (substr($response, 0, 3) === '220') {
                stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                // Send EHLO again after TLS
                $this->sendCommand("EHLO " . gethostname());
                $response = $this->readResponse();
            }
        }
        
        return true;
    }
    
    /**
     * Authenticate with SMTP server
     */
    private function authenticate() {
        // AUTH LOGIN
        $this->sendCommand("AUTH LOGIN");
        $response = $this->readResponse();
        if (substr($response, 0, 3) !== '334') {
            $this->lastError = "AUTH LOGIN failed: $response";
            return false;
        }
        
        // Send username
        $this->sendCommand(base64_encode($this->username));
        $response = $this->readResponse();
        if (substr($response, 0, 3) !== '334') {
            $this->lastError = "Username failed: $response";
            return false;
        }
        
        // Send password
        $this->sendCommand(base64_encode($this->password));
        $response = $this->readResponse();
        if (substr($response, 0, 3) !== '235') {
            $this->lastError = "Authentication failed: $response";
            return false;
        }
        
        return true;
    }
    
    /**
     * Send the actual email
     */
    private function sendEmail($to, $subject, $htmlBody, $replyTo) {
        // MAIL FROM
        $this->sendCommand("MAIL FROM: <{$this->fromEmail}>");
        $response = $this->readResponse();
        if (substr($response, 0, 3) !== '250') {
            $this->lastError = "MAIL FROM failed: $response";
            return false;
        }
        
        // RCPT TO (can be multiple recipients)
        $recipients = is_array($to) ? $to : [$to];
        foreach ($recipients as $recipient) {
            $this->sendCommand("RCPT TO: <$recipient>");
            $response = $this->readResponse();
            if (substr($response, 0, 3) !== '250') {
                $this->lastError = "RCPT TO failed for $recipient: $response";
                return false;
            }
        }
        
        // DATA
        $this->sendCommand("DATA");
        $response = $this->readResponse();
        if (substr($response, 0, 3) !== '354') {
            $this->lastError = "DATA failed: $response";
            return false;
        }
        
        // Build email headers and body
        $headers = "From: {$this->fromName} <{$this->fromEmail}>\r\n";
        $headers .= "To: " . (is_array($to) ? implode(', ', $to) : $to) . "\r\n";
        if ($replyTo) {
            $headers .= "Reply-To: $replyTo\r\n";
        }
        $headers .= "Subject: $subject\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "Content-Transfer-Encoding: 8bit\r\n";
        $headers .= "Date: " . date('r') . "\r\n";
        $headers .= "Message-ID: <" . time() . rand(1000, 9999) . "@{$this->host}>\r\n";
        
        // Send email content
        $email = $headers . "\r\n" . $htmlBody;
        $this->sendCommand($email);
        $this->sendCommand("\r\n.");
        
        $response = $this->readResponse();
        if (substr($response, 0, 3) !== '250') {
            $this->lastError = "Email sending failed: $response";
            return false;
        }
        
        return true;
    }
    
    /**
     * Disconnect from SMTP server
     */
    private function disconnect() {
        if ($this->socket) {
            $this->sendCommand("QUIT");
            fclose($this->socket);
            $this->socket = null;
        }
    }
    
    /**
     * Send command to SMTP server
     */
    private function sendCommand($command) {
        if ($this->socket) {
            fputs($this->socket, $command . "\r\n");
        }
    }
    
    /**
     * Read response from SMTP server
     */
    private function readResponse() {
        $response = '';
        if ($this->socket) {
            while ($line = fgets($this->socket, 515)) {
                $response .= $line;
                if (substr($line, 3, 1) == ' ') break;
            }
        }
        return $response;
    }
    
    /**
     * Get last error message
     */
    public function getLastError() {
        return $this->lastError;
    }
}