import { describe, expect, it } from "vitest";
import { presentAudit } from "./audit-present";

describe("presentAudit", () => {
  it("writes a stage override the way the board does", () => {
    const row = presentAudit({
      action: "stage.override",
      entityType: "project",
      projectCode: "BHIM-2026-0008",
      reason: "Earthing pit photo lost, re-shoot scheduled.",
      before: { stage: 4 },
      after: { stage: 5 },
    });
    expect(row.kind).toBe("override");
    expect(row.tag).toBe("Override");
    expect(row.title).toBe("Stage gate overridden");
    expect(row.detail).toContain("BHIM-2026-0008");
    expect(row.detail).toContain("stage 4 → 5");
    expect(row.detail).toContain("Earthing pit photo lost");
  });

  it("treats an Aadhaar open as a document read and drops the number", () => {
    const row = presentAudit({
      action: "document.read.aadhaar",
      entityType: "document",
      projectCode: "BHIM-2026-0014",
      reason: null,
      before: null,
      after: { aadhaar: "123412341234", fileName: "aadhaar.pdf" },
    });
    expect(row.kind).toBe("read");
    expect(row.tag).toBe("Document read");
    expect(row.detail).not.toContain("123412341234");
    expect(row.detail).toContain("aadhaar.pdf");
  });

  it("marks a received subsidy and an invite with their own tones", () => {
    expect(
      presentAudit({
        action: "subsidy.update",
        entityType: "subsidy",
        projectCode: "BHIM-2026-0002",
        reason: null,
        before: null,
        after: { status: "RECEIVED", receivedAmount: "78000" },
      }).kind,
    ).toBe("ok");

    const invite = presentAudit({
      action: "user.invite",
      entityType: "user",
      projectCode: null,
      reason: null,
      before: null,
      after: { email: "deepak@bhimenergy.in", role: "INSTALLER" },
    });
    expect(invite.kind).toBe("user");
    expect(invite.title).toBe("User invited");
    expect(invite.detail).toBe("deepak@bhimenergy.in · role Installer");
  });
});
