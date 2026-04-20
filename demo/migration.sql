-- Schema-change examples for manual testing.

ALTER TABLE users RENAME COLUMN email TO user_email;
ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50);
ALTER TABLE orders DROP COLUMN status;
DROP TABLE page_views;
