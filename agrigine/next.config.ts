import type { NextConfig } from "next";

// A static export: `npm run build` writes plain files to out/, which Cloudflare Pages serves for free.
// There is no Next.js server, so server-only features (cacheComponents, partial prefetching) stay off.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
