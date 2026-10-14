import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicSupabaseConfig } from './lib/env';
export async function proxy(request: NextRequest) {
  const config = publicSupabaseConfig();
  let response = NextResponse.next({ request });
  if (!config) return response;
  const db = createServerClient(config.url, config.key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(items) {
      items.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  const { data: { user } } = await db.auth.getUser();
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const destination = request.nextUrl.clone(); destination.pathname = '/login'; destination.search = '';
    const redirect = NextResponse.redirect(destination);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/dashboard/:path*', '/login', '/forgot-password', '/update-password', '/auth/:path*'] };
