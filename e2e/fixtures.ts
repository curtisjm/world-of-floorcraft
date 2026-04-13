import { test as base } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

export const test = base.extend<{ clerkPage: void }>({
  clerkPage: [
    async ({ page }, use) => {
      await setupClerkTestingToken({ page });
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
export { clerk };
