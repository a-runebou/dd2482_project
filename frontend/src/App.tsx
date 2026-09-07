import type { ComponentProps } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";

// Derive the router type from RouterProvider so it cannot drift from the library.
type Router = ComponentProps<typeof RouterProvider>["router"];

interface AppProps {
  queryClient: QueryClient;
  router: Router;
}

/**
 * App only composes the providers. The QueryClient and the router are created once at module
 * scope in main.tsx and injected, never inside a component: StrictMode double-invokes state
 * initialisers and a discarded browser router would leak its history listener. Tests inject
 * their own createQueryClient() and a memory router.
 */
function App({ queryClient, router }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
