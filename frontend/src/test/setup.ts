import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "../mocks/server";

// globals:false, so Testing Library does not register its own afterEach(cleanup); register it
// once here for every test file rather than repeating it per file.
afterEach(cleanup);

// Start MSW at module top level, before any test file imports the API client. openapi-fetch
// captures globalThis.fetch when createClient runs (at import time), so MSW must have replaced
// fetch first; starting it in a beforeAll would be too late and requests would hit the network.
// An unhandled request is a test bug, so fail loudly rather than reaching out.
server.listen({ onUnhandledRequest: "error" });
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
