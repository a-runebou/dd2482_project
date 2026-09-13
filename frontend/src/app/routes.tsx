import type { RouteObject } from "react-router";
import { RootLayout } from "./RootLayout";
import { RootErrorBoundary } from "./RootErrorBoundary";
import { HomePage } from "../pages/HomePage";
import { GroupsPage } from "../pages/GroupsPage";
import { CreateGroupPage } from "../pages/CreateGroupPage";
import { GroupDetailPage } from "../pages/GroupDetailPage";
import { SignInPage } from "../pages/SignInPage";
import { AuthCallbackPage } from "../pages/AuthCallbackPage";
import { NotFoundPage } from "../pages/NotFoundPage";

/**
 * The single source of routes, consumed by the browser data router in main.tsx and by a memory
 * router in tests. The root layout is the boot gate; its errorElement is the last-resort
 * boundary. TanStack Query owns server state, so there are no loaders or actions.
 */
export const appRoutes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <RootErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "groups", element: <GroupsPage /> },
      { path: "groups/new", element: <CreateGroupPage /> },
      { path: "groups/:slug", element: <GroupDetailPage /> },
      { path: "sign-in", element: <SignInPage /> },
      { path: "auth/callback", element: <AuthCallbackPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
