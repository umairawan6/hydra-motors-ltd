import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '../../../lib/supabase/server';
import { siteUrl } from '../../../lib/env';
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  if (token_hash && (type === 'invite' || type === 'recovery')) { const db = await supabaseServer(); const { error } = await db.auth.verifyOtp({ token_hash, type }); if (!error) return NextResponse.redirect(new URL('/update-password', siteUrl())); }
  return NextResponse.redirect(new URL('/login?error=link', siteUrl()));
}
