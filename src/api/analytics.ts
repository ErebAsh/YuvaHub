import { dbCommand } from "./db.js";

export class AnalyticsBuffer {
  private buffer: any[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor(private intervalMs: number = 5000) {
    this.startInterval();
  }

  public push(event: any) {
    if (event) {
      if (Array.isArray(event)) {
        this.buffer.push(...event);
      } else {
        this.buffer.push(event);
      }
    }
  }

  private startInterval() {
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => console.error("[AnalyticsBuffer] Auto-flush error:", err));
    }, this.intervalMs);
  }

  public async flush() {
    if (this.buffer.length === 0 || this.isFlushing) {
      return;
    }

    this.isFlushing = true;
    const batch = [...this.buffer];
    this.buffer = [];

    try {
      if (dbCommand) {
        const collection = dbCommand.collection("analytics");
        const bulk = collection.initializeUnorderedBulkOp();
        for (const doc of batch) {
          bulk.insert(doc);
        }
        await bulk.execute();
        console.log(`[AnalyticsBuffer] Flushed ${batch.length} events to MongoDB.`);
      } else {
        this.buffer.unshift(...batch);
        console.warn(`[AnalyticsBuffer] DB not ready. Re-queued ${batch.length} events.`);
      }
    } catch (err) {
      console.error("[AnalyticsBuffer] Error flushing batch:", err);
      this.buffer.unshift(...batch);
    } finally {
      this.isFlushing = false;
    }
  }

  public stop() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

export const analyticsBuffer = new AnalyticsBuffer(5000);
