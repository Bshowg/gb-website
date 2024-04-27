<?php
// Database connection parameters
$host = 'gianmd-articles.db.tb-hosting.com'; // or other host
$dbname = 'gianmd_articles';
$username = 'gianmd_gb';
$password = 'malleolo92';

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

