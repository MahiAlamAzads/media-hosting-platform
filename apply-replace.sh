#!/usr/bin/env bash
set -Eeuo pipefail
TARGET="${1:-}"
[[ -n "$TARGET" ]] || { echo "Usage: $0 /absolute/path/to/media-hosting-platform" >&2; exit 64; }
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$(cd "$TARGET" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$TARGET/.phase-backups/bootstrap-frontend-$STAMP"
[[ "$TARGET" != "/" && "$TARGET" != "$HOME" ]] || { echo "Unsafe target" >&2; exit 65; }
[[ -f "$TARGET/apps/web/package.json" && -d "$TARGET/apps/web/src" ]] || { echo "Target does not contain apps/web" >&2; exit 66; }

mkdir -p "$BACKUP_DIR/apps/web"
cp -a "$TARGET/apps/web/package.json" "$BACKUP_DIR/apps/web/package.json"
cp -a "$TARGET/apps/web/src" "$BACKUP_DIR/apps/web/src"

rm -rf "$TARGET/apps/web/src"
mkdir -p "$TARGET/apps/web"
cp -a "$SOURCE_DIR/apps/web/src" "$TARGET/apps/web/src"
cp -a "$SOURCE_DIR/apps/web/package.json" "$TARGET/apps/web/package.json"
cp -a "$SOURCE_DIR/README-BOOTSTRAP-FRONTEND.md" "$TARGET/README-BOOTSTRAP-FRONTEND.md"
cp -a "$SOURCE_DIR/apply-replace.sh" "$TARGET/apply-replace.sh"
chmod +x "$TARGET/apply-replace.sh"

echo
echo "Full Bootstrap frontend rewrite applied."
echo "Backup: $BACKUP_DIR"
echo "Preserved: backend, .env, database, migrations and media storage"
echo
echo "Run:"
echo "  cd \"$TARGET\""
echo "  pnpm install"
echo "  pnpm typecheck"
echo "  pnpm test"
echo "  pnpm build"
