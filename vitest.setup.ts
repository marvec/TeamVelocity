import "@testing-library/jest-dom/vitest";

// jsdom has no layout engine, so Recharts' ResponsiveContainer measures 0x0 and
// renders nothing. Polyfill ResizeObserver and give elements a stable non-zero
// box so chart components can be unit-tested.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;

Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value(): DOMRect {
    return {
      width: 800,
      height: 400,
      top: 0,
      left: 0,
      right: 800,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  },
});
