import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER && env.SMTP_PASS
    ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
    : undefined
});

export async function sendSecurityEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  await transport.sendMail({
    from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM_EMAIL },
    ...input
  });
}
