import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { AUTH_COOKIE_NAME, authCookieOptions, verifyRequestToken } from '@/lib/auth';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';

function toUserPayload(user) {
  return {
    id: user.id,
    email: user.email,
    nomeCompleto: user.nomeCompleto,
    role: user.role,
    mustChangeCredentials: user.mustChangeCredentials,
  };
}

async function getAuthenticatedUser(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return { response: respondAuthError(verificacao) };
  }

  const user = await prisma.user.findUnique({ where: { id: verificacao.usuario.id } });
  if (!user) {
    return { response: errorResponse('AUTH_USER_NOT_FOUND') };
  }

  return { user };
}

export async function GET(request) {
  const { response, user } = await getAuthenticatedUser(request);
  if (response) {
    return response;
  }

  return NextResponse.json({ user: toUserPayload(user) }, { status: 200 });
}

export async function PATCH(request) {
  const { response, user } = await getAuthenticatedUser(request);
  if (response) {
    return response;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON_INVALID');
  }

  const email = String(body?.email || '').trim();
  const senha = String(body?.senha || '').trim();
  const repitaSenha = String(body?.repitaSenha || '').trim();

  if (!email || !senha || !repitaSenha) {
    return errorResponse('AUTH_CREDENTIALS_REQUIRED');
  }

  if (senha !== repitaSenha) {
    return errorResponse('AUTH_REGISTER_PASSWORD_MISMATCH');
  }

  const emailEmUso = await prisma.user.findUnique({ where: { email } });
  if (emailEmUso && emailEmUso.id !== user.id) {
    return errorResponse('AUTH_REGISTER_EMAIL_IN_USE');
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      email,
      senha: senhaHash,
      mustChangeCredentials: false,
    },
  });

  const tokenPayload = {
    id: updated.id,
    email: updated.email,
    nomeCompleto: updated.nomeCompleto,
  };
  const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1h' });

  const responsePayload = NextResponse.json({ user: toUserPayload(updated) }, { status: 200 });
  responsePayload.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);

  return responsePayload;
}
