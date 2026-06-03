'use client';
import { useState, useEffect } from 'react';

export default function TelegramStatus() {
  const [status, setStatus] = useState("PENDING");

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/chat/healthCheckStatus');
        const data = await res.json();
        setStatus(data.status);
      } catch {
        setStatus('DISCONNECTED');
      }
    };
    check();
    const id = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const config = {
    CONNECTED: { txt: 'Conectado', dot: 'bg-emerald-500', ping: 'bg-emerald-400', text: 'text-emerald-400' },
    PENDING: { txt: 'Pendente', dot: 'bg-amber-500', ping: 'bg-amber-400', text: 'text-amber-400' },
    DISCONNECTED: { txt: 'Desconectado', dot: 'bg-rose-500', ping: 'bg-rose-400', text: 'text-rose-400' }
  }[status] || { txt: 'Desconectado', dot: 'bg-rose-500', ping: 'bg-rose-400', text: 'text-rose-400' };

  return (
    <div className="flex items-center justify-between p-3 bg-slate-200 rounded-xl max-w-xs shadow-sm">
      <div className="flex items-center space-x-2.5">
        <svg className="w-5 h-5 text-sky-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-1-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.53-1.39.51-.46-.01-1.33-.26-1.98-.47-.8-.26-1.43-.4-1.37-.85.03-.23.35-.46.96-.71 3.76-1.63 6.27-2.71 7.54-3.23 3.59-1.47 4.33-1.73 4.82-1.74.11 0 .35.03.5.16.13.1.17.24.19.34.02.07.02.21.01.29z"/>
        </svg>
        <span className="text-xs font-medium text-slate-900 px-2">Telegram API</span>
      </div>

      <div className="flex items-center space-x-1.5 px-2 py-1 rounded-full">
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute h-full w-full rounded-full opacity-75 ${config.ping}`}></span>
          <span className={`relative rounded-full h-2 w-2 ${config.dot}`}></span>
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${config.text}`}>
          {config.txt}
        </span>
      </div>
    </div>
  );
}