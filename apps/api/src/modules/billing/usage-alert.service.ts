import { prisma } from "@media/database";
import { env } from "../../config/env.js";
import { sendSecurityEmail } from "../../infrastructure/mail.js";
import { getWorkspaceUsageSnapshot } from "./usage-query.service.js";
import {
  formatUsageMetricValue,
  usageAlertThresholds,
  usageMetricLabel,
  usageThresholdMessage,
  type UsageAlertThreshold
} from "./usage-alert-policy.js";
import type { UsageMetricName } from "./billing.types.js";
import { shouldRunThrottled } from "../../infrastructure/cache.js";

const retryAfterMilliseconds = 10 * 60 * 1000;
const scheduledWorkspaces = new Set<string>();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[character] ?? character;
  });
}

function errorText(error: unknown): string {
  return (
    error instanceof Error
      ? error.message
      : "Unknown email delivery error."
  ).slice(0, 1_000);
}

function emailSubject(input: {
  workspaceName: string;
  metric: UsageMetricName;
  threshold: UsageAlertThreshold;
  blocked: boolean;
  paygEnabled?: boolean;
}): string {
  const label = usageMetricLabel(input.metric);

  if (input.threshold === 100 && input.blocked) {
    return `${input.workspaceName}: ${label} limit reached — service stopped`;
  }

  if (input.threshold === 100 && input.paygEnabled) {
    return `${input.workspaceName}: ${label} included limit reached — PAYG active`;
  }

  return `${input.workspaceName}: ${label} usage reached ${input.threshold}%`;
}

function emailText(input: {
  workspaceName: string;
  planName: string;
  metric: UsageMetricName;
  threshold: UsageAlertThreshold;
  percent: number;
  current: string;
  limit: string;
  periodEnd: Date;
  blocked: boolean;
  paygEnabled?: boolean;
}): string {
  const message = usageThresholdMessage({
    metric: input.metric,
    threshold: input.threshold,
    blocked: input.blocked,
    paygEnabled: input.paygEnabled
  });
  const current = formatUsageMetricValue(input.metric, input.current);
  const limit = formatUsageMetricValue(input.metric, input.limit);

  return [
    `${input.workspaceName} usage warning`,
    "",
    message,
    "",
    `Plan: ${input.planName}`,
    `Meter: ${usageMetricLabel(input.metric)}`,
    `Current usage: ${current}`,
    `Plan limit: ${limit}`,
    `Current percentage: ${input.percent.toFixed(2)}%`,
    `Billing period ends: ${input.periodEnd.toISOString()}`,
    "",
    `Review usage: ${env.WEB_URL}/dashboard/billing/usage`,
    `Compare plans: ${env.WEB_URL}/dashboard/billing/plans`
  ].join("\n");
}

