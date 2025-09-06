import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Build sırasında lint/TS hatalarına takılma
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
