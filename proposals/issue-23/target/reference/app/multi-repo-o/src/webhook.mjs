import { createHmac, timingSafeEqual } from "node:crypto";

export function expectedWebhookSignature(secret, rawBody) {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyWebhookSignature(secret, rawBody, header) {
  if (!secret || !header) return false;
  const expected = Buffer.from(expectedWebhookSignature(secret, rawBody));
  const actual = Buffer.from(String(header));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function readRawBody(request, limitBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) throw new Error("Webhook body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function webhookHeaders(headers) {
  return {
    signature: headers["x-hub-signature-256"],
    deliveryId: headers["x-github-delivery"],
    eventName: headers["x-github-event"]
  };
}
