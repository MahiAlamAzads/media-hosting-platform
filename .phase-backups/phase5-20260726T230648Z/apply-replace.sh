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
BACKUP_DIR="$TARGET/.phase-backups/phase4-fix-$STAMP"

if [[ "$TARGET" == "/" || "$TARGET" == "$HOME" ]]; then
  echo "Refusing unsafe target: $TARGET" >&2
  exit 65
fi

for required in \
  "apps/api/src/shared/api-key.ts" \
  "apps/api/src/test/setup-env.ts"
do
  if [[ ! -f "$TARGET/$required" ]]; then
    echo "Missing expected file: $TARGET/$required" >&2
    exit 66
  fi
done

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
echo "Phase 4 compile/test fix applied."
echo "Backup: $BACKUP_DIR"
echo
echo "Preserved: .env, migrations, storage, PostgreSQL data"
echo
echo "Run:"
echo "  cd \"$TARGET\""
echo "  pnpm db:generate"
echo "  pnpm typecheck"
echo "  pnpm test"
echo "  pnpm build"
