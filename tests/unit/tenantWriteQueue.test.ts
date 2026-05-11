import pino from "pino";
import { describe, expect, it } from "vitest";
import { createMetricsRegistry } from "../../src/observability/metrics.js";
import { TenantWriteQueue } from "../../src/queue/tenantWriteQueue.js";

describe("TenantWriteQueue", () => {
  it("serializes work per partition", async () => {
    const log = pino({ level: "silent" });
    const metrics = createMetricsRegistry();
    const q = new TenantWriteQueue(log, metrics);
    let concurrent = 0;
    let maxConcurrent = 0;
    const run = () =>
      q.run("t1", "test", async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 5));
        concurrent--;
        return 1;
      });
    await Promise.all([run(), run(), run()]);
    expect(maxConcurrent).toBe(1);
  });

  it("continues chain after failure", async () => {
    const log = pino({ level: "silent" });
    const metrics = createMetricsRegistry();
    const q = new TenantWriteQueue(log, metrics);
    const results: string[] = [];
    await expect(
      q.run("p", "op", async () => {
        results.push("a");
        await Promise.resolve();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await q.run("p", "op", async () => {
      await Promise.resolve();
      results.push("b");
    });
    expect(results).toEqual(["a", "b"]);
  });
});
