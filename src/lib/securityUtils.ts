/**
 * SECURITY FIX: Enhanced security utilities using security-focused packages
 * Provides additional security functions for input validation, sanitization, and protection
 */

import validator from 'validator';
import sanitizeHtml from 'sanitize-html';
import CryptoJS from 'crypto-js';
import { SignJWT, jwtVerify } from 'jose';

// Security configuration
const SECURITY_CONFIG = {
  // HTML sanitization options
  HTML_SANITIZE_OPTIONS: {
    allowedTags: [], // No HTML tags allowed
    allowedAttributes: {},
    disallowedTagsMode: 'discard' as const,
  },
  
  // JWT configuration
  JWT_SECRET: process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
  JWT_ALGORITHM: 'HS256' as const,
  JWT_EXPIRY: '24h',
  
  // Encryption configuration
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'fallback-encryption-key-32-chars',
};

/**
 * SECURITY FIX: Enhanced input validation using validator.js
 */
export class SecurityValidator {
  /**
   * Validates email format with additional security checks
   */
  static validateEmail(email: string): { isValid: boolean; error?: string } {
    if (!email || typeof email !== 'string') {
      return { isValid: false, error: 'Email is required and must be a string.' };
    }

    const trimmed = email.trim();
    
    // Basic format validation
    if (!validator.isEmail(trimmed)) {
      return { isValid: false, error: 'Invalid email format.' };
    }
    
    // Additional security checks
    if (trimmed.length > 254) { // RFC 5321 limit
      return { isValid: false, error: 'Email address is too long.' };
    }
    
    // Check for suspicious patterns
    if (validator.contains(trimmed, '..') || validator.contains(trimmed, '--')) {
      return { isValid: false, error: 'Email contains suspicious patterns.' };
    }
    
    return { isValid: true };
  }

  /**
   * Validates URL with security checks
   */
  static validateUrl(url: string): { isValid: boolean; error?: string } {
    if (!url || typeof url !== 'string') {
      return { isValid: false, error: 'URL is required and must be a string.' };
    }

    const trimmed = url.trim();
    
    // Basic URL validation
    if (!validator.isURL(trimmed, {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
      allow_underscores: false,
      allow_trailing_dot: false,
      allow_protocol_relative_urls: false,
    })) {
      return { isValid: false, error: 'Invalid URL format.' };
    }
    
    // Security checks
    if (validator.contains(trimmed.toLowerCase(), 'javascript:') || 
        validator.contains(trimmed.toLowerCase(), 'data:') ||
        validator.contains(trimmed.toLowerCase(), 'vbscript:')) {
      return { isValid: false, error: 'URL contains dangerous protocol.' };
    }
    
    return { isValid: true };
  }

  /**
   * Validates and sanitizes HTML input
   */
  static sanitizeHtml(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }
    
    return sanitizeHtml(input, SECURITY_CONFIG.HTML_SANITIZE_OPTIONS);
  }

  /**
   * Validates numeric input with range checks
   */
  static validateNumeric(
    value: any, 
    min?: number, 
    max?: number
  ): { isValid: boolean; value?: number; error?: string } {
    if (value === null || value === undefined || value === '') {
      return { isValid: false, error: 'Numeric value is required.' };
    }

    const stringValue = String(value);
    
    if (!validator.isNumeric(stringValue)) {
      return { isValid: false, error: 'Value must be numeric.' };
    }
    
    const numValue = Number(stringValue);
    
    if (min !== undefined && numValue < min) {
      return { isValid: false, error: `Value must be at least ${min}.` };
    }
    
    if (max !== undefined && numValue > max) {
      return { isValid: false, error: `Value must not exceed ${max}.` };
    }
    
    return { isValid: true, value: numValue };
  }

  /**
   * Validates alphanumeric strings
   */
  static validateAlphanumeric(input: string, minLength = 1, maxLength = 255): { isValid: boolean; error?: string } {
    if (!input || typeof input !== 'string') {
      return { isValid: false, error: 'Input is required and must be a string.' };
    }

    const trimmed = input.trim();
    
    if (trimmed.length < minLength) {
      return { isValid: false, error: `Input must be at least ${minLength} characters long.` };
    }
    
    if (trimmed.length > maxLength) {
      return { isValid: false, error: `Input must not exceed ${maxLength} characters.` };
    }
    
    if (!validator.isAlphanumeric(trimmed)) {
      return { isValid: false, error: 'Input must contain only letters and numbers.' };
    }
    
    return { isValid: true };
  }
}

