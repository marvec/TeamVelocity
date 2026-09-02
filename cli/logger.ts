/**
 * Minimal console logger for the CLI. Never logs secrets — the token is passed
 * around as a value and never handed to the logger (invariant #6).
 */

import type { Logger } from "./connectors/types";

export function createConsoleLogger(verbose = false): Logger {
  return {
    info(message: string): void {
      process.stdout.write(`  ${message}\n`);
    },
    warn(message: string): void {
      process.stderr.write(`  ⚠ ${message}\n`);
    },
    error(message: string): void {
      process.stderr.write(`  ✖ ${message}\n`);
    },
    debug(message: string): void {
      if (verbose) process.stdout.write(`  · ${message}\n`);
    },
  };
}
