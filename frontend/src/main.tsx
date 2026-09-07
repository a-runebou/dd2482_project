import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import App from "./App";
import { appRoutes } from "./app/routes";
import { createQueryClient } from "./api/queryClient";
import { enableMocking } from "./app/mocking";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}
const root = rootElement;

// Created once at module scope, so StrictMode's double render cannot make a second QueryClient
// or a second browser router (which would leave a stray history listener attached).
const queryClient = createQueryClient();
const router = createBrowserRouter(appRoutes);

function render() {
  createRoot(root).render(
    <StrictMode>
      <App queryClient={queryClient} router={router} />
    </StrictMode>,
  );
}

// Start the dev mock worker (a no-op unless this is a mocking build) before rendering. If the
// worker fails to start, log it and render anyway, so the normal boot-failure state shows rather
// than a blank page.
enableMocking().then(render, (error: unknown) => {
  console.error("MSW worker failed to start", error);
  render();
});
