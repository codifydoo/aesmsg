// Minimal structured logger. Kept dependency-free (no pino/Fastify) — the worker only ever logs
// aggregate, non-sensitive data (job name, purge count, duration), consistent with the project's
// zero-knowledge logging posture (no IPs, link IDs, or payloads). The Logger interface is the
// injection seam the scheduler/jobs depend on, so tests can pass a fake and assert on calls.
/**
 * Structured log sink. Implementations MUST NOT throw — the scheduler calls these on its hot path
 * (including inside the job error-handling catch) and does not guard against a throwing logger.
 */
export interface Logger {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

function emit(level: "info" | "error", fields: Record<string, unknown>, message: string): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const consoleLogger: Logger = {
  info: (fields, message) => emit("info", fields, message),
  error: (fields, message) => emit("error", fields, message),
};
