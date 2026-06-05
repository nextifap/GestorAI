// Adicionamos 'use client' apenas se o componente tiver cliques ou estado
// Se for só para exibir dados, não precisa, o que poupa CPU no cliente.
export default function ListConversation({ items = [] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className="p-2 border-b border-slate-100">
          <h3 className="text-sm font-medium text-slate-800">{item.titulo}</h3>
          <div className="flex items-center flex-row gap-1 mt-1 text-[11px] uppercase tracking-wide text-slate-500">
            <span>{item.categoria}</span>
            <span>•</span>
            <span>{item.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}