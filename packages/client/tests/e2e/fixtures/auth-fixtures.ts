import { test as base } from "@playwright/test";

export type TestAuthIdentity = {
  address: string;
};

export const authTest = base.extend<{ wallet: TestAuthIdentity }>({
  wallet: async ({}, use) => {
    await use({ address: "local-player" });
  },
});
