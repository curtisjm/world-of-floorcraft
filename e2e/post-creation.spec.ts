import { test, expect, clerk } from "./fixtures";

test.describe("Post creation", () => {
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

  test("new post page loads with editor", async ({ page }) => {
    await page.goto("/posts/new");
    await expect(page.getByRole("heading", { name: "Write Article" })).toBeVisible();
    await expect(page.getByPlaceholder("Article title")).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  });

  test("publish button is disabled without title", async ({ page }) => {
    await page.goto("/posts/new");
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  test("user can write and publish an article", async ({ page }) => {
    await page.goto("/posts/new");

    // Fill title
    const titleInput = page.getByPlaceholder("Article title");
    await titleInput.fill(`E2E Test Post ${Date.now()}`);

    // Fill body via the Tiptap editor
    const editor = page.locator(".tiptap.ProseMirror");
    await editor.click();
    await editor.fill("This is a test article created by E2E tests.");

    // Verify publish button is now enabled
    await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();

    // Select visibility
    await page.locator("select").selectOption("public");

    // Click publish
    await page.getByRole("button", { name: "Publish" }).click();

    // Should redirect to the post page
    await expect(page).toHaveURL(/\/posts\/\d+/, { timeout: 10_000 });
  });

  test("user can save a draft", async ({ page }) => {
    await page.goto("/posts/new");

    const titleInput = page.getByPlaceholder("Article title");
    await titleInput.fill(`E2E Draft ${Date.now()}`);

    const editor = page.locator(".tiptap.ProseMirror");
    await editor.click();
    await editor.fill("Draft content for E2E testing.");

    // Click save draft
    await page.getByRole("button", { name: "Save Draft" }).click();

    // Should redirect to the post page (draft view)
    await expect(page).toHaveURL(/\/posts\/\d+/, { timeout: 10_000 });
  });

  test("visibility selector has correct options", async ({ page }) => {
    await page.goto("/posts/new");
    const select = page.locator("select");
    await expect(select).toBeVisible();

    const options = select.locator("option");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText("Public");
    await expect(options.nth(1)).toHaveText("Followers only");
    await expect(options.nth(2)).toHaveText("Organization only");
  });
});
