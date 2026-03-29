import { describe, it, expect, beforeEach } from "vitest";
import { createCaller, createUser, truncateAll } from "../../setup/helpers";
import { getTestDb } from "../../setup/test-db";
import { notifications } from "@shared/schema";

describe("notification router", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAll();
    const user = await createUser({ username: "notified" });
    userId = user.id;
  });

  describe("list and unreadCount", () => {
    it("returns notifications and count", async () => {
      const actor = await createUser({ username: "actor" });
      const db = getTestDb();

      // Insert test notifications directly
      await db.insert(notifications).values([
        { userId, type: "follow", actorId: actor.id },
        { userId, type: "like", actorId: actor.id },
      ]);

      const caller = createCaller(userId);
      const count = await caller.notification.unreadCount();
      expect(count).toBe(2);

      const list = await caller.notification.list({});
      expect(list.notifications).toHaveLength(2);
    });
  });

  describe("markRead", () => {
    it("marks a notification as read", async () => {
      const actor = await createUser({ username: "actor" });
      const db = getTestDb();
      const [notif] = await db
        .insert(notifications)
        .values({ userId, type: "follow", actorId: actor.id })
        .returning();

      const caller = createCaller(userId);
      await caller.notification.markRead({ notificationId: notif.id });

      const count = await caller.notification.unreadCount();
      expect(count).toBe(0);
    });
  });

  describe("markAllRead", () => {
    it("marks all notifications as read", async () => {
      const actor = await createUser({ username: "actor" });
      const db = getTestDb();
      await db.insert(notifications).values([
        { userId, type: "follow", actorId: actor.id },
        { userId, type: "like", actorId: actor.id },
      ]);

      const caller = createCaller(userId);
      await caller.notification.markAllRead();

      const count = await caller.notification.unreadCount();
      expect(count).toBe(0);
    });
  });
});
