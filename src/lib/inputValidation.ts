/**
 * SECURITY FIX: Comprehensive input validation utilities
 * Provides robust validation for all user inputs to prevent security vulnerabilities
 */

import { NextRequest } from 'next/server'; // SECURITY FIX: Import NextRequest type

// Password validation configuration
export const PASSWORD_CONFIG = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SPECIAL_CHARS: true,
  SPECIAL_CHARS: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

// Username validation configuration
export const USERNAME_CONFIG = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 50,
  ALLOWED_CHARS: /^[a-zA-Z0-9_-]+$/, // Only alphanumeric, underscore, and hyphen
};

// General input limits
export const INPUT_LIMITS = {
  MAX_STRING_LENGTH: 1000,
  MAX_TEXT_LENGTH: 5000,
  MAX_REQUEST_SIZE: 1024 * 1024, // 1MB
};

/**
 * Validates username format and security requirements
 * SECURITY FIX: Made less restrictive to allow existing usernames
 */
export function validateUsername(username: string): { isValid: boolean; error?: string } {
  if (!username || typeof username !== 'string') {
    return { isValid: false, error: 'Username is required and must be a string.' };
  }

  const trimmed = username.trim();
  
  if (trimmed.length < 1) { // SECURITY FIX: Reduced minimum length to 1
    return { isValid: false, error: 'Username is required.' };
  }
  
  if (trimmed.length > USERNAME_CONFIG.MAX_LENGTH) {
    return { isValid: false, error: `Username must not exceed ${USERNAME_CONFIG.MAX_LENGTH} characters.` };
  }
  
  // SECURITY FIX: More permissive character validation - allow most characters except dangerous ones
  // Only block clearly dangerous patterns, not restrict to specific character sets
  
  // Check for dangerous SQL injection patterns (but be less restrictive)
  const dangerousPatterns = [
    /(union\s+select|drop\s+table|delete\s+from|insert\s+into)/i, // SQL injection keywords with spaces
    /<script[^>]*>/i, // Script tags
    /javascript:/i, // JavaScript protocol
    /on\w+\s*=/i, // Event handlers like onclick=
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      return { isValid: false, error: 'Username contains invalid characters.' };
    }
  }
  
  return { isValid: true };
}

/**
 * Validates password strength and security requirements
 */
