#!/usr/bin/env bash
set -Eeuo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 /absolute/path/to/media-hosting-platform" >&2
  exit 64
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$(mkdir -p "$TARGET" && cd "$TARGET" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$TARGET/.phase-backups/phase1-$STAMP"

if [[ "$TARGET" == "/" || "$TARGET" == "$HOME" ]]; then
  echo "Refusing unsafe target: $TARGET" >&2
  exit 65
fi

mkdir -p "$BACKUP_DIR"

PRESERVE=(
  ".env"
  "storage"
  "node_modules"
  "apps/web/.next"
  "apps/api/dist"
)

echo "Applying Media Hosting Phase 1 to: $TARGET"
echo "Backup directory: $BACKUP_DIR"

while IFS= read -r -d '' source; do
  rel="${source#"$SOURCE_DIR"/}"
  [[ "$rel" == "apply-replace.sh" || "$rel" == "MANIFEST.sha256" ]] && continue

  skip=0
  for item in "${PRESERVE[@]}"; do
    if [[ "$rel" == "$item" || "$rel" == "$item/"* ]]; then
      skip=1
      break
    fi
  done
  [[ "$skip" -eq 1 ]] && continue

  destination="$TARGET/$rel"
  if [[ -f "$destination" ]]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    cp -a "$destination" "$BACKUP_DIR/$rel"
  fi

  mkdir -p "$(dirname "$destination")"
  cp -a "$source" "$destination"
done < <(find "$SOURCE_DIR" -type f -print0)

chmod +x "$TARGET/apply-replace.sh"

echo
echo "Phase 1 applied."
echo "Preserved: .env, storage, node_modules, .next, dist"
echo "Next:"
echo "  cd \"$TARGET\""
echo "  cp -n .env.example .env"
echo "  pnpm install"
echo "  pnpm db:generate"
echo "  pnpm db:migrate"
echo "  pnpm dev"
