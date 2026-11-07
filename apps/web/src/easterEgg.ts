/**
 * Tiny easter-egg click tracker. Kept free of DOM/React so it can be unit
 * tested; the browser singleton dispatches a window event.
 */
export const EXPLAIN_EGG_EVENT = 'circuitlab:explain-egg';

export function createExplainClickTracker(windowMs = 3000, threshold = 8) {
  let clicks: number[] = [];
  return {
    click(now: number = Date.now()): boolean {
      clicks = clicks.filter((time) => now - time <= windowMs);
      clicks.push(now);
      if (clicks.length >= threshold) {
        clicks = [];
        return true;
      }
      return false;
    },
    reset(): void {
      clicks = [];
    },
  };
}

const tracker = createExplainClickTracker();

/** Call from every Explain tab/button. Eight clicks within three seconds. */
export function registerExplainClick(): void {
  if (tracker.click()) {
    window.dispatchEvent(new Event(EXPLAIN_EGG_EVENT));
  }
}