/**
 * SECURITY FIX: Enhanced cryptographic utilities
 */
export class SecurityCrypto {
  /**
   * Encrypts sensitive data using AES
   */
  static encrypt(text: string): string {
    try {
      const encrypted = CryptoJS.AES.encrypt(text, SECURITY_CONFIG.ENCRYPTION_KEY).toString();
      return encrypted;
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypts sensitive data using AES
   */
  static decrypt(encryptedText: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, SECURITY_CONFIG.ENCRYPTION_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!decrypted) {
        throw new Error('Decryption failed - invalid data');
      }
      
      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed');
    }
  }

  /**
   * Generates a secure hash using SHA-256
   */
  static hash(text: string): string {
    return CryptoJS.SHA256(text).toString();
  }

  /**
   * Generates a secure random string
   */
  static generateSecureRandom(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      result += chars[randomIndex];
    }
    
    return result;
  }
}

/**
 * SECURITY FIX: JWT utilities using jose library
 */
export class SecurityJWT {
  private static secret = new TextEncoder().encode(SECURITY_CONFIG.JWT_SECRET);

  /**
   * Creates a secure JWT token
   */
  static async createToken(payload: Record<string, any>): Promise<string> {
    try {
      const jwt = await new SignJWT(payload)
        .setProtectedHeader({ alg: SECURITY_CONFIG.JWT_ALGORITHM })
        .setIssuedAt()
        .setExpirationTime(SECURITY_CONFIG.JWT_EXPIRY)
        .sign(this.secret);
      
      return jwt;
    } catch (error) {
      throw new Error('JWT creation failed');
    }
  }

  /**
   * Verifies and decodes a JWT token
   */
  static async verifyToken(token: string): Promise<any> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      return payload;
    } catch (error) {
      throw new Error('JWT verification failed');
    }
  }
}

/**
 * SECURITY FIX: Rate limiting utilities
 */
export class SecurityRateLimit {
  private static attempts = new Map<string, { count: number; resetTime: number }>();

  /**
   * Checks if an action is rate limited
   */
  static checkRateLimit(
    key: string, 
    maxAttempts: number = 5, 
    windowMs: number = 60000
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const record = this.attempts.get(key);

    // Clean up expired records
    if (record && now > record.resetTime) {
      this.attempts.delete(key);
    }

    const currentRecord = this.attempts.get(key);

    if (!currentRecord) {
      // First attempt
      this.attempts.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true, remaining: maxAttempts - 1, resetTime: now + windowMs };
    }

    if (currentRecord.count >= maxAttempts) {
      // Rate limit exceeded
      return { 
        allowed: false, 
        remaining: 0, 
        resetTime: currentRecord.resetTime 
      };
    }

    // Increment attempt count
    currentRecord.count++;
    this.attempts.set(key, currentRecord);

    return { 
      allowed: true, 
      remaining: maxAttempts - currentRecord.count, 
      resetTime: currentRecord.resetTime 
    };
  }

  /**
   * Resets rate limit for a key
   */
  static resetRateLimit(key: string): void {
    this.attempts.delete(key);
  }
}

/**
 * SECURITY FIX: Input sanitization utilities
 */
export class SecuritySanitizer {
  /**
   * Sanitizes string input for database queries
   */
  static sanitizeForDatabase(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
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
   * Sanitizes filename for file operations
   */
  static sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      return 'untitled';
    }

    return filename
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 255);
  }

  /**
   * Sanitizes user input for logging
   */
  static sanitizeForLogging(input: any): string {
    if (typeof input === 'string') {
      return input
        .replace(/password[=:]\s*[^\s&]+/gi, 'password=[REDACTED]')
        .replace(/token[=:]\s*[^\s&]+/gi, 'token=[REDACTED]')
        .replace(/key[=:]\s*[^\s&]+/gi, 'key=[REDACTED]')
        .substring(0, 500);
    }
    
    return String(input).substring(0, 500);
  }
}

// Export all utilities
export const securityValidator = SecurityValidator;
export const securityCrypto = SecurityCrypto;
export const securityJWT = SecurityJWT;
export const securityRateLimit = SecurityRateLimit;
export const securitySanitizer = SecuritySanitizer;
