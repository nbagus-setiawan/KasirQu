-- =====================================================================
-- QR Ordering System — Database Schema (MySQL 8.0+)
-- =====================================================================
CREATE DATABASE IF NOT EXISTS KasirQu
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE KasirQu;

-- ---------------------------------------------------------------------
-- Users (kasir / admin) — mendukung multi-akun dengan role berbeda
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('admin','kasir') NOT NULL DEFAULT 'kasir',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Kategori menu
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Menu makanan/minuman
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  price DECIMAL(12,2) NOT NULL,
  image_url VARCHAR(255) NULL,
  available TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_menu_available (available)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Meja / kursi restoran — tiap meja bisa dapat QR code sendiri
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dining_tables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number INT NOT NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Pesanan (order header)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(20) PRIMARY KEY,           -- id pendek (nanoid), ditunjukkan ke pelanggan
  table_id INT NOT NULL,
  status ENUM('pending','confirmed','paid','completed','cancelled')
    NOT NULL DEFAULT 'pending',
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  customer_note VARCHAR(300) NULL,
  confirmed_by INT NULL,
  paid_by INT NULL,
  completed_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  paid_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (table_id) REFERENCES dining_tables(id),
  FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at),
  INDEX idx_orders_table (table_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Pengaturan restoran (nama, alamat, telp) — dipakai di kop struk
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(50) PRIMARY KEY,
  `value` VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Detail item per pesanan (order lines)
-- name_snapshot & price_snapshot disimpan agar riwayat/laporan tidak
-- berubah walau harga/nama menu diedit di kemudian hari.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(20) NOT NULL,
  menu_item_id INT NULL,
  name_snapshot VARCHAR(150) NOT NULL,
  price_snapshot DECIMAL(12,2) NOT NULL,
  qty INT NOT NULL,
  note VARCHAR(200) NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL,
  INDEX idx_order_items_order (order_id)
) ENGINE=InnoDB;
