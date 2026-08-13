import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the dev-only "N" indicator badge (route/bundler info popover) that
  // next dev injects in the browser. Dev-only tooling — it's never present
  // in a production build/deploy regardless of this setting, but it's
  // distracting while working locally.
  devIndicators: false,
};

export default nextConfig;
