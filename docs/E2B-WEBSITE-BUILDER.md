# E2B isolated website builds

Ilm AI Website Builder uses the official `e2b` JavaScript SDK to run each generated website in a short-lived, isolated E2B Cloud sandbox.

## Configure the API key

1. Create an E2B account and an API key in the E2B dashboard.
2. In a local checkout of the repository, provision the Node 22 template once:
   - Windows PowerShell: `$env:E2B_API_KEY="your-key"`
   - Linux/macOS: `export E2B_API_KEY="your-key"`
   - Then run `npm run build:website-sandbox`.
   - The script prints the created template ID.
3. Open the Ilm AI app resource in Coolify and add these **server-side runtime environment variables**:
   - `E2B_API_KEY`: your E2B API key
   - `E2B_WEBSITE_TEMPLATE`: the template ID printed by the build script (or `ilmai-website-builder-node22` if you kept the default name).
4. Do not prefix either variable with `NEXT_PUBLIC_`, do not put them in client/build-time public variables, and never commit the API key.
5. Redeploy/restart Ilm AI so the Next.js server receives the variables.

The key stays on the Ilm AI server and is used only to create/delete E2B sandboxes. It is never sent to the browser or copied into the sandbox.

## What happens during a build

- Ilm AI validates the generated file paths and package manifest first.
- A new E2B sandbox is created for the request with a five-minute lifetime and a two-vCPU limit.
- The sandbox uses the provisioned Node 22 template and receives only the generated source files. It receives no Supabase, OpenRouter, B2, or other Ilm AI credentials.
- Outbound network is allow-listed to `registry.npmjs.org` while npm downloads dependencies. Package lifecycle scripts are disabled.
- After dependencies are installed, outbound network is disabled and the fixed `npm run build` command runs.
- The sandbox is explicitly killed in a `finally` block, including failed builds.

The UI reports one of three outcomes: **passed**, **failed**, or **unavailable**. A failed/unavailable build does not claim the website is verified; the generated ZIP remains available so it can be inspected and fixed.

## Runtime requirement

The Ilm AI application server must run Node.js 22.19 or newer, as required by the pinned E2B SDK. The isolated build template is provisioned from the official Node 22 image and provides Node.js/npm to run generated Next.js builds. The E2B dependency is pinned to version 2.64.0 in package.json and package-lock.json.
