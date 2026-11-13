import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `img-src 'self' data: blob: ${process.env.NEXT_PUBLIC_SUPABASE_URL || ""}`,
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "form-action 'self'"
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    qualities: [65, 75],
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL ? [{ protocol: "https", hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname }] : []
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" }
      ]
    }];
  }
};

export default nextConfig;
