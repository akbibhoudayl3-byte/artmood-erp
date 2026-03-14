
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { UserRole } from '@/types/database';

export interface AuthResult {
  userId: string;
  role: UserRole;
  profileId: string;
}

/**
 * Server-side auth + role check for API routes.
 * Returns AuthResult or throws a NextResponse (to return directly).
 *
 * Usage in API route:
 *   const auth = await requireRole(['ceo', 'commercial_manager']);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.userId, auth.role are now available
 */
export async function requireRole(
  allowedRoles: UserRole[]
): Promise<AuthResult | NextResponse> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Profile not found' },
      { status: 403 }
    );
  }

  if (!profile.is_active) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Account deactivated' },
      { status: 403 }
    );
  }

  const role = profile.role as UserRole;

  // CEO has universal access
  if (role === 'ceo') {
    return { userId: user.id, role, profileId: profile.id };
  }

  if (!allowedRoles.includes(role)) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: `Role '${role}' is not authorized for this action`,
      },
      { status: 403 }
    );
  }

  return { userId: user.id, role, profileId: profile.id };
}

/**
 * Validate a UUID string.
 */
export function isValidUUID(id: string | null): id is string {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Sanitize a number input. Returns null if invalid.
 */
export function sanitizeNumber(value: unknown, options?: { min?: number; max?: number }): number | null {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return null;
  if (options?.min !== undefined && num < options.min) return null;
  if (options?.max !== undefined && num > options.max) return null;
  return num;
}

/**
 * Sanitize string input. Returns null if empty.
 */
export function sanitizeString(value: unknown, maxLen = 1000): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : null;
}
