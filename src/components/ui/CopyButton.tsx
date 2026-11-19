import { useEffect, useRef, useState } from "react";
import type { CopyContent } from "../../lib/copy-export";
import { Button } from "./Button";

type Status = "idle" | "copied" | "failed";

const STATUS_TEXT: Record<Status, string> = { idle: "Copy", copied: "Copied", failed: "Copy failed" };
const RESET_MS = 2000;

/**
 * Put a section's HTML + Markdown on the clipboard. Serialization runs only on
 * click (`getContent` is lazy). Prefers a `ClipboardItem` carrying both
 * `text/html` and `text/plain`; falls back to `writeText(markdown)` where
 * `ClipboardItem` is unavailable. Never throws — any failure shows "Copy failed".
 */
async function writeClipboard({ html, markdown }: CopyContent): Promise<void> {
  if (typeof ClipboardItem === "undefined") {
    await navigator.clipboard.writeText(markdown);
    return;
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([markdown], { type: "text/plain" }),
    }),
  ]);
}

export function CopyButton({
  getContent,
  label,
  testid,
}: {
  getContent: () => CopyContent;
  /** Stable accessible name naming the section, e.g. "Copy week detail". */
  label: string;
  testid?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  async function copy(): Promise<void> {
    let next: Status;
    try {
      await writeClipboard(getContent());
      next = "copied";
    } catch {
      next = "failed";
    }
    // The write may settle after unmount; don't start a timer nobody will clear.
    if (!mounted.current) return;
    setStatus(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("idle");
    }, RESET_MS);
  }

  return (
    <>
      <Button
        variant="outline"
        aria-label={label}
        data-testid={testid}
        onClick={() => {
          void copy();
        }}
      >
        {STATUS_TEXT[status]}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === "idle" ? "" : STATUS_TEXT[status]}
      </span>
    </>
  );
}
