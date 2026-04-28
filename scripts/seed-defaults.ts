// Seed default model API config and prompt configs into the database.
// Called after db:setup to ensure defaults exist before first runtime use.

import { ensureRuntimeConfigSeeded } from "../src/lib/settings/core";

async function main() {
  await ensureRuntimeConfigSeeded();
  console.log("Default settings seeded.");
}

main();
