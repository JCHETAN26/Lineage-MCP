-- Base tables for extension testing.
-- Open this file after the others to see dependent-file counts on each table.

CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(255),
  plan_tier VARCHAR(50),
  created_at TIMESTAMP
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  user_id INT,
  amount DECIMAL(10,2),
  status VARCHAR(50),
  created_at TIMESTAMP
);

CREATE TABLE page_views (
  id INT PRIMARY KEY,
  user_id INT,
  page_name VARCHAR(100),
  viewed_at TIMESTAMP
);
