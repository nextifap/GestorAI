import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '../../../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { AUTH_COOKIE_NAME, authCookieOptions } from '@/lib/auth';
import { errorResponse } from '@/lib/apiErrors';

export async function POST(request) {
  const { email, senha } = await request.json();

  const usuario = await prisma.user.findUnique({ where: { email } });

  if (!usuario) {
    return errorResponse('AUTH_LOGIN_INVALID');
  }

  if (!usuario.senha) {
    return errorResponse('AUTH_LOGIN_PASSWORD_MISSING');
  }

  const senhasCoincidem = await bcrypt.compare(senha, usuario.senha);

  if (!senhasCoincidem) {
    return errorResponse('AUTH_LOGIN_INVALID');
  }

  // Corrigido: Adicione o nomeCompleto ao payload do token
  const payload = { 
    id: usuario.id,
    email: usuario.email,
    nomeCompleto: usuario.nomeCompleto, 
  };
  
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  const response = NextResponse.json(
    {
      message: 'Login bem-sucedido!',
      user: {
        id: usuario.id,
        nomeCompleto: usuario.nomeCompleto,
        email: usuario.email,
        role: usuario.role,
        mustChangeCredentials: usuario.mustChangeCredentials,
      },
    },
    { status: 200 },
  );

  response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);

  return response;
}