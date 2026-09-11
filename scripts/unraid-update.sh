#!/bin/sh
# Run this in Unraid's terminal AFTER you have copied the latest project files
# into this directory (the PC copy is not used unless you copy/sync it here).
set -eu

cd "$(dirname "$0")/.."
ROOT=$(pwd)

if [ ! -f "$ROOT/Dockerfile" ] || [ ! -f "$ROOT/src/ui/Toolbar.tsx" ]; then
  echo "This does not look like the planner project."
  echo "Expected Dockerfile at $ROOT/Dockerfile"
  exit 1
fi

if ! grep -q '__BUILD_TIME__' "$ROOT/src/ui/Toolbar.tsx"; then
  echo "The files on THIS server are an old copy."
  echo "Copy the project from your PC into $ROOT (including src/ui/Toolbar.tsx)"
  echo "then run this script again. Browser refresh cannot do that."
  exit 1
fi

echo "Building lgb-planner:latest from $ROOT ..."
docker build --no-cache -t lgb-planner:latest .

NEW_ID=$(docker images -q lgb-planner:latest | head -n 1)
echo "New image id: $NEW_ID"

for name in LGB-Planner lgb-planner; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    OLD_ID=$(docker inspect --format '{{.Image}}' "$name" | sed 's/^sha256://' | cut -c1-12)
    echo "Removing container $name (was image ${OLD_ID}...)"
    docker stop "$name" >/dev/null
    docker rm "$name" >/dev/null
  fi
done

echo
echo "Image is ready. The old container is gone (that is required;"
echo "Stop/Start keeps the previous image)."
echo
echo "In Unraid: Docker → Add Container → pick your LGB-Planner template"
echo "→ Repository must be lgb-planner:latest → Apply."
echo
echo "Then open the planner and check the toolbar: build YYYY-MM-DD HH:MM"
echo "If that minute is not now, you still have old files or an old container."
