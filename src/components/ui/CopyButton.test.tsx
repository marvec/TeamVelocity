import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CopyButton } from "./CopyButton";

const CONTENT = { html: '<a href="https://example.com/pr/1">#1</a>', markdown: "[#1](https://example.com/pr/1)" };

/** Records what the fake ClipboardItem was constructed with. */
class FakeClipboardItem {
  constructor(public readonly items: Record<string, Blob>) {}
}

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function mockClipboard(clipboard: Partial<Clipboard>): void {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
}

/** Click and let the clipboard promise settle inside act. */
async function clickCopy(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId("copy-test"));
    await Promise.resolve();
  });
}

describe("CopyButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  });

  function renderButton(getContent = () => CONTENT) {
    render(<CopyButton getContent={getContent} label="Copy week detail" testid="copy-test" />);
  }

  it("writes one ClipboardItem with text/html and text/plain blobs and shows Copied", async () => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    const write = vi.fn<(items: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
    mockClipboard({ write });
    const getContent = vi.fn(() => CONTENT);
    renderButton(getContent);
    expect(getContent).not.toHaveBeenCalled();

    await clickCopy();

    expect(getContent).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    const items = write.mock.calls[0]?.[0] ?? [];
    expect(items).toHaveLength(1);
    const item = items[0] as FakeClipboardItem;
    expect(Object.keys(item.items).sort()).toEqual(["text/html", "text/plain"]);
    expect(item.items["text/html"]?.type).toBe("text/html");
    expect(item.items["text/plain"]?.type).toBe("text/plain");
    expect(screen.getByTestId("copy-test")).toHaveTextContent("Copied");
  });

  it("falls back to writeText(markdown) when ClipboardItem is undefined", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const write = vi.fn();
    mockClipboard({ writeText, write });
    renderButton();

    await clickCopy();

    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(CONTENT.markdown);
    expect(screen.getByTestId("copy-test")).toHaveTextContent("Copied");
  });

  it("shows Copy failed when write rejects, without throwing", async () => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    mockClipboard({ write: vi.fn().mockRejectedValue(new Error("denied")) });
    renderButton();

    await clickCopy();

    expect(screen.getByTestId("copy-test")).toHaveTextContent("Copy failed");
  });

  it("returns to Copy after the status timeout", async () => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    mockClipboard({ write: vi.fn().mockResolvedValue(undefined) });
    renderButton();

    await clickCopy();
    expect(screen.getByTestId("copy-test")).toHaveTextContent("Copied");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("copy-test")).toHaveTextContent(/^Copy$/);
  });

  it("keeps a stable aria-label and announces the status in a polite live region", async () => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    mockClipboard({ write: vi.fn().mockResolvedValue(undefined) });
    renderButton();

    const button = screen.getByRole("button", { name: "Copy week detail" });
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("");

    await clickCopy();

    expect(screen.getByRole("button", { name: "Copy week detail" })).toBe(button);
    expect(status).toHaveTextContent("Copied");
  });

  it("clears its reset timer on unmount", async () => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    mockClipboard({ write: vi.fn().mockResolvedValue(undefined) });
    const { unmount } = render(<CopyButton getContent={() => CONTENT} label="Copy" testid="copy-test" />);
    await clickCopy();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
