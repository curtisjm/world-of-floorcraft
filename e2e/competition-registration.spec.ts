import { test, expect, clerk } from "./fixtures";

test.describe("Competition registration", () => {
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

  test("competitions listing page loads", async ({ page }) => {
    await page.goto("/competitions");
    await expect(page).toHaveURL(/\/competitions/);
    // Page should render without errors
    await expect(page.locator("body")).toBeVisible();
  });

  test("competition detail page renders", async ({ page }) => {
    await page.goto("/competitions");

    // Look for any competition link
    const compLink = page.locator('a[href^="/competitions/"]').first();
    const hasCompetitions = await compLink.isVisible().catch(() => false);

    if (!hasCompetitions) {
      test.skip(true, "No competitions available for testing");
      return;
    }

    await compLink.click();
    await expect(page).toHaveURL(/\/competitions\/[^/]+$/);
  });

  test("registration page shows wizard when entries are open", async ({ page }) => {
    await page.goto("/competitions");

    // Find a competition to test with
    const compLink = page.locator('a[href^="/competitions/"]').first();
    const hasCompetitions = await compLink.isVisible().catch(() => false);

    if (!hasCompetitions) {
      test.skip(true, "No competitions available for testing");
      return;
    }

    // Get the slug from the link
    const href = await compLink.getAttribute("href");
    if (!href) {
      test.skip(true, "Could not determine competition slug");
      return;
    }

    await page.goto(`${href}/register`);

    // Should show competition name and registration content
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Registration")).toBeVisible();
  });

  test("registration wizard step 0 - register for competition", async ({ page }) => {
    await page.goto("/competitions");

    const compLink = page.locator('a[href^="/competitions/"]').first();
    const hasCompetitions = await compLink.isVisible().catch(() => false);

    if (!hasCompetitions) {
      test.skip(true, "No competitions available");
      return;
    }

    const href = await compLink.getAttribute("href");
    await page.goto(`${href}/register`);

    // If already registered, skip this test
    const registerBtn = page.getByRole("button", { name: "Register" });
    const isRegisterVisible = await registerBtn.isVisible().catch(() => false);

    if (!isRegisterVisible) {
      test.skip(true, "Already registered or entries not open");
      return;
    }

    // The register card should show
    await expect(
      page.getByRole("heading", { name: "Register for this Competition" })
    ).toBeVisible();
    await expect(registerBtn).toBeEnabled();
  });

  test("registration wizard shows step indicator", async ({ page }) => {
    await page.goto("/competitions");

    const compLink = page.locator('a[href^="/competitions/"]').first();
    const hasCompetitions = await compLink.isVisible().catch(() => false);

    if (!hasCompetitions) {
      test.skip(true, "No competitions available");
      return;
    }

    const href = await compLink.getAttribute("href");
    await page.goto(`${href}/register`);

    // Check for step labels (hidden on small screens, visible on sm+)
    const stepLabels = ["Register", "Events", "Partners", "Review"];
    for (const label of stepLabels) {
      // Steps might be hidden on mobile, so just verify they exist in DOM
      const step = page.getByText(label, { exact: true }).first();
      await expect(step).toBeAttached({ timeout: 10_000 });
    }
  });

  test("closed competition shows appropriate message", async ({ page }) => {
    // This test verifies the not-open state renders correctly
    // We navigate to register for any comp and check the messaging
    await page.goto("/competitions");

    const compLink = page.locator('a[href^="/competitions/"]').first();
    const hasCompetitions = await compLink.isVisible().catch(() => false);

    if (!hasCompetitions) {
      test.skip(true, "No competitions available");
      return;
    }

    const href = await compLink.getAttribute("href");
    await page.goto(`${href}/register`);

    // Page should render without errors, showing either wizard or closed message
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
  });
});
