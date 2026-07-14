import type { MetadataRoute } from "next";

/** Required under output:'export' — render this route at build time. */
export const dynamic = "force-static";

/**
 * sitemap.xml via the App Router file convention — a static GET route handler
 * rendered to out/sitemap.xml under output:'export' (see static-exports.md
 * "Route Handlers"). Single-page site: one canonical URL.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://littlekirkycode.github.io/portfolio-3d/",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
