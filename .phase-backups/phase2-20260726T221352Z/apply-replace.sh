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
BACKUP_DIR="$TARGET/.phase-backups/phase1-pino-final-fix-$STAMP"

if [[ "$TARGET" == "/" || "$TARGET" == "$HOME" ]]; then
  echo "Refusing unsafe target: $TARGET" >&2
  exit 65
fi

if [[ ! -f "$TARGET/package.json" || ! -f "$TARGET/apps/api/src/app.ts" ]]; then
  echo "Target does not look like the Media Hosting Platform project." >&2
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
echo "Phase 1 final compile fix applied."
echo "Backup: $BACKUP_DIR"
echo
echo "Run:"
echo "  cd \"$TARGET\""
echo "  pnpm install"
echo "  pnpm rebuild argon2"
echo "  pnpm db:generate"
echo "  pnpm db:check"
echo "  pnpm typecheck"
echo "  pnpm build"
