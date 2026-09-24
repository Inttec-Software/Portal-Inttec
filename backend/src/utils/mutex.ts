/**
 * KeyedMutex provides Promise-based FIFO sequential execution per key.
 * This guarantees atomic serialization of concurrent asynchronous tasks
 * for a specific tenant and serie, preventing race conditions and duplicate
 * folio reservations.
 */
export class KeyedMutex {
  private queues: Map<string, Promise<unknown>> = new Map();

  /**
   * Executes `task` exclusively for the specified `key`.
   * Concurrent invocations for the exact same key will queue up and execute
   * strictly in order, one by one. Tasks with different keys run concurrently.
   */
  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prevPromise = this.queues.get(key) || Promise.resolve();

    let releaseLock!: () => void;
    const currentPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // Chain this task after the previous promise resolves or rejects
    const taskPromise = prevPromise
      .catch(() => {}) // Prevent previous rejections from breaking the queue
      .then(async () => {
        try {
          return await task();
        } finally {
          releaseLock();
        }
      });

    // Update the queue head for this key
    this.queues.set(key, currentPromise);

    try {
      return await taskPromise;
    } finally {
      // Memory cleanup: If no other task queued behind this one, clean up the Map entry
      if (this.queues.get(key) === currentPromise) {
        this.queues.delete(key);
      }
    }
  }

  /**
   * Returns current number of active queues (for debugging/monitoring)
   */
  getActiveQueueCount(): number {
    return this.queues.size;
  }
}

export const folioMutex = new KeyedMutex();
