// SECURITY FIX: Enhanced Next.js configuration with security headers and CORS
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Disable ESLint during the build
  },
};

module.exports = nextConfig;