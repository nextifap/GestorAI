import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { saveSystemLog } from '@/lib/systemLog';
import { verifyRequestToken } from '@/lib/auth';

export async function POST(request) {
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { title } = await request.json();

  try {
    const novaTarefa = await prisma.task.create({
      data: {
        title,
        userId: verificacao.usuario.id,
      },
    });

    return NextResponse.json(
      {
        message: 'Tarefa criada com sucesso!',
        data: novaTarefa,
      },
      { status: 201 },
    );
  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/tasks',
      message: 'Erro ao criar tarefa.',
      context: { error, userId: verificacao?.usuario?.id },
    });

    return NextResponse.json(
      {
        error: 'Erro interno do servidor ao criar a tarefa.',
      },
      { status: 500 },
    );
  }
}