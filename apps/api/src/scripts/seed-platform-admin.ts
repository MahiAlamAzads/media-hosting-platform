import argon2 from "argon2";
import { prisma } from "@media/database";
import { createFreeBillingForWorkspace } from "../modules/billing/billing.service.js";
import { ensureWorkspaceStorage } from "../infrastructure/storage.js";

const DEFAULT_NAME = "Mahi Alam";
const DEFAULT_EMAIL = "mahialamazad.bd@gmail.com";
const DEFAULT_PASSWORD = "#1234#Mahialam";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function platformAdminEmails(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

async function main(): Promise<void> {
  const name = process.env.SEED_ADMIN_NAME?.trim() || DEFAULT_NAME;
  const email = normalizeEmail(process.env.SEED_ADMIN_EMAIL || DEFAULT_EMAIL);
  const password = process.env.SEED_ADMIN_PASSWORD || DEFAULT_PASSWORD;

  if (!email.includes("@") || !email.includes(".")) {
    throw new Error(`Invalid SEED_ADMIN_EMAIL: ${email}`);
  }

  if (password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 8 characters.");
  }

  const now = new Date();
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id
  });

  const result = await prisma.$transaction(async tx => {
    const existingUser = await tx.user.findUnique({
      where: { normalizedEmail: email }
    });

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            name,
            email,
            normalizedEmail: email,
            passwordHash,
            emailVerifiedAt: existingUser.emailVerifiedAt ?? now,
            status: "ACTIVE",
            passwordVersion: { increment: 1 }
          }
        })
      : await tx.user.create({
          data: {
            name,
            email,
            normalizedEmail: email,
            passwordHash,
            emailVerifiedAt: now,
            status: "ACTIVE"
          }
        });

    if (existingUser) {
      await tx.session.updateMany({
        where: {
          userId: user.id,
          revokedAt: null
        },
        data: {
          revokedAt: now
        }
      });
    }

    const existingMembership = await tx.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" }
    });

    let workspace;

    if (existingMembership) {
      workspace = await tx.workspace.update({
        where: { id: existingMembership.workspaceId },
        data: { status: "ACTIVE" }
      });

      await tx.workspaceMember.update({
        where: { id: existingMembership.id },
        data: { role: "OWNER" }
      });
    } else {
      const created = await tx.workspace.create({
        data: {
          name: `${name}'s Workspace`,
          slug: `platform-admin-${user.id.slice(-8)}`,
          storageRootKey: `pending/${user.id}`,
          status: "ACTIVE",
          storageLimitBytes: 2147483648n
        }
      });

      workspace = await tx.workspace.update({
        where: { id: created.id },
        data: {
          storageRootKey: `tenants/${created.id}`
        }
      });

      await tx.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          role: "OWNER"
        }
      });
    }

    const subscription = await tx.workspaceSubscription.findUnique({
      where: { workspaceId: workspace.id }
    });

    if (!subscription) {
      await createFreeBillingForWorkspace(tx, {
        workspaceId: workspace.id,
        billingEmail: email,
        currency: "BDT"
      });
    } else {
      await tx.billingPreference.upsert({
        where: { workspaceId: workspace.id },
        create: {
          workspaceId: workspace.id,
          preferredCurrency: subscription.currency,
          preferredInterval: subscription.interval,
          billingEmail: email
        },
        update: {
          billingEmail: email
        }
      });
    }

    return {
      userId: user.id,
      workspaceId: workspace.id,
      created: !existingUser
    };
  });

  await ensureWorkspaceStorage(result.workspaceId);

  const isPlatformAdmin = platformAdminEmails().has(email);

  console.log("");
  console.log("Platform admin seed complete.");
  console.log(`User: ${email}`);
  console.log(`User ID: ${result.userId}`);
  console.log(`Workspace ID: ${result.workspaceId}`);
  console.log(`Created new user: ${result.created ? "yes" : "no"}`);
  console.log(`Email verified: yes`);
  console.log(`Workspace role: OWNER`);
  console.log(`PLATFORM_ADMIN_EMAILS match: ${isPlatformAdmin ? "yes" : "no"}`);

  if (!isPlatformAdmin) {
    console.warn("");
    console.warn(
      `Warning: add ${email} to PLATFORM_ADMIN_EMAILS in the root .env, then restart the API.`
    );
  }
}

main()
  .catch(error => {
    console.error("Platform admin seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
