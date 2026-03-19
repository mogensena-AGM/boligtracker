import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

interface ScrapeRun {
  finished_at: string | null
  status: string
}

export default function NavBar() {
  const [lastRun, setLastRun] = useState<ScrapeRun | null>(null)

  useEffect(() => {
    supabase
      .from('scrape_runs')
      .select('finished_at, status')
      .order('finished_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setLastRun(data))
  }, [])

  const dotColor = () => {
    if (!lastRun?.finished_at) return 'bg-red-500'
    if (lastRun.status === 'error') return 'bg-red-500'
    const hours = (Date.now() - new Date(lastRun.finished_at).getTime()) / 36e5
    if (lastRun.status === 'done' && hours < 36) return 'bg-[#3ECFA0]'
    if (hours < 50) return 'bg-[#F5A623]'
    return 'bg-red-500'
  }

  const statusLabel = () => {
    if (!lastRun?.finished_at) return 'Ingen data'
    if (lastRun.status === 'error') return 'Fejl ved seneste kørsel'
    const d = new Date(lastRun.finished_at)
    return `Opdateret ${d.toLocaleString('da-DK', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded text-sm font-medium transition-colors ${
      isActive ? 'bg-[#3ECFA0] text-[#0F1419]' : 'text-slate-300 hover:text-white'
    }`

  return (
    <nav className="border-b border-slate-700 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[#3ECFA0] font-bold text-lg mr-3">BoligTracker</span>
        <NavLink to="/til-salg" className={linkClass}>Til salg</NavLink>
        <NavLink to="/solgte" className={linkClass}>Solgte</NavLink>
        <NavLink to="/vores-lejlighed" className={linkClass}>Vores lejlighed</NavLink>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor()}`} />
        <span>{statusLabel()}</span>
      </div>
    </nav>
  )
}
