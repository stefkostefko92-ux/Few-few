/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // No remote images: media is local (/uploads), brand assets are in /public.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // No "preload" until TLS is confirmed stable — preload is hard to reverse.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        // CSP everywhere EXCEPT /uploads: that route serves user-supplied files
        // and sets its own, far stricter policy ("default-src 'none'; sandbox").
        // Excluding it here keeps exactly one CSP source matching any path, so a
        // weaker global policy can never override the sandbox on uploaded files.
        source: "/((?!uploads/).*)",
        headers: [
          // Safe CSP directives that don't touch script/style-src (so Next's inline
          // bootstrap and the Facebook embed keep working). A full script-src CSP
          // needs per-request nonces — a separate, larger change.
          { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
