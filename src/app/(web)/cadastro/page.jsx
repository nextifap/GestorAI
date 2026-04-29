'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const capitalizeName = (name) => {
  if (!name) return '';
  return name.split(' ').map((word) => {
    if (word.length === 0) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

export default function CadastroPage() {
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [repitaSenha, setRepitaSenha] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!nomeCompleto || !email || !senha || !repitaSenha) {
      setMessage('Preencha todos os campos.');
      setMessageType('error');
      return;
    }

    if (senha !== repitaSenha) {
      setMessage('As senhas não coincidem.');
      setMessageType('error');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeCompleto: capitalizeName(nomeCompleto),
          email,
          senha,
          repitaSenha,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao cadastrar usuário');

      setMessage('Usuário cadastrado com sucesso!');
      setMessageType('success');
      setTimeout(() => router.push('/login'), 1200);
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#e0f2fe_0%,_#f8fafc_42%,_#eef2ff_100%)] px-4 py-6 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-[32px] border border-white/80 bg-white/75 shadow-[0_25px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex flex-col justify-between bg-gradient-to-br from-sky-700 via-slate-900 to-indigo-900 p-8 text-white lg:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-200">GestorAI</p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight md:text-5xl">Crie sua conta e entre no painel com agenda semanal.</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">O cadastro mantém a mesma linguagem visual do login e prepara o acesso ao chat, calendário e solicitações.</p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
              <div className="text-2xl font-semibold">Claro</div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-300">Layout direto</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
              <div className="text-2xl font-semibold">Fluxo</div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-300">Simples e rápido</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
              <div className="text-2xl font-semibold">Agenda</div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-300">Disponibilidade útil</div>
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
            <h2 className="mt-5 text-center text-3xl font-semibold text-slate-900">Criar conta</h2>
            <p className="mt-2 text-center text-sm text-slate-500">Cadastre um usuário para acessar o sistema.</p>

            {!loading ? (
              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
                <input
                  type="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
                <input
                  type="password"
                  placeholder="Senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
                <input
                  type="password"
                  placeholder="Confirmar senha"
                  value={repitaSenha}
                  onChange={(e) => setRepitaSenha(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />

                <button type="submit" className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800">
                  Cadastrar
                </button>

                {message && (
                  <p className={`text-center text-sm font-medium ${messageType === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {message}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Já tenho conta
                </button>
              </form>
            ) : (
              <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 py-12">
                <svg className="h-8 w-8 animate-spin text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="mt-3 text-sm text-slate-500">Cadastrando...</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
