import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createUser, createOrg, truncateAll } from "../../setup/helpers";

describe("join-request router", () => {
  let owner: { id: string };
  let requester: { id: string };

  beforeEach(async () => {
    await truncateAll();
    owner = await createUser({ username: "owner" });
    requester = await createUser({ username: "requester" });
  });

  describe("request", () => {
    it("creates a join request for request-model org", async () => {
      const org = await createOrg(owner.id, { membershipModel: "request" });
      const caller = createCaller(requester.id);
      const result = await caller.joinRequest.request({ orgId: org.id });
      expect(result.status).toBe("pending");
      expect(result.userId).toBe(requester.id);
    });

    it("rejects request for non-request org", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const caller = createCaller(requester.id);
      await expect(
        caller.joinRequest.request({ orgId: org.id })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects duplicate pending request", async () => {
      const org = await createOrg(owner.id, { membershipModel: "request" });
      const caller = createCaller(requester.id);
      await caller.joinRequest.request({ orgId: org.id });
      await expect(
        caller.joinRequest.request({ orgId: org.id })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("approve", () => {
    it("approves a request and creates membership", async () => {
      const org = await createOrg(owner.id, { membershipModel: "request" });
      const requesterCaller = createCaller(requester.id);
      const request = await requesterCaller.joinRequest.request({ orgId: org.id });

      const ownerCaller = createCaller(owner.id);
      const result = await ownerCaller.joinRequest.approve({
        requestId: request.id,
      });
      expect(result.status).toBe("approved");

      // Verify membership
      const membership = await requesterCaller.membership.getMyMembership({
        orgId: org.id,
      });
      expect(membership.membership).not.toBeNull();
    });
  });

  describe("reject", () => {
    it("rejects a request", async () => {
      const org = await createOrg(owner.id, { membershipModel: "request" });
      const requesterCaller = createCaller(requester.id);
      const request = await requesterCaller.joinRequest.request({ orgId: org.id });

      const ownerCaller = createCaller(owner.id);
      const result = await ownerCaller.joinRequest.reject({
        requestId: request.id,
      });
      expect(result.status).toBe("rejected");
    });
  });

  describe("listPending", () => {
    it("returns pending requests for org admin", async () => {
      const org = await createOrg(owner.id, { membershipModel: "request" });
      const requesterCaller = createCaller(requester.id);
      await requesterCaller.joinRequest.request({ orgId: org.id });

      const ownerCaller = createCaller(owner.id);
      const pending = await ownerCaller.joinRequest.listPending({ orgId: org.id });
      expect(pending).toHaveLength(1);
    });
  });

  describe("getMyRequest", () => {
    it("returns user's pending request", async () => {
      const org = await createOrg(owner.id, { membershipModel: "request" });
      const caller = createCaller(requester.id);
      await caller.joinRequest.request({ orgId: org.id });

      const result = await caller.joinRequest.getMyRequest({ orgId: org.id });
      expect(result).not.toBeNull();
      expect(result!.status).toBe("pending");
    });

    it("returns null when no request", async () => {
      const org = await createOrg(owner.id, { membershipModel: "request" });
      const caller = createCaller(requester.id);
      const result = await caller.joinRequest.getMyRequest({ orgId: org.id });
      expect(result).toBeNull();
    });
  });
});
