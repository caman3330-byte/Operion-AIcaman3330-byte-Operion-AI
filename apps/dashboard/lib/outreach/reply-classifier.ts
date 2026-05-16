import type { ReplyClassification } from "@operion/shared";

export interface ReplyClassificationInput {
  subject?: string | null;
  bodyText?: string | null;
  fromEmail: string;
}

export interface ReplyClassificationResult {
  classification: ReplyClassification;
  intent_score: number;
  sentiment: "positive" | "neutral" | "negative";
  requires_follow_up: boolean;
  escalated: boolean;
  reason: string;
}

const optOutPatterns = [/unsubscribe/i, /remove me/i, /stop emailing/i, /do not contact/i, /don't contact/i];
const bouncePatterns = [/undeliverable/i, /delivery status notification/i, /mail delivery failed/i, /address not found/i];
const positivePatterns = [/interested/i, /tell me more/i, /send (me )?details/i, /call me/i, /yes/i, /available/i, /how much/i];
const questionPatterns = [/\?/, /what/i, /when/i, /how/i, /where/i, /rate/i, /terms/i];
const negativePatterns = [/not interested/i, /no thanks/i, /already funded/i, /not looking/i, /decline/i];

export function classifyOutreachReply(input: ReplyClassificationInput): ReplyClassificationResult {
  const text = `${input.subject ?? ""}\n${input.bodyText ?? ""}`.trim();
  const normalized = text || input.fromEmail;

  if (matches(normalized, bouncePatterns)) {
    return result("bounce", 0, "negative", false, false, "Provider or recipient mailbox reported a delivery issue.");
  }

  if (matches(normalized, optOutPatterns)) {
    return result("opt_out", 0, "negative", false, true, "Recipient requested suppression or no further contact.");
  }

  if (matches(normalized, negativePatterns)) {
    return result("negative", 10, "negative", false, false, "Recipient is not currently interested.");
  }

  if (matches(normalized, positivePatterns)) {
    return result("positive", 90, "positive", true, true, "Recipient showed buying intent or asked for a sales conversation.");
  }

  if (matches(normalized, questionPatterns)) {
    return result("question", 70, "neutral", true, true, "Recipient asked a question that needs follow-up.");
  }

  return result("neutral", 35, "neutral", true, false, "Reply did not include a clear intent signal.");
}

function matches(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function result(
  classification: ReplyClassification,
  intentScore: number,
  sentiment: "positive" | "neutral" | "negative",
  requiresFollowUp: boolean,
  escalated: boolean,
  reason: string
): ReplyClassificationResult {
  return {
    classification,
    intent_score: intentScore,
    sentiment,
    requires_follow_up: requiresFollowUp,
    escalated,
    reason
  };
}
