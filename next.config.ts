import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import path from "path";
import {
  CROSS_ORIGIN_OPENER_POLICY_HEADER,
  CROSS_ORIGIN_RESOURCE_POLICY_HEADER,
  ORIGIN_AGENT_CLUSTER_HEADER,
  PERMISSIONS_POLICY_HEADER,
} from "./lib/runtime/security-headers";
import { shouldSendNoIndexHeader } from "./lib/runtime/deployment-env";

initOpenNextCloudflareForDev(process.env.NEXT_PUBLIC_RUNTIME_MODE === "development" && process.env.DAO_PUBLICATION_LOCAL_STATE
  ? { persist: { path: process.env.DAO_PUBLICATION_LOCAL_STATE } } : undefined);

interface WebpackConfig {
  resolve?: {
    fallback?: Record<string, boolean>;
    alias?: Record<string, boolean | string>;
  };
}

const sendNoIndexHeader = shouldSendNoIndexHeader();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["dao-beta.dao-ops.com"],
  output: "standalone",
  async headers() {
    const headers = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: PERMISSIONS_POLICY_HEADER,
      },
      {
        key: "Cross-Origin-Opener-Policy",
        value: CROSS_ORIGIN_OPENER_POLICY_HEADER,
      },
      {
        key: "Cross-Origin-Resource-Policy",
        value: CROSS_ORIGIN_RESOURCE_POLICY_HEADER,
      },
      {
        key: "Origin-Agent-Cluster",
        value: ORIGIN_AGENT_CLUSTER_HEADER,
      },
    ];

    if (sendNoIndexHeader) {
      headers.push({
        key: "X-Robots-Tag",
        value: "noindex, nofollow",
      });
    }

    return [
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-Requested-With",
          },
        ],
      },
      {
        source: "/(.*)",
        headers,
      },
    ];
  },

  webpack: (config: WebpackConfig, { isServer }: { isServer: boolean }) => {
    config.resolve = config.resolve || {};

    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        net: false,
        tls: false,
      };
    }

    const emptyStub = path.resolve(__dirname, "lib/stubs/empty.ts");
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "pino-pretty": emptyStub,
      "@react-native-async-storage/async-storage": emptyStub,
      lokijs: false,
      encoding: false,
    };
    return config;
  },
};

export default nextConfig;
