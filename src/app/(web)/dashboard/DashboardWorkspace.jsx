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
  getHolidayName,
  getTodayIsoDate,
  scheduleLimits,
  validateScheduleInput,
} from '@/lib/schedule';
import { formatarData } from '@/lib/utils';
import { getApiErrorMessage, readApiError } from '@/lib/apiClient';
import SidebarInfo from './components/Sidebar';
import TelegramStatus from './components/HealthCheckStatus';
import TelegramLogin from './components/TelegramLogin';
import GroqConfig from './components/GroqConfig';

const businessHours = Array.from({ length: scheduleLimits.endHour - scheduleLimits.startHour + 1 }, (_, index) => scheduleLimits.startHour + index);
const baseTabOptions = [
  { id: 'chat', label: 'Chat' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'events', label: 'Eventos' },
  { id: 'requests', label: 'Solicitações' },
  { id: 'contacts', label: 'Contatos' },
  { id: 'handover', label: 'Handover' },
  { id: 'history', label: 'Histórico' },
];
const adminTabOptions = [];
const hiddenAdminTabs = [];
const hideSidebarForTabs = ['chat'];
const CONVERSATIONS_PER_PAGE = 8;

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

// Retorna os 7 dias da semana (domingo -> sábado) para exibição do calendário.
const getWeekDays = (referenceDate = new Date()) => {
  const days = [];
  const date = new Date(referenceDate);
  date.setHours(12, 0, 0, 0);

  // Ajusta para o domingo da semana atual
  const dayOfWeek = date.getDay(); // 0 (Dom) - 6 (Sáb)
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - dayOfWeek);

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({
      iso,
      label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      day: d.getDate(),
      ddmm: formatDateDDMMYYYY(iso),
    });
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

const toDateInputValue = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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

