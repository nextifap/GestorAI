'use client';

import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  formatSlotPtBr,
  formatDateDDMMYYYY,
  getDateBlockReason,
  getTodayIsoDate,
  scheduleLimits,
  validateScheduleInput,
} from '@/lib/schedule';

const businessHours = Array.from({ length: scheduleLimits.endHour - scheduleLimits.startHour + 1 }, (_, index) => scheduleLimits.startHour + index);
const tabOptions = [
  { id: 'chat', label: 'Chat' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'requests', label: 'Solicitações' },
  { id: 'handover', label: 'Handover' },
  { id: 'history', label: 'Histórico' },
];

const capitalizeName = (name) => {
  if (!name) return '';
  return name.split(' ').map((word) => {
    if (word.length === 0) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

const getSummary = (text) => {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '');
};

const isoKey = (date) => {
  if (!date) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (isoDate) => {
  const [year, month, day] = String(isoDate || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12));
};

const getBusinessDays = (referenceDate = new Date(), count = 5) => {
  const days = [];
  const cursor = new Date(referenceDate);
  cursor.setHours(12, 0, 0, 0);

  let attempts = 0;
  while (days.length < count && attempts < 31) {
    const nextDate = new Date(cursor);
    nextDate.setDate(cursor.getDate() + attempts);
    const iso = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
    if (!getDateBlockReason(iso)) {
      days.push({
        iso,
        label: nextDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        day: nextDate.getDate(),
        ddmm: formatDateDDMMYYYY(iso),
      });
    }

    attempts += 1;
  }

  return days;
};

const formatWeekRange = (weekDays) => {
  if (!weekDays.length) return '';
  const start = parseIsoDate(weekDays[0].iso);
  const end = parseIsoDate(weekDays[weekDays.length - 1].iso);
  if (!start || !end) return '';

  const startLabel = start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const endLabel = end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return `${startLabel} - ${endLabel}`;
};

const formatCalendarCellTitle = (date, hour) => {
  const parsed = parseIsoDate(date);
  if (!parsed) return `${date} • ${String(hour).padStart(2, '0')}:00`;

  const dateLabel = parsed.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).replace('.', '');

  const ddmm = formatDateDDMMYYYY(date);

  return `${dateLabel} (${ddmm}) • ${String(hour).padStart(2, '0')}:00`;
};

const buildSlotsMap = (slots) => slots.reduce((acc, slot) => {
  const key = isoKey(slot.date);
  if (!acc[key]) acc[key] = {};
  acc[key][slot.hour] = slot;
  return acc;
}, {});

const buildRequestsMap = (requests) => requests.reduce((acc, request) => {
  const key = isoKey(request.date);
  if (!acc[key]) acc[key] = [];
  acc[key].push(request);
  return acc;
}, {});

function Modal({ open, title, subtitle, onClose, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200">
            Fechar
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function DashboardWorkspace() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [handoverQueue, setHandoverQueue] = useState([]);
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [appointmentRequests, setAppointmentRequests] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [slotModal, setSlotModal] = useState({ open: false, mode: 'create', slot: null, date: '', hour: scheduleLimits.startHour, isAvailable: true });
  const [requestModal, setRequestModal] = useState({ open: false, request: null, justification: '' });
  const [rejectReasonById, setRejectReasonById] = useState({});
  const router = useRouter();
  const chatEndRef = useRef(null);

  const todayIso = useMemo(() => getTodayIsoDate(), []);
  const businessDays = useMemo(() => getBusinessDays(new Date(), 5), []);
  const slotsByDate = useMemo(() => buildSlotsMap(scheduleSlots), [scheduleSlots]);
  const requestsByDate = useMemo(() => buildRequestsMap(appointmentRequests), [appointmentRequests]);
  const availableSlotsCount = scheduleSlots.filter((slot) => slot.isAvailable).length;
  const blockedSlotsCount = scheduleSlots.length - availableSlotsCount;

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
        await Promise.all([
          fetchConversations(),
          fetchHandoverQueue(),
          fetchScheduleSlots(),
          fetchAppointmentRequests(),
        ]);
        setLoading(false);
      } catch {
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    if (chatEndRef.current && activeTab === 'chat') {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, activeTab]);

  useEffect(() => {
    const handleClickOutside = () => setMenuOpen(false);
    if (menuOpen) {
      window.addEventListener('click', handleClickOutside);
    }

    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

  const fetchConversations = async () => {
    try {
      const response = await fetch('/api/conversations', { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch {
      // Mantém o estado atual.
    }
  };

  const fetchHandoverQueue = async () => {
    try {
      const response = await fetch('/api/handover/queue', { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setHandoverQueue(data.queue || []);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch {
      // Mantém o estado atual.
    }
  };

  const fetchScheduleSlots = async () => {
    try {
      const response = await fetch(`/api/schedule/slots?from=${todayIso || ''}`, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setScheduleSlots(data.slots || []);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch {
      // Mantém o estado atual.
    }
  };

  const fetchAppointmentRequests = async () => {
    try {
      const response = await fetch('/api/appointments/requests?status=pending', { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setAppointmentRequests(data.requests || []);
      } else if (response.status === 401) {
        router.push('/login');
      }
    } catch {
      // Mantém o estado atual.
    }
  };

  const openSlotModal = ({ mode, slot = null, date = '', hour = scheduleLimits.startHour, isAvailable = true }) => {
    setNotice('');
    setSlotModal({
      open: true,
      mode,
      slot,
      date,
      hour,
      isAvailable,
    });
  };

  const closeSlotModal = () => setSlotModal({ open: false, mode: 'create', slot: null, date: '', hour: scheduleLimits.startHour, isAvailable: true });

  const openRequestModal = (request) => {
    setNotice('');
    setRequestModal({
      open: true,
      request,
      justification: request?.justification || rejectReasonById[request?.id] || '',
    });
  };

  const closeRequestModal = () => setRequestModal({ open: false, request: null, justification: '' });

  const handleSaveSlot = async () => {
    const date = slotModal.date;
    const hour = Number(slotModal.hour);
    const validation = validateScheduleInput({ date, hour });

    if (!validation.ok) {
      setNotice(validation.error);
      return;
    }

    const payload = {
      date,
      hour,
      isAvailable: slotModal.isAvailable,
    };

    const endpoint = slotModal.mode === 'edit' && slotModal.slot ? `/api/schedule/slots/${slotModal.slot.id}` : '/api/schedule/slots';
    const method = slotModal.mode === 'edit' && slotModal.slot ? 'PATCH' : 'POST';

    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setNotice(data.error || 'Não foi possível salvar o slot.');
      return;
    }

    closeSlotModal();
    await fetchScheduleSlots();
  };

  const handleDeleteSlot = async () => {
    if (!slotModal.slot?.id) return;

    const response = await fetch(`/api/schedule/slots/${slotModal.slot.id}`, { method: 'DELETE' });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setNotice(data.error || 'Não foi possível excluir o slot.');
      return;
    }

    closeSlotModal();
    await fetchScheduleSlots();
  };

  const handleToggleSlot = async (slot) => {
    const response = await fetch(`/api/schedule/slots/${slot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: !slot.isAvailable }),
    });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setNotice(data.error || 'Não foi possível atualizar o slot.');
      return;
    }

    closeSlotModal();
    await fetchScheduleSlots();
  };

  const handleDecisionRequest = async (requestId, action, justificationOverride = '') => {
    const justification = String(justificationOverride || requestModal.justification || rejectReasonById[requestId] || '').trim();
    if (action === 'reject' && !justification) {
      setNotice('Informe a justificativa para recusar a solicitação.');
      return;
    }

    const response = await fetch(`/api/appointments/requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, justification }),
    });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setNotice(data.error || 'Não foi possível processar a solicitação.');
      return;
    }

    setRejectReasonById((prev) => ({ ...prev, [requestId]: '' }));
    closeRequestModal();
    await fetchAppointmentRequests();
    await fetchScheduleSlots();
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

      await Promise.all([fetchHandoverQueue(), fetchConversations()]);
      await handleHistoryClick(conversationId);
    } catch (error) {
      setNotice(error.message || 'Erro ao assumir conversa.');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
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
    setChatHistory((prev) => [...prev, newUserMessage]);
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
      setChatHistory((prev) => [...prev, { sender: 'assistant', text: result.response, conversationId: convIdToUse }]);
    } catch (error) {
      setNotice('Erro: ' + error.message);
    }
  };

  const handleNewChat = () => {
    setChatHistory([]);
    setCurrentMessage('');
    setCurrentConversationId(null);
    setActiveTab('chat');
  };

  const handleHistoryClick = async (id) => {
    try {
      const response = await fetch(`/api/chat/${id}`, { method: 'GET' });
      if (response.status === 401) {
        router.push('/login');
        return;
      }

      const result = await response.json();
      const msgs = result.conversation.messages.map((m) => ({ sender: m.sender, text: m.text }));
      setChatHistory(msgs);
      setCurrentConversationId(id);
      setActiveTab('chat');
    } catch {
      setNotice('Não foi possível carregar a conversa.');
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

    setNotice('Importado com sucesso.');
  };

  const handleExport = async () => {
    const response = await fetch('/api/export-tasks', { method: 'GET' });

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

  const quickPrompts = [
    'Quando o gestor tem horário livre?',
    'Quero solicitar um agendamento para amanhã às 16h',
    'Mostre horários disponíveis da semana',
  ];

  const renderChatPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Chat</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">{user?.nomeCompleto ? `Olá, ${capitalizeName(user.nomeCompleto)}!` : 'Bem-vindo ao GestorAI'}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Converse aqui. A agenda e as solicitações ficam em painéis separados para reduzir ruído visual.</p>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button onClick={() => setActiveTab('agenda')} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Ir para agenda</button>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => setCurrentMessage(prompt)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[calc(100vh-360px)] min-h-[28rem] overflow-y-auto bg-[linear-gradient(180deg,_rgba(248,250,252,1)_0%,_rgba(255,255,255,1)_100%)] px-6 py-6">
        {chatHistory.length === 0 ? (
          <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-sky-50 shadow-sm">
              <Image src="/logo.png" alt="Logo" width={48} height={48} priority />
            </div>
            <h4 className="mt-5 text-xl font-semibold text-slate-900">Abra uma conversa ou envie uma dúvida</h4>
            <p className="mt-2 max-w-md text-sm text-slate-500">Pergunte sobre horários livres ou solicite um agendamento. O painel de agenda fica disponível na aba dedicada.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {chatHistory.map((msg, idx) => (
              <div key={`${msg.sender}-${idx}`} className={`flex items-end gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'assistant' && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">AI</div>}
                <div className={`max-w-[82%] rounded-[24px] px-4 py-3 shadow-sm ${msg.sender === 'user' ? 'rounded-br-md bg-gradient-to-r from-sky-600 to-indigo-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                  {msg.sender === 'assistant' ? (
                    <div className="prose prose-slate max-w-none text-sm [&>ul]:ml-4 [&>ol]:ml-4 [&>ul]:list-disc [&>ol]:list-decimal">
                      <ReactMarkdown
                        components={{
                          code({ inline, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline && match ? (
                              <div className="my-4 overflow-hidden rounded-2xl border border-slate-200">
                                <div className="bg-slate-100 px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{match[1]}</div>
                                <SyntaxHighlighter style={atomDark} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: '1rem', background: '#0f172a' }} {...props}>
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              </div>
                            ) : (
                              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-900" {...props}>{children}</code>
                            );
                          },
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-6">{msg.text}</p>
                  )}
                </div>
                {msg.sender === 'user' && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">EU</div>}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white/95 px-6 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            type="text"
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
            placeholder="Escreva sua mensagem ou peça um horário livre..."
          />
          <button onClick={handleSendMessage} className="rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-slate-800">
            Enviar
          </button>
        </div>
      </div>
    </div>
  );

  const renderAgendaPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Agenda</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Calendário semanal</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">A agenda aparece apenas aqui. Slots passados e feriados ficam indisponíveis e não podem ser agendados.</p>
        </div>
        <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-600">{formatWeekRange(businessDays)}</div>
      </div>

      <div className="mt-5 grid grid-cols-[64px_repeat(5,minmax(0,1fr))] gap-2 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-3">
        <div />
        {businessDays.map((day) => {
          const blocked = getDateBlockReason(day.iso);
          const daySlots = slotsByDate[day.iso] || {};
          const dayRequests = requestsByDate[day.iso] || [];

          return (
            <div key={day.iso} className={`rounded-2xl px-3 py-3 text-center shadow-sm ${blocked ? 'bg-slate-100' : 'bg-white'}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{day.label}</div>
              <div className="mt-1 text-xs font-semibold text-sky-700">{day.ddmm}</div>
              <div className="mt-0.5 text-xl font-semibold text-slate-900">{day.day}</div>
              <div className="mt-2 text-[11px] text-slate-500">{blocked ? blocked : `${Object.values(daySlots).filter((slot) => slot.isAvailable).length} livres`}</div>
              {dayRequests.length > 0 && (
                <div className="mt-1 text-[10px] font-semibold text-amber-700">
                  {dayRequests.length} {dayRequests.length === 1 ? 'solicitação' : 'solicitações'}
                </div>
              )}
            </div>
          );
        })}

        {businessHours.map((hour) => (
          <Fragment key={`hour-${hour}`}>
            <div key={`hour-label-${hour}`} className="flex items-center justify-end pr-2 text-[11px] font-semibold text-slate-400">{String(hour).padStart(2, '0')}:00</div>
            {businessDays.map((day) => {
              const slot = slotsByDate[day.iso]?.[hour] || null;
              const blockedReason = getDateBlockReason(day.iso);
              const requests = (requestsByDate[day.iso] || []).filter((request) => Number(request.hour) === hour);
              const cellStatus = slot
                ? slot.isAvailable
                  ? 'Livre'
                  : 'Ocupado'
                : blockedReason
                  ? 'Fechado'
                  : 'Adicionar';

              const tone = slot
                ? slot.isAvailable
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
                : blockedReason
                  ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50';

              return (
                <button
                  key={`${day.iso}-${hour}`}
                  onClick={() => {
                    if (blockedReason) {
                      setNotice(blockedReason);
                      return;
                    }

                    openSlotModal({
                      mode: slot ? 'edit' : 'create',
                      slot,
                      date: day.iso,
                      hour,
                      isAvailable: slot ? slot.isAvailable : true,
                    });
                  }}
                  className={`group min-h-[86px] rounded-2xl border p-2 text-left transition ${tone}`}
                  disabled={Boolean(blockedReason)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide">{String(hour).padStart(2, '0')}:00</div>
                      <div className="mt-1 text-xs leading-5">{cellStatus}</div>
                      {requests.length > 0 && <div className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">{requests.length} {requests.length === 1 ? 'solicitação' : 'solicitações'}</div>}
                    </div>
                    <div className={`h-2.5 w-2.5 rounded-full ${slot ? (slot.isAvailable ? 'bg-emerald-500' : 'bg-rose-500') : (blockedReason ? 'bg-slate-300' : 'bg-slate-300 group-hover:bg-sky-400')}`} />
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-current/60">{slot ? 'Slot cadastrado' : blockedReason ? 'Agenda fechada' : 'Clique para criar'}</div>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="mt-4 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">Clique em um horário para abrir o modal de edição.</div>
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">Datas passadas e feriados já chegam bloqueadas.</div>
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">O gestor mantém a agenda aberta por padrão, salvo horários ocupados.</div>
      </div>
    </div>
  );

  const renderRequestsPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Solicitações</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Aprovar ou recusar</h2>
          <p className="mt-1 text-sm text-slate-500">Abra cada item para decidir sem poluir a tela principal.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{appointmentRequests.length}</span>
      </div>

      <div className="mt-5 grid gap-3">
        {appointmentRequests.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Sem solicitações pendentes no momento.</div>}
        {appointmentRequests.map((item) => (
          <button key={item.id} onClick={() => openRequestModal(item)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{formatCalendarCellTitle(item.date, item.hour)}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{item.channel}</div>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Pendente</span>
            </div>
            <div className="mt-3 rounded-2xl bg-white p-3 text-sm text-slate-700">
              <div className="font-medium text-slate-900">{item.requester?.nomeCompleto || item.requester?.email || 'Solicitante não identificado'}</div>
              <div className="mt-1 text-sm leading-6 text-slate-600">Toque para abrir o modal e decidir com justificativa quando necessário.</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderHandoverPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Handover</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Conversas pendentes</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{handoverQueue.length}</span>
      </div>
      <div className="mt-5 grid gap-3">
        {handoverQueue.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Sem conversas pendentes.</div>}
        {handoverQueue.map((conv) => (
          <div key={conv.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">{conv.summary}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{conv.handlingMode || 'Manual'}</p>
            <button onClick={() => handleTakeHandover(conv.id)} className="mt-3 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500">Assumir conversa</button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHistoryPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Histórico</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Conversas salvas</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{conversations.length}</span>
      </div>
      <div className="mt-5 grid gap-2">
        {conversations.map((conv) => (
          <button key={conv.id} onClick={() => handleHistoryClick(conv.id)} className={`rounded-2xl border px-4 py-3 text-left transition ${currentConversationId === conv.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
            <div className="truncate text-sm font-medium text-slate-900">{conv.summary}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{conv.handlingMode || 'Automatizado'}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'agenda':
        return renderAgendaPanel();
      case 'requests':
        return renderRequestsPanel();
      case 'handover':
        return renderHandoverPanel();
      case 'history':
        return renderHistoryPanel();
      case 'chat':
      default:
        return renderChatPanel();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#eef6ff_0%,_#f8fafc_40%,_#eef2ff_100%)] text-slate-900 flex items-center justify-center">
        <div className="rounded-3xl border border-white/80 bg-white/70 px-6 py-4 shadow-xl backdrop-blur-xl">Carregando painel...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#eef6ff_0%,_#f8fafc_40%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
        <header className="rounded-[30px] border border-white/80 bg-white/85 px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-200/60">
                <Image src="/logo.png" alt="GestorAI" width={34} height={34} priority />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">GestorAI</p>
                <h1 className="text-xl font-semibold text-slate-900">Painel do gestor</h1>
                <p className="text-sm text-slate-500">Uma aba por vez, sem poluir o fluxo principal.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {tabOptions.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === tab.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative flex items-center gap-2">
              <button onClick={() => setActiveTab('agenda')} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Agenda</button>
              <button onClick={() => setMenuOpen((value) => !value)} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Menu</button>
              {menuOpen && (
                <div className="absolute right-0 top-14 z-30 w-56 rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.15)]" onClick={(event) => event.stopPropagation()}>
                  <button onClick={() => { handleExport(); setMenuOpen(false); }} className="w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">Exportar tarefas</button>
                  <button onClick={() => { document.getElementById('file-input').click(); setMenuOpen(false); }} className="w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">Importar tarefas</button>
                  <button onClick={() => { handleLogout(); setMenuOpen(false); }} className="w-full rounded-2xl px-4 py-3 text-left text-sm text-rose-600 transition hover:bg-rose-50">Sair</button>
                  <input type="file" id="file-input" className="hidden" onChange={handleImport} accept=".csv" />
                </div>
              )}
            </div>
          </div>
          {notice && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div>}
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <div className="rounded-2xl bg-sky-50 px-4 py-3">
              <div className="text-xl font-semibold text-sky-900">{availableSlotsCount}</div>
              <div className="text-xs text-sky-700">Horários livres</div>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-3">
              <div className="text-xl font-semibold text-rose-900">{blockedSlotsCount}</div>
              <div className="text-xs text-rose-700">Horários ocupados</div>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <div className="text-xl font-semibold text-amber-900">{appointmentRequests.length}</div>
              <div className="text-xs text-amber-700">Solicitações pendentes</div>
            </div>
            <div className="hidden rounded-2xl bg-slate-50 px-4 py-3 xl:block">
              <div className="text-xl font-semibold text-slate-900">{formatDateDDMMYYYY(todayIso) || '--'}</div>
              <div className="text-xs text-slate-500">Hoje na agenda</div>
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-h-0">{renderActivePanel()}</section>

          <aside className="flex min-h-0 flex-col gap-4">
            <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Como usar</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">1. Use as abas para mostrar só o necessário.</div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">2. Clique em um dia/horário para abrir o modal de agenda.</div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">3. Solicitantes e handover ficam separados do chat.</div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Legenda</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Livre</div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-500" /> Ocupado</div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-300" /> Fechado / indisponível</div>
              </div>
            </div>
          </aside>
        </main>
      </div>

      <Modal
        open={slotModal.open}
        title={slotModal.mode === 'edit' ? 'Editar horário' : 'Cadastrar horário'}
        subtitle={slotModal.mode === 'edit' ? 'Ajuste status, data ou horário deste slot.' : 'Crie um slot livre ou bloqueado dentro da agenda.'}
        onClose={closeSlotModal}
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-600">
              <span>Data</span>
              <input
                type="date"
                min={todayIso || undefined}
                value={slotModal.date}
                onChange={(e) => setSlotModal((prev) => ({ ...prev, date: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Horário</span>
              <select
                value={slotModal.hour}
                onChange={(e) => setSlotModal((prev) => ({ ...prev, hour: Number(e.target.value) }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              >
                {businessHours.map((hour) => (
                  <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={slotModal.isAvailable}
              onChange={(e) => setSlotModal((prev) => ({ ...prev, isAvailable: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            Horário livre
          </label>

          {slotModal.slot && (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {slotModal.slot.isAvailable ? 'Este horário está livre.' : 'Este horário está ocupado.'}
            </div>
          )}

          <div className="flex flex-col gap-2 md:flex-row">
            <button onClick={handleSaveSlot} className="rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800">
              Salvar horário
            </button>
            {slotModal.mode === 'edit' && slotModal.slot && (
              <button onClick={() => handleToggleSlot(slotModal.slot)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50">
                {slotModal.slot.isAvailable ? 'Bloquear' : 'Liberar'}
              </button>
            )}
            {slotModal.mode === 'edit' && slotModal.slot && (
              <button onClick={handleDeleteSlot} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-medium text-rose-700 transition hover:bg-rose-100">
                Excluir slot
              </button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={requestModal.open}
        title="Decidir solicitação"
        subtitle={requestModal.request ? formatSlotPtBr(requestModal.request.date, requestModal.request.hour) : ''}
        onClose={closeRequestModal}
      >
        <div className="space-y-4">
          {requestModal.request && (
            <>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div className="font-medium text-slate-900">{requestModal.request.requester?.nomeCompleto || requestModal.request.requester?.email || 'Solicitante não identificado'}</div>
                <div className="mt-1 text-slate-500">Canal: {requestModal.request.channel}</div>
              </div>

              <label className="space-y-2 text-sm text-slate-600">
                <span>Justificativa da recusa</span>
                <textarea
                  rows={4}
                  value={requestModal.justification}
                  onChange={(e) => setRequestModal((prev) => ({ ...prev, justification: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  placeholder="Obrigatória se a solicitação for recusada"
                />
              </label>

              <div className="flex flex-col gap-2 md:flex-row">
                <button onClick={() => handleDecisionRequest(requestModal.request.id, 'approve', requestModal.justification)} className="rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500">
                  Aprovar
                </button>
                <button onClick={() => handleDecisionRequest(requestModal.request.id, 'reject', requestModal.justification)} className="rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white transition hover:bg-rose-500">
                  Recusar
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
