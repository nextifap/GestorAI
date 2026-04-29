// app/api/tasks/route.js

import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma'; // Importe a instância do Prisma Client
import { saveSystemLog } from '@/lib/systemLog';
import { verifyRequestToken } from '@/lib/auth';

export async function POST(request) {
  // 1. Verifique o token antes de processar a requisição
  const verificacao = verifyRequestToken(request);
  if (verificacao.status !== 200) {
    return NextResponse.json({ error: verificacao.error }, { status: verificacao.status });
  }

  const { title } = await request.json();

  try {
    // 2. Salve a nova tarefa no banco de dados usando o Prisma
    const novaTarefa = await prisma.task.create({
      data: {
        title: title,
        userId: verificacao.usuario.id, // Usa o ID do usuário extraído do token
      },
    });

    // 3. Retorne a resposta de sucesso com a nova tarefa criada
    return NextResponse.json({
      message: 'Tarefa criada com sucesso!',
      data: novaTarefa
    }, { status: 201 });

  } catch (error) {
    await saveSystemLog({
      level: 'ERROR',
      source: 'api/tasks',
      message: 'Erro ao criar tarefa.',
      context: { error, userId: verificacao?.usuario?.id },
    });
    return NextResponse.json({
      error: 'Erro interno do servidor ao criar a tarefa.'
    }, { status: 500 });
  }
}