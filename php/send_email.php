<?php
// Check if the form is submitted
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Collect post data from the form
    $name = strip_tags(trim($_POST["name"]));
    $email = filter_var(trim($_POST["email"]), FILTER_SANITIZE_EMAIL);
    $message = strip_tags(trim($_POST["message"]));

    // Specify the recipient email address
    $recipient = "g.biscini@gmail.com"; // <-- Replace this with your email address

    // Set the email subject
    $subject = "New contact from $name";

    // Build the email content in a variable
    $email_content = "Name: $name\n";
    $email_content .= "Email: $email\n\n";
    $email_content .= "Message:\n$message\n";

    // Build the email headers
    $email_headers = "From: $name <$email>";

    // Send the email
    if (mail($recipient, $subject, $email_content, $email_headers)) {
        // Set a 200 (okay) response code and redirect back with a success message
        http_response_code(200);
        header("Location: index.html?mailsend=success");
        exit;
    } else {
        // Set a 500 (internal server error) response code and redirect back with an error message
        http_response_code(500);
        header("Location: index.html?mailsend=error");
        exit;
    }
} else {
    // Not a POST request, set a 403 (forbidden) response code.
    http_response_code(403);
    echo "There was a problem with your submission, please try again.";
}
?>