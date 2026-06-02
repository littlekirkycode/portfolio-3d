import type { NextConfig } from "next";

// GitHub Pages serves a project site under /<repo>/. Set NEXT_PUBLIC_BASE_PATH
// (e.g. "/portfolio-3d") in CI; left empty for local dev / root deploys.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export", // static HTML export for GitHub Pages
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: true, // /route/ → route/index.html, friendlier on Pages
  images: { unoptimized: true }, // no server image optimizer on static hosting
};

export default nextConfig;
