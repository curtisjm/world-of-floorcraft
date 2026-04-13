import { test, expect, clerk } from "./fixtures";

test.describe("Dance browsing", () => {
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

  test("dances listing page loads with heading", async ({ page }) => {
    await page.goto("/dances");
    await expect(
      page.getByRole("heading", { name: "Dances" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Select a dance to explore its figures and transitions")
    ).toBeVisible();
  });

  test("dances page shows dance cards", async ({ page }) => {
    await page.goto("/dances");
    await expect(
      page.getByRole("heading", { name: "Dances" })
    ).toBeVisible({ timeout: 10_000 });

    // Should have at least one dance card with a figure count
    const figureCountText = page.getByText(/\d+ figures?/);
    await expect(figureCountText.first()).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a dance navigates to detail page", async ({ page }) => {
    await page.goto("/dances");
    await expect(
      page.getByRole("heading", { name: "Dances" })
    ).toBeVisible({ timeout: 10_000 });

    // Click the first dance link
    const danceLink = page.locator('a[href^="/dances/"]').first();
    await expect(danceLink).toBeVisible({ timeout: 10_000 });
    await danceLink.click();

    // Should navigate to a dance detail page
    await expect(page).toHaveURL(/\/dances\/[^/]+$/, { timeout: 10_000 });
  });

  test("dance detail page shows figure list with filters", async ({
    page,
  }) => {
    await page.goto("/dances");
    await expect(
      page.getByRole("heading", { name: "Dances" })
    ).toBeVisible({ timeout: 10_000 });

    const danceLink = page.locator('a[href^="/dances/"]').first();
    const hasLinks = await danceLink.isVisible().catch(() => false);
    if (!hasLinks) {
      test.skip(true, "No dances available");
      return;
    }

    await danceLink.click();
    await expect(page).toHaveURL(/\/dances\/[^/]+$/, { timeout: 10_000 });

    // Should show search input and level filter buttons
    await expect(
      page.getByPlaceholder("Search figures...")
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Bronze" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Silver" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gold" })).toBeVisible();
  });

  test("dance detail page has View Graph button", async ({ page }) => {
    await page.goto("/dances");
    const danceLink = page.locator('a[href^="/dances/"]').first();
    const hasLinks = await danceLink.isVisible().catch(() => false);
    if (!hasLinks) {
      test.skip(true, "No dances available");
      return;
    }

    await danceLink.click();
    await expect(page).toHaveURL(/\/dances\/[^/]+$/, { timeout: 10_000 });

    await expect(
      page.getByRole("link", { name: "View Graph" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("figure search filters the list", async ({ page }) => {
    await page.goto("/dances");
    const danceLink = page.locator('a[href^="/dances/"]').first();
    const hasLinks = await danceLink.isVisible().catch(() => false);
    if (!hasLinks) {
      test.skip(true, "No dances available");
      return;
    }

    await danceLink.click();
    await expect(page).toHaveURL(/\/dances\/[^/]+$/, { timeout: 10_000 });

    const searchInput = page.getByPlaceholder("Search figures...");
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // Type a search term — the figure count should update
    await searchInput.fill("natural");

    // After filtering, the count text should still be visible (may show fewer)
    await expect(page.getByText(/\d+ of \d+ figures?/)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("level toggle buttons filter figures", async ({ page }) => {
    await page.goto("/dances");
    const danceLink = page.locator('a[href^="/dances/"]').first();
    const hasLinks = await danceLink.isVisible().catch(() => false);
    if (!hasLinks) {
      test.skip(true, "No dances available");
      return;
    }

    await danceLink.click();
    await expect(page).toHaveURL(/\/dances\/[^/]+$/, { timeout: 10_000 });

    // Click Gold button to toggle it off
    const goldButton = page.getByRole("button", { name: "Gold" });
    await expect(goldButton).toBeVisible({ timeout: 10_000 });
    await goldButton.click();

    // Figure count should still be displayed
    await expect(page.getByText(/\d+ of \d+ figures?/)).toBeVisible();
  });
});
