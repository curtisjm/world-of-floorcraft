import { test, expect, clerk } from "./fixtures";

test.describe("Routine management", () => {
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

  test("routines page loads with heading", async ({ page }) => {
    await page.goto("/routines");
    await expect(
      page.getByRole("heading", { name: "My Routines" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Select a dance to view and manage your routines")
    ).toBeVisible();
  });

  test("routines page shows dance cards", async ({ page }) => {
    await page.goto("/routines");
    await expect(
      page.getByRole("heading", { name: "My Routines" })
    ).toBeVisible({ timeout: 10_000 });

    // Should show dance cards for navigation
    const danceLink = page.locator('a[href^="/routines/dance/"]').first();
    await expect(danceLink).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a dance card navigates to dance routines page", async ({
    page,
  }) => {
    await page.goto("/routines");
    await expect(
      page.getByRole("heading", { name: "My Routines" })
    ).toBeVisible({ timeout: 10_000 });

    const danceLink = page.locator('a[href^="/routines/dance/"]').first();
    await expect(danceLink).toBeVisible({ timeout: 10_000 });
    await danceLink.click();

    await expect(page).toHaveURL(/\/routines\/dance\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: /Routines$/ })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("dance routines page shows New Routine button", async ({ page }) => {
    await page.goto("/routines");
    const danceLink = page.locator('a[href^="/routines/dance/"]').first();
    await expect(danceLink).toBeVisible({ timeout: 10_000 });
    await danceLink.click();

    await expect(page).toHaveURL(/\/routines\/dance\//, { timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: "New Routine" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("new routine page loads with dance selection", async ({ page }) => {
    await page.goto("/routines/new");
    await expect(
      page.getByRole("heading", { name: "New Routine" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Select a dance to get started")
    ).toBeVisible();
  });

  test("new routine dance selection shows dance buttons", async ({ page }) => {
    await page.goto("/routines/new");
    await expect(
      page.getByRole("heading", { name: "New Routine" })
    ).toBeVisible({ timeout: 10_000 });

    // Should have dance buttons to select from
    const danceButtons = page.locator("button").filter({ hasText: /Waltz|Foxtrot|Tango|Quickstep/i });
    await expect(danceButtons.first()).toBeVisible({ timeout: 10_000 });
  });

  test("selecting a dance shows name input form", async ({ page }) => {
    await page.goto("/routines/new");
    await expect(
      page.getByRole("heading", { name: "New Routine" })
    ).toBeVisible({ timeout: 10_000 });

    // Click the first dance button
    const danceButtons = page.locator("button").filter({ hasText: /Waltz|Foxtrot|Tango|Quickstep/i });
    await expect(danceButtons.first()).toBeVisible({ timeout: 10_000 });
    await danceButtons.first().click();

    // Should now show the name input form
    await expect(
      page.getByPlaceholder("e.g., Competition Waltz")
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Create & Build" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel" })
    ).toBeVisible();
  });

  test("create button is disabled without name", async ({ page }) => {
    await page.goto("/routines/new");
    const danceButtons = page.locator("button").filter({ hasText: /Waltz|Foxtrot|Tango|Quickstep/i });
    await expect(danceButtons.first()).toBeVisible({ timeout: 10_000 });
    await danceButtons.first().click();

    await expect(
      page.getByRole("button", { name: "Create & Build" })
    ).toBeDisabled({ timeout: 10_000 });
  });

  test("create button enables after entering name", async ({ page }) => {
    await page.goto("/routines/new");
    const danceButtons = page.locator("button").filter({ hasText: /Waltz|Foxtrot|Tango|Quickstep/i });
    await expect(danceButtons.first()).toBeVisible({ timeout: 10_000 });
    await danceButtons.first().click();

    const nameInput = page.getByPlaceholder("e.g., Competition Waltz");
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill("E2E Test Routine");

    await expect(
      page.getByRole("button", { name: "Create & Build" })
    ).toBeEnabled();
  });
});
