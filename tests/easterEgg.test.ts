import { describe, expect, it } from 'vitest';
import { createExplainClickTracker } from '../apps/web/src/easterEgg';

describe('Explain easter egg tracker', () => {
  it('fires on the 8th click inside a 3-second window', () => {
    const tracker = createExplainClickTracker(3000, 8);
    const results = [0, 400, 800, 1200, 1600, 2000, 2400, 2800].map((time) =>
      tracker.click(time),
    );
    expect(results.slice(0, 7)).toEqual([false, false, false, false, false, false, false]);
    expect(results[7]).toBe(true);
  });

  it('does not fire when the 8 clicks are spread over more than 3 seconds', () => {
    const tracker = createExplainClickTracker(3000, 8);
    const results = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000].map((time) =>
      tracker.click(time),
    );
    expect(results.every((result) => result === false)).toBe(true);
  });

  it('starts a fresh window after firing', () => {
    const tracker = createExplainClickTracker(3000, 8);
    for (let i = 0; i < 8; i += 1) tracker.click(i * 100);
    for (let i = 0; i < 7; i += 1) expect(tracker.click(2000 + i * 100)).toBe(false);
    expect(tracker.click(2800)).toBe(true);
  });
});
