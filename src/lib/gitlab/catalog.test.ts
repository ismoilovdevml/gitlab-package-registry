import { describe, expect, it, vi } from "vitest";
import { mapLimit } from "./catalog";

// catalog.ts also exports request-scoped loaders; keep the session/DB layer out of this test.
vi.mock("@/lib/dal", () => ({ getAuthenticatedClient: vi.fn() }));

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapLimit", () => {
  it("preserves input order even when later items finish first", async () => {
    const delays = [30, 5, 20, 1, 10];
    const out = await mapLimit(delays, 3, async (d, i) => {
      await tick(d);
      return `${i}:${d}`;
    });
    expect(out).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10"]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    await mapLimit(Array.from({ length: 10 }, (_, i) => i), 3, async (i) => {
      started.push(i);
      active++;
      peak = Math.max(peak, active);
      await tick(5);
      active--;
    });
    expect(peak).toBe(3);
    expect(started.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("calls fn exactly once per item", async () => {
    const fn = vi.fn(async (x: number) => x * 2);
    expect(await mapLimit([1, 2, 3], 10, fn)).toEqual([2, 4, 6]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("handles an empty list", async () => {
    const fn = vi.fn(async (x: number) => x);
    expect(await mapLimit([], 4, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects when a task rejects", async () => {
    await expect(
      mapLimit([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error("boom");
        return x;
      }),
    ).rejects.toThrow("boom");
  });
});
