export function normalizeResourceName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function replacePathPrefix(
  pathKey: string,
  oldPrefix: string,
  newPrefix: string,
): string {
  if (pathKey === oldPrefix) return newPrefix;

  if (!pathKey.startsWith(`${oldPrefix}/`)) {
    return pathKey;
  }

  return `${newPrefix}${pathKey.slice(oldPrefix.length)}`;
}
