import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { errorResponse, respondAuthError } from '@/lib/apiErrors';
import { verifyRequestToken } from '@/lib/auth';

async function getAuthenticatedAdmin(request) {
  const verification = verifyRequestToken(request);
  if (verification.status !== 200) {
    return { response: respondAuthError(verification) };
  }

  const user = await prisma.user.findUnique({ where: { id: verification.usuario.id } });
  if (!user) {
    return { response: errorResponse('AUTH_USER_NOT_FOUND') };
  }

  if (user.role !== 'admin') {
    return { response: errorResponse('AUTH_FORBIDDEN') };
  }

  return { user };
}

export async function GET(request) {
  const { response } = await getAuthenticatedAdmin(request);
  if (response) {
    return response;
  }

  const config = await prisma.telegramConfig.findFirst();
  if (!config) {
    return NextResponse.json({ config: null }, { status: 200 });
  }

  return NextResponse.json({
    config: {
      id: config.id,
      apiTelegramId: config.apiTelegramId,
      phoneNumber: config.phoneNumber ?? null,
      keysChanged: config.keysChanged,
      attempt: config.attempt ?? 0,
      error: config.error ?? null,
      step: config.step ?? null,
    },
  }, { status: 200 });
}

export async function PATCH(request) {
  const { response } = await getAuthenticatedAdmin(request);
  if (response) {
    return response;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON_INVALID');
  }

  const telegramId = String(body?.telegramId || '').trim();
  const telegramHash = String(body?.telegramHash || '').trim();
  const phoneNumber = String(body?.phoneNumber || '').trim() || null;
  const twoFactor = String(body?.twoFactor || '').trim() || null;
  const phoneCode = String(body?.phoneCode || '').trim() || null;

  if (!telegramId || !telegramHash) {
    return errorResponse('TELEGRAM_CONFIG_REQUIRED');
  }

  const existingConfig = await prisma.telegramConfig.findFirst();
  const data = {
    apiTelegramId: telegramId,
    apiTelegramHash: telegramHash,
    phoneNumber,
    twoFactor,
    phoneCode,
    keysChanged: true,
    attempt: 0,
    error: null,
  };

  const config = existingConfig
    ? await prisma.telegramConfig.update({ where: { id: existingConfig.id }, data })
    : await prisma.telegramConfig.create({ data });

  if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const telegram = await import('../../../../../telegramServer.js');
      console.error("... 1");
      if (typeof telegram.restartServer === 'function') {
        console.error("... 2");
        await telegram.restartServer(config);
      }
    } catch (error) {
      console.error('Erro ao reiniciar Telegram server após salvar config:', error?.message || error);
    }
  } else {
    console.error("... 0");
  }

  const savedConfig = await prisma.telegramConfig.findUnique({
    where: { id: config.id },
  });

  return NextResponse.json({
    config: {
      id: savedConfig.id,
      apiTelegramId: savedConfig.apiTelegramId,
      phoneNumber: savedConfig.phoneNumber ?? null,
      keysChanged: savedConfig.keysChanged,
      attempt: savedConfig.attempt ?? 0,
      error: savedConfig.error ?? null,
      step: savedConfig.step ?? null,
    },
  }, { status: 200 });
}
