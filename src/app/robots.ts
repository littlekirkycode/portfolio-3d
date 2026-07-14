import type { MetadataRoute } from "next";

/** Required under output:'export' — render this route at build time. */
export const dynamic = "force-static";

/**
 * robots.txt via the App Router file convention. Compiles to a static GET
 * route handler at build, which output:'export' renders to out/robots.txt
 * (static-exports.md: "Route Handlers will render a static response when
 * running next build").
 *
 * Note: GitHub Pages serves this project under /portfolio-3d/, so the file
 * lands at /portfolio-3d/robots.txt. Crawlers only honour robots.txt at the
 * domain root (owned by the user's littlekirkycode.github.io root repo), but
 * shipping it is harmless and the Sitemap line is still discoverable when
 * the sitemap URL is submitted to Search Console.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://littlekirkycode.github.io/portfolio-3d/sitemap.xml",
  };
}
