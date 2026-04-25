import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '../../../../../lib/prisma';
import jwt from 'jsonwebtoken';
import { AUTH_COOKIE_NAME, authCookieOptions } from '@/lib/auth';

export async function POST(request) {
  const { email, senha } = await request.json();

  const usuario = await prisma.user.findUnique({ where: { email } });

  if (!usuario) {
    return NextResponse.json({ error: 'Email ou senha inválidos.' }, { status: 401 });
  }

  if (!usuario.senha) {
    return NextResponse.json({ error: 'Senha não cadastrada para este usuário.' }, { status: 500 });
  }

  const senhasCoincidem = await bcrypt.compare(senha, usuario.senha);

  if (!senhasCoincidem) {
    return NextResponse.json({ error: 'Email ou senha inválidos.' }, { status: 401 });
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
      },
    },
    { status: 200 },
  );

  response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);

  return response;
}