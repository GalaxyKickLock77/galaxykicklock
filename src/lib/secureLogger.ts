/**
 * SECURITY FIX: Secure logging utility
 * Prevents exposure of sensitive information in logs while maintaining debugging capabilities
 */

// Sensitive patterns that should be masked in logs
const SENSITIVE_PATTERNS = [
  // Tokens and API keys
  { pattern: /token [a-zA-Z0-9_-]+/gi, replacement: 'token [MASKED]' },
  { pattern: /Bearer [a-zA-Z0-9_-]+/gi, replacement: 'Bearer [MASKED]' },
  { pattern: /github_pat_[a-zA-Z0-9_-]+/gi, replacement: 'github_pat_[MASKED]' },
  { pattern: /key_[a-zA-Z0-9_-]+/gi, replacement: 'key_[MASKED]' },
  
  // URLs with sensitive information
  { pattern: /https:\/\/api\.github\.com\/repos\/[^\/\s]+\/[^\/\s]+/gi, replacement: 'https://api.github.com/repos/[ORG]/[REPO]' },
  { pattern: /\/repos\/[^\/\s]+\/[^\/\s]+/gi, replacement: '/repos/[ORG]/[REPO]' },
  
  // Database connection strings
  { pattern: /postgresql:\/\/[^@\s]+@[^\/\s]+/gi, replacement: 'postgresql://[USER]@[HOST]' },
  { pattern: /supabase\.co\/[^\/\s]+/gi, replacement: 'supabase.co/[PROJECT]' },
  
  // User identifiers (but keep structure for debugging)
  { pattern: /user_[a-zA-Z0-9_-]+/gi, replacement: 'user_[ID]' },
  { pattern: /userId:\s*[a-zA-Z0-9_-]+/gi, replacement: 'userId: [ID]' },
  
  // IP addresses
  { pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, replacement: '[IP]' },
  
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  
  // Session IDs and similar
  { pattern: /session[_-]?id[:\s]*[a-zA-Z0-9_-]+/gi, replacement: 'session_id: [MASKED]' },
  { pattern: /sessionId[:\s]*[a-zA-Z0-9_-]+/gi, replacement: 'sessionId: [MASKED]' },
];

/**
 * Masks sensitive information in a string
 */
function maskSensitiveData(text: string): string {
  let maskedText = text;
  
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    maskedText = maskedText.replace(pattern, replacement);
  }
  
  return maskedText;
}

/**
 * Sanitizes an object by masking sensitive values
 */
function sanitizeObject(obj: any, maxDepth: number = 3, currentDepth: number = 0): any {
  if (currentDepth >= maxDepth) {
    return '[MAX_DEPTH_REACHED]';
  }
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return maskSensitiveData(obj);
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    const keys = Object.keys(obj).slice(0, 20); // Limit number of keys
    
    for (const key of keys) {
      // Skip potentially sensitive keys entirely
      if (/password|secret|token|key|auth|credential/i.test(key)) {
        sanitized[key] = '[SENSITIVE_FIELD_MASKED]';
      } else {
        sanitized[key] = sanitizeObject(obj[key], maxDepth, currentDepth + 1);
      }
    }
    
    if (Object.keys(obj).length > 20) {
      sanitized['[TRUNCATED]'] = `${Object.keys(obj).length - 20} more keys`;
    }
    
    return sanitized;
  }
  
  return '[UNKNOWN_TYPE]';
}

/**
 * Secure logging levels
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Secure logger class
 */
export class SecureLogger {
  private static instance: SecureLogger;
  private logLevel: LogLevel = 'info';
  
  private constructor() {}
  
  static getInstance(): SecureLogger {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger();
    }
    return SecureLogger.instance;
  }
  
  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }
  
  private shouldLog(level: LogLevel): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    return requestedLevelIndex >= currentLevelIndex;
  }
  
  private formatMessage(level: LogLevel, message: string, context?: string): string {
    const timestamp = new Date().toISOString();
    const prefix = context ? `[${context}]` : '';
    return `${timestamp} [${level.toUpperCase()}] ${prefix} ${maskSensitiveData(message)}`;
  }
  
  error(message: string, data?: any, context?: string) {
    if (!this.shouldLog('error')) return;
    
    const formattedMessage = this.formatMessage('error', message, context);
    
    if (data) {
      const sanitizedData = sanitizeObject(data);
      console.error(formattedMessage, { sanitized: sanitizedData });
    } else {
      console.error(formattedMessage);
    }
  }
  
  warn(message: string, data?: any, context?: string) {
    if (!this.shouldLog('warn')) return;
    
    const formattedMessage = this.formatMessage('warn', message, context);
    
    if (data) {
      const sanitizedData = sanitizeObject(data);
      console.warn(formattedMessage, { sanitized: sanitizedData });
    } else {
      console.warn(formattedMessage);
    }
  }
  
  info(message: string, data?: any, context?: string) {
    if (!this.shouldLog('info')) return;
    
    const formattedMessage = this.formatMessage('info', message, context);
    
    if (data) {
      const sanitizedData = sanitizeObject(data);
      console.info(formattedMessage, { sanitized: sanitizedData });
    } else {
      console.info(formattedMessage);
    }
  }
  
  debug(message: string, data?: any, context?: string) {
    if (!this.shouldLog('debug')) return;
    
    const formattedMessage = this.formatMessage('debug', message, context);
    
    if (data) {
      const sanitizedData = sanitizeObject(data);
      console.debug(formattedMessage, { sanitized: sanitizedData });
    } else {
      console.debug(formattedMessage);
    }
  }
}

// Export singleton instance for easy use
export const secureLogger = SecureLogger.getInstance();

// Convenience functions for direct use
export const secureLog = {
  error: (message: string, data?: any, context?: string) => secureLogger.error(message, data, context),
  warn: (message: string, data?: any, context?: string) => secureLogger.warn(message, data, context),
  info: (message: string, data?: any, context?: string) => secureLogger.info(message, data, context),
  debug: (message: string, data?: any, context?: string) => secureLogger.debug(message, data, context),
};
