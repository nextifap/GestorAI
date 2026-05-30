'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CadastroPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#e0f2fe_0%,_#f8fafc_42%,_#eef2ff_100%)] px-4 py-6 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-semibold text-slate-900">Cadastro desativado</h1>
          <p className="mt-2 text-sm text-slate-600">Use o acesso do administrador para criar novos usuarios.</p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-6 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Ir para login
          </button>
        </div>
      </div>
    </div>
  );
}
