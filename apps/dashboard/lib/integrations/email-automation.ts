import { ConfigurationError } from "@/lib/errors";

export interface FundingEmailInput {
  to: string;
  subject: string;
  text: string;
}

export async function enqueueFundingEmail(_input: FundingEmailInput) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new ConfigurationError("SENDGRID_API_KEY is required before email automation is enabled");
  }

  // TODO: Route application lifecycle emails through the SendGrid queue.
  return { queued: false, reason: "email_automation_not_enabled" as const };
}
