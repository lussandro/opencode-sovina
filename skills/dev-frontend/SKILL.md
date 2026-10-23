---
name: dev-frontend
description: Use when building or changing UI: React, Vite, Next.js components, forms, data fetching, state, accessibility or rendering performance.
---
# Frontend

- **Reuse before adding.** Match the existing components, tokens and patterns of the app.
- **State:** keep it next to where it is used, derive instead of storing, put shareable state in the URL. Server data belongs in a query layer with cache and invalidation, not `useEffect` plus `useState`.
- **Effects** are for syncing with outside systems only, never for derived values or event handling. Clean up subscriptions and ignore stale or aborted fetches.
- **Next.js App Router:** server components by default; add `"use client"` only for interactivity and push the boundary down. Fetch on the server, keep secrets out of client code, and decide caching and revalidation explicitly.
- **Every async view has loading, empty, error and partial states.** Disable submit while pending, keep user input after an error, and give optimistic updates a rollback.
- **Forms:** one schema for client and server, with the server as the authority. Labels tied to inputs and errors tied to fields.
- **Accessibility:** real elements (`button`, `a`, `label`), keyboard reachable with visible focus, alt text, enough contrast, never color alone, focus managed in dialogs and on route changes.
- **Performance:** measure first. Stable keys, not array indexes. Virtualize long lists, lazy-load heavy routes, give images dimensions to avoid layout shift.
- **Types:** parse API responses (a schema) instead of casting; no `any` at boundaries.
- **Security:** no `dangerouslySetInnerHTML` with untrusted data; prefer httpOnly cookies over `localStorage` for tokens.

Verify in a browser: happy path and error path, with the console clean.