export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { isValid: false, error: 'Password is required and must be a string.' };
  }
  
  if (password.length < PASSWORD_CONFIG.MIN_LENGTH) {
    return { isValid: false, error: `Password must be at least ${PASSWORD_CONFIG.MIN_LENGTH} characters long.` };
  }
  
  if (password.length > PASSWORD_CONFIG.MAX_LENGTH) {
    return { isValid: false, error: `Password must not exceed ${PASSWORD_CONFIG.MAX_LENGTH} characters.` };
  }
  
  if (PASSWORD_CONFIG.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one uppercase letter.' };
  }
  
  if (PASSWORD_CONFIG.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one lowercase letter.' };
  }
  
  if (PASSWORD_CONFIG.REQUIRE_NUMBERS && !/[0-9]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one number.' };
  }
  
  if (PASSWORD_CONFIG.REQUIRE_SPECIAL_CHARS) {
    const specialCharsRegex = new RegExp(`[${PASSWORD_CONFIG.SPECIAL_CHARS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
    if (!specialCharsRegex.test(password)) {
      return { isValid: false, error: `Password must contain at least one special character (${PASSWORD_CONFIG.SPECIAL_CHARS}).` };
    }
  }
  
  // Check for common weak passwords
  const weakPasswords = [
    'password', '12345678', 'qwerty123', 'admin123', 'letmein123',
    'welcome123', 'password123', '123456789', 'qwertyuiop'
  ];
  
  if (weakPasswords.includes(password.toLowerCase())) {
    return { isValid: false, error: 'Password is too common. Please choose a stronger password.' };
  }
  
  return { isValid: true };
}

/**
 * Validates email format (if needed in the future)
 */
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email is required and must be a string.' };
  }
  
  const trimmed = email.trim().toLowerCase();
  
  if (trimmed.length > 254) { // RFC 5321 limit
    return { isValid: false, error: 'Email address is too long.' };
  }
  
  // RFC 5322 compliant email regex (simplified but robust)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Please enter a valid email address.' };
  }
  
  return { isValid: true };
}

/**
 * Validates token format
 */
export function validateToken(token: string): { isValid: boolean; error?: string } {
  if (!token || typeof token !== 'string') {
    return { isValid: false, error: 'Token is required and must be a string.' };
  }
  
  const trimmed = token.trim();
  
  if (trimmed.length < 10) {
    return { isValid: false, error: 'Token format is invalid.' };
  }
  
  if (trimmed.length > 500) {
    return { isValid: false, error: 'Token is too long.' };
  }
  
  // Check for basic token format (alphanumeric and common token characters)
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return { isValid: false, error: 'Token contains invalid characters.' };
  }
  
  return { isValid: true };
}

/**
 * Sanitizes string input to prevent XSS and injection attacks
 */
export function sanitizeString(input: string, maxLength: number = INPUT_LIMITS.MAX_STRING_LENGTH): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>'"&]/g, (char) => {
      switch (char) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#x27;';
        case '&': return '&amp;';
        default: return char;
      }
    });
}

/**
 * Validates general string input
 */
export function validateStringInput(
  input: string, 
  fieldName: string, 
  minLength: number = 1, 
  maxLength: number = INPUT_LIMITS.MAX_STRING_LENGTH,
  required: boolean = true
): { isValid: boolean; error?: string; sanitized?: string } {
  
  if (!input || typeof input !== 'string') {
    if (required) {
      return { isValid: false, error: `${fieldName} is required and must be a string.` };
    }
    return { isValid: true, sanitized: '' };
  }
  
  const trimmed = input.trim();
  
  if (required && trimmed.length < minLength) {
    return { isValid: false, error: `${fieldName} must be at least ${minLength} characters long.` };
  }
  
  if (trimmed.length > maxLength) {
    return { isValid: false, error: `${fieldName} must not exceed ${maxLength} characters.` };
  }
  
  const sanitized = sanitizeString(trimmed, maxLength);
  
  return { isValid: true, sanitized };
}

/**
 * Validates numeric input
 */
export function validateNumericInput(
  input: any, 
  fieldName: string, 
  min?: number, 
  max?: number,
  required: boolean = true
): { isValid: boolean; error?: string; value?: number } {
  
  if (input === null || input === undefined || input === '') {
    if (required) {
      return { isValid: false, error: `${fieldName} is required.` };
    }
    return { isValid: true, value: undefined };
  }
  
  const num = Number(input);
  
  if (isNaN(num) || !isFinite(num)) {
    return { isValid: false, error: `${fieldName} must be a valid number.` };
  }
  
  if (min !== undefined && num < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min}.` };
  }
  
  if (max !== undefined && num > max) {
    return { isValid: false, error: `${fieldName} must not exceed ${max}.` };
  }
  
  return { isValid: true, value: num };
}

/**
 * Validates request body size
 */
export function validateRequestSize(request: NextRequest): { isValid: boolean; error?: string } {
  const contentLength = request.headers.get('content-length');
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > INPUT_LIMITS.MAX_REQUEST_SIZE) {
      return { 
        isValid: false, 
        error: `Request size (${size} bytes) exceeds maximum allowed size (${INPUT_LIMITS.MAX_REQUEST_SIZE} bytes).` 
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Comprehensive input validation for authentication requests
 */
export function validateAuthInput(data: any): { 
  isValid: boolean; 
  errors: string[]; 
  sanitized?: { username: string; password: string; token?: string } 
} {
  const errors: string[] = [];
  
  // Validate username
  const usernameValidation = validateUsername(data.username);
  if (!usernameValidation.isValid) {
    errors.push(usernameValidation.error!);
  }
  
  // Validate password
  const passwordValidation = validatePassword(data.password);
  if (!passwordValidation.isValid) {
    errors.push(passwordValidation.error!);
  }
  
  // Validate token if provided
  let tokenValid = true;
  if (data.token) {
    const tokenValidation = validateToken(data.token);
    if (!tokenValidation.isValid) {
      errors.push(tokenValidation.error!);
      tokenValid = false;
    }
  }
  
  if (errors.length > 0) {
    return { isValid: false, errors };
  }
  
  return {
    isValid: true,
    errors: [],
    sanitized: {
      username: data.username.trim().toLowerCase(),
      password: data.password,
      token: tokenValid && data.token ? data.token.trim() : undefined
    }
  };
}
