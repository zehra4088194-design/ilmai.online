#!/usr/bin/env bash
set -Eeuo pipefail

section() { printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }

section "Filesystem space"
df -hT
section "Docker aggregate usage"
if command -v docker >/dev/null 2>&1; then
  docker system df -v
  section "Running containers (writable layer size)"
  docker ps --size --format 'table {{.Names}}\t{{.Status}}\t{{.Size}}'
  section "Builder cache"
  if docker builder du >/dev/null 2>&1; then
    docker builder du
  else
    echo "docker builder du is not supported by this Docker version."
  fi
else
  echo "Docker CLI is not available."
fi

section "Large host directories (read-only, if accessible)"
for dir in /var/lib/docker /var/lib/containerd /var/log /opt /srv; do
  if [ -d "$dir" ]; then
    du -xhd1 "$dir" 2>/dev/null | sort -h | tail -n 15 || true
  fi
done

section "Docker log configuration"
if [ -f /etc/docker/daemon.json ]; then
  cat /etc/docker/daemon.json
else
  echo "/etc/docker/daemon.json does not exist; Docker is using daemon defaults."
fi

printf '\nAudit only: no containers, images, build cache, volumes or files were deleted.\n'
