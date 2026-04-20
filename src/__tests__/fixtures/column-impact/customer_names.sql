SELECT
  id,
  first_name,
  last_name,
  first_name || ' ' || last_name AS full_name
FROM users;
