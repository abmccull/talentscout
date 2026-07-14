export interface AutosaveQueueOptions<T> {
  persist: (value: T) => Promise<void>;
  onRequest?: (value: T) => void;
  onError: (error: unknown, value: T) => void;
  schedule?: (task: () => void) => void;
}

export interface AutosaveQueue<T> {
  request: (value: T) => void;
}

/**
 * Lets the committed gameplay result paint before full-save serialization.
 * Background tabs may suspend animation frames, so the timeout preserves the
 * durability guarantee even when no paint is possible.
 */
export function scheduleAfterPaint(task: () => void): void {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    setTimeout(task, 0);
    return;
  }

  let completed = false;
  let fallbackId = 0;
  const runOnce = () => {
    if (completed) return;
    completed = true;
    window.clearTimeout(fallbackId);
    task();
  };

  fallbackId = window.setTimeout(runOnce, 1_000);
  let framesRemaining = 2;
  const waitForPaint = () => {
    window.requestAnimationFrame(() => {
      framesRemaining -= 1;
      if (framesRemaining > 0) {
        waitForPaint();
        return;
      }
      window.setTimeout(runOnce, 0);
    });
  };
  waitForPaint();
}

/**
 * Coalesces same-task writes and keeps exactly one follow-up behind an
 * in-flight write. Persistence remains ordered while expensive serialization
 * starts outside the gameplay interaction task.
 */
export function createAutosaveQueue<T>(
  options: AutosaveQueueOptions<T>,
): AutosaveQueue<T> {
  const schedule = options.schedule ?? ((task: () => void) => {
    setTimeout(task, 0);
  });
  let pending = false;
  let scheduled = false;
  let queued: { value: T } | null = null;

  const flush = (): void => {
    scheduled = false;
    if (pending || queued === null) return;

    const { value } = queued;
    queued = null;
    pending = true;
    void options.persist(value)
      .catch((error: unknown) => options.onError(error, value))
      .finally(() => {
        pending = false;
        if (queued !== null && !scheduled) {
          scheduled = true;
          schedule(flush);
        }
      });
  };

  return {
    request(value: T): void {
      options.onRequest?.(value);
      queued = { value };
      if (pending || scheduled) return;
      scheduled = true;
      schedule(flush);
    },
  };
}
