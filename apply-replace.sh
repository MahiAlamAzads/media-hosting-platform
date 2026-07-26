#!/usr/bin/env bash
set -Eeuo pipefail
TARGET="${1:-}"
[[ -n "$TARGET" ]] || { echo "Usage: $0 /absolute/path/to/media-hosting-platform" >&2; exit 64; }
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$(cd "$TARGET" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$TARGET/.phase-backups/phase7-auth-$STAMP"
[[ "$TARGET" != "/" && "$TARGET" != "$HOME" ]] || { echo "Unsafe target" >&2; exit 65; }
[[ -f "$TARGET/package.json" && -d "$TARGET/apps/api" && -d "$TARGET/apps/web" ]] || { echo "Wrong project target" >&2; exit 66; }
mkdir -p "$BACKUP_DIR"
while IFS= read -r -d '' source; do
  rel="${source#"$SOURCE_DIR"/}"
  [[ "$rel" == "MANIFEST.sha256" ]] && continue
  dest="$TARGET/$rel"
  if [[ -f "$dest" ]]; then mkdir -p "$BACKUP_DIR/$(dirname "$rel")"; cp -a "$dest" "$BACKUP_DIR/$rel"; fi
  mkdir -p "$(dirname "$dest")"
  cp -a "$source" "$dest"
done < <(find "$SOURCE_DIR" -type f -print0)
chmod +x "$TARGET/apply-replace.sh"
echo "Phase 7 auth completion applied."
echo "Backup: $BACKUP_DIR"
echo "Preserved: .env, existing migrations, PostgreSQL data, media storage"
echo "Run: pnpm install && pnpm db:generate && pnpm db:deploy && pnpm db:check && pnpm typecheck && pnpm test && pnpm build"
