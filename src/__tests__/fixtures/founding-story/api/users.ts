// API endpoint that reads users via Prisma + raw SQL.
import { PrismaClient } from "@prisma/client";
import { pool } from "./db.js";

const prisma = new PrismaClient();

export async function getUserList() {
  return await prisma.user.findMany({
    select: { id: true, email: true, name: true },
  });
}

export async function getUserByEmailRaw(email: string) {
  const result = await pool.query(
    "SELECT id, email, name FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0];
}
