import type { NextConfig } from "next";

const native = process.env.TTG_NATIVE === "1";

const nextConfig: NextConfig = native
  ? {
      output: "export",
      distDir: "out",
      images: { unoptimized: true },
      trailingSlash: true,
    }
  : {};

export default nextConfig;
