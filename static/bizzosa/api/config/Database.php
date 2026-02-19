<?php
/**
 * Database connection class using PDO
 */
class Database {
    private static $instance = null;
    private $connection;
    
    private function __construct() {
        try {
            $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES " . DB_CHARSET
            ];
            
            $this->connection = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            if (ENVIRONMENT === 'development') {
                die('Database connection failed: ' . $e->getMessage());
            } else {
                die('Database connection failed. Please try again later.');
            }
        }
    }
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function getConnection() {
        return $this->connection;
    }
    
    /**
     * Execute a SELECT query
     */
    public function select($sql, $params = []) {
        try {
            $stmt = $this->connection->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll();
        } catch (PDOException $e) {
            $this->handleError($e, $sql);
            return false;
        }
    }
    
    /**
     * Execute a SELECT query and return single row
     */
    public function selectOne($sql, $params = []) {
        try {
            $stmt = $this->connection->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetch();
        } catch (PDOException $e) {
            $this->handleError($e, $sql);
            return false;
        }
    }
    
    /**
     * Execute INSERT query
     */
    public function insert($table, $data) {
        try {
            $fields = array_keys($data);
            $values = array_map(function($field) { return ':' . $field; }, $fields);
            
            $sql = "INSERT INTO $table (" . implode(', ', $fields) . ") 
                    VALUES (" . implode(', ', $values) . ")";
            
            $stmt = $this->connection->prepare($sql);
            $stmt->execute($data);
            
            return $this->connection->lastInsertId();
        } catch (PDOException $e) {
            $this->handleError($e, $sql ?? '');
            return false;
        }
    }
    
    /**
     * Execute UPDATE query
     */
    public function update($table, $data, $where, $whereParams = []) {
        try {
            $setClause = [];
            foreach ($data as $field => $value) {
                $setClause[] = "$field = :$field";
            }
            
            $sql = "UPDATE $table SET " . implode(', ', $setClause) . " WHERE $where";
            
            $params = array_merge($data, $whereParams);
            $stmt = $this->connection->prepare($sql);
            $stmt->execute($params);
            
            return $stmt->rowCount();
        } catch (PDOException $e) {
            $this->handleError($e, $sql ?? '');
            return false;
        }
    }
    
    /**
     * Execute DELETE query
     */
    public function delete($table, $where, $params = []) {
        try {
            $sql = "DELETE FROM $table WHERE $where";
            $stmt = $this->connection->prepare($sql);
            $stmt->execute($params);
            
            return $stmt->rowCount();
        } catch (PDOException $e) {
            $this->handleError($e, $sql);
            return false;
        }
    }
    
    /**
     * Begin transaction
     */
    public function beginTransaction() {
        return $this->connection->beginTransaction();
    }
    
    /**
     * Commit transaction
     */
    public function commit() {
        return $this->connection->commit();
    }
    
    /**
     * Rollback transaction
     */
    public function rollback() {
        return $this->connection->rollBack();
    }
    
    /**
     * Handle database errors
     */
    private function handleError($exception, $sql = '') {
        if (ENVIRONMENT === 'development') {
            echo "Database Error: " . $exception->getMessage();
            if ($sql) {
                echo "\nSQL: " . $sql;
            }
        } else {
            error_log("Database Error: " . $exception->getMessage() . " SQL: " . $sql);
        }
    }
    
    /**
     * Prevent cloning
     */
    private function __clone() {}
    
    /**
     * Prevent unserialization
     */
    public function __wakeup() {
        throw new Exception("Cannot unserialize singleton");
    }
}