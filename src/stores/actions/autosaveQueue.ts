export interface AutosaveQueueOptions<T> {
  persist: (value: T) => Promise<void>;
  onRequest?: (value: T) => void;
  onSuccess?: (value: T) => void;
  onError: (error: unknown, value: T) => void;
  schedule?: (task: () => void) => void | (() => void);
}

export interface AutosaveQueue<T> {
  request: (value: T) => void;
  flushNow: () => Promise<void>;
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
 * Lets rapid planner clicks collapse into one persist without delaying quit.
 * The returned cancel is used by flushNow so a hide/close does not wait.
 */
export function scheduleCoalescedGameplayPersist(task: () => void): () => void {
  const handle = setTimeout(task, 400);
  return () => clearTimeout(handle);
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
    const handle = setTimeout(task, 0);
    return () => clearTimeout(handle);
  });
  let pending = false;
  let scheduled = false;
  let immediate = false;
  let cancelScheduled: (() => void) | null = null;
  let queued: { value: T } | null = null;
  let idleWaiters: Array<() => void> = [];

  const notifyIdle = (): void => {
    if (pending || queued !== null || scheduled) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const waiter of waiters) waiter();
  };

  const armSchedule = (): void => {
    if (pending || scheduled || queued === null) return;
    scheduled = true;
    let cancelled = false;
    const wrapped = () => {
      if (cancelled) return;
      flush();
    };
    const cancelFromSchedule = schedule(wrapped);
    cancelScheduled = () => {
      cancelled = true;
      if (typeof cancelFromSchedule === "function") cancelFromSchedule();
    };
  };

  const flush = (): void => {
    scheduled = false;
    cancelScheduled = null;
    if (pending || queued === null) {
      notifyIdle();
      return;
    }

    const { value } = queued;
    queued = null;
    pending = true;
    void options.persist(value)
      .then(() => options.onSuccess?.(value))
      .catch((error: unknown) => options.onError(error, value))
      .finally(() => {
        pending = false;
        if (queued !== null) {
          if (immediate) {
            flush();
            return;
          }
          armSchedule();
          return;
        }
        notifyIdle();
      });
  };

  const whenIdle = (): Promise<void> =>
    new Promise((resolve) => {
      if (!pending && queued === null && !scheduled) {
        resolve();
        return;
      }
      idleWaiters.push(resolve);
    });

  return {
    request(value: T): void {
      options.onRequest?.(value);
      queued = { value };
      armSchedule();
    },
    async flushNow() {
      immediate = true;
      if (cancelScheduled) {
        cancelScheduled();
        cancelScheduled = null;
        scheduled = false;
      }
      if (!pending && queued !== null) {
        flush();
      }
      try {
        await whenIdle();
      } finally {
        immediate = false;
      }
    },
  };
}
