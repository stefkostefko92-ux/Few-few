/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export (SSG) — the marketing/rules layer is fully prerendered and
  // crawlable (§15). The play app (Vite SPA) is a separate deploy target.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Transpile the shared workspace package.
  transpilePackages: ["@aso/shared"],
};

export default nextConfig;
