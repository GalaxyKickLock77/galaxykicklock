/**
 * SECURITY FIX: Security configuration for the application
 * Centralizes security settings and provides security utilities
 */

module.exports = {
  // Security audit configuration
  audit: {
    // Vulnerability levels to check
    levels: ['critical', 'high', 'moderate'],
    
    // Packages to exclude from audit (if they have acceptable risks)
    exclude: [
      // Add package names here if needed
    ],
    
    // Maximum age for vulnerabilities (in days)
    maxAge: 30,
  },
  
  // Dependency management
  dependencies: {
    // Allowed licenses
    allowedLicenses: [
      'MIT',
      'Apache-2.0',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'ISC',
      'CC0-1.0',
      'Unlicense'
    ],
    
    // Blocked packages (known security issues)
    blockedPackages: [
      'lodash@<4.17.21',
      'moment@<2.29.4',
      'axios@<0.21.2',
      'node-fetch@<2.6.7'
    ],
  },
  
  // Security headers configuration
  headers: {
    // Content Security Policy
    csp: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      'img-src': ["'self'", "data:", "https:", "blob:"],
      'font-src': ["'self'", "data:", "https://fonts.gstatic.com"],
      'connect-src': ["'self'", "https://sarsafeqetopciqjhzrt.supabase.co", "wss://sarsafeqetopciqjhzrt.supabase.co"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'object-src': ["'none'"],
      'media-src': ["'self'"],
      'worker-src': ["'self'", "blob:"],
      'child-src': ["'self'"]
    },
    
    // Other security headers
    other: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
    }
  },
  
  // Rate limiting configuration
  rateLimit: {
    // API endpoints
    api: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
    
    // Authentication endpoints
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // limit each IP to 5 requests per windowMs
    },
    
    // Admin endpoints
    admin: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // limit each IP to 10 requests per windowMs
    }
  },
  
  // Input validation configuration
  validation: {
    // Maximum input lengths
    maxLengths: {
      username: 50,
      password: 128,
      email: 254,
      token: 500,
      general: 1000
    },
    
    // Allowed characters patterns
    patterns: {
      username: /^[a-zA-Z0-9_-]+$/,
      alphanumeric: /^[a-zA-Z0-9]+$/,
      email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    }
  },
  
  // Encryption configuration
  encryption: {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16,
    tagLength: 16
  },
  
  // Session configuration
  session: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict'
  }
};
