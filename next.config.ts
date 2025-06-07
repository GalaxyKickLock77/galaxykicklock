// SECURITY FIX: Enhanced Next.js configuration with security headers and CORS
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Disable ESLint during the build
  },
  
  // SECURITY FIX: Add security headers at the framework level
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
      {
        // More restrictive headers for API routes
        source: '/api/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        // CSP for pages (not API routes to avoid conflicts)
        source: '/((?!api).*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: process.env.NODE_ENV === 'production' 
              ? [
                  "default-src 'self'",
                  "script-src 'self'",
                  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                  "img-src 'self' data: https:",
                  "font-src 'self' data: https://fonts.gstatic.com",
                  "connect-src 'self' https://sarsafeqetopciqjhzrt.supabase.co wss://sarsafeqetopciqjhzrt.supabase.co",
                  "frame-ancestors 'none'",
                  "base-uri 'self'",
                  "form-action 'self'",
                  "object-src 'none'",
                  "media-src 'self'",
                  "worker-src 'self'",
                  "child-src 'self'"
                ].join('; ')
              : [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                  "img-src 'self' data: https: blob:",
                  "font-src 'self' data: https://fonts.gstatic.com",
                  "connect-src 'self' https://sarsafeqetopciqjhzrt.supabase.co wss://sarsafeqetopciqjhzrt.supabase.co ws://localhost:* ws://127.0.0.1:*",
                  "frame-ancestors 'none'",
                  "base-uri 'self'",
                  "form-action 'self'",
                  "object-src 'none'",
                  "media-src 'self'",
                  "worker-src 'self' blob:",
                  "child-src 'self'"
                ].join('; ')
          },
        ],
      },
    ];
  },
  
  // SECURITY FIX: Additional security configurations
  poweredByHeader: false, // Remove X-Powered-By header
  
  // Compress responses for better performance
  compress: true,
  
  // SECURITY FIX: Configure redirects for security
  async redirects() {
    return [
      // Add any security-related redirects here if needed
    ];
  },
  
  // SECURITY FIX: Configure rewrites if needed
  async rewrites() {
    return [
      // Add any security-related rewrites here if needed
    ];
  },
  
  // SECURITY FIX: Environment variable validation
  env: {
    // Only expose necessary environment variables to the client
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  
  // SECURITY FIX: Webpack configuration for additional security
  webpack: (config: any, { buildId, dev, isServer, defaultLoaders, webpack }: any) => {
    // Add any webpack security configurations here
    
    // SECURITY FIX: Validate CORS configuration during build
    if (!dev && isServer) {
      try {
        const { validateCorsConfiguration } = require('./src/lib/corsConfig');
        const validation = validateCorsConfiguration();
        
        if (validation.errors.length > 0) {
          console.error('CORS Configuration Errors:');
          validation.errors.forEach((error: string) => console.error(`  - ${error}`));
          
          if (process.env.NODE_ENV === 'production') {
            throw new Error('CORS configuration has errors in production build');
          }
        }
        
        if (validation.warnings.length > 0) {
          console.warn('CORS Configuration Warnings:');
          validation.warnings.forEach((warning: string) => console.warn(`  - ${warning}`));
        }
      } catch (error) {
        console.warn('Could not validate CORS configuration during build:', error);
      }
    }
    
    return config;
  },
};

module.exports = nextConfig;