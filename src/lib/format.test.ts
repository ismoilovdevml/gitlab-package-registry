import { describe, expect, it } from "vitest";
import { formatBytes, formatCompact, formatDate, formatDateTime, formatNumber, shortSha, timeAgo } from "./format";

describe("formatBytes", () => {
  it("shows a dash for missing values", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
  });

  it("formats bytes as integers and larger units with one decimal below 100", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(formatBytes(150 * 1024)).toBe("150 KB");
    expect(formatBytes(2.25 * 1024 ** 3)).toBe("2.3 GB");
  });

  it("caps at PB instead of running off the unit table", () => {
    expect(formatBytes(1024 ** 6)).toBe("1024 PB");
  });

  it("handles negative deltas", () => {
    expect(formatBytes(-2048)).toBe("-2.0 KB");
  });
});

describe("formatNumber / formatCompact", () => {
  it("groups thousands", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(null)).toBe("—");
  });

  it("uses compact notation", () => {
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(1500)).toBe("1.5K");
    expect(formatCompact(2_000_000)).toBe("2M");
    expect(formatCompact(undefined)).toBe("—");
  });
});

describe("formatDate / formatDateTime", () => {
  // Midday UTC so the calendar date is the same in every local timezone.
  const iso = "2026-03-15T12:00:00Z";

  it("formats dates in en-GB style", () => {
    expect(formatDate(iso)).toBe("15 Mar 2026");
    expect(formatDate(new Date(iso))).toBe("15 Mar 2026");
  });

  it("includes the time for formatDateTime", () => {
    expect(formatDateTime(iso)).toMatch(/^15 Mar 2026,? \d{2}:\d{2}$/);
  });

  it("shows a dash for empty values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  const ago = (ms: number) => timeAgo(new Date(now - ms), now);
  const S = 1000;
  const M = 60 * S;
  const H = 60 * M;
  const D = 24 * H;

  it("walks through each unit", () => {
    expect(ago(10 * S)).toBe("just now");
    expect(ago(44 * S)).toBe("just now");
    expect(ago(45 * S)).toBe("1 min ago");
    expect(ago(59 * M)).toBe("59 min ago");
    expect(ago(60 * M)).toBe("1 h ago");
    expect(ago(23 * H)).toBe("23 h ago");
    expect(ago(24 * H)).toBe("1 d ago");
    expect(ago(29 * D)).toBe("29 d ago");
    expect(ago(30 * D)).toBe("1 mo ago");
    expect(ago(11 * 30 * D)).toBe("11 mo ago");
    expect(ago(365 * D)).toBe("1 y ago");
    expect(ago(3 * 365 * D)).toBe("3 y ago");
  });

  it("accepts ISO strings and treats future timestamps as just now", () => {
    expect(timeAgo("2026-05-31T22:00:00Z", now)).toBe("2 h ago");
    expect(ago(-5 * M)).toBe("just now");
    expect(timeAgo(null, now)).toBe("—");
  });
});

describe("shortSha", () => {
  it("strips the sha256: prefix and truncates", () => {
    expect(shortSha("sha256:0123456789abcdef0123")).toBe("0123456789ab");
    expect(shortSha("abcdef", 4)).toBe("abcd");
    expect(shortSha(null)).toBe("—");
    expect(shortSha("")).toBe("—");
  });
});
