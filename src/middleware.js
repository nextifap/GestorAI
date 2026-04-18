// middleware.js
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose'; 

// Rotas que não precisam de autenticação (públicas)
const rotasPublicas = ['/', '/cadastro', '/login'];

function isRotaPublica(pathname) {
  return rotasPublicas.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`));
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
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

  if (tokenValido && isRotaPublica(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (!tokenValido && !isRotaPublica(pathname)) {
    const response = NextResponse.redirect(new URL('/login', req.url));
    if (token) {
      response.cookies.set('token', '', { maxAge: 0, path: '/' });
    }
    return response;
  }

  return NextResponse.next();
}

// Matcher que ignora arquivos estáticos e API
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logo.png|vercel.svg|window.svg).*)'],
};
