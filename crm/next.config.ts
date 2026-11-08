import type { NextConfig } from "next";
const config: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};
export default config;
