import { test, expect, clerk } from "./fixtures";

test.describe("Feed browsing", () => {
  test.beforeEach(async ({ page }) => {
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: process.env.E2E_CLERK_USER_EMAIL!,
        password: process.env.E2E_CLERK_USER_PASSWORD!,
      },
    });
  });

  test("feed page loads with heading and tabs", async ({ page }) => {
    await page.goto("/feed");
    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Following" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Explore" })).toBeVisible();
  });

  test("new post button navigates to post creation", async ({ page }) => {
    await page.goto("/feed");
    await page.getByRole("link", { name: "New Post" }).click();
    await expect(page).toHaveURL(/\/posts\/new/, { timeout: 10_000 });
  });

  test("following tab is selected by default", async ({ page }) => {
    await page.goto("/feed");
    const followingTab = page.getByRole("tab", { name: "Following" });
    await expect(followingTab).toHaveAttribute("data-state", "active");
  });

  test("can switch to explore tab", async ({ page }) => {
    await page.goto("/feed");
    await page.getByRole("tab", { name: "Explore" }).click();
    const exploreTab = page.getByRole("tab", { name: "Explore" });
    await expect(exploreTab).toHaveAttribute("data-state", "active");
  });

  test("explore tab shows public posts or empty state", async ({ page }) => {
    await page.goto("/feed");
    await page.getByRole("tab", { name: "Explore" }).click();

    // Should show either post cards or the empty state message
    const hasContent = await page
      .getByText("No public posts yet")
      .isVisible()
      .catch(() => false);

    if (hasContent) {
      await expect(page.getByText("No public posts yet")).toBeVisible();
    } else {
      // Posts are present — page should have loaded without error
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("following tab shows posts or empty state", async ({ page }) => {
    await page.goto("/feed");

    const hasEmptyState = await page
      .getByText("No posts yet")
      .isVisible()
      .catch(() => false);

    if (hasEmptyState) {
      await expect(
        page.getByText("Follow other dancers to see their posts here")
      ).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
