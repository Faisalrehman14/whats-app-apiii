import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "ffmpeg-static"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
