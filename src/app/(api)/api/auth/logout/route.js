import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, authCookieOptions } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ message: 'Logout realizado com sucesso.' }, { status: 200 });

  response.cookies.set(AUTH_COOKIE_NAME, '', {
    ...authCookieOptions,
    maxAge: 0,
  });

  return response;
}
