import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  // Remove test calls created during verification (keep seeded history)
  const testCalls = await db.call.findMany({ where: { startedAt: { gt: new Date(Date.now() - 40 * 60 * 1000) } }, select: { id: true } });
  for (const c of testCalls) {
    await db.decision.deleteMany({ where: { callId: c.id } });
    await db.journalEntry.deleteMany({ where: { callId: c.id } });
    await db.call.delete({ where: { id: c.id } });
  }
  // Remove LIVE learning patterns from tests
  await db.learning.deleteMany({ where: { source: "LIVE" } });
  // Remove test customers (non-persona-seeded ones created for test calls)
  const customers = await db.customer.findMany();
  const seededNames = ["Marcus Chen", "Priya Sharma", "David Okafor", "Elena Rodriguez"];
  for (const c of customers) {
    const calls = await db.call.count({ where: { customerId: c.id } });
    if (calls === 0 && !seededNames.includes(c.name)) {
      await db.customer.delete({ where: { id: c.id } });
    }
  }
  const counts = {
    calls: await db.call.count(),
    decisions: await db.decision.count(),
    journal: await db.journalEntry.count(),
    learning: await db.learning.count(),
    customers: await db.customer.count(),
  };
  console.log("post-cleanup:", counts);
}
main().then(() => db.$disconnect());
