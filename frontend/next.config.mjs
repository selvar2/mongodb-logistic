/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Note: NEXT_PUBLIC_* vars are auto-exposed by Next.js. We intentionally do
  // NOT hardcode a fallback here — when NEXT_PUBLIC_API_BASE is unset the client
  // auto-detects the forwarded backend host in Codespaces (see lib/api.ts).
};
export default nextConfig;
