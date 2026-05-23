// app/auth/api/register/route.js

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '../../../../../lib/prisma'; // Importe a instância do Prisma Client
import { saveSystemLog } from '@/lib/systemLog';
import { errorResponse } from '@/lib/apiErrors';

export async function POST(request) {
  const { nomeCompleto, email, senha, repitaSenha } = await request.json();

  if (senha !== repitaSenha) {
    return errorResponse('AUTH_REGISTER_PASSWORD_MISMATCH');
  }

  // Verifica se o email já existe
  const usuarioExistente = await prisma.user.findUnique({ where: { email } });
  if (usuarioExistente) {
    return errorResponse('AUTH_REGISTER_EMAIL_IN_USE');
  }

  const salt = await bcrypt.genSalt(10);
  const senhaCriptografada = await bcrypt.hash(senha, salt);

  try {
    const novoUsuario = await prisma.user.create({
      data: {
        nomeCompleto,
        email,
        senha: senhaCriptografada,
      },
    });

    return NextResponse.json(
      {
        message: 'Usuário cadastrado com sucesso!',
        user: {
          id: novoUsuario.id,
          email: novoUsuario.email,
          nomeCompleto: novoUsuario.nomeCompleto,
        },
      },
      { status: 201 },
    );

  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/auth/register',
      message: 'Erro ao cadastrar usuário.',
      context: { error },
    });
    return errorResponse('AUTH_REGISTER_FAILED');
  }
}