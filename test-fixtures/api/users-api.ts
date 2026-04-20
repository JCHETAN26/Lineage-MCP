import { Pool } from "pg";

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getUserByEmail(email: string) {
  const result = await db.query(
    `SELECT id, email, username, created_at FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0];
}

export async function getOrdersForUser(userId: number) {
  const result = await db.query(
    `SELECT o.id, o.amount, o.status FROM orders o WHERE o.user_id = $1`,
    [userId]
  );
  return result.rows;
}