function Modal({ open, title, subtitle, onClose, children, dismissible = true }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {dismissible && (
            <button onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200">
              Fechar
            </button>
          )}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function DashboardWorkspace() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [handoverQueue, setHandoverQueue] = useState([]);
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [appointmentRequests, setAppointmentRequests] = useState([]);
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [slotModal, setSlotModal] = useState({ open: false, mode: 'create', slot: null, date: '', hour: scheduleLimits.startHour, isAvailable: true });
  const [eventModal, setEventModal] = useState({ open: false, mode: 'create', event: null, title: '', description: '', date: '', time: '' });
  const [requestModal, setRequestModal] = useState({ open: false, request: null, justification: '' });
  const [credentialModal, setCredentialModal] = useState({
    open: false,
    mandatory: false,
    email: '',
    senha: '',
    repitaSenha: '',
    loading: false,
    message: '',
    messageType: '',
  });
  const [userModal, setUserModal] = useState({
    open: false,
    mode: 'create',
    user: null,
    nomeCompleto: '',
    email: '',
    senha: '',
    repitaSenha: '',
    mustChangeCredentials: true,
  });
  const [rejectReasonById, setRejectReasonById] = useState({});
  const [historyPage, setHistoryPage] = useState(1);
  const router = useRouter();
  const chatEndRef = useRef(null);

  const todayIso = useMemo(() => getTodayIsoDate(), []);
  const businessDays = useMemo(() => getBusinessDays(new Date(), 5), []);
  const [weekStartDate, setWeekStartDate] = useState(() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; });
  const weekDays = useMemo(() => getWeekDays(weekStartDate), [weekStartDate]);
  const slotsByDate = useMemo(() => buildSlotsMap(scheduleSlots), [scheduleSlots]);
  const requestsByDate = useMemo(() => buildRequestsMap(appointmentRequests), [appointmentRequests]);
  const availableSlotsCount = scheduleSlots.filter((slot) => slot.isAvailable).length;
  const blockedSlotsCount = scheduleSlots.length - availableSlotsCount;

  const [poolingIntervalId, setPoolingIntervalId] = useState(false);
  const [poolingMessagesIntervalId, setPoolingMessagesIntervalId] = useState(false);

  const visibleTabs = useMemo(() => {
    if (user?.role === 'admin') {
      return [...baseTabOptions, ...adminTabOptions];
    }
    return baseTabOptions;
  }, [user?.role]);

  const availableTabs = useMemo(() => {
    if (user?.role === 'admin') {
      return [...baseTabOptions, ...adminTabOptions, ...hiddenAdminTabs];
    }
    return baseTabOptions;
  }, [user?.role]);

  useEffect(() => {
    if (poolingIntervalId) clearInterval(poolingIntervalId);

    setPoolingIntervalId(setInterval(() => {
      fetchConversations(null, 'true');
    }, 15000));
  }, []);

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

        if (meData.user.mustChangeCredentials) {
          setCredentialModal({
            open: true,
            mandatory: true,
            email: meData.user.email || '',
            senha: '',
            repitaSenha: '',
            loading: false,
            message: '',
            messageType: '',
          });
        }

        await Promise.all([
          fetchConversations(),
          // fetchHandoverQueue(),
          // fetchScheduleSlots(),
          // fetchAppointmentRequests(),
          // fetchEvents(),
        ]);

        setLoading(false);
      } catch {
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

  // Chat
  useEffect(() => {
  if (poolingMessagesIntervalId) clearInterval(poolingMessagesIntervalId);

    if (chatEndRef.current && activeTab === 'chat') {

      setPoolingMessagesIntervalId(setInterval(() => {
        handleHistoryClick(currentConversationId, true);
      }, 10000));

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

  const fetchConversations = async (value = null, newMessages = null) => {
    try {
      const response = await fetch(`/api/conversations?contact=${encodeURIComponent(value || '')}&newMessages=${newMessages}`, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        if (newMessages === 'true') { 

            if (data?.conversations?.length > 0) playNotification();

            data?.conversations?.forEach((conv) => {
              if (data.conversations.filter((c) => c.id == conv.id).length === 0) { 
                data.conversations.push(conv);
              } else {
                // Atualiza a conversa existente com os novos dados (como mensagens não lidas)
                const updated = data.conversations.map(a => {
                  if (a.id === conv.id) {
                    return {
                      ...conv
                    };
                  }
                  return a;
                });
                setConversations(updated);
              }
            });
        } else {
          setConversations(data.conversations || []);
        }
      } else if (response.status === 401) {
        router.push('/login');
      } else {
        const message = await getApiErrorMessage(response, 'Não foi possível carregar o histórico.');
        setNotice(message);
      }
    } catch {
      // Mantém o estado atual.
    }
  };

  const fetchContacts = async () => {
    try {
      const response = await fetch(`/api/contacts`, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts || []);
      } else if (response.status === 401) {
        router.push('/login');
      } else {
        const message = await getApiErrorMessage(response, 'Não foi possível carregar os contatos.');
        setNotice(message);
      }
    } catch {
      // Mantém o estado atual.
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users', { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else if (response.status === 401) {
        router.push('/login');
      } else {
        const message = await getApiErrorMessage(response, 'Não foi possível carregar os usuários.');
        setNotice(message);
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
      } else {
        const message = await getApiErrorMessage(response, 'Não foi possível carregar a fila de handover.');
        setNotice(message);
      }
    } catch {
      // Mantém o estado atual.
    }
  };

  const fetchScheduleSlots = async (from = null) => {
    try {
      const f = from || todayIso || '';
      const response = await fetch(`/api/schedule/slots?from=${encodeURIComponent(f)}`, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setScheduleSlots(data.slots || []);
      } else if (response.status === 401) {
        router.push('/login');
      } else {
        const message = await getApiErrorMessage(response, 'Não foi possível carregar a agenda.');
        setNotice(message);
      }
    } catch {
      // Mantém o estado atual.
    }
  };

  useEffect(() => {
    // Carrega slots para a semana visível quando o início da semana mudar
    const fromIso = weekDays && weekDays[0] ? weekDays[0].iso : todayIso;
    fetchScheduleSlots(fromIso);
  }, [weekStartDate]);

  const fetchAppointmentRequests = async () => {
    try {
      const response = await fetch('/api/appointments/requests?status=pending', { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setAppointmentRequests(data.requests || []);
      } else if (response.status === 401) {
        router.push('/login');
      } else {
        const message = await getApiErrorMessage(response, 'Não foi possível carregar as solicitações.');
        setNotice(message);
      }
    } catch {
      // Mantém o estado atual.
    }
  };

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events', { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
      } else if (response.status === 401) {
        router.push('/login');
      } else {
        const message = await getApiErrorMessage(response, 'Não foi possível carregar os eventos.');
        setNotice(message);
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

  const openEventModal = ({ mode, event = null } = {}) => {
    setNotice('');
    setEventModal({
      open: true,
      mode,
      event,
      title: event?.title || '',
      description: event?.description || '',
      date: toDateInputValue(event?.eventDate) || '',
      time: toTimeInputValue(event?.eventDate) || '',
    });
  };

  const closeEventModal = () => setEventModal({ open: false, mode: 'create', event: null, title: '', description: '', date: '', time: '' });

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
      const message = await getApiErrorMessage(response, 'Não foi possível salvar o slot.');
      setNotice(message);
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
      const message = await getApiErrorMessage(response, 'Não foi possível excluir o slot.');
      setNotice(message);
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
      const message = await getApiErrorMessage(response, 'Não foi possível atualizar o slot.');
      setNotice(message);
      return;
    }

    closeSlotModal();
    await fetchScheduleSlots();
  };

  const handleSaveEvent = async () => {
    const title = String(eventModal.title || '').trim();
    const description = String(eventModal.description || '').trim();
    const date = eventModal.date;
    const time = eventModal.time;

    if (!title) {
      setNotice('Informe o nome do evento.');
      return;
    }

    if (!date || !time) {
      setNotice('Informe data e horário para o evento.');
      return;
    }

    const payload = {
      title,
      description: description || null,
      date,
      time,
    };

    const endpoint = eventModal.mode === 'edit' && eventModal.event ? `/api/events/${eventModal.event.id}` : '/api/events';
    const method = eventModal.mode === 'edit' && eventModal.event ? 'PATCH' : 'POST';

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
      const message = await getApiErrorMessage(response, 'Não foi possível salvar o evento.');
      setNotice(message);
      return;
    }

    closeEventModal();
    await fetchEvents();
  };

  const handleDeleteEvent = async (eventId) => {
    if (!eventId) return;
    if (!window.confirm('Excluir este evento?')) return;

    const response = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    if (!response.ok) {
      const message = await getApiErrorMessage(response, 'Não foi possível excluir o evento.');
      setNotice(message);
      return;
    }

    closeEventModal();
    await fetchEvents();
  };

  const handleImportEvents = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/events/import', {
      method: 'POST',
      body: formData,
    });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    if (!response.ok) {
      const apiError = await readApiError(response);
      if (apiError?.details?.invalidRows?.length) {
        setNotice(`${apiError.message} (${apiError.details.invalidRows.length} linha(s) com erro).`);
        return;
      }

      setNotice(apiError?.message || 'Não foi possível importar a planilha.');
      return;
    }

    setNotice('Eventos importados com sucesso.');
    await fetchEvents();
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
      const message = await getApiErrorMessage(response, 'Não foi possível processar a solicitação.');
      setNotice(message);
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
        const message = await getApiErrorMessage(response, 'Não foi possível assumir a conversa.');
        throw new Error(message);
      }

      await Promise.all([fetchHandoverQueue(), fetchConversations()]);
      await handleHistoryClick(conversationId);
    } catch (error) {
      setNotice(error.message || 'Erro ao assumir conversa.');
    }
  };

  const openCredentialModal = (mandatory = false) => {
    setCredentialModal({
      open: true,
      mandatory,
      email: user?.email || '',
      senha: '',
      repitaSenha: '',
      loading: false,
      message: '',
      messageType: '',
    });
  };

  const closeCredentialModal = () => {
    if (credentialModal.mandatory) return;
    setCredentialModal({
      open: false,
      mandatory: false,
      email: '',
      senha: '',
      repitaSenha: '',
      loading: false,
      message: '',
      messageType: '',
    });
  };

  const handleUpdateCredentials = async () => {
    const email = String(credentialModal.email || '').trim();
    const senha = String(credentialModal.senha || '').trim();
    const repitaSenha = String(credentialModal.repitaSenha || '').trim();

    if (!email || !senha || !repitaSenha) {
      setCredentialModal((prev) => ({
        ...prev,
        message: 'Preencha todos os campos.',
        messageType: 'error',
      }));
      return;
    }

    if (senha !== repitaSenha) {
      setCredentialModal((prev) => ({
        ...prev,
        message: 'As senhas não coincidem.',
        messageType: 'error',
      }));
      return;
    }

    setCredentialModal((prev) => ({ ...prev, loading: true, message: '' }));

    const response = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha, repitaSenha }),
    });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    if (!response.ok) {
      const message = await getApiErrorMessage(response, 'Não foi possível atualizar as credenciais.');
      setCredentialModal((prev) => ({
        ...prev,
        loading: false,
        message,
        messageType: 'error',
      }));
      return;
    }

    const data = await response.json();
    setUser(data.user);
    setNotice('Credenciais atualizadas com sucesso.');
    setCredentialModal({
      open: false,
      mandatory: false,
      email: '',
      senha: '',
      repitaSenha: '',
      loading: false,
      message: '',
      messageType: '',
    });
  };

  const openUserModal = ({ mode, user: targetUser = null }) => {
    setNotice('');
    setUserModal({
      open: true,
      mode,
      user: targetUser,
      nomeCompleto: targetUser?.nomeCompleto || '',
      email: targetUser?.email || '',
      senha: '',
      repitaSenha: '',
      mustChangeCredentials: targetUser ? Boolean(targetUser.mustChangeCredentials) : true,
    });
  };

  const closeUserModal = () => {
    setUserModal({
      open: false,
      mode: 'create',
      user: null,
      nomeCompleto: '',
      email: '',
      senha: '',
      repitaSenha: '',
      mustChangeCredentials: true,
    });
  };

  const handleSaveUser = async () => {
    const nomeCompleto = capitalizeName(userModal.nomeCompleto);
    const email = String(userModal.email || '').trim();
    const senha = String(userModal.senha || '').trim();
    const repitaSenha = String(userModal.repitaSenha || '').trim();

    if (!nomeCompleto || !email) {
      setNotice('Informe nome e e-mail para continuar.');
      return;
    }

    if (userModal.mode === 'create' && (!senha || !repitaSenha)) {
      setNotice('Informe a senha para o novo usuário.');
      return;
    }

    if (senha || repitaSenha) {
      if (!senha || !repitaSenha) {
        setNotice('Informe a senha e a confirmação.');
        return;
      }

      if (senha !== repitaSenha) {
        setNotice('As senhas não coincidem.');
        return;
      }
    }

    const payload = {
      nomeCompleto,
      email,
      mustChangeCredentials: userModal.mustChangeCredentials,
    };

    if (senha && repitaSenha) {
      payload.senha = senha;
      payload.repitaSenha = repitaSenha;
    }

    const endpoint = userModal.mode === 'edit' && userModal.user
      ? `/api/users/${userModal.user.id}`
      : '/api/users';
    const method = userModal.mode === 'edit' && userModal.user ? 'PATCH' : 'POST';

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
      const message = await getApiErrorMessage(response, 'Não foi possível salvar o usuário.');
      setNotice(message);
      return;
    }

    closeUserModal();
    await fetchUsers();
  };

  const handleDeleteUser = async (targetUser) => {
    if (!targetUser?.id) return;
    if (!window.confirm('Excluir este usuário?')) return;

    const response = await fetch(`/api/users/${targetUser.id}`, { method: 'DELETE' });

    if (response.status === 401) {
      router.push('/login');
      return;
    }

    if (!response.ok) {
      const message = await getApiErrorMessage(response, 'Não foi possível excluir o usuário.');
      setNotice(message);
      return;
    }

    await fetchUsers();
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

      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Não foi possível salvar a conversa.');
        setNotice(message);
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

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Erro na comunicação.');
        throw new Error(message);
      }

      const result = await response.json();
      // setChatHistory((prev) => [...prev, { sender: 'assistant', createdAt: result.createdAt, text: result.response, conversationId: convIdToUse }]);
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

  const handleHistoryClick = async (id, isPooling = false) => {
    try {
      const response = await fetch(`/api/chat/${id}?isPooling=${isPooling}`, { method: 'GET' });
      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Não foi possível carregar a conversa.');
        setNotice(message);
        return;
      }

      const messageStatus = {
        "PENDING": 'Pendente',
        "SENT": 'Enviado',
        "DELIVERED": 'Entregue',
        "READ": 'Lido',
        "FAILED": 'Falhou',
      };
      const result = await response.json();
      const msgs = result.conversation.messages.map((m) => ({ sender: m.sender, text: m.text, createdAt: m.createdA, status: messageStatus[m.telegramStatus], id: m.id, conversationId: m.conversationId }));
      
      if (isPooling && msg?.length == 0) return;

      setChatHistory(msgs);
      
      if (isPooling) {
        playNotification();
        return;
      }

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

    if (!response.ok) {
      const apiError = await readApiError(response);
      if (apiError?.details?.invalidRows?.length) {
        setNotice(`${apiError.message} (${apiError.details.invalidRows.length} linha(s) com erro).`);
        return;
      }

      setNotice(apiError?.message || 'Não foi possível importar a planilha.');
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

    if (!response.ok) {
      const message = await getApiErrorMessage(response, 'Não foi possível exportar as tarefas.');
      setNotice(message);
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

  const hideSidebar = () => {
    return hideSidebarForTabs.includes(activeTab);
  }

  var lastSearch = null

  const searchContact = (value) => {

    if (lastSearch) clearTimeout(lastSearch);

    lastSearch = setTimeout(() => {
      fetchConversations(value)
    }, 300);
  }

  const playNotification = () => {
    // Caminho para o seu arquivo de áudio
    const audio = new Audio('./../notification.wav'); 
    
    audio.play().catch(error => {
      console.error("Erro ao reproduzir o áudio:", error);
    });
  }

  useEffect(() => {
    switch (activeTab) {
      case 'chat': fetchConversations(); break;
      case 'contacts': fetchContacts(); break;
      case 'events': fetchEvents(); break;
      case 'handover': fetchHandoverQueue(); break;
      case 'agenda': 
          fetchScheduleSlots();
      break;
      case 'requests': fetchAppointmentRequests(); break;
      case 'users': fetchUsers(); break;
    }
  }, [activeTab]);

  const renderChatPanel = (className = "") => (    
    <div className={`rounded-[28px] border border-white/80 bg-white/90 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Chat</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">
            {conversations.find((c) => c.id === currentConversationId)?.contact?.name || 'Nova conversa'}
          </h2>
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
              <div key={`${msg.sender}-${idx}`} className={`flex items-end gap-3 ${(msg.sender === 'user' || msg.sender === 'assistant') ? 'justify-end' : 'justify-start'}`}>
                <div className='flex flex-col max-w-[82%]'>
                <div className={`max-w-[100%] rounded-[24px] px-4 py-3 shadow-sm ${(msg.sender === 'user' || msg.sender === 'assistant') ? 'rounded-br-md bg-gradient-to-r from-sky-600 to-indigo-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                  {(msg.sender === 'user' || msg.sender === 'assistant') ? (
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
                  {(msg.sender === 'user' || msg.sender === 'assistant') ? (
                    <div className="top-1 text-right mt-1 text-[11px] opacity-50">
                      {msg.createdAt ? formatarData(msg.createdAt) : 'Desconhecida'}
                    </div>
                  ) : (
                    <div className="top-1 text-left mt-1 text-[11px] opacity-50">
                      {msg.createdAt ? formatarData(msg.createdAt) : 'Desconhecida'}
                    </div>
                  )}
                </div>
                {(msg.sender === 'user' || msg.sender === 'assistant') ? (
                    <div className="ml-auto mt-1 text-[10px] italic font-medium tracking-wider uppercase text-gray-500">
                      {msg.status}
                    </div> ) : null }
                </div>
                {msg.sender === 'assistant' && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">AI</div>}
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

  const renderTelegramPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Telegram</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Configuração do Telegram</h2>
          <p className="mt-1 text-sm text-slate-500">Aqui você pode conectar seu Telegram e ajustar configurações de login.</p>
        </div>
        <button onClick={() => setActiveTab('chat')} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Voltar ao chat</button>
      </div>
      <div className="px-6 py-6">
        <TelegramLogin />
      </div>
    </div>
  );

  const renderAgendaPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Agenda</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Calendário semanal</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">A agenda aparece apenas aqui. Slots passados, finais de semana (exibidos para contexto) e feriados ficam indisponíveis; apenas segunda a sexta estão disponíveis para agendamento.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStartDate((d) => { const nd = new Date(d); nd.setDate(nd.getDate() - 7); return nd; })} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700">‹</button>
          <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-600">{formatWeekRange(weekDays)}</div>
          <button onClick={() => setWeekStartDate((d) => { const nd = new Date(d); nd.setDate(nd.getDate() + 7); return nd; })} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700">›</button>
          <button onClick={() => { const nd = new Date(); nd.setHours(12,0,0,0); setWeekStartDate(nd); }} className="ml-2 rounded-2xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700">Semana atual</button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-2 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-3">
        <div />
        {weekDays.map((day) => {
          const blocked = getDateBlockReason(day.iso);
          const holidayName = getHolidayName(day.iso);
          const daySlots = slotsByDate[day.iso] || {};
          const dayRequests = requestsByDate[day.iso] || [];

          return (
            <div key={day.iso} className={`rounded-2xl px-3 py-3 text-center shadow-sm ${blocked ? 'bg-slate-100' : 'bg-white'}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{day.label}</div>
              <div className="mt-1 text-xs font-semibold text-sky-700">{day.ddmm}</div>
              <div className="mt-0.5 text-xl font-semibold text-slate-900">{day.day}</div>
              <div className="mt-2 text-[11px] text-slate-500">{blocked ? (holidayName || blocked) : `${Object.values(daySlots).filter((slot) => slot.isAvailable).length} livres`}</div>
              {holidayName && (
                <div className="mt-1 text-sm font-semibold text-rose-700">{holidayName}</div>
              )}
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
            {weekDays.map((day) => {
              const slot = slotsByDate[day.iso]?.[hour] || null;
              const blockedReason = getDateBlockReason(day.iso, hour);
              const holidayName = getHolidayName(day.iso);
              const requests = (requestsByDate[day.iso] || []).filter((request) => Number(request.hour) === hour);
              const cellStatus = slot
                ? slot.isAvailable
                  ? 'Livre'
                  : (`Reservado com ${slot.requester?.nomeCompleto}`)
                : blockedReason
                  ? (holidayName || 'Fechado')
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
                      setNotice(holidayName || blockedReason);
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
                  <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-current/60">{slot ? 'Slot cadastrado' : blockedReason ? (holidayName ? `Feriado: ${holidayName}` : 'Agenda fechada') : 'Clique para criar'}</div>
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="mt-4 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">Clique em um horário para abrir o modal de edição.</div>
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">Datas passadas, finais de semana e feriados já chegam bloqueados.</div>
        <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">O gestor mantém a agenda aberta por padrão, salvo horários ocupados e exceções configuradas.</div>
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
          <div key={conv.id} className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <span className="font-semibold text-base text-slate-900">
                {conv.contact?.name || "Usuário desconhecido"}
              </span>
              <span className="text-xs text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded">
                {conv.contact?.telephone || conv.contact?.phone || "Número desconhecido"}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {conv.messages?.map((msg, index) => (
                <p 
                  key={msg.id || index} 
                  className="text-sm font-medium text-slate-800 break-words bg-slate-50/60 px-3 py-1.5 rounded-md"
                >
                  {msg.text}
                </p>
              ))}
            </div>

            <div className="w-auto flex flex-col ml-auto items-start gap-2 mt-3">
              <p className="mt-1 mr-auto text-[11px] uppercase tracking-wide text-slate-500">{conv.handlingMode || 'Manual'}</p>
              <button onClick={() => handleTakeHandover(conv.id)} className="mt-3 ml-auto rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500">Assumir conversa</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHistoryPanel = (className = "") => {
    const totalPages = Math.ceil(conversations.length / CONVERSATIONS_PER_PAGE);
    const startIdx = (historyPage - 1) * CONVERSATIONS_PER_PAGE;
    const endIdx = startIdx + CONVERSATIONS_PER_PAGE;
    const paginatedConversations = conversations.slice(startIdx, endIdx);

    return (
      <div className={`rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl ${className}`}>
        <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200 pb-5">
          <div className="flex w-full items-center gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Histórico</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">Conversas</h2>
              </div>
              <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{conversations.length}</span>
          </div>
          {/* Filter Chat/Contact */}
          <div className="flex mt-1 mb-1 bg-slate-50 rounded-xl border border-slate-200">
            <input
              type="text"
              placeholder="Buscar contato..."
              onChange={(e) => {
                setHistoryPage(1);
                searchContact(e.target.value);
              }}
              className="w-full px-4 py-2 pl-3 border border-slate-100 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="relative w-full mt-5 grid gap-2 max-h-full overflow-y-auto">
          {paginatedConversations.length === 0 && conversations.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Nenhuma conversa encontrada.</div>
          )}
          {paginatedConversations.map((conv) => (
            <button key={conv.id} onClick={() => handleHistoryClick(conv.id)} className={`relative rounded-2xl border px-4 py-3 text-left transition ${currentConversationId === conv.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-900">
                  {conv?.contact?.name || conv.summary}
                </span>
                <span className="text-slate-600 text-[13px]">
                  Contato: {conv?.contact?.telephone || "Sem Telefone"}
                </span>
              </div>
              {conv.newMessages && (
                <div className="ml-auto absolute top-1 right-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-rose-800">
                  <svg className="h-3 w-3 animate-pulse text-rose-500" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                </div>
              )}
              <div className="flex items-center flex-row gap-1 mt-0 text-[11px] uppercase tracking-wide text-slate-500">
                <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{formatarData(conv.updatedAt)}</div>
                <div className="mt-1 text-[11px] uppercase font-bold tracking-wide text-slate-500">{conv.handlingMode || 'Automatizado'}</div>
              </div>
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
            <button
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={historyPage === 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-slate-50"
            >
              ← Anterior
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setHistoryPage(page)}
                  className={`h-8 w-8 rounded-lg text-sm font-medium transition ${
                    historyPage === page
                      ? 'bg-sky-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
              disabled={historyPage === totalPages}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-slate-50"
            >
              Próximo →
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderContactsPanel = () => (
    <div onClick={() => {}} className={`rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl`}>
      <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Contatos</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Lista de contatos</h2>
        </div>
      </div>
      <div className="relative w-full mt-5 grid gap-2">
        {contacts.map((contact) => (
          <div key={contact.id} className={`relative rounded-2xl border px-4 py-3 text-left transition`}>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-900">
                {contact.name}
              </span>
              <span className="text-slate-600 text-[13px]">
                Telefone: {contact.telephone || "Sem Telefone"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderUsersPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Usuarios</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Controle de acesso</h2>
          <p className="mt-1 text-sm text-slate-500">Cadastre novos usuários e gerencie quem pode acessar o painel.</p>
        </div>
        <button onClick={() => openUserModal({ mode: 'create' })} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Novo usuario</button>
      </div>

      <div className="mt-5 grid gap-3">
        {users.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Nenhum usuário cadastrado.
          </div>
        )}
        {users.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">{item.nomeCompleto || item.email}</div>
                  {item.role === 'admin' && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Admin</span>
                  )}
                  {item.mustChangeCredentials && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Troca pendente</span>
                  )}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{item.email}</div>
              </div>
              <div className="flex flex-row gap-2 md:flex-col">
                <button onClick={() => openUserModal({ mode: 'edit', user: item })} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">Editar</button>
                {item.id !== user?.id && (
                  <button onClick={() => handleDeleteUser(item)} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">Excluir</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderGroqConfigPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Configuração</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Groq API</h2>
          <p className="mt-1 text-sm text-slate-500">Gerencie a configuração e autenticação da API do Groq.</p>
        </div>
      </div>

      <div className="mt-5">
        <GroqConfig />
      </div>
    </div>
  );

  const renderEventsPanel = () => (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">Eventos</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Agenda acadêmica</h2>
          <p className="mt-1 text-sm text-slate-500">Cadastre eventos da faculdade e importe planilhas com data, horário e descrição.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => openEventModal({ mode: 'create' })} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Novo evento</button>
          <button onClick={() => document.getElementById('events-file-input').click()} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Importar planilha</button>
          <input type="file" id="events-file-input" className="hidden" onChange={handleImportEvents} accept=".csv" />
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {events.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Nenhum evento cadastrado ainda.
          </div>
        )}
        {events.map((event) => (
          <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{formatarData(event.eventDate)}</div>
                <p className="mt-2 text-sm text-slate-600">{event.description || 'Sem descrição informada.'}</p>
              </div>
              <div className="flex flex-row gap-2 md:flex-col">
                <button onClick={() => openEventModal({ mode: 'edit', event })} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">Editar</button>
                <button onClick={() => handleDeleteEvent(event.id)} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">Excluir</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Colunas esperadas na planilha: nome, data, horário e descrição. Datas podem ser no formato YYYY-MM-DD ou DD/MM/YYYY.
      </div>
    </div>
  );

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'agenda':
        return renderAgendaPanel();
      case 'events':
        return renderEventsPanel();
      case 'requests':
        return renderRequestsPanel();
      case 'handover':
        return renderHandoverPanel();
      case 'history':
        return renderHistoryPanel();
      case 'users':
        return renderUsersPanel();
      case 'groq-config':
        return renderGroqConfigPanel();
      case 'contacts':
        return renderContactsPanel();
      case 'telegram':
        return renderTelegramPanel();
      case 'chat':
      default:
        return (
          <div className="flex gap-2 flex-row h-full">
            {renderHistoryPanel("w-[350px] mr-3 flex flex-col")}
            {renderChatPanel("w-full")}
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#eef6ff_0%,_#f8fafc_40%,_#eef2ff_100%)] text-slate-900 flex items-center justify-center">
        <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border-none border-slate-200 bg-slate-50 py-12">
          <svg className="h-8 w-8 animate-spin text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="mt-3 text-sm text-slate-500">Carregando Painel...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#eef6ff_0%,_#f8fafc_40%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
        <header className="relative z-40 overflow-visible rounded-[30px] border border-white/80 bg-white/85 px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
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
              {visibleTabs.map((tab) => (
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
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen((value) => !value);
                }}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Menu
              </button>
              {(menuOpen) && (
                <div className="absolute right-0 top-14 z-50 w-56 rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.15)]" onClick={(event) => event.stopPropagation()}>
                  <button onClick={() => { openCredentialModal(false); setMenuOpen(false); }} className="w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">Atualizar acesso</button>
                  {user?.role === 'admin' && (
                    <button onClick={() => { setActiveTab('users'); setMenuOpen(false); }} className="w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">Usuários</button>
                  )}
                  <button onClick={() => { handleExport(); setMenuOpen(false); }} className="w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">Exportar tarefas</button>
                  <button onClick={() => { setActiveTab('telegram'); setMenuOpen(false); }} className="w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">Config Telegram</button>
                  {user?.role === 'admin' && (
                    <button onClick={() => { setActiveTab('groq-config'); setMenuOpen(false); window.scrollTo({ top: 0, left: 0, behavior: 'smooth' }); }} className="w-full rounded-2xl px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">Config Groq</button>
                  )}
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
          <div className="relative mt-2 mb-1 w-full justify-end flex items-end bg-orange gap-2">
            <TelegramStatus />
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)]">
          <section className="min-h-0">{renderActivePanel()}</section>

          {!hideSidebar() && <SidebarInfo />}
        </main>
      </div>

      <Modal
        open={credentialModal.open}
        title={credentialModal.mandatory ? 'Atualize seu acesso' : 'Atualizar acesso'}
        subtitle={credentialModal.mandatory
          ? 'Atualize seu e-mail e senha para continuar no painel.'
          : 'Atualize e-mail e senha do usuário logado.'}
        onClose={closeCredentialModal}
        dismissible={!credentialModal.mandatory}
      >
        <div className="space-y-4">
          {credentialModal.mandatory && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Para continuar, informe um novo e-mail e uma nova senha.
            </div>
          )}
          <input
            type="text"
            placeholder="E-mail"
            value={credentialModal.email}
            onChange={(e) => setCredentialModal((prev) => ({ ...prev, email: e.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="password"
              placeholder="Nova senha"
              value={credentialModal.senha}
              onChange={(e) => setCredentialModal((prev) => ({ ...prev, senha: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
            />
            <input
              type="password"
              placeholder="Confirmar senha"
              value={credentialModal.repitaSenha}
              onChange={(e) => setCredentialModal((prev) => ({ ...prev, repitaSenha: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
            />
          </div>
          <button
            onClick={handleUpdateCredentials}
            disabled={credentialModal.loading}
            className="rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {credentialModal.loading ? 'Salvando...' : 'Salvar credenciais'}
          </button>
          {credentialModal.message && (
            <p className={`text-sm font-medium ${credentialModal.messageType === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>
              {credentialModal.message}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={userModal.open}
        title={userModal.mode === 'edit' ? 'Editar usuário' : 'Novo usuário'}
        subtitle={userModal.mode === 'edit' ? 'Atualize os dados do usuário.' : 'Informe nome, e-mail e senha de acesso.'}
        onClose={closeUserModal}
      >
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Nome completo"
            value={userModal.nomeCompleto}
            onChange={(e) => setUserModal((prev) => ({ ...prev, nomeCompleto: e.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          />
          <input
            type="text"
            placeholder="E-mail"
            value={userModal.email}
            onChange={(e) => setUserModal((prev) => ({ ...prev, email: e.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="password"
              placeholder={userModal.mode === 'edit' ? 'Nova senha (opcional)' : 'Senha'}
              value={userModal.senha}
              onChange={(e) => setUserModal((prev) => ({ ...prev, senha: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            />
            <input
              type="password"
              placeholder={userModal.mode === 'edit' ? 'Confirmar senha' : 'Confirmar senha'}
              value={userModal.repitaSenha}
              onChange={(e) => setUserModal((prev) => ({ ...prev, repitaSenha: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            />
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={userModal.mustChangeCredentials}
              onChange={(e) => setUserModal((prev) => ({ ...prev, mustChangeCredentials: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            Exigir troca de credenciais no primeiro acesso
          </label>
          <div className="flex flex-col gap-2 md:flex-row">
            <button onClick={handleSaveUser} className="rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800">
              Salvar usuário
            </button>
          </div>
        </div>
      </Modal>

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
        open={eventModal.open}
        title={eventModal.mode === 'edit' ? 'Editar evento' : 'Cadastrar evento'}
        subtitle={eventModal.mode === 'edit' ? 'Atualize os detalhes do evento.' : 'Informe nome, data, horário e descrição.'}
        onClose={closeEventModal}
      >
        <div className="space-y-4">
          <label className="space-y-2 text-sm text-slate-600">
            <span>Nome do evento</span>
            <input
              type="text"
              value={eventModal.title}
              onChange={(e) => setEventModal((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              placeholder="Ex: Semana de Tecnologia"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-600">
              <span>Data</span>
              <input
                type="date"
                value={eventModal.date}
                onChange={(e) => setEventModal((prev) => ({ ...prev, date: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-600">
              <span>Horário</span>
              <input
                type="time"
                value={eventModal.time}
                onChange={(e) => setEventModal((prev) => ({ ...prev, time: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm text-slate-600">
            <span>Descrição</span>
            <textarea
              rows={4}
              value={eventModal.description}
              onChange={(e) => setEventModal((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              placeholder="Detalhes do evento"
            />
          </label>

          <div className="flex flex-col gap-2 md:flex-row">
            <button onClick={handleSaveEvent} className="rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-800">
              Salvar evento
            </button>
            {eventModal.mode === 'edit' && eventModal.event && (
              <button onClick={() => handleDeleteEvent(eventModal.event.id)} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-medium text-rose-700 transition hover:bg-rose-100">
                Excluir evento
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
