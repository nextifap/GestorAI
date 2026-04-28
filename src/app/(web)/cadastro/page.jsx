'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const capitalizeName = (name) => {
  if (!name) return '';
  return name.split(' ').map(word => {
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
    
    const nomeFormatado = capitalizeName(nomeCompleto);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeCompleto: nomeFormatado, email, senha, repitaSenha }),
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Erro ao cadastrar usuário');

      setMessage('Usuário cadastrado com sucesso!');
      setMessageType('success');

      setTimeout(() => {
        router.push('/login');
      }, 1500);

    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 to-blue-200 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg flex h-[400px] flex-col sm:flex-row w-full max-w-3xl">
        
        {/* Lado Esquerdo - Logo com botão de Login acima */}
        <div className="flex-1 flex flex-col items-center justify-center p-10 space-y-4">
          <button
            onClick={() => router.push('/login')}
            className="bg-azulContraste text-white px-5 py-2 rounded-full font-semibold "
          >
            Login
          </button>

          <Image
            src="/logo.png"
            alt="Logo"
            width={250}
            height={250}
            className="object-contain"
          />
        </div>

        {/* Lado Direito - Formulário */}
        <div className="flex flex-col justify-center sm:w-1/2 px-6">
          <h2 className="text-3xl font-bold text-gray-800 text-center mb-6">GestorAI</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Digite seu Nome"
              value={nomeCompleto}
              onChange={(e) => setNomeCompleto(e.target.value)}
              className="w-full p-3 rounded-2xl border border-pretoBase focus:outline-none focus:ring-2 focus:ring-azulPrincial text-black placeholder-gray-500"
            />
            <input
              type="email"
              placeholder="Digite seu E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-2xl border border-pretoBase focus:outline-none focus:ring-2 focus:ring-azulPrincial text-black placeholder-gray-500"
            />
            <input
              type="password"
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full p-3 rounded-2xl border border-pretoBase focus:outline-none focus:ring-2 focus:ring-azulPrincial text-black placeholder-gray-500"
            />
            <input
              type="password"
              placeholder="Confirmar Senha"
              value={repitaSenha}
              onChange={(e) => setRepitaSenha(e.target.value)}
              className="w-full p-3 rounded-2xl border border-pretoBase focus:outline-none focus:ring-2 focus:ring-azulPrincial text-black placeholder-gray-500"
            />

            <button
              type="submit"
              className="w-full bg-azulContraste text-white p-3 rounded-full font-semibold"
            >
              Cadastrar
            </button>

            {message && (
              <p className={`text-center font-medium ${messageType === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {message}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}