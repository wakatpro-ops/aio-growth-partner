import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Preserve old bookmarks, query feedback and history/task deep links.
    return [
      { source: "/stores/:storeId/aio-improvement", destination: "/stores/:storeId/marketing/aio-improvement", permanent: false },
      { source: "/stores/:storeId/aio-improvement/:path+", destination: "/stores/:storeId/marketing/aio-improvement/:path+", permanent: false }
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4.5mb"
    }
  }
};

export default nextConfig;
