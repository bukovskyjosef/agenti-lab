import { workItemFromWebhook, workItemKey } from "./mapping.mjs";

function retryDelay(attempt) {
  return Math.min(60000, 1000 * 2 ** Math.max(0, attempt - 1));
}

export async function processNextDelivery({
  store,
  orchestrator,
  profile,
  workerId,
  leaseMs,
  now = Date.now()
}) {
  const delivery = store.claimNext({ owner: workerId, leaseMs, now });
  if (!delivery) return null;

  const workItem = delivery.event_name === "reconcile"
    ? delivery.payload.work_item
    : workItemFromWebhook({
        eventName: delivery.event_name,
        payload: delivery.payload,
        profile
      });

  if (!workItem) {
    store.complete(delivery.delivery_id);
    return { delivery_id: delivery.delivery_id, ignored: true };
  }

  const key = workItemKey(workItem);
  if (!store.acquireWorkLease({ workKey: key, owner: workerId, leaseMs, now })) {
    store.retry(delivery.delivery_id, "WORK_ITEM_BUSY", 500, now);
    return { delivery_id: delivery.delivery_id, busy: true };
  }

  try {
    const result = await orchestrator.processWorkItem(
      workItem,
      new Date(now).toISOString()
    );
    store.complete(delivery.delivery_id);
    return { delivery_id: delivery.delivery_id, work_item: key, result };
  } catch (error) {
    const errorClass = error?.name || "WorkerError";
    if (delivery.attempt_count >= 8) store.fail(delivery.delivery_id, errorClass);
    else store.retry(delivery.delivery_id, errorClass, retryDelay(delivery.attempt_count), now);
    return { delivery_id: delivery.delivery_id, work_item: key, error: String(error) };
  } finally {
    store.releaseWorkLease(key, workerId);
  }
}
