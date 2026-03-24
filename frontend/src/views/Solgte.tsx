import { useEffect, useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { fetchAll } from '../lib/fetchAll'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

interface SoldRecord {
  estate_id: number
  address: string
  zip_code: number
  price: number
  sold_date: string
  size: number
  rooms: number
  sqm_price: number
  price_change: number
  municipality: number
}

const AREAS = [
  { name: 'Indre By',         zips: (z: number) => z >= 1000 && z < 1500 },
  { name: 'Vesterbro',        zips: (z: number) => z >= 1500 && z < 1800 },
  { name: 'Frederiksberg C',  zips: (z: number) => z >= 1800 && z < 2000 },
  { name: 'Frederiksberg',    zips: (z: number) => z === 2000 },
  { name: 'Østerbro',         zips: (z: number) => z >= 2100 && z <= 2150 },
  { name: 'Nørrebro',         zips: (z: number) => z === 2200 },
  { name: 'Amager',           zips: (z: number) => z === 2300 || z === 2450 },
  { name: 'Kbh. NV',          zips: (z: number) => z === 2400 },
  { name: 'Valby',            zips: (z: number) => z === 2500 },
  { name: 'Brønshøj/Vanløse', zips: (z: number) => z >= 2700 && z <= 2720 },
]

const AREA_COLORS = ['#3ECFA0', '#F5A623', '#60a5fa', '#f472b6', '#a78bfa', '#34d399', '#fb923c', '#e879f9', '#38bdf8', '#4ade80']

const PERIODS: Record<string, number> = { '3 mdr': 3, '6 mdr': 6, '1 år': 12, '2 år': 24, '5 år': 60 }

const fmt = (n: number) => n?.toLocaleString('da-DK')

function median(arr: number[]) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export default function Solgte() {
  const [records, setRecords] = useState<SoldRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState('2 år')
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [minSize, setMinSize] = useState(0)
  const [maxSize, setMaxSize] = useState(300)
  const [rooms, setRooms] = useState<number[]>([])

  useEffect(() => {
    fetchAll<SoldRecord>(
      'sold',
      'estate_id,address,zip_code,price,sold_date,size,rooms,sqm_price,price_change,municipality',
      q => q.neq('zip_code', 2900).order('sold_date', { ascending: false })
    ).then(data => { setRecords(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const cutoff = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - PERIODS[period])
    return d.toISOString().slice(0, 10)
  }, [period])

  const filtered = useMemo(() => records.filter(r => {
    if (r.sold_date < cutoff) return false
    if (selectedAreas.length) {
      const inArea = AREAS.filter(a => selectedAreas.includes(a.name)).some(a => a.zips(r.zip_code))
      if (!inArea) return false
    }
    if (r.size < minSize || r.size > maxSize) return false
    if (rooms.length) {
      const rv = Math.floor(r.rooms)
      if (!rooms.includes(rv >= 6 ? 6 : rv)) return false
    }
    return true
  }), [records, cutoff, selectedAreas, minSize, maxSize, rooms])

  // Monthly buckets per area (or overall if no area selected)
  const chartData = useMemo(() => {
    const buckets: Record<string, Record<string, number[]>> = {}
    const activeAreas = selectedAreas.length ? AREAS.filter(a => selectedAreas.includes(a.name)) : [{ name: 'Alle', zips: () => true }]

    filtered.forEach(r => {
      const month = r.sold_date.slice(0, 7)
      if (!buckets[month]) buckets[month] = {}
      activeAreas.forEach(a => {
        if (a.zips(r.zip_code)) {
          if (!buckets[month][a.name]) buckets[month][a.name] = []
          buckets[month][a.name].push(r.sqm_price)
        }
      })
    })

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, areas]) => {
        const entry: Record<string, any> = { month }
        Object.entries(areas).forEach(([area, prices]) => {
          entry[area] = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
        })
        return entry
      })
  }, [filtered, selectedAreas])

  const areaKeys = useMemo(
    () => selectedAreas.length ? selectedAreas : ['Alle'],
    [selectedAreas]
  )

  // Linear regression trend line per area key
  const chartDataWithTrend = useMemo(() => {
    const result = chartData.map(row => ({ ...row })) as Record<string, any>[]
    areaKeys.forEach(key => {
      const points = chartData
        .map((row, i) => ({ i, v: row[key] as number }))
        .filter(p => typeof p.v === 'number')
      if (points.length < 2) return
      const n = points.length
      const sumX = points.reduce((s, p) => s + p.i, 0)
      const sumY = points.reduce((s, p) => s + p.v, 0)
      const sumXY = points.reduce((s, p) => s + p.i * p.v, 0)
      const sumX2 = points.reduce((s, p) => s + p.i * p.i, 0)
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
      const intercept = (sumY - slope * sumX) / n
      points.forEach(p => {
        result[p.i][`${key}_trend`] = Math.round(intercept + slope * p.i)
      })
    })
    return result
  }, [chartData, areaKeys])

  const kpis = useMemo(() => {
    if (!filtered.length) return null
    const changes = filtered.map(r => r.price_change).filter(v => v != null)

    const months = [...new Set(filtered.map(r => r.sold_date.slice(0, 7)))].sort()
    const firstMonth = months[0]
    const lastMonth = months[months.length - 1]
    const sqmFirst = filtered.filter(r => r.sold_date.startsWith(firstMonth)).map(r => r.sqm_price).filter(Boolean)
    const sqmLast  = filtered.filter(r => r.sold_date.startsWith(lastMonth)).map(r => r.sqm_price).filter(Boolean)
    const avgSqmFirst = sqmFirst.reduce((s, v) => s + v, 0) / sqmFirst.length
    const avgSqmLast  = sqmLast.reduce((s, v) => s + v, 0) / sqmLast.length

    return {
      avgSqmFirst,
      avgSqmLast,
      firstMonth,
      lastMonth,
      avgChange: changes.reduce((s, v) => s + v, 0) / changes.length,
    }
  }, [filtered])

  const toggleArea = (name: string) =>
    setSelectedAreas(a => a.includes(name) ? a.filter(x => x !== name) : [...a, name])

  const toggleRoom = (r: number) =>
    setRooms(rs => rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r])

  if (loading) return <Spinner label="Henter solgte boliger… (kan tage et øjeblik)" />
  if (error) return <div className="p-6 text-red-400">Fejl: {error}</div>

  return (
    <div className="p-6 space-y-4">
      {/* Filter bar */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-6">
          {/* Period */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Periode</label>
            <div className="flex gap-2">
              {Object.keys(PERIODS).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${period === p ? 'bg-[#3ECFA0] text-[#0F1419] font-medium' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Area */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Område</label>
            <div className="flex flex-wrap gap-2">
              {AREAS.map(a => (
                <button key={a.name} onClick={() => toggleArea(a.name)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${selectedAreas.includes(a.name) ? 'bg-[#3ECFA0] text-[#0F1419] font-medium' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          {/* Rooms */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Værelser</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6].map(r => (
                <button key={r} onClick={() => toggleRoom(r)}
                  className={`w-10 h-10 rounded text-sm font-medium transition-colors ${rooms.includes(r) ? 'bg-[#3ECFA0] text-[#0F1419]' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                  {r === 6 ? '6+' : r}
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div className="flex-1 min-w-56">
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">
              Størrelse: {minSize}–{maxSize} m²
            </label>
            <div className="relative h-5 flex items-center">
              <input type="range" min={0} max={300} step={5}
                value={minSize}
                onChange={e => setMinSize(Math.min(+e.target.value, maxSize - 5))}
                className="absolute w-full accent-[#3ECFA0] pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto" />
              <input type="range" min={0} max={300} step={5}
                value={maxSize}
                onChange={e => setMaxSize(Math.max(+e.target.value, minSize + 5))}
                className="absolute w-full accent-[#3ECFA0] pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto" />
            </div>
          </div>

          <div className="flex items-end">
            <button onClick={() => { setSelectedAreas([]); setRooms([]); setPeriod('2 år'); setMinSize(0); setMaxSize(300) }}
              className="px-4 py-2 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm transition-colors">
              Nulstil
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: `Gns. kr/m² (${kpis.firstMonth})`, value: fmt(Math.round(kpis.avgSqmFirst)) + ' kr' },
            { label: `Gns. kr/m² (${kpis.lastMonth})`, value: fmt(Math.round(kpis.avgSqmLast)) + ' kr' },
            { label: 'Gns. prisændring', value: kpis.avgChange.toFixed(1) + ' %' },
          ].map(k => (
            <div key={k.label} className="bg-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</div>
              <div className="text-xl font-semibold text-[#F5A623]">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="bg-slate-800 rounded-lg p-4">
        <h2 className="text-sm font-medium text-slate-300 mb-4">Gns. salgspris kr/m² pr. måned — seneste {period}</h2>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartDataWithTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false}
              tickFormatter={v => (v / 1000).toFixed(0) + 'k'} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v: number, name: string) => [fmt(v) + ' kr/m²', name]} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            {areaKeys.flatMap((key, i) => [
              <Line key={key} type="monotone" dataKey={key} stroke={AREA_COLORS[i % AREA_COLORS.length]}
                dot={false} strokeWidth={1.5} strokeOpacity={0.4} connectNulls legendType="none" />,
              <Line key={`${key}_trend`} type="monotone" dataKey={`${key}_trend`}
                stroke={AREA_COLORS[i % AREA_COLORS.length]} dot={false} strokeWidth={2.5}
                connectNulls name={key} />,
            ])}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              {['Adresse', 'Postnr', 'Solgt dato', 'Vær.', 'm²', 'Udbudspris', 'Salgspris', 'kr/m²', 'Prisændring'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {filtered.length === 0 && (
              <tr><td colSpan={9}><EmptyState /></td></tr>
            )}
            {filtered.slice(0, 200).map(r => (
              <tr key={r.estate_id} className="hover:bg-slate-800 transition-colors">
                <td className="px-4 py-3 text-slate-200">{r.address}</td>
                <td className="px-4 py-3 text-slate-400">{r.zip_code}</td>
                <td className="px-4 py-3 text-slate-400">{r.sold_date}</td>
                <td className="px-4 py-3 text-slate-300">{r.rooms}</td>
                <td className="px-4 py-3 text-slate-300">{r.size}</td>
                <td className="px-4 py-3 text-slate-300">{r.price_change != null ? fmt(Math.round(r.price / (1 + r.price_change / 100))) : '—'}</td>
                <td className="px-4 py-3 text-[#F5A623] font-medium">{fmt(r.price)}</td>
                <td className="px-4 py-3 text-slate-300">{fmt(Math.round(r.sqm_price))}</td>
                <td className={`px-4 py-3 font-medium ${r.price_change < 0 ? 'text-[#3ECFA0]' : 'text-red-400'}`}>
                  {r.price_change?.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div className="px-4 py-3 text-xs text-slate-500 bg-slate-800 border-t border-slate-700">
            Viser 200 af {fmt(filtered.length)} resultater — brug filtrene for at indsnævre
          </div>
        )}
      </div>
    </div>
  )
}
