import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@operion/shared"],
  poweredByHeader: false,
  typedRoutes: true,
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
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
