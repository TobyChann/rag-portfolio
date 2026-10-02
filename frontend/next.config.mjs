/** @type {import('next').NextConfig} */
const nextConfig = {
  // In production the browser only talks to this site: /api/* is forwarded to
  // the FastAPI backend (BACKEND_URL, e.g. https://toby-api.duckdns.org). That
  // keeps the admin session cookie first-party — a cookie set by a different
  // domain would be a third-party cookie, which browsers block — and means no
  // CORS. Set NEXT_PUBLIC_API_URL=/api alongside it. Locally BACKEND_URL is
  // unset and the browser calls the backend directly via NEXT_PUBLIC_API_URL.
  async rewrites() {
    const backend = process.env.BACKEND_URL;
    if (!backend) return [];
    return [{ source: "/api/:path*", destination: `${backend.replace(/\/$/, "")}/api/:path*` }];
  },
};

export default nextConfig;
