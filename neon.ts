import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  auth: false,
  functions: {
    // Web app at /, game API at /api. Run `pnpm build:function` first so the web build is embedded.
    ringfall: {
      name: "Ringfall",
      source: "apps/server/function/index.ts",
      // Password hashing is a native addon; the deploy installs its linux-arm64 build.
      externalPackages: ["@node-rs/argon2"],
      env: { JWT_SECRET: process.env.JWT_SECRET! },
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
