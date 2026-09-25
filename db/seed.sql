USE KasirQu;

-- ---------------------------------------------------------------------
-- Kategori
-- ---------------------------------------------------------------------
INSERT INTO categories (name, sort_order) VALUES
  ('Makanan', 1),
  ('Minuman', 2),
  ('Camilan', 3)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ---------------------------------------------------------------------
-- Menu
-- Catatan: dicek dulu dengan NOT EXISTS supaya aman dijalankan berkali-kali
-- tanpa membuat duplikat (nama menu tidak diberi UNIQUE constraint karena
-- nama boleh sama di kategori berbeda saat dipakai sungguhan).
-- ---------------------------------------------------------------------
INSERT INTO menu_items (category_id, name, description, price, available)
SELECT c.id, x.name, x.description, x.price, 1
FROM (
  SELECT 'Makanan' AS cat, 'Nasi Goreng Spesial' AS name, 'Nasi goreng dengan telur, ayam suwir, dan kerupuk.' AS description, 28000 AS price
  UNION ALL SELECT 'Makanan', 'Mie Goreng Jawa', 'Mie goreng bumbu jawa dengan sayuran segar.', 25000
  UNION ALL SELECT 'Makanan', 'Ayam Geprek Sambal Bawang', 'Ayam crispy digeprek dengan sambal bawang pedas.', 27000
  UNION ALL SELECT 'Makanan', 'Sate Ayam (10 tusuk)', 'Sate ayam bumbu kacang khas.', 32000
  UNION ALL SELECT 'Makanan', 'Soto Ayam', 'Soto ayam kuah bening dengan soun dan telur.', 24000
  UNION ALL SELECT 'Minuman', 'Es Teh Manis', 'Teh manis dingin segar.', 8000
  UNION ALL SELECT 'Minuman', 'Es Jeruk', 'Jeruk peras segar dengan es.', 10000
  UNION ALL SELECT 'Minuman', 'Kopi Susu Gula Aren', 'Kopi susu dengan gula aren khas.', 18000
  UNION ALL SELECT 'Minuman', 'Jus Alpukat', 'Jus alpukat creamy dengan cokelat.', 16000
  UNION ALL SELECT 'Minuman', 'Air Mineral', 'Air mineral botol 600ml.', 5000
  UNION ALL SELECT 'Camilan', 'Pisang Goreng Keju', 'Pisang goreng crispy dengan topping keju & cokelat.', 15000
  UNION ALL SELECT 'Camilan', 'Tahu Crispy', 'Tahu goreng crispy dengan saus sambal.', 12000
) AS x
JOIN categories c ON c.name = x.cat
WHERE NOT EXISTS (SELECT 1 FROM menu_items m WHERE m.name = x.name);

-- ---------------------------------------------------------------------
-- Meja (1-12)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO dining_tables (number, active)
VALUES (1,1),(2,1),(3,1),(4,1),(5,1),(6,1),(7,1),(8,1),(9,1),(10,1),(11,1),(12,1);

-- ---------------------------------------------------------------------
-- Pengaturan restoran default (dipakai di kop struk cetak)
-- ---------------------------------------------------------------------
INSERT INTO settings (`key`, `value`) VALUES
  ('restaurant_name', 'Warung Nusantara'),
  ('restaurant_address', 'Jl. Contoh No. 123, Kota Anda'),
  ('restaurant_phone', '0812-3456-7890'),
  ('receipt_footer', 'Terima kasih atas kunjungan Anda!')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
