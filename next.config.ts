import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel builds its own output — no standalone server needed here.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
