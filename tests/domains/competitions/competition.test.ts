import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  createCompetition,
  truncateAll,
} from "../../setup/helpers";

describe("competition router", () => {
  let ownerId: string;
  let orgId: number;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    orgId = org.id;
  });

  describe("create", () => {
    it("creates a competition in draft status", async () => {
      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "Spring Fling 2026", orgId });

      expect(comp.name).toBe("Spring Fling 2026");
      expect(comp.status).toBe("draft");
      expect(comp.slug).toBe("spring-fling-2026");
      expect(comp.orgId).toBe(orgId);
      expect(comp.createdBy).toBe(ownerId);
    });

    it("auto-generates unique slug on conflict", async () => {
      const caller = createCaller(ownerId);
      const comp1 = await caller.competition.create({ name: "Spring Fling", orgId });
      const comp2 = await caller.competition.create({ name: "Spring Fling", orgId });

      expect(comp1.slug).toBe("spring-fling");
      expect(comp2.slug).not.toBe("spring-fling");
      expect(comp2.slug).toContain("spring-fling");
    });

    it("rejects non-admin/owner", async () => {
      const member = await createUser();
      const caller = createCaller(member.id);

      await expect(caller.competition.create({ name: "Test", orgId })).rejects.toThrow("Org admin or owner required");
    });
  });

  describe("getBySlug", () => {
    it("returns competition with org info", async () => {
      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "Test Comp", orgId });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.competition.getBySlug({ slug: comp.slug });

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test Comp");
      expect(result!.orgName).toBeDefined();
    });

    it("returns null for non-existent slug", async () => {
      const publicCaller = createPublicCaller();
      const result = await publicCaller.competition.getBySlug({ slug: "does-not-exist" });
      expect(result).toBeNull();
    });
  });

  describe("list", () => {
    it("returns competitions with pagination", async () => {
      const caller = createCaller(ownerId);
      await caller.competition.create({ name: "Comp A", orgId });
      await caller.competition.create({ name: "Comp B", orgId });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.competition.list({ limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeUndefined();
    });

    it("filters by status", async () => {
      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "Comp", orgId });
      await caller.competition.updateStatus({ competitionId: comp.id, status: "advertised" });

      const publicCaller = createPublicCaller();
      const drafts = await publicCaller.competition.list({ status: "draft" });
      const advertised = await publicCaller.competition.list({ status: "advertised" });

      expect(drafts.items).toHaveLength(0);
      expect(advertised.items).toHaveLength(1);
    });
  });

  describe("update", () => {
    it("updates competition fields", async () => {
      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "Test", orgId });

      const updated = await caller.competition.update({
        competitionId: comp.id,
        name: "Updated Name",
        city: "Columbus",
        state: "OH",
        baseFee: "25.00",
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.city).toBe("Columbus");
      expect(updated.baseFee).toBe("25.00");
    });
  });

  describe("updateStatus", () => {
    it("transitions status freely", async () => {
      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "Test", orgId });

      let updated = await caller.competition.updateStatus({
        competitionId: comp.id,
        status: "advertised",
      });
      expect(updated.status).toBe("advertised");

      updated = await caller.competition.updateStatus({
        competitionId: comp.id,
        status: "running",
      });
      expect(updated.status).toBe("running");

      // Backward transition
      updated = await caller.competition.updateStatus({
        competitionId: comp.id,
        status: "draft",
      });
      expect(updated.status).toBe("draft");
    });
  });

  describe("delete", () => {
    it("allows org owner to delete", async () => {
      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "To Delete", orgId });

      const result = await caller.competition.delete({ competitionId: comp.id });
      expect(result.success).toBe(true);

      const publicCaller = createPublicCaller();
      const found = await publicCaller.competition.getBySlug({ slug: comp.slug });
      expect(found).toBeNull();
    });

    it("rejects non-owner", async () => {
      const admin = await createUser();
      // Make admin an org admin (not owner)
      const { getTestDb } = await import("../../setup/test-db");
      const { memberships } = await import("@orgs/schema");
      await getTestDb().insert(memberships).values({
        orgId,
        userId: admin.id,
        role: "admin",
      });

      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "Test", orgId });

      const adminCaller = createCaller(admin.id);
      await expect(
        adminCaller.competition.delete({ competitionId: comp.id }),
      ).rejects.toThrow("Only the org owner");
    });
  });

  describe("setCompCode", () => {
    it("sets comp code", async () => {
      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "Test", orgId });

      const updated = await caller.competition.setCompCode({
        competitionId: comp.id,
        compCode: "OSB",
      });
      expect(updated.compCode).toBe("OSB");
    });

    it("rejects duplicate comp code", async () => {
      const caller = createCaller(ownerId);
      const comp1 = await caller.competition.create({ name: "Comp 1", orgId });
      const comp2 = await caller.competition.create({ name: "Comp 2", orgId });

      await caller.competition.setCompCode({ competitionId: comp1.id, compCode: "ABC" });

      await expect(
        caller.competition.setCompCode({ competitionId: comp2.id, compCode: "ABC" }),
      ).rejects.toThrow("already in use");
    });
  });

  describe("setMasterPassword", () => {
    it("hashes and stores the password", async () => {
      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "Test", orgId });

      const updated = await caller.competition.setMasterPassword({
        competitionId: comp.id,
        password: "secret123",
      });

      expect(updated.masterPasswordHash).toBeDefined();
      expect(updated.masterPasswordHash).not.toBe("secret123");
    });
  });

  describe("permission: scrutineer access", () => {
    it("allows scrutineer to update competition", async () => {
      const caller = createCaller(ownerId);
      const comp = await caller.competition.create({ name: "Test", orgId });

      const scrutineer = await createUser();
      await caller.staff.assign({
        competitionId: comp.id,
        userId: scrutineer.id,
        role: "scrutineer",
      });

      const scrCaller = createCaller(scrutineer.id);
      const updated = await scrCaller.competition.update({
        competitionId: comp.id,
        description: "Updated by scrutineer",
      });

      expect(updated.description).toBe("Updated by scrutineer");
    });
  });
});
