<?php
header('Content-Type: application/json');

// Configurazione email per Aruba hosting
$to = "to@email.it"; // Sostituire con l'email reale

// Validazione e sanitizzazione input
$email = isset($_POST['email']) ? filter_var(trim($_POST['email']), FILTER_SANITIZE_EMAIL) : '';
$language = isset($_POST['language']) ? trim($_POST['language']) : 'it';

// Array di risposta
$response = array();

// Messaggi multilingua
$messages = array(
    'it' => array(
        'subject' => 'Nuova iscrizione newsletter - Radici',
        'required_fields' => 'Email è un campo obbligatorio.',
        'invalid_email' => 'Indirizzo email non valido.',
        'success' => 'La tua iscrizione è stata inviata con successo! Riceverai presto aggiornamenti sul progetto.',
        'error' => 'Si è verificato un errore durante l\'iscrizione. Riprova più tardi.'
    ),
    'en' => array(
        'subject' => 'New newsletter subscription - Roots',
        'required_fields' => 'Email is a required field.',
        'invalid_email' => 'Invalid email address.',
        'success' => 'Your subscription was sent successfully! You will soon receive updates on the project.',
        'error' => 'An error occurred during subscription. Please try again later.'
    )
);

$msg = $messages[$language] ?? $messages['it'];

// Controlli di validazione
if (empty($email)) {
    $response['status'] = 'error';
    $response['message'] = $msg['required_fields'];
    echo json_encode($response);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $response['status'] = 'error';
    $response['message'] = $msg['invalid_email'];
    echo json_encode($response);
    exit;
}

// Costruzione del messaggio email
$email_content = "Nuovo iscritto alla newsletter: $email\n";
$email_content .= "Lingua: $language\n";
$email_content .= "Data: " . date('Y-m-d H:i:s') . "\n\n";

$from_email = "from@email.it";

$headers = "From: $from_email\r\n";
$headers .= "Reply-To: $email\r\n";
$headers .= "Return-Path: $from_email\r\n";
$headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Content-Transfer-Encoding: 8bit\r\n";

// Parametri aggiuntivi per Aruba (-f flag per sendmail)
$additional_params = "-f$from_email";

// Invio email con configurazione Aruba
if (mail($to, $msg['subject'], $email_content, $headers, $additional_params)) {
    $response['status'] = 'success';
    $response['message'] = $msg['success'];
} else {
    $response['status'] = 'error';
    $response['message'] = $msg['error'];
}

echo json_encode($response);
?>