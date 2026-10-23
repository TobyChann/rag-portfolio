// Lives outside /api on purpose: middleware.ts proxies every /api/* request
// to the backend. The backend POSTs here after curation writes and syncs.
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  revalidateTag("portfolio");
  return NextResponse.json({ ok: true, revalidated: "portfolio" });
}
