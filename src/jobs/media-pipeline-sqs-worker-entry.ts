// src/jobs/media-pipeline-sqs-worker-entry.ts
import { runMediaPipelineSqsWorkerLoop } from "./media-pipeline-sqs-worker.js";

const ac = new AbortController();
for (const ev of ["SIGINT", "SIGTERM"] as const) {
  process.on(ev, () => ac.abort());
}

runMediaPipelineSqsWorkerLoop(ac.signal).catch((err) => {
  console.error(err);
  process.exit(1);
});
