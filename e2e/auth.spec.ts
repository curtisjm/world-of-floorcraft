import { test, expect, clerk } from "./fixtures";

test.describe("Auth flow", () => {
  test("sign-in page renders Clerk form", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/sign-in/);
    // Clerk renders its sign-in widget
    await expect(page.locator(".cl-signIn-root")).toBeVisible({ timeout: 10_000 });
  });

  test("sign-up page renders Clerk form", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/\/sign-up/);
    await expect(page.locator(".cl-signUp-root")).toBeVisible({ timeout: 10_000 });
  });

  test("protected route redirects unauthenticated user to sign-in", async ({
    browser,
  }) => {
    // Use a fresh context without the Clerk testing token
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/posts/new");
    // Clerk middleware should redirect to sign-in
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });

    await context.close();
  });

  test("authenticated user can access protected route", async ({ page }) => {
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: process.env.E2E_CLERK_USER_EMAIL!,
        password: process.env.E2E_CLERK_USER_PASSWORD!,
      },
    });

    await page.goto("/posts/new");
    await expect(page).toHaveURL(/\/posts\/new/);
    await expect(page.getByRole("heading", { name: "Write Article" })).toBeVisible();
  });

  test("user can sign out", async ({ page }) => {
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: process.env.E2E_CLERK_USER_EMAIL!,
        password: process.env.E2E_CLERK_USER_PASSWORD!,
      },
    });

    await page.goto("/");
    await clerk.signOut({ page });

    // After sign-out, trying a protected route should redirect
    await page.goto("/posts/new");
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });
  });
});
