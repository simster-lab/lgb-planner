#!/bin/sh
# Build the planner image on this PC and push it to GitHub Container Registry.
# Unraid pulls ghcr.io/simster-lab/lgb-planner:latest; it does not build.
set -eu

cd "$(dirname "$0")/.."

IMAGE=ghcr.io/simster-lab/lgb-planner:latest

if command -v docker >/dev/null 2>&1; then
  ENGINE=docker
elif command -v podman >/dev/null 2>&1; then
  ENGINE=podman
else
  echo "Neither docker nor podman is installed."
  exit 1
fi

# Podman's default auth file lives under /run and disappears on reboot.
# Keep the GitHub login in the home directory instead.
PODMAN_AUTH_FILE=$HOME/.config/containers/auth.json
if [ "$ENGINE" = podman ]; then
  mkdir -p "$(dirname "$PODMAN_AUTH_FILE")"
  export REGISTRY_AUTH_FILE=$PODMAN_AUTH_FILE
fi

logged_in=0
for auth_file in \
  "${DOCKER_CONFIG:-$HOME/.docker}/config.json" \
  "$PODMAN_AUTH_FILE" \
  "${XDG_RUNTIME_DIR:-}/containers/auth.json"
do
  if [ -f "$auth_file" ] && grep -q 'ghcr.io' "$auth_file"; then
    logged_in=1
    break
  fi
done

if [ "$logged_in" -ne 1 ]; then
  echo "Not logged in to ghcr.io."
  echo "Create a GitHub personal access token with write:packages, then:"
  if [ "$ENGINE" = podman ]; then
    echo "  echo TOKEN | podman login --authfile \"$PODMAN_AUTH_FILE\" ghcr.io -u simster-lab --password-stdin"
    echo "That file is kept across reboots."
  else
    echo "  echo TOKEN | docker login ghcr.io -u simster-lab --password-stdin"
  fi
  exit 1
fi

echo "Building $IMAGE for linux/amd64 with $ENGINE ..."
$ENGINE build --platform linux/amd64 -t "$IMAGE" .

echo "Pushing $IMAGE ..."
# Unraid's update check requests a Docker manifest. Podman's default OCI
# manifest is invisible to that check, so the container stays "up to date".
if [ "$ENGINE" = podman ]; then
  $ENGINE push --format v2s2 "$IMAGE"
else
  $ENGINE push "$IMAGE"
fi

echo
echo "Pushed $IMAGE"
echo "On Unraid: Docker → Check for Updates → Update."
echo "The first time, set the template Repository to $IMAGE and Apply."
echo "If Unraid cannot pull, make the GitHub package public (Packages → lgb-planner)."
