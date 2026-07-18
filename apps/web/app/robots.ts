import type { MetadataRoute } from "next";

// The `/l/<id>` bouncer URLs are capability pointers, not content — they must never
// be crawled, indexed, or cached by search engines. Everything else is public.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/l/",
    },
  };
}
