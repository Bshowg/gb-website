# Personal Website

[<img alt="Deployed with FTP Deploy Action" src="https://img.shields.io/badge/Deployed With-FTP DEPLOY ACTION-%3CCOLOR%3E?style=for-the-badge&color=2b9348">](https://github.com/SamKirkland/FTP-Deploy-Action)


GET ARTICLES.PHP

<?php
// Database connection parameters
$host = ''; // or other host
$dbname = '';
$username = '';
$password = '';

// Create connection
$conn = new mysqli($host, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// SQL to fetch articles
$sql = "SELECT * FROM articles";
$result = $conn->query($sql);

$articles = [];

if ($result->num_rows > 0) {
    // output data of each row
    while($row = $result->fetch_assoc()) {
        $articles[] = $row;
    }
} else {
    echo "0 results";
}

header('Content-Type: application/json');
echo json_encode($articles);

$conn->close();
?>
