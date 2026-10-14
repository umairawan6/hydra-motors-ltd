import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '../../../lib/supabase/server';
import { authDestination } from '../../../lib/auth/redirects';
import { siteUrl } from '../../../lib/env';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) { const db = await supabaseServer(); const { error } = await db.auth.exchangeCodeForSession(code); if (!error) return NextResponse.redirect(new URL(authDestination(request.nextUrl.searchParams.get('next')), siteUrl())); }
  return NextResponse.redirect(new URL('/login?error=link', siteUrl()));
}