function emailHtml(input: {
  workspaceName: string;
  planName: string;
  metric: UsageMetricName;
  threshold: UsageAlertThreshold;
  percent: number;
  current: string;
  limit: string;
  periodEnd: Date;
  blocked: boolean;
  paygEnabled?: boolean;
}): string {
  const message = usageThresholdMessage({
    metric: input.metric,
    threshold: input.threshold,
    blocked: input.blocked,
    paygEnabled: input.paygEnabled
  });
  const formattedCurrent = formatUsageMetricValue(input.metric, input.current);
  const formattedLimit = formatUsageMetricValue(input.metric, input.limit);
  const workspaceName = escapeHtml(input.workspaceName);
  const planName = escapeHtml(input.planName);
  const safeMessage = escapeHtml(message);
  const current = escapeHtml(formattedCurrent);
  const limit = escapeHtml(formattedLimit);
  const tone =
    input.threshold >= 100
      ? "#b42318"
      : input.threshold >= 90
        ? "#c4320a"
        : input.threshold >= 80
          ? "#b54708"
          : "#175cd3";

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#172b4d">
    <div style="max-width:640px;margin:24px auto;background:#ffffff;border:1px solid #dfe3e8;border-radius:10px;overflow:hidden">
      <div style="padding:18px 24px;background:${tone};color:#ffffff">
        <strong>${workspaceName}</strong>
        <div style="font-size:26px;margin-top:6px">${input.threshold}% usage warning</div>
      </div>
      <div style="padding:24px">
        <p style="font-size:16px;line-height:1.6;margin-top:0">${safeMessage}</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #eee">Plan</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right"><strong>${planName}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee">Meter</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right"><strong>${usageMetricLabel(input.metric)}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee">Current</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${current}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee">Limit</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${limit}</td></tr>
          <tr><td style="padding:8px">Period ends</td><td style="padding:8px;text-align:right">${input.periodEnd.toISOString()}</td></tr>
        </table>
        <p>
          <a href="${env.WEB_URL}/dashboard/billing/usage" style="display:inline-block;padding:11px 16px;background:${tone};color:white;text-decoration:none;border-radius:6px;margin-right:8px">Review usage</a>
          <a href="${env.WEB_URL}/dashboard/billing/plans" style="display:inline-block;padding:11px 16px;border:1px solid #98a2b3;color:#344054;text-decoration:none;border-radius:6px">Compare plans</a>
        </p>
      </div>
    </div>
  </body>
</html>`;
}

async function claimEmail(alertId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - retryAfterMilliseconds);
  const claimed = await prisma.usageAlert.updateMany({
    where: {
      id: alertId,
      emailSentAt: null,
      OR: [
        { emailStatus: { in: ["PENDING", "FAILED"] } },
        {
          emailStatus: "SENDING",
          lastEmailAttemptAt: { lt: staleBefore }
        }
      ]
    },
    data: {
      emailStatus: "SENDING",
      lastEmailAttemptAt: new Date(),
      emailLastError: null
    }
  });

  return claimed.count === 1;
}

export async function evaluateUsageAlertsForWorkspace(
  workspaceId: string
): Promise<{
  created: number;
  emailed: number;
  failed: number;
}> {
  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId },
    select: {
      periodStart: true,
      periodEnd: true,
      workspace: {
        select: {
          name: true,
          members: {
            where: { role: "OWNER" },
            take: 1,
            select: {
              user: { select: { email: true } }
            }
          },
          billingPreference: {
            select: { billingEmail: true }
          }
        }
      }
    }
  });

  if (!subscription) {
    return { created: 0, emailed: 0, failed: 0 };
  }

  const snapshot = await getWorkspaceUsageSnapshot(workspaceId);
  const recipient =
    subscription.workspace.billingPreference?.billingEmail ??
    subscription.workspace.members[0]?.user.email ??
    null;

  let created = 0;
  let emailed = 0;
  let failed = 0;

  for (const metric of snapshot.metrics) {
    // A selected prepaid PAYG meter is billed from wallet credit rather than
    // constrained by an included plan allowance. Wallet balance warnings are
    // shown separately, so normal PAYG usage must not create 70/80/90/100
    // plan-limit alerts or duplicate emails.
    if (metric.paygEnabled) continue;

    for (const threshold of usageAlertThresholds) {
      if (metric.percent < threshold) continue;

      const inserted = await prisma.usageAlert.createMany({
        data: [{
          workspaceId,
          metric: metric.metric,
          threshold,
          periodStart: subscription.periodStart,
          periodEnd: subscription.periodEnd
        }],
        skipDuplicates: true
      });
      created += inserted.count;

      const alert = await prisma.usageAlert.findUnique({
        where: {
          workspaceId_metric_threshold_periodStart_periodEnd: {
            workspaceId,
            metric: metric.metric,
            threshold,
            periodStart: subscription.periodStart,
            periodEnd: subscription.periodEnd
          }
        }
      });

      if (!alert || alert.emailSentAt || !recipient) continue;
      if (!(await claimEmail(alert.id))) continue;

      const blocked = threshold === 100 && metric.blocked;
      const paygEnabled = threshold === 100 && metric.paygEnabled;

      try {
        await sendSecurityEmail({
          to: recipient,
          subject: emailSubject({
            workspaceName: subscription.workspace.name,
            metric: metric.metric,
            threshold,
            blocked,
            paygEnabled
          }),
          text: emailText({
            workspaceName: subscription.workspace.name,
            planName: snapshot.plan.name,
            metric: metric.metric,
            threshold,
            percent: metric.percent,
            current: metric.current,
            limit: metric.limit,
            periodEnd: snapshot.subscription.periodEnd,
            blocked,
            paygEnabled
          }),
          html: emailHtml({
            workspaceName: subscription.workspace.name,
            planName: snapshot.plan.name,
            metric: metric.metric,
            threshold,
            percent: metric.percent,
            current: metric.current,
            limit: metric.limit,
            periodEnd: snapshot.subscription.periodEnd,
            blocked,
            paygEnabled
          })
        });

        await prisma.usageAlert.update({
          where: { id: alert.id },
          data: {
            emailStatus: "SENT",
            emailRecipient: recipient,
            emailSentAt: new Date(),
            emailLastError: null
          }
        });
        emailed += 1;
      } catch (error) {
        await prisma.usageAlert.update({
          where: { id: alert.id },
          data: {
            emailStatus: "FAILED",
            emailRecipient: recipient,
            emailLastError: errorText(error)
          }
        });
        failed += 1;
      }
    }
  }

  return { created, emailed, failed };
}

export async function evaluateUsageAlertsForAllWorkspaces(): Promise<{
  workspaces: number;
  created: number;
  emailed: number;
  failed: number;
}> {
  const subscriptions = await prisma.workspaceSubscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING", "GRACE_PERIOD"] }
    },
    select: { workspaceId: true }
  });

  let created = 0;
  let emailed = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    const result = await evaluateUsageAlertsForWorkspace(
      subscription.workspaceId
    );
    created += result.created;
    emailed += result.emailed;
    failed += result.failed;
  }

  return {
    workspaces: subscriptions.length,
    created,
    emailed,
    failed
  };
}

export function scheduleUsageAlertEvaluation(
  workspaceId: string
): void {
  if (scheduledWorkspaces.has(workspaceId)) return;
  scheduledWorkspaces.add(workspaceId);

  void shouldRunThrottled(
    "usage-alert-evaluation",
    workspaceId,
    env.REDIS_USAGE_ALERT_DEBOUNCE_SECONDS
  ).then(shouldRun => {
    if (!shouldRun) {
      scheduledWorkspaces.delete(workspaceId);
      return;
    }

    const timer = setTimeout(() => {
      void evaluateUsageAlertsForWorkspace(workspaceId)
        .catch(error => {
          console.error("Usage alert evaluation failed:", error);
        })
        .finally(() => {
          scheduledWorkspaces.delete(workspaceId);
        });
    }, 1_000);

    timer.unref();
  }).catch(error => {
    scheduledWorkspaces.delete(workspaceId);
    console.error("Usage alert scheduling failed:", error);
  });
}
