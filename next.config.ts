import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is opened via the loopback IP for the Spotify OAuth redirect
  // (Spotify rejects "localhost" redirect URIs), so allow it in dev.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
