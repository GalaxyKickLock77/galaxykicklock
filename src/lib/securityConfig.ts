/**
 * SECURITY FIX: Centralized security configuration
 * Contains all security-related constants and configurations
 */

// Password security configuration
export const PASSWORD_SECURITY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SPECIAL_CHARS: true,
  SPECIAL_CHARS: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  SALT_ROUNDS: 12, // Increased from default 10
  WEAK_PASSWORDS: [
    'password', '12345678', 'qwerty123', 'admin123', 'letmein123',
    'welcome123', 'password123', '123456789', 'qwertyuiop',
    'abc123456', 'password1', 'admin1234', 'user12345'
  ]
};

// Username security configuration
export const USERNAME_SECURITY = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 50,
  ALLOWED_CHARS: /^[a-zA-Z0-9_-]+$/,
  RESERVED_NAMES: [
    'admin', 'administrator', 'root', 'system', 'api', 'www',
    'mail', 'email', 'support', 'help', 'info', 'contact',
    'user', 'guest', 'anonymous', 'null', 'undefined'
  ]
};

// Rate limiting configuration
export const RATE_LIMITING = {
  LOGIN_ATTEMPTS: {
    MAX_ATTEMPTS: 3,
    WINDOW_MS: 60 * 1000, // 1 minute
    BLOCK_DURATION_MS: 60 * 1000, // 1 minute
    COOLDOWN_AFTER_LOGOUT_MS: 30 * 1000, // 30 seconds
  },
  API_REQUESTS: {
    MAX_REQUESTS: 100,
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  },
  PASSWORD_RESET: {
    MAX_ATTEMPTS: 3,
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
  }
};

// Request size limits
export const REQUEST_LIMITS = {
  AUTH_REQUEST: 1024, // 1KB
  API_REQUEST: 100 * 1024, // 100KB
  UPLOAD_REQUEST: 10 * 1024 * 1024, // 10MB
  DEFAULT_REQUEST: 1024 * 1024, // 1MB
};

// Session security configuration
export const SESSION_SECURITY = {
  TOKEN_LENGTH: 48, // bytes for session tokens
  SESSION_DURATION: 24 * 60 * 60, // 24 hours in seconds
  ADMIN_SESSION_DURATION: 8 * 60 * 60, // 8 hours in seconds
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
  }
};

// Input validation patterns
export const VALIDATION_PATTERNS = {
  EMAIL: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  TOKEN: /^[a-zA-Z0-9._-]+$/,
  SAFE_STRING: /^[a-zA-Z0-9\s.\-_]+$/,
  SQL_INJECTION: [
    /['";\\|*%<>{}[\]]/i,
    /(union|select|insert|update|delete|drop|create|alter|exec|execute)/i,
    /(script|javascript|vbscript|onload|onerror)/i,
  ],
  XSS_PATTERNS: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
  ]
};

// Security headers configuration
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live", // SECURITY FIX: Added vercel.live for Next.js compatibility
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // SECURITY FIX: Allow Google Fonts
    "img-src 'self' data: https: blob:", // SECURITY FIX: Allow blob: for dynamic images
    "font-src 'self' data: https://fonts.gstatic.com", // SECURITY FIX: Allow Google Fonts and data URLs
    "connect-src 'self' https://sarsafeqetopciqjhzrt.supabase.co wss://sarsafeqetopciqjhzrt.supabase.co https://vercel.live wss://vercel.live", // SECURITY FIX: Added Vercel live reload
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'", // SECURITY FIX: Block object/embed tags
    "media-src 'self'", // SECURITY FIX: Restrict media sources
    "worker-src 'self' blob:", // SECURITY FIX: Allow service workers
    "child-src 'self'", // SECURITY FIX: Restrict child contexts
    "frame-src 'none'" // SECURITY FIX: Block frames
  ].join('; ')
};

// Error messages (generic to prevent information disclosure)
export const SECURITY_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid credentials provided.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  INVALID_INPUT: 'Invalid input provided.',
  UNAUTHORIZED: 'Authentication required.',
  FORBIDDEN: 'Access denied.',
  SERVER_ERROR: 'An unexpected error occurred.',
  INVALID_TOKEN: 'Invalid or expired token.',
  ACCOUNT_LOCKED: 'Account temporarily locked due to security reasons.',
};

// Logging configuration
export const SECURITY_LOGGING = {
  LOG_FAILED_LOGINS: true,
  LOG_RATE_LIMIT_HITS: true,
  LOG_INVALID_TOKENS: true,
  LOG_SUSPICIOUS_ACTIVITY: true,
  MASK_SENSITIVE_DATA: true,
};

// Feature flags for security features
export const SECURITY_FEATURES = {
  ENABLE_RATE_LIMITING: true,
  ENABLE_REQUEST_SIZE_LIMITS: true,
  ENABLE_INPUT_VALIDATION: true,
  ENABLE_SECURITY_HEADERS: true,
  ENABLE_CSRF_PROTECTION: true,
  ENABLE_XSS_PROTECTION: true,
  ENABLE_SQL_INJECTION_PROTECTION: true,
};
