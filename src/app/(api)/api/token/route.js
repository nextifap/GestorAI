// app/api/tasks/route.js

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '../../../../lib/prisma'; // Importe a instância do Prisma Client
import { saveSystemLog } from '@/lib/systemLog';

// Função para verificar o token JWT e obter as informações do usuário
function verificarToken(request) {
  // Acessa o token do cabeçalho de autorização da requisição
  const token = request.headers.get('authorization')?.split(' ')[1];

  if (!token) {
    return { error: 'Token não fornecido.', status: 401 };
  }

  try {
    // Tenta verificar e decodificar o token usando a chave secreta
    const usuario = jwt.verify(token, process.env.JWT_SECRET);
    return { usuario, status: 200 };
  } catch (error) {
    // Se o token for inválido, retorna um erro
    return { error: 'Token inválido.', status: 401 };
  }
}

export async function POST(request) {
  // 1. Verifique o token antes de processar a requisição
  const verificacao = verificarToken(request);
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
      source: 'api/token',
      message: 'Erro ao criar tarefa.',
      context: { error, userId: verificacao?.usuario?.id },
    });
    return NextResponse.json({
      error: 'Erro interno do servidor ao criar a tarefa.'
    }, { status: 500 });
  }
}