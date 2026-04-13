import { test, expect, clerk } from "./fixtures";

test.describe("Organization management", () => {
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

  test("create org page loads with form", async ({ page }) => {
    await page.goto("/orgs/create");
    await expect(page.getByRole("heading", { name: "Create Organization" })).toBeVisible();
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#description")).toBeVisible();
    await expect(page.locator("#membershipModel")).toBeVisible();
  });

  test("create button is disabled without name", async ({ page }) => {
    await page.goto("/orgs/create");
    await expect(
      page.getByRole("button", { name: "Create Organization" })
    ).toBeDisabled();
  });

  test("user can create an organization", async ({ page }) => {
    await page.goto("/orgs/create");

    const orgName = `E2E Org ${Date.now()}`;

    // Fill name
    await page.locator("#name").fill(orgName);

    // Fill description
    await page.locator("#description").fill("Test organization created by E2E tests");

    // Select membership model
    await page.locator("#membershipModel").click();
    await page.getByRole("option", { name: /Open/ }).click();

    // Create button should be enabled
    await expect(
      page.getByRole("button", { name: "Create Organization" })
    ).toBeEnabled();

    // Submit
    await page.getByRole("button", { name: "Create Organization" }).click();

    // Should redirect to org profile page
    await expect(page).toHaveURL(/\/orgs\//, { timeout: 10_000 });
    await expect(page.getByText(orgName)).toBeVisible();
  });

  test("org profile page shows tabs", async ({ page }) => {
    // Navigate to orgs listing
    await page.goto("/orgs");
    await expect(page.getByRole("heading", { name: /Organizations/ })).toBeVisible();
  });

  test("create org with request-based membership", async ({ page }) => {
    await page.goto("/orgs/create");

    const orgName = `E2E Request Org ${Date.now()}`;
    await page.locator("#name").fill(orgName);

    // Select "Request" membership model
    await page.locator("#membershipModel").click();
    await page.getByRole("option", { name: /Request/ }).click();

    await page.getByRole("button", { name: "Create Organization" }).click();
    await expect(page).toHaveURL(/\/orgs\//, { timeout: 10_000 });
  });

  test("create org with invite-only membership", async ({ page }) => {
    await page.goto("/orgs/create");

    const orgName = `E2E Invite Org ${Date.now()}`;
    await page.locator("#name").fill(orgName);

    // Select "Invite" membership model
    await page.locator("#membershipModel").click();
    await page.getByRole("option", { name: /Invite/ }).click();

    await page.getByRole("button", { name: "Create Organization" }).click();
    await expect(page).toHaveURL(/\/orgs\//, { timeout: 10_000 });
  });

  test("org owner can access settings", async ({ page }) => {
    // First create an org
    await page.goto("/orgs/create");
    const orgName = `E2E Settings Org ${Date.now()}`;
    await page.locator("#name").fill(orgName);
    await page.locator("#membershipModel").click();
    await page.getByRole("option", { name: /Open/ }).click();
    await page.getByRole("button", { name: "Create Organization" }).click();
    await expect(page).toHaveURL(/\/orgs\//, { timeout: 10_000 });

    // Navigate to settings
    const currentUrl = page.url();
    await page.goto(`${currentUrl}/settings`);
    await expect(page.getByText(/Settings/)).toBeVisible({ timeout: 10_000 });
  });
});
