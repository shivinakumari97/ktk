import { createServer } from "./web/server.js";
import { startScheduler } from "./scheduler/scheduler.js";
import { env } from "./config/env.js";

/**
 * Single-process entrypoint: web dashboard/API + the polling scheduler. Split
 * these into separate processes later if you outgrow one box.
 */
const server = createServer();
server.listen(env.port, () => {
  console.log(`[web] dashboard on http://localhost:${env.port}`);
  startScheduler();
});
