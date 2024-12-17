<?php
// Database connection parameters
$host = 'gianmd-articles.db.tb-hosting.com'; 
$dbname = 'gianmd_articles';
$username = 'gianmd_gb';
$password = 'malleolo92';

// Create connection
$conn = new mysqli($host, $username, $password, $dbname);

// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Get limit and offset from query parameters
$limit = isset($_GET['limit']) ? intval($_GET['limit']) : 5;
$offset = isset($_GET['offset']) ? intval($_GET['offset']) : 0;

// SQL to fetch articles with limit and offset for pagination
$sql = "SELECT * FROM articles ORDER BY id DESC LIMIT $limit OFFSET $offset";
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
