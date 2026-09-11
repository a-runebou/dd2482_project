import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";
import { resolveBaseUrl } from "./baseUrl";

export const apiClient = createClient<paths>({
  baseUrl: resolveBaseUrl(
    import.meta.env.VITE_API_BASE_URL,
    globalThis.location.origin,
  ),
});
