import { test, expect, clerk } from "./fixtures";

test.describe("Profile settings", () => {
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

  test("edit profile page loads with form fields", async ({ page }) => {
    await page.goto("/settings/profile");
    await expect(
      page.getByRole("heading", { name: "Edit Profile" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Display name")).toBeVisible();
    await expect(page.getByLabel("Bio")).toBeVisible();
    await expect(page.getByLabel("Competition level")).toBeVisible();
  });

  test("save button is present", async ({ page }) => {
    await page.goto("/settings/profile");
    await expect(
      page.getByRole("button", { name: "Save changes" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("bio field has character counter", async ({ page }) => {
    await page.goto("/settings/profile");
    await expect(page.getByLabel("Bio")).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("Bio").fill("Hello world");
    await expect(page.getByText("/500")).toBeVisible();
  });

  test("competition level dropdown has expected options", async ({ page }) => {
    await page.goto("/settings/profile");
    const select = page.getByLabel("Competition level");
    await expect(select).toBeVisible({ timeout: 10_000 });

    // Verify key options exist
    const options = select.locator("option");
    const optionTexts = await options.allTextContents();
    expect(optionTexts).toContain("Newcomer");
    expect(optionTexts).toContain("Bronze");
    expect(optionTexts).toContain("Silver");
    expect(optionTexts).toContain("Gold");
  });

  test("partner search toggle is present", async ({ page }) => {
    await page.goto("/settings/profile");
    await expect(
      page.getByText("Looking for a partner")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("private account toggle is present", async ({ page }) => {
    await page.goto("/settings/profile");
    await expect(page.getByText("Private account")).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("User profile viewing", () => {
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

  test("competitors listing page loads", async ({ page }) => {
    await page.goto("/competitors");
    await expect(page).toHaveURL(/\/competitors/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("partners listing page loads", async ({ page }) => {
    await page.goto("/partners");
    await expect(page).toHaveURL(/\/partners/);
    await expect(page.locator("body")).toBeVisible();
  });
});
