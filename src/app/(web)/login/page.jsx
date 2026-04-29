'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!email || !password) {
      setMessage('Preencha todos os campos.');
      setMessageType('error');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao fazer login');

      setMessage('Login realizado com sucesso!');
      setMessageType('success');
      router.push('/dashboard');
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#e0f2fe_0%,_#f8fafc_42%,_#eef2ff_100%)] px-4 py-6 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[32px] border border-white/80 bg-white/75 shadow-[0_25px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between bg-gradient-to-br from-slate-950 via-slate-900 to-sky-900 p-8 text-white lg:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-200">GestorAI</p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight md:text-5xl">Acompanhe chat, agenda e solicitações em um único painel claro.</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">A interface foi pensada para leitura rápida, tomada de decisão e visualização de agenda no estilo semanal.</p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
              <div className="text-2xl font-semibold">14-22h</div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-300">Faixa útil</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
              <div className="text-2xl font-semibold">Agenda</div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-300">Visão semanal</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
              <div className="text-2xl font-semibold">Chat</div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-300">Balões organizados</div>
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-center p-6 md:p-10">
          <div className="mx-auto w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 shadow-sm">
                <Image src="/logo.png" alt="Logo" width={42} height={42} priority />
              </div>
            </div>
            <h2 className="mt-5 text-center text-3xl font-semibold text-slate-900">Entrar</h2>
            <p className="mt-2 text-center text-sm text-slate-500">Use sua conta para acessar o painel do gestor.</p>

            {!loading ? (
              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <input
                  type="email"
                  placeholder="Digite seu e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
                <input
                  type="password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />

                <button type="submit" className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800">
                  Entrar
                </button>

                {message && (
                  <p className={`text-center text-sm font-medium ${messageType === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {message}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => router.push('/cadastro')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Criar conta
                </button>
              </form>
            ) : (
              <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 py-12">
                <svg className="h-8 w-8 animate-spin text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="mt-3 text-sm text-slate-500">Fazendo login...</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
