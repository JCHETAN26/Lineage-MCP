-- Adversarial SQL: a mix of valid and malformed statements.
-- Scanner must not crash; valid statements must still be picked up.

CREATE TABLE valid_table (
  id INTEGER PRIMARY KEY,
  name VARCHAR(255)
);

-- Unclosed string literal
SELECT 'unclosed_string FROM should_not_be_a_table

-- Missing closing paren
CREATE TABLE broken_table (
  id INTEGER,
  name VARCHAR(255

-- Comment that looks like SQL: -- CREATE TABLE comment_table (id INT);

CREATE TABLE another_valid (
  id INTEGER
);
