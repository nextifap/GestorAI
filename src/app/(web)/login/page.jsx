'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
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
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password }),
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Erro ao fazer login');

      document.cookie = `token=${result.token}; path=/; max-age=${60 * 60}; SameSite=Lax`;

      setMessage('Login realizado com sucesso!');
      setMessageType('success');

      router.push('/dashboard');
      
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-azulFundo">
      <div className="bg-brancoNeve h-[400px] shadow-lg rounded-2xl flex flex-col md:flex-row w-[90%] max-w-4xl p-8 md:p-0">
        
        {/* Lado esquerdo - Formulário */}
        <div className="flex-1 flex flex-col justify-center px-8 py-10">
          <h1 className="text-3xl font-bold text-gray-800 text-center mb-6">
            GestorAI
          </h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <input
                type="email"
                placeholder="Digite seu E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 rounded-2xl border border-pretoBase focus:outline-none focus:ring-2 focus:ring-azulPrincial text-black placeholder-gray-500"
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Digite sua Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded-2xl border border-pretoBase focus:outline-none focus:ring-2 focus:ring-azulPrincial text-black placeholder-gray-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-azulContraste text-white p-3 rounded-full font-semibold "
            >
              Entrar
            </button>

            {message && (
              <p
                className={`text-center font-medium mt-2 ${
                  messageType === 'success' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {message}
              </p>
            )}
          </form>
        </div>

        {/* Divisor vertical */}
        <div className="hidden md:block w-px bg-gray-300 my-10"></div>

        {/* Lado direito - Imagem + botão de cadastro */}
        <div className="flex-1 flex flex-col items-center justify-center p-10 space-y-4">
          <button
            onClick={() => router.push('/cadastro')}
            className="bg-azulContraste text-white px-5 py-2 rounded-full font-semibold"
          >
            Cadastre-se aqui
          </button>

          <Image
            src="/logo.png"
            alt="Ilustração Login"
            width={250}
            height={250}
            className="object-contain"
          />
        </div>
      </div>
    </div>
  );
}