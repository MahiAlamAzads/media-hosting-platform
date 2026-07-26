import { prisma } from "./client.js";

async function main(): Promise<void> {
  const result = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() AS now`;
  console.log("Database connection successful:", result[0]?.now ?? "unknown");
}

main()
  .catch((error: unknown) => {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
