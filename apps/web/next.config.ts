import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.2.109'],
  turbopack: {
    root: path.resolve(__dirname, "../..")
  }
};

export default nextConfig;
