#!/bin/sh
# This server-side rebuild is no longer how updates work.
# On the PC that has the project, run scripts/publish-image.sh.
# That builds linux/amd64 and pushes ghcr.io/simster-lab/lgb-planner:latest.
# On Unraid: Docker → Check for Updates → Update.
set -eu

echo "Do not build this image on Unraid."
echo "On your PC, from the project directory:"
echo "  ./scripts/publish-image.sh"
echo "Then on Unraid: Docker → Check for Updates → Update."
echo "Repository must be ghcr.io/simster-lab/lgb-planner:latest."
exit 1
