import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  env: {
    // Compile the test bridge away unless build:e2e explicitly opts in.
    NEXT_PUBLIC_ENABLE_E2E_BRIDGE:
      process.env.NEXT_PUBLIC_ENABLE_E2E_BRIDGE ?? "false",
  },
};

export default withNextIntl(nextConfig);
