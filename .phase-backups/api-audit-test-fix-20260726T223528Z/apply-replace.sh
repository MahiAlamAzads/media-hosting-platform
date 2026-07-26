#!/usr/bin/env bash
set -Eeuo pipefail

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 /absolute/path/to/media-hosting-platform" >&2
  exit 64
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$(cd "$TARGET" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$TARGET/.phase-backups/oop-tests-$STAMP"

if [[ "$TARGET" == "/" || "$TARGET" == "$HOME" ]]; then
  echo "Refusing unsafe target: $TARGET" >&2
  exit 65
fi

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/apps/api/src/modules/delivery" ]]; then
  echo "Target does not look like the Phase 3 Media Hosting Platform project." >&2
  exit 66
fi

mkdir -p "$BACKUP_DIR"

while IFS= read -r -d '' source; do
  rel="${source#"$SOURCE_DIR"/}"
  [[ "$rel" == "MANIFEST.sha256" ]] && continue

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
echo "OOP modular backend and test patch applied."
echo "Backup: $BACKUP_DIR"
echo
echo "Preserved:"
echo "  .env"
echo "  migrations"
echo "  storage"
echo "  PostgreSQL data"
echo
echo "Run:"
echo "  cd \"$TARGET\""
echo "  pnpm install"
echo "  pnpm db:generate"
echo "  pnpm typecheck"
echo "  pnpm test"
echo "  pnpm build"
