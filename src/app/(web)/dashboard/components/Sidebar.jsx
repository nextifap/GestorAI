export default function SidebarInfo() {
  return (
    <aside className="flex min-h-0 flex-col gap-4">
      {/* Como usar */}
      <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Como usar</h3>
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">1. Use as abas para mostrar só o necessário.</div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">2. Clique em um dia/horário para abrir o modal de agenda.</div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">3. Solicitantes e handover ficam separados do chat.</div>
        </div>
      </div>

      {/* Legenda */}
      <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">Legenda</h3>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Livre</div>
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-500" /> Ocupado</div>
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-300" /> Fechado / indisponível</div>
        </div>
      </div>
    </aside>
  );
}