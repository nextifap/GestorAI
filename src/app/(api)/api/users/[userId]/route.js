import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { verifyRequestToken } from '@/lib/auth';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';
import { saveSystemLog } from '@/lib/systemLog';

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

export async function PATCH(request, { params }) {
  const { response } = await requireAdmin(request);
  if (response) {
    return response;
  }

  const userId = params?.userId;
  if (!userId) {
    return errorResponse('USERS_UPDATE_FAILED', { status: 400, message: 'Usuario invalido.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON_INVALID');
  }

  const nomeCompleto = String(body?.nomeCompleto || '').trim();
  const email = String(body?.email || '').trim();
  const senha = String(body?.senha || '').trim();
  const repitaSenha = String(body?.repitaSenha || '').trim();
  const mustChangeCredentials = body?.mustChangeCredentials;

  if (!nomeCompleto && !email && !senha && typeof mustChangeCredentials !== 'boolean') {
    return errorResponse('USERS_UPDATE_FAILED', { status: 400, message: 'Informe ao menos um campo para atualizar.' });
  }

  const updateData = {};
  if (nomeCompleto) {
    updateData.nomeCompleto = nomeCompleto;
  }

  if (email) {
    const emailEmUso = await prisma.user.findUnique({ where: { email } });
    if (emailEmUso && emailEmUso.id !== userId) {
      return errorResponse('AUTH_REGISTER_EMAIL_IN_USE');
    }
    updateData.email = email;
  }

  if (senha || repitaSenha) {
    if (!senha || !repitaSenha) {
      return errorResponse('AUTH_CREDENTIALS_REQUIRED', { message: 'Informe senha e confirmacao.' });
    }

    if (senha !== repitaSenha) {
      return errorResponse('AUTH_REGISTER_PASSWORD_MISMATCH');
    }

    updateData.senha = await bcrypt.hash(senha, 10);
  }

  if (typeof mustChangeCredentials === 'boolean') {
    updateData.mustChangeCredentials = mustChangeCredentials;
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({ user: toUserPayload(updated) }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/users',
      message: 'Erro ao atualizar usuario.',
      context: { error, userId },
    });

    return errorResponse('USERS_UPDATE_FAILED');
  }
}

export async function DELETE(request, { params }) {
  const { response, user: adminUser } = await requireAdmin(request);
  if (response) {
    return response;
  }

  const userId = params?.userId;
  if (!userId) {
    return errorResponse('USERS_DELETE_FAILED', { status: 400, message: 'Usuario invalido.' });
  }

  if (userId === adminUser.id) {
    return errorResponse('USER_SELF_DELETE_FORBIDDEN');
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) {
    return errorResponse('USERS_DELETE_FAILED', { status: 404, message: 'Usuario nao encontrado.' });
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ message: 'Usuario excluido com sucesso.' }, { status: 200 });
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/users',
      message: 'Erro ao excluir usuario.',
      context: { error, userId },
    });

    return errorResponse('USERS_DELETE_FAILED');
  }
}
