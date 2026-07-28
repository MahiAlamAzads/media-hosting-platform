import { prisma } from "@media/database";

async function main(): Promise<void> {
  const subscriptions = await prisma.workspaceSubscription.findMany({
    where: {
      status: {
        in: ["ACTIVE", "TRIALING", "GRACE_PERIOD"]
      }
    },
    select: {
      workspaceId: true,
      periodStart: true,
      periodEnd: true
    }
  });

  let aggregates = 0;

  for (const subscription of subscriptions) {
    const grouped = await prisma.usageEvent.groupBy({
      by: ["metric"],
      where: {
        workspaceId: subscription.workspaceId,
        occurredAt: {
          gte: subscription.periodStart,
          lt: subscription.periodEnd
        }
      },
      _sum: { quantity: true },
      _max: { occurredAt: true }
    });

    for (const item of grouped) {
      await prisma.usageAggregate.upsert({
        where: {
          workspaceId_metric_periodStart_periodEnd: {
            workspaceId: subscription.workspaceId,
            metric: item.metric,
            periodStart: subscription.periodStart,
            periodEnd: subscription.periodEnd
          }
        },
        create: {
          workspaceId: subscription.workspaceId,
          metric: item.metric,
          periodStart: subscription.periodStart,
          periodEnd: subscription.periodEnd,
          quantity: item._sum.quantity ?? 0n,
          lastEventAt: item._max.occurredAt
        },
        update: {
          quantity: item._sum.quantity ?? 0n,
          lastEventAt: item._max.occurredAt
        }
      });
      aggregates += 1;
    }
  }

  console.log(
    `Usage aggregation complete. subscriptions=${subscriptions.length} aggregates=${aggregates}`
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
