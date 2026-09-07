import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { bootTheme } from "./theme/use-theme";
import "./theme/globals.css";

// Stamp the persisted theme on <html> before the first render so the app
// never paints in the default theme and then flips.
bootTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
