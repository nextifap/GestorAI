import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';
import { saveSystemLog } from '@/lib/systemLog';

const userSchema = z.object({
  nomeCompleto: z.string().trim().min(3).max(120),
  email: z.string().trim().min(1).max(120),
  senha: z.string().min(4).max(64),
  mustChangeCredentials: z.boolean().optional(),
});

function normalizeName(name) {
  const parts = String(name || '').trim().split(' ').filter(Boolean);
  return parts.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

function toUserPayload(user) {
  return {
    id: user.id,
    nomeCompleto: user.nomeCompleto,
    email: user.email,
    role: user.role,
    mustChangeCredentials: user.mustChangeCredentials,
  };
}

async function requireAdmin(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return { response: respondAuthError(verificacao) };
  }

  const user = await prisma.user.findUnique({ where: { id: verificacao.usuario.id } });
  if (!user) {
    return { response: errorResponse('AUTH_USER_NOT_FOUND') };
  }

  if (user.role !== 'admin') {
    return { response: errorResponse('AUTH_FORBIDDEN') };
  }

  return { user };
}

export async function GET(request) {
  const { response } = await requireAdmin(request);
  if (response) {
    return response;
  }

  try {
    const users = await prisma.user.findMany({
      where: { telegramId: null },
      orderBy: { nomeCompleto: 'asc' },
    });

    return NextResponse.json({ users: users.map(toUserPayload) }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/users',
      message: 'Erro ao listar usuarios.',
      context: { error },
    });

    return errorResponse('USERS_LIST_FAILED');
  }
}

export async function POST(request) {
  const { response } = await requireAdmin(request);
  if (response) {
    return response;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON_INVALID');
  }

  const parsed = userSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse('USERS_CREATE_FAILED', { status: 400, message: issue?.message || 'Dados invalidos.' });
  }

  const email = String(parsed.data.email || '').trim();
  const nomeCompleto = normalizeName(parsed.data.nomeCompleto);

  const emailEmUso = await prisma.user.findUnique({ where: { email } });
  if (emailEmUso) {
    return errorResponse('AUTH_REGISTER_EMAIL_IN_USE');
  }

  try {
    const senhaHash = await bcrypt.hash(parsed.data.senha, 10);
    const created = await prisma.user.create({
      data: {
        nomeCompleto,
        email,
        senha: senhaHash,
        role: 'user',
        mustChangeCredentials: Boolean(parsed.data.mustChangeCredentials),
      },
    });

    return NextResponse.json({ user: toUserPayload(created) }, { status: 201 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/users',
      message: 'Erro ao criar usuario.',
      context: { error },
    });

    return errorResponse('USERS_CREATE_FAILED');
  }
}
