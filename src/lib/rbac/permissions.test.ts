import { describe, expect, it } from "vitest";
import {
  MONEY_ACTIONS,
  ROLES,
  can,
  canSeeMoney,
  type Actor,
  type Role,
} from "./permissions";

const actor = (role: Role, id = "u1", partnerId?: string): Actor => ({
  id,
  role,
  partnerId: partnerId ?? null,
});

describe("money boundary", () => {
  it("allows every money action for an admin", () => {
    for (const action of MONEY_ACTIONS) {
      expect(can(actor("ADMIN"), action), action).toBe(true);
    }
  });

  it("denies every money action to everyone else", () => {
    for (const role of ROLES.filter((r) => r !== "ADMIN")) {
      for (const action of MONEY_ACTIONS) {
        expect(
          can(actor(role), action, {
            assignedEmployeeId: "u1",
            assignedInstallerIds: ["u1"],
            partnerId: "p1",
            ownerId: "u1",
          }),
          `${role} / ${action}`,
        ).toBe(false);
      }
    }
  });

  it("only an admin may read monetary columns", () => {
    expect(canSeeMoney("ADMIN")).toBe(true);
    expect(canSeeMoney("EMPLOYEE")).toBe(false);
    expect(canSeeMoney("INSTALLER")).toBe(false);
    expect(canSeeMoney("PARTNER")).toBe(false);
  });
});

describe("field work is open to every staff role", () => {
  const fieldActions = ["survey.write", "installation.write", "evidence.write", "photo.upload"] as const;

  it("admin and employee may do field work anywhere", () => {
    for (const action of fieldActions) {
      expect(can(actor("ADMIN"), action), action).toBe(true);
      expect(can(actor("EMPLOYEE"), action), action).toBe(true);
    }
  });

  it("an installer may only work on an assigned project, and a crew can be several", () => {
    const assigned = { assignedInstallerIds: ["vikram", "mukesh"] };
    const other = { assignedInstallerIds: ["mukesh"] };

    for (const action of fieldActions) {
      expect(can(actor("INSTALLER", "vikram"), action, assigned), action).toBe(true);
      expect(can(actor("INSTALLER", "vikram"), action, other), action).toBe(false);
    }
  });

  it("a partner may never do field work", () => {
    for (const action of fieldActions) {
      expect(can(actor("PARTNER", "u1", "p1"), action, { partnerId: "p1" }), action).toBe(false);
    }
  });
});

describe("conditional scopes fail closed", () => {
  it("denies an assigned-scope action when no resource is supplied", () => {
    expect(can(actor("INSTALLER"), "installation.write")).toBe(false);
  });

  it("denies an own-scope action when no resource is supplied", () => {
    expect(can(actor("PARTNER", "u1", "p1"), "referral.read")).toBe(false);
  });

  it("denies everything for a missing actor", () => {
    expect(can(null, "project.read")).toBe(false);
    expect(can(undefined, "admin.users")).toBe(false);
  });
});

describe("partners see only their own", () => {
  it("reads their own referrals", () => {
    expect(can(actor("PARTNER", "u1", "p1"), "referral.read", { partnerId: "p1" })).toBe(true);
  });

  it("cannot read another partner's referrals", () => {
    expect(can(actor("PARTNER", "u1", "p1"), "referral.read", { partnerId: "p2" })).toBe(false);
  });

  it("cannot read a project they did not refer", () => {
    expect(can(actor("PARTNER", "u1", "p1"), "project.read", { partnerId: "p2" })).toBe(false);
  });
});

describe("admin-only controls", () => {
  const adminOnly = [
    "flag.waive",
    "admin.users",
    "admin.masterdata",
    "admin.templates",
    "admin.audit",
  ] as const;

  it("are refused to every non-admin role", () => {
    for (const role of ROLES.filter((r) => r !== "ADMIN")) {
      for (const action of adminOnly) {
        expect(can(actor(role), action), `${role} / ${action}`).toBe(false);
      }
    }
  });
});

