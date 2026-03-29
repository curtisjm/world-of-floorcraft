import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createUser, createOrg, truncateAll } from "../../setup/helpers";

describe("invite router", () => {
  let owner: { id: string };
  let invitee: { id: string };

  beforeEach(async () => {
    await truncateAll();
    owner = await createUser({ username: "owner" });
    invitee = await createUser({ username: "invitee" });
  });

  describe("sendInvite", () => {
    it("sends a direct invite", async () => {
      const org = await createOrg(owner.id, { membershipModel: "invite" });
      const caller = createCaller(owner.id);
      const invite = await caller.invite.sendInvite({
        orgId: org.id,
        userId: invitee.id,
      });
      expect(invite.orgId).toBe(org.id);
      expect(invite.invitedUserId).toBe(invitee.id);
      expect(invite.status).toBe("pending");
    });

    it("rejects invite for existing member", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const memberCaller = createCaller(invitee.id);
      await memberCaller.membership.join({ orgId: org.id });

      const ownerCaller = createCaller(owner.id);
      await expect(
        ownerCaller.invite.sendInvite({ orgId: org.id, userId: invitee.id })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("rejects duplicate pending invite", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      await caller.invite.sendInvite({ orgId: org.id, userId: invitee.id });
      await expect(
        caller.invite.sendInvite({ orgId: org.id, userId: invitee.id })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("generateLink", () => {
    it("generates a link invite with token", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      const invite = await caller.invite.generateLink({ orgId: org.id });
      expect(invite.token).toBeDefined();
      expect(invite.token!.length).toBeGreaterThan(0);
    });
  });

  describe("accept", () => {
    it("accepts a direct invite", async () => {
      const org = await createOrg(owner.id);
      const ownerCaller = createCaller(owner.id);
      const invite = await ownerCaller.invite.sendInvite({
        orgId: org.id,
        userId: invitee.id,
      });

      const inviteeCaller = createCaller(invitee.id);
      const result = await inviteeCaller.invite.accept({ inviteId: invite.id });
      expect(result.success).toBe(true);

      // Verify membership was created
      const membership = await inviteeCaller.membership.getMyMembership({
        orgId: org.id,
      });
      expect(membership.membership).not.toBeNull();
    });

    it("accepts a link invite", async () => {
      const org = await createOrg(owner.id);
      const ownerCaller = createCaller(owner.id);
      const invite = await ownerCaller.invite.generateLink({ orgId: org.id });

      const inviteeCaller = createCaller(invitee.id);
      const result = await inviteeCaller.invite.accept({ token: invite.token! });
      expect(result.success).toBe(true);
    });
  });

  describe("decline", () => {
    it("declines a direct invite", async () => {
      const org = await createOrg(owner.id);
      const ownerCaller = createCaller(owner.id);
      const invite = await ownerCaller.invite.sendInvite({
        orgId: org.id,
        userId: invitee.id,
      });

      const inviteeCaller = createCaller(invitee.id);
      const result = await inviteeCaller.invite.decline({ inviteId: invite.id });
      expect(result.success).toBe(true);
    });
  });

  describe("listMyInvites", () => {
    it("returns pending invites for the user", async () => {
      const org = await createOrg(owner.id);
      const ownerCaller = createCaller(owner.id);
      await ownerCaller.invite.sendInvite({ orgId: org.id, userId: invitee.id });

      const inviteeCaller = createCaller(invitee.id);
      const invites = await inviteeCaller.invite.listMyInvites();
      expect(invites).toHaveLength(1);
      expect(invites[0].orgId).toBe(org.id);
    });
  });
});
