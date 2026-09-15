// Prisma client singleton — one connection pool shared by every module.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
