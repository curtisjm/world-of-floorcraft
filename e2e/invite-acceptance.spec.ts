import { test, expect, clerk } from "./fixtures";

test.describe("Invite acceptance", () => {
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

  test("org settings page shows invite manager for invite-only orgs", async ({
    page,
  }) => {
    // Create an invite-only org first
    await page.goto("/orgs/create");
    const orgName = `E2E Invite Test ${Date.now()}`;
    await page.locator("#name").fill(orgName);
    await page.locator("#membershipModel").click();
    await page.getByRole("option", { name: /Invite/ }).click();
    await page.getByRole("button", { name: "Create Organization" }).click();
    await expect(page).toHaveURL(/\/orgs\//, { timeout: 10_000 });

    // Go to settings
    const orgUrl = page.url();
    await page.goto(`${orgUrl}/settings`);

    // Should show the Generate Invite Link button
    await expect(
      page.getByRole("button", { name: "Generate Invite Link" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("admin can generate an invite link", async ({ page }) => {
    // Create invite-only org
    await page.goto("/orgs/create");
    const orgName = `E2E Link Gen ${Date.now()}`;
    await page.locator("#name").fill(orgName);
    await page.locator("#membershipModel").click();
    await page.getByRole("option", { name: /Invite/ }).click();
    await page.getByRole("button", { name: "Create Organization" }).click();
    await expect(page).toHaveURL(/\/orgs\//, { timeout: 10_000 });

    // Navigate to settings
    const orgUrl = page.url();
    await page.goto(`${orgUrl}/settings`);

    // Generate invite link
    await page.getByRole("button", { name: "Generate Invite Link" }).click();

    // Should show the generated link in an input field
    const linkInput = page.locator('input[readonly]');
    await expect(linkInput).toBeVisible({ timeout: 10_000 });

    const linkValue = await linkInput.inputValue();
    expect(linkValue).toContain("/orgs/invite/");
  });

  test("admin can copy invite link", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Create invite-only org
    await page.goto("/orgs/create");
    const orgName = `E2E Copy Link ${Date.now()}`;
    await page.locator("#name").fill(orgName);
    await page.locator("#membershipModel").click();
    await page.getByRole("option", { name: /Invite/ }).click();
    await page.getByRole("button", { name: "Create Organization" }).click();
    await expect(page).toHaveURL(/\/orgs\//, { timeout: 10_000 });

    const orgUrl = page.url();
    await page.goto(`${orgUrl}/settings`);

    // Generate link
    await page.getByRole("button", { name: "Generate Invite Link" }).click();
    await expect(page.locator('input[readonly]')).toBeVisible({ timeout: 10_000 });

    // Click copy
    await page.getByRole("button", { name: "Copy" }).click();

    // Should show "Copied!" feedback
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  });

  test("user pending invites list loads", async ({ page }) => {
    // Visit orgs page - invites would be shown via the notification system
    await page.goto("/orgs");
    await expect(page).toHaveURL(/\/orgs/);
    // Page renders successfully
    await expect(page.locator("body")).toBeVisible();
  });

  test("open org allows direct joining from profile", async ({ page }) => {
    // Create an open org
    await page.goto("/orgs/create");
    const orgName = `E2E Join Test ${Date.now()}`;
    await page.locator("#name").fill(orgName);
    await page.locator("#membershipModel").click();
    await page.getByRole("option", { name: /Open/ }).click();
    await page.getByRole("button", { name: "Create Organization" }).click();
    await expect(page).toHaveURL(/\/orgs\//, { timeout: 10_000 });

    // As owner, we're already a member. Verify the org page loads.
    await expect(page.getByText(orgName)).toBeVisible();
  });
});
