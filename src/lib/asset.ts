/**
 * Prefix an absolute public-asset path (e.g. "/models/foo.glb") with the
 * deploy base path so it resolves under GitHub Pages' /<repo>/ subpath.
 * No-op when NEXT_PUBLIC_BASE_PATH is empty (local dev / root deploy).
 * Inlined at build time since it's a NEXT_PUBLIC_ var.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function withBase(path: string): string {
  if (!path.startsWith("/")) return path;
  return `${BASE}${path}`;
}
