/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@operion/shared"],
  poweredByHeader: false,
  typedRoutes: true
};

export default nextConfig;
