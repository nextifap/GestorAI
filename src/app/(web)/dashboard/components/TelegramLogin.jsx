'use client';

import { useMemo, useState, useEffect, useRef } from 'react';

const inputClassName =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100';

export default function TelegramLogin() {
  const [telegramId, setTelegramId] = useState('');
  const [telegramHash, setTelegramHash] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [twoFactor, setTwoFactor] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tgError, setTgError] = useState(null);
  const [status, setStatus] = useState(null);

  const pollRef = useRef(null);

  const canSubmit = useMemo(() => {
    return telegramId.trim().length > 0 && telegramHash.trim().length > 0;
  }, [telegramId, telegramHash]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  };

  const startPolling = () => {
    if (pollRef.current) return;

    setPolling(true);

    const runCheck = async () => {
      try {
        const res = await fetch('/api/telegram-config', {
          credentials: 'include',
        });

        if (!res.ok) return;

        const data = await res.json().catch(() => null);
        const cfg = data?.config;

        if (!cfg) return;

        setPhoneNumber(cfg.phoneNumber || '');
        setTwoFactor(cfg.twoFactor || '');
        setAttempt(Number(cfg.attempt || 0));
        setTgError(cfg.error || null);
        setStatus(cfg.step || null);

        if (cfg.step === 'CONNECTED') {
          setMessage('Telegram conectado com sucesso.');
          stopPolling();
          return;
        }

        if (cfg.step === 'ERROR') {
          setMessage(cfg.error || 'Erro na autenticação.');
          return;
        }

        if (cfg.step === 'PHONE') {
          setMessage('Aguardando número de telefone...');
        } else if (cfg.step === 'CODE') {
          setMessage('Digite o código recebido no Telegram.');
        } else if (cfg.step === 'PASSWORD') {
          setMessage('Digite a senha 2FA.');
        } else {
          setMessage('Aguardando autenticação...');
        }

        setBusy(false);
      } catch (err) {
        console.error(err);
      }
    };

    runCheck();
    pollRef.current = setInterval(runCheck, 5000);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/telegram-config', {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          const cfg = data?.config;

          if (cfg) {
            setPhoneNumber(cfg.phoneNumber || '');
            setTwoFactor(cfg.twoFactor || '');
            setAttempt(Number(cfg.attempt || 0));
            setTgError(cfg.error || null);
          }
        }
      } catch {}
    })();

    return () => stopPolling();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canSubmit) {
      setMessage('Informe telegramId e telegramHash.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/telegram-config', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          telegramId: telegramId.trim(),
          telegramHash: telegramHash.trim(),
          phoneNumber: phoneNumber.trim(),
          twoFactor: twoFactor.trim(),
          phoneCode: phoneCode.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setMessage(errorData?.error?.message || 'Não foi possível atualizar.');
        return;
      }

      const result = await response.json().catch(() => null);

      setPhoneNumber(result?.config?.phoneNumber || phoneNumber);
      setPhoneCode('');
      setAttempt(Number(result?.config?.attempt || 0));
      setTgError(result?.config?.error || null);

      setMessage('Config enviada. Verificando autenticação...');
      startPolling();
    } catch (err) {
      console.error(err);
      setMessage('Falha ao processar formulário.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
          Telegram Login
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">
          Autenticação Telegram
        </h2>
      </div>
      
      {status === 'CONNECTED' && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700">Telegram configurado e ativo</p>
        </div>
      )}

      {(status === 'CODE' || status === 'PHONE' || status === 'ERROR' || status === 'PASSWORD') && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700">{message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input className={inputClassName} value={telegramId} onChange={(e) => setTelegramId(e.target.value)} placeholder="telegramId" />

        <input className={inputClassName} value={telegramHash} onChange={(e) => setTelegramHash(e.target.value)} placeholder="telegramHash" />

        <input className={inputClassName} value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Telefone" />

        <input className={inputClassName} value={twoFactor} onChange={(e) => setTwoFactor(e.target.value)} placeholder="Senha 2FA" />

        <input className={inputClassName} value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} placeholder="Código SMS" />

        <button
          type="submit"
          className="rounded-2xl bg-slate-900 px-5 py-3 text-white disabled:bg-slate-400"
        >
          {busy ? 'Processando...' : 'Salvar credenciais'}
        </button>

        {message && <p className="text-sm text-slate-600">{message}</p>}

        <p className="text-xs text-slate-500">
          Tentativas: <strong>{attempt}</strong>
        </p>

        {attempt >= 5 && (
          <p className="text-sm text-red-600">
            Erro: {tgError || 'Muitas tentativas'}
          </p>
        )}
      </form>
    </section>
  );
}