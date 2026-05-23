import { NextResponse } from 'next/server';
import { verifyRequestToken } from '@/lib/auth';
import { respondAuthError } from '@/lib/apiErrors';

export async function GET(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return respondAuthError(verificacao);
  }

  const { id, email, nomeCompleto } = verificacao.usuario;

  return NextResponse.json(
    {
      user: {
        id,
        email,
        nomeCompleto,
      },
    },
    { status: 200 },
  );
}
