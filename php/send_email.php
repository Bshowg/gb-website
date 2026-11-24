<?php
// Check if the form is submitted
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Collect post data from the form
    // Newlines are stripped from the name because it goes into the Subject header
    $name = str_replace(["\r", "\n"], " ", strip_tags(trim($_POST["name"] ?? "")));
    $email = filter_var(trim($_POST["email"] ?? ""), FILTER_SANITIZE_EMAIL);
    $message = strip_tags(trim($_POST["message"] ?? ""));

    // Validate email address
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo "Invalid email address. Please enter a valid email.";
        exit;
    }

    // Specify the recipient email address
    $recipient = "g.biscini@gmail.com";
    $subject = "New contact from $name";

    $email_content = "Name: $name\n";
    $email_content .= "Email: $email\n\n";
    $email_content .= "Message:\n$message\n";

    // Enhanced headers
    $email_headers = "From: info@gianmarcobiscini.it\r\n";
    $email_headers .= "Reply-To: $email\r\n";
    $email_headers .= "MIME-Version: 1.0\r\n";
    $email_headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    if (mail($recipient, $subject, $email_content, $email_headers)) {
        header("Location: ../static/mailsendsuccess.html");
        exit;
    } else {
        header("Location: ../static/contacts.html?mailsend=error");
        exit;
    }
} else {
    http_response_code(403);
    echo "There was a problem with your submission, please try again.";
}
?>
