import { scanPrismaSchema } from "../scanners/prisma-scanner.js";

const SCHEMA = `
generator client {
  provider = "prisma-client-js"
}

model Post {
  id       Int     @id @default(autoincrement())
  content  String?
  title    String
  authorId Int?
  author   User?   @relation(fields: [authorId], references: [id])
  @@map("posts")
}

// user model
model User {
  id       Int       @id @default(autoincrement())
  email    String    @unique
  name     String?
  posts    Post[]
  profiles Profile[]
}
`;

describe("Prisma Scanner", () => {
  const tables = scanPrismaSchema(SCHEMA, "prisma/schema.prisma");

  it("detects Prisma models as tables", () => {
    const names = tables.map((t) => t.name);
    expect(names).toContain("Post");
    expect(names).toContain("User");
  });

  it("parses Prisma fields as columns", () => {
    const user = tables.find((t) => t.name === "User");
    expect(user).toBeDefined();
    expect(user!.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(["id", "email", "name", "posts", "profiles"])
    );
  });

  it("ignores block-level directives when parsing columns", () => {
    const post = tables.find((t) => t.name === "Post");
    expect(post).toBeDefined();
    expect(post!.columns.map((c) => c.name)).not.toContain("@@map");
  });

  it("stores file path and line number", () => {
    const user = tables.find((t) => t.name === "User");
    expect(user?.filePath).toBe("prisma/schema.prisma");
    expect(user?.line).toBeGreaterThan(0);
  });
});
