import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

// The browser worker shares the same handlers as the Node server used in tests, so development
// and tests answer identically. It is imported dynamically from src/app/mocking.ts and only in
// development, so the production bundle never pulls in MSW.
export const worker = setupWorker(...handlers);
