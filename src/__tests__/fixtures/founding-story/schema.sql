-- Founding-story fixture: mirrors the SQL rename that caused the Silent Data Break.
-- A test will simulate renaming users.email -> users.user_email and assert that
-- every downstream reference (Python, Spark, Jupyter, TS) is reported.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  amount DECIMAL(10, 2),
  status VARCHAR(50)
);
