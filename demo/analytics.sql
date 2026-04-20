-- Downstream analytics query that depends on users and orders.

CREATE TABLE user_order_summary (
  user_id INT,
  email VARCHAR(255),
  total_orders INT,
  total_amount DECIMAL(10,2)
);

INSERT INTO user_order_summary (user_id, email, total_orders, total_amount)
SELECT
  u.id,
  u.email,
  COUNT(o.id),
  SUM(o.amount)
FROM users u
JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.email;
