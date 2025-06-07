/**
 * SECURITY FIX: Database Security Monitoring API
 * Provides database security status and monitoring capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateEnhancedAdminSession } from '@/lib/enhancedAuth';
import { DatabaseMonitoring } from '@/lib/secureDbWrapper';
import { DatabaseSecurity } from '@/lib/secureDatabase';

/**
 * GET /api/admin/database-security - Get database security status
 */
export async function GET(request: NextRequest) {
  const adminSession = await validateEnhancedAdminSession(request);
  
  if (!adminSession) {
    return NextResponse.json({ message: 'Admin authentication required' }, { status: 401 });
  }

  try {
    // Get comprehensive database security status
    const [securityStatus, configValidation] = await Promise.all([
      DatabaseMonitoring.getSecurityStatus(),
      DatabaseMonitoring.validateSecurityConfiguration()
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        security: {
          isSecure: configValidation.isSecure,
          issues: configValidation.issues,
          recommendations: configValidation.recommendations,
        },
        connectionPool: securityStatus.connectionPool,
        rowLevelSecurity: securityStatus.rlsStatus,
        recentViolations: securityStatus.recentViolations,
        metrics: DatabaseSecurity.getSecurityMetrics(),
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error: any) {
    console.error('Database security status check failed:', error.message);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to retrieve database security status'
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/database-security/validate - Validate database security configuration
 */
export async function POST(request: NextRequest) {
  const adminSession = await validateEnhancedAdminSession(request);
  
  if (!adminSession) {
    return NextResponse.json({ message: 'Admin authentication required' }, { status: 401 });
  }

  try {
    const validation = await DatabaseMonitoring.validateSecurityConfiguration();
    
    return NextResponse.json({
      status: 'success',
      data: {
        validation,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error: any) {
    console.error('Database security validation failed:', error.message);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to validate database security configuration'
    }, { status: 500 });
  }
}
