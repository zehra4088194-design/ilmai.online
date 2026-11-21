# Ilm AI PDF renderer

This is a separate, private Playwright service. The Next.js app sends only server-generated, escaped HTML. The renderer disables JavaScript, blocks HTTP(S) requests, checks a shared bearer secret, caps request and PDF size, and limits concurrent rendering.

## Deploy in Coolify

1. Add a resource for this repository using build context at the repo root and Dockerfile path workers/pdf-renderer/Dockerfile.
2. Set the internal service port to 3400. Do not expose the render endpoint publicly.
3. Set PDF_RENDERER_SECRET to a long random value (at least 32 random bytes).
4. Set the Next.js app variables:
   - PDF_RENDERER_URL=http://<internal-pdf-service-name>:3400
   - PDF_RENDERER_SECRET=<same-secret>
5. Ensure both containers share a private Coolify Docker network, then redeploy the Next.js app after the PDF service is healthy.

The image installs Noto font packages, including Noto Nastaliq Urdu. Review actual English, Urdu and mixed-script PDF pages after deployment; a successful container build is not a substitute for visual quality checks.

## Local run

~~~bash
cd workers/pdf-renderer
npm install
PDF_RENDERER_SECRET='replace-with-a-long-random-secret' npm start
npm test
~~~

The renderer accepts POST /render with JSON { "html": "...", "pageSize": "A4", "language": "Urdu" } and returns application/pdf. GET /health is unauthenticated for container health checks.
