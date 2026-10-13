import { describe, expect, it } from "vitest";
import { accountSummary, lastSeen } from "./format";

describe("lastSeen", () => {
  const now = new Date("2026-10-11T16:00:00");

  it("says never when there is no session", () => {
    expect(lastSeen(null, now)).toBe("Never");
  });

  it("counts minutes and hours", () => {
    expect(lastSeen(new Date("2026-10-11T15:48:00"), now)).toBe("12 minutes ago");
    expect(lastSeen(new Date("2026-10-11T14:00:00"), now)).toBe("2 hours ago");
  });

  it("says yesterday for the previous calendar day", () => {
    expect(lastSeen(new Date("2026-10-10T09:00:00"), now)).toBe("Yesterday");
  });

  it("counts a few days, then switches to a date", () => {
    expect(lastSeen(new Date("2026-10-08T09:00:00"), now)).toBe("3 days ago");
    expect(lastSeen(new Date("2026-09-01T09:00:00"), now)).toBe("01 Sep 2026");
  });
});

describe("accountSummary", () => {
  it("lists every role that has someone in it", () => {
    expect(
      accountSummary({ ADMIN: 1, EMPLOYEE: 3, INSTALLER: 3, PARTNER: 2 }),
    ).toBe("9 accounts · 1 admin, 3 employees, 3 installers, 2 channel partners");
  });

  it("stays singular for one account", () => {
    expect(accountSummary({ ADMIN: 1, EMPLOYEE: 0, INSTALLER: 0, PARTNER: 0 })).toBe(
      "1 account · 1 admin",
    );
  });
});
