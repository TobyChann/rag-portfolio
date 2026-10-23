import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/profile";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/match`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/stack`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
