import { startWorkerLoop } from "@/lib/tasks/worker";

startWorkerLoop({
  pollIntervalMs: 2_000,
}).catch((error) => {
  console.error("Worker loop crashed", error);
  process.exit(1);
});
