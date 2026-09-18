import test from "node:test";
import assert from "node:assert/strict";
import { OperationalStore } from "../src/store.mjs";
import { expectedWebhookSignature, verifyWebhookSignature } from "../src/webhook.mjs";

test("webhook signature verifies exact raw body and rejects mutation", () => {
  const body = Buffer.from('{"zen":"keep it logically awesome"}');
  const signature = expectedWebhookSignature("secret", body);
  assert.equal(verifyWebhookSignature("secret", body, signature), true);
  assert.equal(verifyWebhookSignature("secret", Buffer.from('{"zen":"changed"}'), signature), false);
});

test("delivery queue deduplicates GitHub delivery and processes by received order", () => {
  const store = new OperationalStore(":memory:");
  assert.equal(store.enqueue({
    deliveryId: "d2", eventName: "pull_request", repository: "acme/a",
    payload: { sequence: 2 }, now: 200
  }).inserted, true);
  assert.equal(store.enqueue({
    deliveryId: "d1", eventName: "pull_request", repository: "acme/a",
    payload: { sequence: 1 }, now: 100
  }).inserted, true);
  assert.equal(store.enqueue({
    deliveryId: "d1", eventName: "pull_request", repository: "acme/a",
    payload: { sequence: 999 }, now: 300
  }).inserted, false);

  const first = store.claimNext({ owner: "w", leaseMs: 1000, now: 500 });
  assert.equal(first.delivery_id, "d1");
  assert.equal(first.payload.sequence, 1);
  store.complete("d1");

  const second = store.claimNext({ owner: "w", leaseMs: 1000, now: 500 });
  assert.equal(second.delivery_id, "d2");
  store.close();
});

test("per-work-item lease serializes workers and expires", () => {
  const store = new OperationalStore(":memory:");
  assert.equal(store.acquireWorkLease({ workKey: "acme/control#7", owner: "w1", leaseMs: 1000, now: 100 }), true);
  assert.equal(store.acquireWorkLease({ workKey: "acme/control#7", owner: "w2", leaseMs: 1000, now: 500 }), false);
  assert.equal(store.acquireWorkLease({ workKey: "acme/control#7", owner: "w2", leaseMs: 1000, now: 1200 }), true);
  store.close();
});
