# Ilm AI server storage and Docker maintenance

The Next.js application stores user media in private Backblaze B2 and application records in Supabase. Website builds run in isolated E2B sandboxes. The Next.js container should not be used as a permanent file store.

## Read-only disk audit

Run from the Coolify host over SSH:

```bash
bash scripts/server-space-audit.sh
```

The script reports filesystem usage, Docker images/containers/volumes/build cache, container writable-layer sizes, and the largest accessible host directories. It does not delete anything.

You can also run the core Docker reports directly:

```bash
df -hT
docker system df -v
docker ps --size
docker builder du
```

## Safe cleanup after reviewing the audit

Only run cleanup after confirming the target host and reviewing the output:

- Remove unused BuildKit cache older than seven days: `docker builder prune -f --filter "until=168h"`.
- Remove dangling image layers only: `docker image prune -f`.
- Remove stopped containers older than seven days only after confirming they are not being retained for investigation or rollback: `docker container prune -f --filter "until=168h"`.

Do not use `docker system prune --volumes`, `docker volume prune`, or `docker image prune -a` as routine maintenance. Named volumes can contain persistent service data, and tagged images may be intentionally retained for rollback. Keep the PDF renderer and database volumes.

## Docker log rotation

Check the existing Docker daemon configuration first:

```bash
cat /etc/docker/daemon.json
```

For hosts using Docker's `json-file` logging driver, a reasonable baseline is:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Merge these keys into the existing daemon file; do not overwrite other settings. Changing the daemon's default log options usually requires a Docker daemon restart and recreation of existing containers before those containers use the new defaults. Schedule this in a maintenance window because a daemon restart can briefly affect running services.

If the host uses journald, inspect it with `journalctl --disk-usage`; only then consider a retention-based vacuum such as `journalctl --vacuum-time=14d`.

## Application and Backblaze storage

- Browser uploads go directly to B2 quarantine keys; the Next.js app does not keep permanent copies.
- Generated image/video bytes are transferred by the Cloudflare Worker directly from Picsart to private B2; the app stores metadata only.
- A daily cron now runs a cleanup for `media_assets` rows still marked `pending` under the user's `staging/<user-id>/` prefix and older than 24 hours. It never selects ready/published assets.
- Library deletion removes only the signed-in owner's ready asset and then its B2 object. Project links are removed by the database foreign-key cascade.
- Ensure the existing Coolify daily-credits Scheduled Task is active; otherwise its new staging cleanup section will not run.

## Deployment context

The Next.js Docker build context excludes `workers/`, Supabase migrations, tests, GitHub metadata and local test output. This reduces build context transfer and cache churn; it does not delete older images or cache already present on the Coolify host.

No destructive host cleanup is run by the application or this repository. Measure first, then remove only reviewed, unused artifacts.
