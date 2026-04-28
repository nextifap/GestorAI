'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import jwt from 'jsonwebtoken';

const capitalizeName = (name) => {
  if (!name) return '';
  return name.split(' ').map(word => {
    if (word.length === 0) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

const getSummary = (text) => {
  const words = text.split(' ');
  return words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '');
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const router = useRouter();
  const chatEndRef = useRef(null);

  useEffect(() => {
    const checkAuth = async () => {
      const tokenCookie = document.cookie.split(';').find(row => row.trim().startsWith('token='));
      if (!tokenCookie) {
        router.push('/auth/login');
      } else {
        const token = tokenCookie.split('=')[1];
        try {
          const decodedUser = jwt.decode(token);
          if (decodedUser) {
            setUser(decodedUser);
            await fetchConversations(token);
            setLoading(false);
          } else {
            router.push('/auth/login');
          }
        } catch (error) {
          router.push('/auth/login');
        }
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  const fetchConversations = async (token) => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations);
      }
    } catch (error) {
      console.error('Erro ao buscar conversas:', error);
    }
  };

  const handleLogout = () => {
    document.cookie = 'token=; Max-Age=0; path=/;';
    router.push('/auth/login');
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return;
    const token = document.cookie.split(';').find(row => row.trim().startsWith('token='))?.split('=')[1];
    
    let convIdToUse = currentConversationId;
    
    // Salva o resumo da primeira mensagem
    if (!convIdToUse) {
      const summary = getSummary(currentMessage);
      const newConv = await saveConversationSummary(token, summary);
      convIdToUse = newConv.conversation.id;
      setCurrentConversationId(newConv.conversation.id);
    }

    const newUserMessage = { sender: 'user', text: currentMessage, conversationId: convIdToUse };
    setChatHistory(prevHistory => [...prevHistory, newUserMessage]);
    setCurrentMessage('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: newUserMessage.text, conversationId: convIdToUse }),
      });

      if (!response.ok) throw new Error('Erro na comunicação com o assistente.');
      
      const result = await response.json();
      const assistantResponse = result.response;
      
      setChatHistory(prevHistory => [...prevHistory, { sender: 'assistant', text: assistantResponse, conversationId: convIdToUse }]);

    } catch (error) {
      console.error('Erro no chat:', error);
      alert('Erro ao enviar mensagem: ' + error.message);
    }
  };

  const saveConversationSummary = async (token, summary) => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ summary }),
      });
      const data = await response.json();
      fetchConversations(token); 
      return data;
    } catch (error) {
      console.error('Erro ao salvar resumo da conversa:', error);
    }
  };

  const handleNewChat = () => {
    setChatHistory([]);
    setCurrentMessage('');
    setCurrentConversationId(null);
  };
  
  const handleHistoryClick = async (conversationId) => {
    const token = document.cookie.split(';').find(row => row.trim().startsWith('token='))?.split('=')[1];
    try {
        const response = await fetch(`/api/chat/${conversationId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) throw new Error('Erro ao carregar a conversa.');

        const result = await response.json();
        const messages = result.conversation.messages.map(msg => ({
            sender: msg.sender,
            text: msg.text,
        }));

        setChatHistory(messages);
        setCurrentConversationId(conversationId);
    } catch (error) {
        console.error('Erro ao carregar o histórico:', error);
        alert('Erro ao carregar a conversa: ' + error.message);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const token = document.cookie.split(';').find(row => row.trim().startsWith('token='))?.split('=')[1];
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/import-tasks', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) throw new Error('Erro ao enviar a planilha.');
      alert('Planilha importada com sucesso!');
    } catch (error) {
      console.error('Erro ao importar planilha:', error);
      alert('Erro ao importar planilha: ' + error.message);
    }
  };

  const handleExport = async () => {
    const token = document.cookie.split(';').find(row => row.trim().startsWith('token='))?.split('=')[1];
    try {
      const response = await fetch('/api/export-tasks', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Erro ao baixar a planilha.');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tarefas_exportadas.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      alert('Planilha exportada com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar planilha:', error);
      alert('Erro ao exportar planilha: ' + error.message);
    }
  };

  if (loading) {
    return (<div className="flex items-center justify-center min-h-screen bg-black-basic text-cream">Carregando...</div>);
  }

  return (
    <div className="flex min-h-screen bg-background text-black-basic font-sans">
      <aside className="w-80 bg-primary p-6 flex flex-col justify-between shadow-lg">
        <div>
          <div className="mt-8">
            <button
              onClick={handleNewChat}
              className="w-full bg-accent text-cream p-3 rounded-full font-semibold hover:bg-white hover:text-primary transition-colors duration-200 mb-6"
            >
              Novo Chat
            </button>
            <h3 className="font-semibold mb-4 text-cream">HISTÓRICO</h3>
            <div className="space-y-2">
              {conversations.map((conv, index) => (
                <div 
                  key={index} 
                  onClick={() => handleHistoryClick(conv.id)}
                  className="cursor-pointer p-2 rounded-lg text-cream hover:bg-accent hover:text-white transition duration-200">
                  {conv.summary}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col p-8 text-center bg-cream relative">
        <header className="absolute top-0 right-0 p-6">
          <button onClick={handleLogout} className="bg-primary text-cream p-3 rounded-full font-semibold hover:bg-accent transition-colors duration-300 shadow-md">
            <img src="/out.svg" alt="" />
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-between w-full max-w-4xl mx-auto p-4">
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 relative z-10 bg-black-basic rounded-lg shadow-md w-full mb-8">
            
            {chatHistory.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center opacity-10 pointer-events-none z-0">
                <Image 
                  src="/logo.png" 
                  alt="GestoAI Logo" 
                  width={400} 
                  height={400} 
                  priority
                />
                <h1 className="text-3xl font-bold mb-4 text-cream">
                  Olá, {user?.nomeCompleto ? capitalizeName(user.nomeCompleto) : 'Usuário'}!
                </h1>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4 relative z-10">
              {chatHistory.map((msg, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg max-w-[90%] ${msg.sender === 'user' ? 'bg-primary text-cream self-end ml-auto' : 'text-cream self-start'}`}
                >
                  {msg.text}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>
          
          {/* Campo de input e botões de ação */}
          <div className="flex flex-col gap-4 w-full relative z-10">
            <div className="flex w-full">
              <input
                type="text"
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                className="flex-1 p-3 rounded-2xl border border-gray-300 bg-cream text-black-basic"
                placeholder="Descreva aqui o que você precisa para que eu possa ajudá-lo"
              />
              <button
                onClick={handleSendMessage}
                className="p-3 bg-primary text-cream rounded-r-lg hover:bg-accent transition-colors duration-200"
              >
                Enviar
              </button>
            </div>
            
            <div className="flex justify-center space-x-4">
              <input type="file" id="file-input-import" className="hidden" onChange={handleImport} accept=".csv" />
              <div onClick={() => document.getElementById('file-input-import').click()} className="flex flex-col items-center p-4 bg-primary rounded-xl cursor-pointer hover:bg-accent transition duration-200">
                <Image src="/export.svg" alt="Importar" width={32} height={32} />
                <span className="mt-2 text-sm text-cream">Importar</span>
              </div>
              <div onClick={handleExport} className="flex flex-col items-center p-4 bg-primary rounded-xl cursor-pointer hover:bg-accent transition duration-200">
                <Image src="/import.svg" alt="Exportar" width={32} height={32} />
                <span className="mt-2 text-sm text-cream">Exportar</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}