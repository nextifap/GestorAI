import { NextResponse } from 'next/server';
import { verifyRequestToken } from '@/lib/auth';

export async function GET(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
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
