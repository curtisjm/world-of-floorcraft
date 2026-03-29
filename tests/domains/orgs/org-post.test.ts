import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createPublicCaller, createUser, createOrg, truncateAll } from "../../setup/helpers";

describe("org-post router", () => {
  let owner: { id: string };

  beforeEach(async () => {
    await truncateAll();
    owner = await createUser({ username: "orgowner" });
  });

  describe("create", () => {
    it("creates an org post as admin", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      const post = await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Org Announcement",
        body: "Hello members!",
        publish: true,
      });
      expect(post.orgId).toBe(org.id);
      expect(post.title).toBe("Org Announcement");
    });

    it("rejects non-admin creating org post", async () => {
      const org = await createOrg(owner.id, { membershipModel: "open" });
      const member = await createUser({ username: "member" });
      const memberCaller = createCaller(member.id);
      await memberCaller.membership.join({ orgId: org.id });

      await expect(
        memberCaller.orgPost.create({
          orgId: org.id,
          type: "article",
          title: "Unauthorized",
          body: "Test",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("listByOrg", () => {
    it("returns published org posts", async () => {
      const org = await createOrg(owner.id);
      const caller = createCaller(owner.id);
      await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Published",
        body: "Content",
        publish: true,
      });
      await caller.orgPost.create({
        orgId: org.id,
        type: "article",
        title: "Draft",
        body: "Content",
        publish: false,
      });

      const publicCaller = createPublicCaller();
      const result = await publicCaller.orgPost.listByOrg({ orgId: org.id });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Published");
    });
  });
});
