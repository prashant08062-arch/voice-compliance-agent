import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging is dev-only: serverless production runs stay quiet + fast.
    log: process.env.NODE_ENV === "production" ? [] : ["query"],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db