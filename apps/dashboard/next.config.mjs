import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@operion/shared"],
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    middlewareClientMaxBodySize: "55mb"
  },
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          }
        ]
      }
    ];
  },
  async redirects() {
    return [
      {
        source: "/dashboard/:path*",
        destination: "/thank-you?source=deprecated_merchant_portal",
        permanent: false
      },
      {
        source: "/application-status/:path*",
        destination: "/thank-you?source=deprecated_merchant_portal",
        permanent: false
      },
      {
        source: "/settings/:path*",
        destination: "/thank-you?source=deprecated_merchant_portal",
        permanent: false
      },
      {
        source: "/login",
        destination: "/apply?source=merchant_auth_removed",
        permanent: false
      },
      {
        source: "/signin",
        destination: "/apply?source=merchant_auth_removed",
        permanent: false
      },
      {
        source: "/signup",
        destination: "/apply?source=merchant_auth_removed",
        permanent: false
      },
      {
        source: "/forgot-password",
        destination: "/apply?source=merchant_auth_removed",
        permanent: false
      },
      {
        source: "/reset-password",
        destination: "/apply?source=merchant_auth_removed",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
