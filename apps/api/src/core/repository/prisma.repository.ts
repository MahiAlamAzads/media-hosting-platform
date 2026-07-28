import { prisma } from "@media/database";
export abstract class PrismaRepository { protected readonly db = prisma; }
