import { defineConfig } from "drizzle-kit";

// Support both DATABASE_URL and USE_LOCAL_POSTGRES defaults
const url =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.FORGE_POSTGRES_USER || "forge"}:${process.env.FORGE_POSTGRES_PASSWORD || "forge_dev_password"}@localhost:${process.env.FORGE_POSTGRES_PORT || "5489"}/${process.env.FORGE_POSTGRES_DB || "forge"}`;

export default defineConfig({
  schema: "./server/db/schema",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
