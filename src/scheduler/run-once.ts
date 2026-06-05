import { pollOnce } from "./scheduler.js";

/**
 * One-shot pipeline run for manual triggering / cron-from-outside / debugging.
 * `npm run worker`
 */
pollOnce()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
