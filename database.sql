CREATE DATABASE IF NOT EXISTS data_tool
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE data_tool;

CREATE TABLE IF NOT EXISTS results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    extracted_text LONGTEXT NOT NULL,
    char_count INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);