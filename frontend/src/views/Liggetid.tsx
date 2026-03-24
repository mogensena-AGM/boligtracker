import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface Listing {
  id: number
  street: string
  zip_code: number
  size: number
  price: number
  sqm_price: number
  days_for_sale: number
  rooms: number
}

const fmt = (n: number) => n?.toLocaleString('da-DK')

const AREAS = [
  { name: 'Indre By',          zips: (z: number) => z >= 1000 && z < 1500 },
  { name: 'Vesterbro',         zips: (z: number) => z >= 1500 && z < 1800 },
  { name: 'Frederiksberg C',   zips: (z: number) => z >= 1800 && z < 2000 },
  { name: 'Frederiksberg',     zips: (z: number) => z === 2000 },
  { name: 'Østerbro',          zips: (z: number) => z >= 2100 && z <= 2150 },
  { name: 'Nørrebro',          zips: (z: number) => z === 2200 },
  { name: 'Amager',            zips: (z: number) => z === 2300 || z === 2450 },
  { name: 'Kbh. NV',           zips: (z: number) => z === 2400 },
  { name: 'Valby',             zips: (z: number) => z === 2500 },
  { name: 'Brønshøj/Vanløse',  zips: (z: number) => z >= 2700 && z <= 2720 },
]

const BUCKETS = [
  { label: '0–14',  min: 0,   max: 14  },
  { label: '15–30', min: 15,  max: 30  },
  { label: '31–60', min: 31,  max: 60  },
  { label: '61–90', min: 61,  max: 90  },
  { label: '91–180',min: 91,  max: 180 },
  { label: '181+',  min: 181, max: Infinity },
]

function median(vals: number[]) {
  if (!vals.length) return 0
  const s = [...vals].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

function areaOf(zip: number) {
  return AREAS.find(a => a.zips(zip))?.name ?? 'Andet'
}

export default function Liggetid() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])

  useEffect(() => {
    supabase
      .from('listings')
      .select('id,street,zip_code,size,price,sqm_price,days_for_sale,rooms')
      .eq('is_active', true)
      .neq('zip_code', 2900)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setListings(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    if (!selectedAreas.length) return listings
    return listings.filter(l =>
      AREAS.filter(a => selectedAreas.includes(a.name)).some(a => a.zips(l.zip_code))
    )
  }, [listings, selectedAreas])

  const toggleArea = (name: string) =>
    setSelectedAreas(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]
    )

  const days = filtered.map(l => l.days_for_sale).filter(d => d != null)

  const kpis = useMemo(() => {
    if (!days.length) return null
    const med = median(days)
    const over60 = days.filter(d => d > 60).length
    const over90 = days.filter(d => d > 90).length
    const max = Math.max(...days)
    return { med, over60pct: Math.round((over60 / days.length) * 100), over90pct: Math.round((over90 / days.length) * 100), max }
  }, [days])

  const bucketData = useMemo(() =>
    BUCKETS.map(b => ({
      label: b.label,
      antal: filtered.filter(l => l.days_for_sale >= b.min && l.days_for_sale <= b.max).length,
    })),
    [filtered]
  )

  const areaBreakdown = useMemo(() => {
    const map: Record<string, number[]> = {}
    filtered.forEach(l => {
      const name = areaOf(l.zip_code)
      if (!map[name]) map[name] = []
      map[name].push(l.days_for_sale)
    })
    return Object.entries(map)
      .map(([name, vals]) => ({ name, count: vals.length, median: median(vals) }))
      .sort((a, b) => b.median - a.median)
  }, [filtered])

  const stale = useMemo(() =>
    [...filtered].sort((a, b) => b.days_for_sale - a.days_for_sale).slice(0, 50),
    [filtered]
  )

  if (loading) return <Spinner />
  if (error) return <div className="p-6 text-red-400">Fejl: {error}</div>

  return (
    <div className="p-6 space-y-4">

      {/* Area filter */}
      <div className="bg-slate-800 rounded-lg p-4">
        <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Område</label>
        <div className="flex flex-wrap gap-2">
          {AREAS.map(a => (
            <button key={a.name} onClick={() => toggleArea(a.name)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                selectedAreas.includes(a.name)
                  ? 'bg-[#3ECFA0] text-[#0F1419] font-medium'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}>
              {a.name}
            </button>
          ))}
          {selectedAreas.length > 0 && (
            <button onClick={() => setSelectedAreas([])}
              className="px-3 py-1 rounded text-sm bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
              Nulstil
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Boliger', value: filtered.length.toString() },
            { label: 'Median liggetid', value: `${kpis.med} dage` },
            { label: 'Over 60 dage', value: `${kpis.over60pct}%` },
            { label: 'Over 90 dage', value: `${kpis.over90pct}%` },
          ].map(k => (
            <div key={k.label} className="bg-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</div>
              <div className="text-xl font-semibold text-[#F5A623]">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Distribution chart + area table side by side */}
      <div className="grid grid-cols-2 gap-4">

        {/* Bar chart */}
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-4">Fordeling (dage på markedet)</div>
          {filtered.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bucketData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#3ECFA0' }}
                />
                <Bar dataKey="antal" fill="#3ECFA0" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Area breakdown */}
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-4">Median liggetid per område</div>
          {areaBreakdown.length === 0 ? <EmptyState /> : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-xs text-slate-400 uppercase tracking-wider pb-2">Område</th>
                  <th className="text-right text-xs text-slate-400 uppercase tracking-wider pb-2">Boliger</th>
                  <th className="text-right text-xs text-slate-400 uppercase tracking-wider pb-2">Median dage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {areaBreakdown.map(a => (
                  <tr key={a.name}>
                    <td className="py-2 text-slate-200">{a.name}</td>
                    <td className="py-2 text-right text-slate-400">{a.count}</td>
                    <td className="py-2 text-right text-[#F5A623] font-medium">{a.median}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Stale listings table */}
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Længst på markedet (top 50)</div>
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800">
              <tr>
                {['Adresse', 'Område', 'Vær.', 'm²', 'Pris', 'kr/m²', 'Dage'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {stale.length === 0 && <tr><td colSpan={7}><EmptyState /></td></tr>}
              {stale.map(l => (
                <tr key={l.id}
                  onClick={() => window.open(`https://www.boliga.dk/bolig/${l.id}`, '_blank')}
                  className="hover:bg-slate-800 cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-slate-200">{l.street}</td>
                  <td className="px-4 py-3 text-slate-400">{areaOf(l.zip_code)}</td>
                  <td className="px-4 py-3 text-slate-300">{l.rooms}</td>
                  <td className="px-4 py-3 text-slate-300">{l.size}</td>
                  <td className="px-4 py-3 text-[#F5A623] font-medium">{fmt(l.price)}</td>
                  <td className="px-4 py-3 text-slate-300">{fmt(Math.round(l.sqm_price))}</td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{l.days_for_sale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
