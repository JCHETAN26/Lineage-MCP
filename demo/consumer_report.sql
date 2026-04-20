-- A second dependent file so the extension can show larger lineage counts.

CREATE TABLE active_user_pages (
  user_id INT,
  page_name VARCHAR(100),
  viewed_at TIMESTAMP
);

INSERT INTO active_user_pages (user_id, page_name, viewed_at)
SELECT
  pv.user_id,
  pv.page_name,
  pv.viewed_at
FROM page_views pv
JOIN users u ON u.id = pv.user_id
WHERE u.plan_tier = 'pro';
