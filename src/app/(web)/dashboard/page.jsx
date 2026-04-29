'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
  const [handoverQueue, setHandoverQueue] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const router = useRouter();
  const chatEndRef = useRef(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const meResponse = await fetch('/api/auth/me', { method: 'GET' });
        if (!meResponse.ok) {
          router.push('/login');
          return;
        }

        const meData = await meResponse.json();
        if (!meData?.user) {
          router.push('/login');
          return;
        }

        setUser(meData.user);
        await fetchConversations();
        await fetchHandoverQueue();
        setLoading(false);
      } catch {
        router.push('/login');
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  const fetchConversations = async () => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'GET',
      });
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch {
      // Erros de rede são tratados com fallback de UX no fluxo da tela.
    }
  };

  const fetchHandoverQueue = async () => {
    try {
      const response = await fetch('/api/handover/queue', {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        setHandoverQueue(data.queue || []);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch {
      // Sem ação: mantém a última fila carregada.
    }
  };

  const handleTakeHandover = async (conversationId) => {
    try {
      const response = await fetch(`/api/handover/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'handover_in_progress',
          handoverNote: 'Conversa assumida manualmente pelo painel web.',
        }),
      });

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Não foi possível assumir a conversa.');
      }

      await fetchHandoverQueue();
      await fetchConversations();
      await handleHistoryClick(conversationId);
    } catch (error) {
      alert(error.message || 'Erro ao assumir conversa.');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return;

    let convIdToUse = currentConversationId;
    
    if (!convIdToUse) {
      const summary = getSummary(currentMessage);
      const newConv = await saveConversationSummary(summary);
      if (newConv) {
        convIdToUse = newConv.conversation.id;
        setCurrentConversationId(newConv.conversation.id);
      }
    }

    const newUserMessage = { sender: 'user', text: currentMessage, conversationId: convIdToUse };
    setChatHistory(prev => [...prev, newUserMessage]);
    setCurrentMessage('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: newUserMessage.text, conversationId: convIdToUse }),
      });

      if (!response.ok) throw new Error('Erro na comunicação.');
      
      const result = await response.json();
      setChatHistory(prev => [...prev, { sender: 'assistant', text: result.response, conversationId: convIdToUse }]);

    } catch (error) {
      alert('Erro: ' + error.message);
    }
  };

  const saveConversationSummary = async (summary) => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });

      if (response.status === 401) {
        router.push('/login');
        return null;
      }

      const data = await response.json();
      fetchConversations(); 
      return data;
    } catch {
      return null;
    }
  };

  const handleNewChat = () => {
    setChatHistory([]);
    setCurrentMessage('');
    setCurrentConversationId(null);
  };
  
  const handleHistoryClick = async (id) => {
    try {
        const response = await fetch(`/api/chat/${id}`, {
            method: 'GET',
        });

        if (response.status === 401) {
          router.push('/login');
          return;
        }

        const result = await response.json();
        const msgs = result.conversation.messages.map(m => ({ sender: m.sender, text: m.text }));
        setChatHistory(msgs);
        setCurrentConversationId(id);
    } catch {
        // Sem ação: mantém a tela atual.
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/import-tasks', {
      method: 'POST',
      body: formData,
    });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    alert('Importado!');
  };

  const handleExport = async () => {
    const response = await fetch('/api/export-tasks', {
      method: 'GET',
    });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.csv';
    a.click();
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-black-basic text-cream">Carregando...</div>;

  return (
    <div className="flex h-screen bg-background text-black-basic font-sans overflow-hidden">
      <aside className="w-80 bg-primary p-6 flex flex-col h-full z-20">
        <div className="mt-8 flex flex-col h-full overflow-hidden">
          <button onClick={handleNewChat} className="w-full bg-accent text-cream p-3 rounded-full font-semibold hover:bg-white hover:text-primary transition-all mb-6">Novo Chat</button>

          <h3 className="text-cream text-xs uppercase font-bold mb-2 opacity-70">Handover</h3>
          <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar mb-6">
            {handoverQueue.length === 0 && (
              <div className="text-[11px] text-cream/70">Sem conversas pendentes.</div>
            )}
            {handoverQueue.map((conv) => (
              <div key={`handover-${conv.id}`} className="p-2 rounded-xl bg-black/20">
                <p className="text-[11px] text-cream truncate">{conv.summary}</p>
                <p className="text-[10px] text-cream/70 mt-1">Atendimento: {conv.handlingMode || 'Manual'}</p>
                <button
                  onClick={() => handleTakeHandover(conv.id)}
                  className="mt-1 w-full text-[11px] bg-accent text-cream rounded-lg py-1 font-semibold hover:bg-white hover:text-primary transition-all"
                >
                  Assumir
                </button>
              </div>
            ))}
          </div>

          <h3 className="text-cream text-xs uppercase font-bold mb-4 opacity-70">Histórico</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {conversations.map((conv) => (
              <div key={conv.id} onClick={() => handleHistoryClick(conv.id)} className={`cursor-pointer p-3 rounded-xl text-sm text-cream truncate transition ${currentConversationId === conv.id ? 'bg-accent' : 'hover:bg-accent/40'}`}>
                <div className="truncate">{conv.summary}</div>
                <div className="text-[10px] opacity-70 uppercase mt-1">{conv.handlingMode || 'Automatizado'}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full bg-cream relative">
        <header className="absolute top-0 right-0 p-6 z-30">
          <button onClick={handleLogout} className="bg-primary text-cream p-3 rounded-full hover:bg-accent transition-all shadow-lg">
            <img src="/out.svg" alt="Sair" className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 flex flex-col w-full max-w-5xl mx-auto p-4 h-full">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-black-basic rounded-t-3xl shadow-2xl mt-4 custom-scrollbar">
            {chatHistory.length === 0 && (
              <div className="flex-1 h-full flex flex-col items-center justify-center opacity-10">
                <Image src="/logo.png" alt="Logo" width={200} height={200} priority />
                <h1 className="text-2xl font-bold text-cream mt-4">Olá, {user?.nomeCompleto ? capitalizeName(user.nomeCompleto) : 'Usuário'}!</h1>
              </div>
            )}
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-4 rounded-2xl max-w-[85%] ${msg.sender === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-[#1e1e1e] text-cream rounded-tl-none border border-gray-800'}`}>
                  {msg.sender === 'assistant' ? (
                    <div className="prose prose-invert max-w-none text-sm [&>ul]:list-disc [&>ul]:ml-4 [&>ol]:list-decimal [&>ol]:ml-4 [&>strong]:text-accent">
                      <ReactMarkdown
                        components={{
                          code({ inline, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <div className="my-4 rounded-xl overflow-hidden border border-gray-700">
                                <div className="bg-gray-800 px-4 py-1 text-[10px] text-gray-400 uppercase font-bold">{match[1]}</div>
                                <SyntaxHighlighter style={atomDark} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: '1rem', background: '#121212' }} {...props}>
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              </div>
                            ) : (
                              <code className="bg-gray-700 px-1 rounded text-accent" {...props}>{children}</code>
                            );
                          }
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  ) : <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="bg-black-basic p-6 rounded-b-3xl mb-4 border-t border-gray-800">
            <div className="flex gap-3 mb-6">
              <input type="text" value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} className="flex-1 p-4 rounded-2xl bg-[#2a2a2a] text-cream outline-none focus:ring-1 focus:ring-accent" placeholder="Descreva aqui o que precisa..." />
              <button onClick={handleSendMessage} className="px-8 bg-primary text-cream rounded-2xl font-bold hover:bg-accent transition-all active:scale-95">Enviar</button>
            </div>
            <div className="flex justify-center space-x-10">
              <button onClick={() => document.getElementById('file-input').click()} className="flex flex-col items-center gap-1 group">
                <div className="p-3 bg-gray-800 rounded-xl group-hover:bg-primary transition-all"><Image src="/export.svg" alt="In" width={20} height={20}/></div>
                <span className="text-[10px] text-gray-500 font-bold uppercase">Importar</span>
                <input type="file" id="file-input" className="hidden" onChange={handleImport} accept=".csv" />
              </button>
              <button onClick={handleExport} className="flex flex-col items-center gap-1 group">
                <div className="p-3 bg-gray-800 rounded-xl group-hover:bg-primary transition-all"><Image src="/import.svg" alt="Out" width={20} height={20}/></div>
                <span className="text-[10px] text-gray-500 font-bold uppercase">Exportar</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        .prose pre { background: transparent !important; padding: 0 !important; }
        .prose code::before, .prose code::after { content: "" !important; }
      `}</style>
    </div>
  );
}