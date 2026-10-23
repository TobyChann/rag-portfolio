import type { MetadataRoute } from "next";
import { serverFetch } from "@/lib/api";
import { SITE_URL } from "@/lib/profile";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { docs } = await serverFetch<{ docs: { google_doc_id: string; last_synced_at: string | null }[] }>(
    "/portfolio", { docs: [] });
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/match`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/stack`, changeFrequency: "monthly", priority: 0.6 },
    ...docs.map(d => ({
      url: `${SITE_URL}/notes/${d.google_doc_id}`,
      lastModified: d.last_synced_at ? new Date(d.last_synced_at) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
