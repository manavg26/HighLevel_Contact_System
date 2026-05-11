import type { AppLogger } from "../observability/logger.js";
import type { AppMetrics } from "../observability/metrics.js";

/**
 * In-memory per-partition serialization. Swap for a distributed queue
 * (partition key = tenant or tenant+dedupe) without changing callers.
 */
export class TenantWriteQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(
    private readonly log: AppLogger,
    private readonly metrics: AppMetrics,
  ) {}

  run<T>(partitionKey: string, op: string, fn: () => Promise<T>): Promise<T> {
    const enqueueAt = Date.now();
    const endWait = this.metrics.queueLatencySeconds.startTimer({
      partition: partitionKey.slice(0, 64),
    });
    const prev = this.tails.get(partitionKey) ?? Promise.resolve();

    const next = prev
      .catch(() => {
        /* keep chain alive */
      })
      .then(() => {
        endWait();
        this.log.debug(
          {
            op,
            partitionKey,
            queueWaitMs: Date.now() - enqueueAt,
          },
          "queue.dequeued",
        );
        return fn();
      });

    this.tails.set(
      partitionKey,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );

    return next;
  }
}
