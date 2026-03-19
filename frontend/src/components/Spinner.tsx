export default function Spinner({ label = 'Henter data…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
      <div className="w-8 h-8 border-2 border-slate-600 border-t-[#3ECFA0] rounded-full animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
