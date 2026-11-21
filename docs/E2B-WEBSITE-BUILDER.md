# E2B isolated website builds

Ilm AI Website Builder uses the official `e2b` JavaScript SDK to run each generated website in a short-lived, isolated E2B Cloud sandbox.

## Configure the API key

1. Create an E2B account and an API key in the E2B dashboard.
2. Open the Ilm AI app resource in Coolify and add `E2B_API_KEY` as a **server-side runtime environment variable**.
3. Do not prefix it with `NEXT_PUBLIC_`, do not put it in a client/build-time public variable, and never commit its value.
4. Redeploy/restart Ilm AI so the Next.js server receives the key.

The key stays on the Ilm AI server and is used only to create/delete E2B sandboxes. It is never sent to the browser or copied into the sandbox.

## What happens during a build

- Ilm AI validates the generated file paths and package manifest first.
- A new E2B sandbox is created for the request with a five-minute lifetime and a two-vCPU limit.
- The sandbox receives only the generated source files. It receives no Supabase, OpenRouter, B2, or other Ilm AI credentials.
- Outbound network is allow-listed to `registry.npmjs.org` while npm downloads dependencies. Package lifecycle scripts are disabled.
- After dependencies are installed, outbound network is disabled and the fixed `npm run build` command runs.
- The sandbox is explicitly killed in a `finally` block, including failed builds.

The UI reports one of three outcomes: **passed**, **failed**, or **unavailable**. A failed/unavailable build does not claim the website is verified; the generated ZIP remains available so it can be inspected and fixed.

## Runtime requirement

The Ilm AI application server must run Node.js 22.19 or newer, as required by the pinned E2B SDK. The isolated E2B build machine only needs a compatible Node.js runtime for the generated Next.js project. The E2B dependency is pinned to version 2.64.0 in package.json and package-lock.json.