describe("stage gates inform rather than block", () => {
  it("lets an employee push past an unmet gate", () => {
    expect(can(actor("EMPLOYEE"), "stage.override")).toBe(true);
    expect(can(actor("ADMIN"), "stage.override")).toBe(true);
  });

  it("still refuses an installer or a partner", () => {
    expect(can(actor("INSTALLER"), "stage.override")).toBe(false);
    expect(can(actor("PARTNER", "u1", "p1"), "stage.override")).toBe(false);
  });

  it("keeps waiving a flag admin-only — that is a different decision", () => {
    expect(can(actor("EMPLOYEE"), "flag.waive")).toBe(false);
    expect(can(actor("ADMIN"), "flag.waive")).toBe(true);
  });
});

describe("employees run the pipeline", () => {
  it("can advance stages and handle documents without seeing money", () => {
    const e = actor("EMPLOYEE");
    expect(can(e, "stage.advance")).toBe(true);
    expect(can(e, "document.generate")).toBe(true);
    expect(can(e, "document.pack")).toBe(true);
    expect(can(e, "portal.upload")).toBe(true);
    expect(can(e, "commissioning.write")).toBe(true);
    // but not the money behind them
    expect(can(e, "money.read")).toBe(false);
    expect(can(e, "settlement.write")).toBe(false);
  });
});

describe("an installer gets their own jobs and two forms, nothing else", () => {
  const assigned = { assignedInstallerIds: ["vikram", "mukesh"] };

  it("may fill the site survey and the post-installation record on an assigned job", () => {
    const i = actor("INSTALLER", "vikram");
    expect(can(i, "project.read", assigned)).toBe(true);
    expect(can(i, "survey.write", assigned)).toBe(true);
    expect(can(i, "installation.write", assigned)).toBe(true);
    expect(can(i, "evidence.write", assigned)).toBe(true);
    expect(can(i, "photo.upload", assigned)).toBe(true);
  });

  it("is refused every office action, assigned or not", () => {
    const i = actor("INSTALLER", "vikram");
    const officeOnly = [
      "lead.read",
      "lead.write",
      "lead.convert",
      "project.write",
      "project.assign",
      "prospect.write",
      "flag.resolve",
      "document.read",
      "document.upload",
      "document.generate",
      "document.pack",
      "portal.dcr",
      "portal.meter",
      "portal.upload",
      "commissioning.write",
      "referral.create",
      "referral.read",
      "stage.advance",
      "stage.override",
    ] as const;

    for (const action of officeOnly) {
      expect(can(i, action, assigned), action).toBe(false);
    }
  });
});

describe("quotations are the one amount an employee may see", () => {
  it("lets an admin and an employee raise and read them", () => {
    for (const role of ["ADMIN", "EMPLOYEE"] as const) {
      expect(can(actor(role), "quotation.read"), role).toBe(true);
      expect(can(actor(role), "quotation.write"), role).toBe(true);
    }
  });

  it("still refuses an installer and a partner", () => {
    const resource = {
      assignedEmployeeId: "u1",
      assignedInstallerIds: ["u1"],
      partnerId: "p1",
      ownerId: "u1",
    };
    for (const role of ["INSTALLER", "PARTNER"] as const) {
      expect(can(actor(role, "u1", "p1"), "quotation.read", resource), role).toBe(false);
      expect(can(actor(role, "u1", "p1"), "quotation.write", resource), role).toBe(false);
    }
  });

  it("does not widen the money boundary — the plan and payouts stay admin-only", () => {
    const e = actor("EMPLOYEE");
    expect(can(e, "quotation.write")).toBe(true);
    expect(can(e, "money.read")).toBe(false);
    expect(can(e, "money.write")).toBe(false);
    expect(can(e, "payout.read")).toBe(false);
    expect(can(e, "settlement.write")).toBe(false);
    expect(MONEY_ACTIONS).not.toContain("quotation.read");
    expect(MONEY_ACTIONS).not.toContain("quotation.write");
  });
});
