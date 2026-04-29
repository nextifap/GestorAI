// middleware.js
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose'; 

// Rotas que não precisam de autenticação (públicas)
const rotasPublicas = ['/', '/cadastro', '/login'];
const rotasPublicasApi = ['/api/auth/login', '/api/auth/register', '/api/telegram-webhook'];

function isRotaPublica(pathname) {
  return rotasPublicas.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`));
}

function isRotaApiPublica(pathname) {
  return rotasPublicasApi.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`));
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');
  const token = req.cookies.get('token')?.value;

  let tokenValido = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
      tokenValido = true;
    } catch {
      tokenValido = false;
    }
  }

  if (!isApiRoute && tokenValido && isRotaPublica(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (!tokenValido && isApiRoute && !isRotaApiPublica(pathname)) {
    const response = NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    if (token) {
      response.cookies.set('token', '', { maxAge: 0, path: '/' });
    }
    return response;
  }

  if (!tokenValido && !isApiRoute && !isRotaPublica(pathname)) {
    const response = NextResponse.redirect(new URL('/login', req.url));
    if (token) {
      response.cookies.set('token', '', { maxAge: 0, path: '/' });
    }
    return response;
  }

  return NextResponse.next();
}

// Matcher que ignora apenas arquivos estáticos
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|vercel.svg|window.svg).*)'],
};
