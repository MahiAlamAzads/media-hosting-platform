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
BACKUP_DIR="$TARGET/.phase-backups/phase3-$STAMP"

if [[ "$TARGET" == "/" || "$TARGET" == "$HOME" ]]; then
  echo "Refusing unsafe target: $TARGET" >&2
  exit 65
fi

if [[ ! -f "$TARGET/package.json" || ! -d "$TARGET/apps/api" || ! -d "$TARGET/packages/database/prisma" ]]; then
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

if [[ -f "$TARGET/.env" ]] && ! grep -q '^MEDIA_SIGNING_SECRET=' "$TARGET/.env"; then
  SIGNING_SECRET="$(openssl rand -base64 64 | tr -d '\n')"
  {
    echo
    echo "MEDIA_SIGNING_SECRET=$SIGNING_SECRET"
    echo "DELIVERY_TOKEN_TTL_SECONDS=900"
  } >> "$TARGET/.env"
  echo "Generated MEDIA_SIGNING_SECRET in existing .env."
fi

chmod +x "$TARGET/apply-replace.sh"

echo
echo "Media Hosting Phase 3 applied."
echo "Backup: $BACKUP_DIR"
echo
echo "Preserved:"
echo "  existing .env values"
echo "  existing migrations"
echo "  storage"
echo "  PostgreSQL data"
echo
echo "Run:"
echo "  cd \"$TARGET\""
echo "  pnpm install"
echo "  pnpm db:generate"
echo "  pnpm db:deploy"
echo "  pnpm db:check"
echo "  pnpm typecheck"
echo "  pnpm build"
