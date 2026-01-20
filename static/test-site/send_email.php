<?php
header('Content-Type: application/json');

// Configurazione email per Aruba hosting
$to = "info@irenedelmonte.it"; // Sostituire con l'email reale
$subject = "Nuova richiesta di appuntamento dal sito web";

// Validazione e sanitizzazione input
$name = isset($_POST['name']) ? strip_tags(trim($_POST['name'])) : '';
$email = isset($_POST['email']) ? filter_var(trim($_POST['email']), FILTER_SANITIZE_EMAIL) : '';
$message = isset($_POST['message']) ? strip_tags(trim($_POST['message'])) : '';

// Array di risposta
$response = array();

// Controlli di validazione
if (empty($name) || empty($email)) {
    $response['status'] = 'error';
    $response['message'] = 'Nome ed email sono campi obbligatori.';
    echo json_encode($response);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $response['status'] = 'error';
    $response['message'] = 'Indirizzo email non valido.';
    echo json_encode($response);
    exit;
}

// Costruzione del messaggio email
$email_content = "Nome: $name\n";
$email_content .= "Email: $email\n\n";
$email_content .= "Messaggio:\n$message\n";

$from_email = "postmaster@irenedelmonte.it";

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
if (mail($to, $subject, $email_content, $headers, $additional_params)) {
    $response['status'] = 'success';
    $response['message'] = 'La tua richiesta è stata inviata con successo! Ti contatterò al più presto.';
} else {
    $response['status'] = 'error';
    $response['message'] = 'Si è verificato un errore durante l\'invio. Riprova più tardi o contattami direttamente.';
}

echo json_encode($response);
?>