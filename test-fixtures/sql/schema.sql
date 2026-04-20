-- Core user table
CREATE TABLE users (
  id          INT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  username    VARCHAR(100),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Orders table referencing users
CREATE TABLE orders (
  id         INT PRIMARY KEY,
  user_id    INT NOT NULL,
  amount     DECIMAL(10,2),
  status     VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Events table
CREATE TABLE events (
  id         INT PRIMARY KEY,
  user_id    INT,
  event_name VARCHAR(100),
  properties JSONB,
  occurred_at TIMESTAMP
);

-- A migration that renames a column
ALTER TABLE users RENAME COLUMN email TO user_email;
