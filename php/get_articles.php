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

// SQL to fetch articles with condition to exclude LIMIT and OFFSET if they are 0
if ($limit === 0 && $offset === 0) {
    $sql = "SELECT * FROM articles ORDER BY id DESC";
} else {
    $sql = "SELECT * FROM articles ORDER BY id DESC LIMIT $limit OFFSET $offset";
}

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
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
echo json_encode($articles);

$conn->close();
