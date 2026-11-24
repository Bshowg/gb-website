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
    $sender = "info@gianmarcobiscini.it";

    // Encode non-ASCII (accented names) instead of sending raw 8-bit headers
    $subject = mb_encode_mimeheader("Messaggio dal sito da $name", "UTF-8", "B");

    $email_content = "Ciao Gianmarco,\n\n";
    $email_content .= "$name ti ha scritto dal modulo contatti di gianmarcobiscini.it.\n";
    $email_content .= "Basta rispondere a questa email per continuare la conversazione.\n\n";
    $email_content .= "----------------------------------------\n\n";
    $email_content .= "$message\n\n";
    $email_content .= "----------------------------------------\n";
    $email_content .= "Nome:  $name\n";
    $email_content .= "Email: $email\n";
    $email_content .= "Data:  " . date("d/m/Y H:i") . "\n";

    $email_headers = "From: Sito gianmarcobiscini.it <$sender>\r\n";
    $email_headers .= "Reply-To: $email\r\n";
    $email_headers .= "MIME-Version: 1.0\r\n";
    $email_headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $email_headers .= "Content-Transfer-Encoding: 8bit\r\n";

    // -f sets the bounce address to the same domain as From
    if (mail($recipient, $subject, $email_content, $email_headers, "-f$sender")) {
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
