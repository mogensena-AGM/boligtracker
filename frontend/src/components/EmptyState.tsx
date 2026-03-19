export default function EmptyState({ message = 'Ingen resultater matcher dine filtre.' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
      <span className="text-4xl">🔍</span>
      <span className="text-sm">{message}</span>
    </div>
  )
}
