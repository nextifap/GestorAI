'use client';

import { useState, useEffect } from 'react';
import { getApiErrorMessage, readApiError } from '@/lib/apiClient';

const inputClassName =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100';

export default function GroqConfig() {
  const [groqHash, setGroqHash] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'info', 'success', 'error'
  const [busy, setBusy] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load current configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/groq-config', {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setIsConfigured(data.config?.isConfigured || false);
          setMessage('');
        }
      } catch (err) {
        console.error('Erro ao carregar configuração do Groq:', err);
        setMessage('Erro ao carregar configuração.');
        setMessageType('error');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();

    if (!groqHash.trim()) {
      setMessage('Por favor, insira a hash do Groq.');
      setMessageType('error');
      return;
    }

    setBusy(true);
    setMessage('Salvando configuração...');
    setMessageType('info');

    try {
      const res = await fetch('/api/groq-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          hash: groqHash.trim(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const errorMsg = getApiErrorMessage(data, res.status);
        setMessage(errorMsg || 'Erro ao salvar configuração.');
        setMessageType('error');
        return;
      }

      setIsConfigured(true);
      setGroqHash('');
      setMessage('Configuração do Groq salva com sucesso!');
      setMessageType('success');

      // Clear success message after 5 seconds
      setTimeout(() => {
        setMessage('');
      }, 5000);
    } catch (err) {
      console.error('Erro ao salvar configuração:', err);
      setMessage('Erro ao conectar com o servidor.');
      setMessageType('error');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Deseja remover a configuração do Groq?')) {
      return;
    }

    setBusy(true);
    setMessage('Removendo configuração...');
    setMessageType('info');

    try {
      const res = await fetch('/api/groq-config', {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const errorMsg = getApiErrorMessage(data, res.status);
        setMessage(errorMsg || 'Erro ao remover configuração.');
        setMessageType('error');
        return;
      }

      setIsConfigured(false);
      setGroqHash('');
      setMessage('Configuração removida com sucesso!');
      setMessageType('success');

      // Clear success message after 5 seconds
      setTimeout(() => {
        setMessage('');
      }, 5000);
    } catch (err) {
      console.error('Erro ao remover configuração:', err);
      setMessage('Erro ao conectar com o servidor.');
      setMessageType('error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <p className="text-slate-500">Carregando configuração...</p>
      </div>
    );
  }

  const messageStyles = {
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    error: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Configuração do Groq</h2>

        {message && (
          <div className={`mb-4 p-4 rounded-lg border ${messageStyles[messageType]}`}>
            {message}
          </div>
        )}

        {isConfigured ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700">✓ Groq configurado e ativo</p>
            </div>

            <button
              onClick={handleRemove}
              disabled={busy}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {busy ? 'Processando...' : 'Remover Configuração'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Hash do Groq
              </label>
              <input
                type="password"
                value={groqHash}
                onChange={(e) => setGroqHash(e.target.value)}
                placeholder="Insira a hash do Groq"
                className={inputClassName}
                disabled={busy}
              />
              <p className="text-xs text-slate-500 mt-2">
                Esta é uma chave sensível. Use uma string segura para autenticação do Groq.
              </p>
            </div>

            <button
              type="submit"
              disabled={busy || !groqHash.trim()}
              className="w-full px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {busy ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
