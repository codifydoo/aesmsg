import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Enable React's act() environment so state updates driven from tests (e.g. the async identity
// state-machine actions) are flushed deterministically and without console noise. Vitest browser
// mode does not set this by default the way jsdom-based setups do.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
