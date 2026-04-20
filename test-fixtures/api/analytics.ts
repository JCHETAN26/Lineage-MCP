import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getDailySignups() {
  return prisma.users.findMany({
    where: { created_at: { gte: new Date("2024-01-01") } },
    select: { id: true, email: true, username: true },
  });
}

export async function getRevenueByUser() {
  return prisma.orders.findMany({
    where: { status: "completed" },
    include: { users: true },
  });
}
