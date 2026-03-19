import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

interface Listing {
  id: number
  street: string
  zip_code: number
  rooms: number
  size: number
  price: number
  sqm_price: number
  days_for_sale: number
  energy_class: string
  floor: number
}

const fmt = (n: number) => n?.toLocaleString('da-DK')

const AREAS = [
  { name: 'Indre By',        zips: (l: number) => l >= 1000 && l < 1500 },
  { name: 'Vesterbro',       zips: (l: number) => l >= 1500 && l < 1800 },
  { name: 'Frederiksberg C', zips: (l: number) => l >= 1800 && l < 2000 },
  { name: 'Frederiksberg',   zips: (l: number) => l === 2000 },
  { name: 'Østerbro',        zips: (l: number) => l >= 2100 && l <= 2150 },
  { name: 'Nørrebro',        zips: (l: number) => l === 2200 },
  { name: 'Amager',          zips: (l: number) => l === 2300 || l === 2450 },
  { name: 'Kbh. NV',         zips: (l: number) => l === 2400 },
  { name: 'Valby',           zips: (l: number) => l === 2500 },
  { name: 'Brønshøj/Vanløse', zips: (l: number) => l >= 2700 && l <= 2720 },
]

const DEFAULT_FILTERS = {
  areas: [] as string[],
  rooms: [] as number[],
  minPrice: 0,
  maxPrice: 20_000_000,
  minSize: 0,
  maxSize: 300,
}

export default function TilSalg() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<keyof Listing>('days_for_sale')
  const [sortAsc, setSortAsc] = useState(true)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  useEffect(() => {
    supabase
      .from('listings')
      .select('id,street,zip_code,rooms,size,price,sqm_price,days_for_sale,energy_class,floor')
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setListings(data || [])
        setLoading(false)
      })
  }, [])

const filtered = useMemo(() => listings.filter(l => {
    if (filters.areas.length) {
      const inArea = AREAS.filter(a => filters.areas.includes(a.name)).some(a => a.zips(l.zip_code))
      if (!inArea) return false
    }
    if (filters.rooms.length) {
      const r = Math.floor(l.rooms)
      if (!filters.rooms.includes(r >= 6 ? 6 : r)) return false
    }
    if (l.price < filters.minPrice || l.price > filters.maxPrice) return false
    if (l.size < filters.minSize || l.size > filters.maxSize) return false
    return true
  }), [listings, filters])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  }), [filtered, sortKey, sortAsc])

  const kpis = useMemo(() => {
    if (!filtered.length) return null
    const avgSqm = filtered.reduce((s, l) => s + l.sqm_price, 0) / filtered.length
    const avgPrice = filtered.reduce((s, l) => s + l.price, 0) / filtered.length
    const avgDays = filtered.reduce((s, l) => s + l.days_for_sale, 0) / filtered.length
    return { avgSqm, avgPrice, avgDays }
  }, [filtered])

  const handleSort = (key: keyof Listing) => {
    if (key === sortKey) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const toggleArea = (name: string) => setFilters(f => ({
    ...f, areas: f.areas.includes(name) ? f.areas.filter(x => x !== name) : [...f.areas, name]
  }))

  const toggleRoom = (r: number) => setFilters(f => ({
    ...f, rooms: f.rooms.includes(r) ? f.rooms.filter(x => x !== r) : [...f.rooms, r]
  }))

  const Col = ({ label, k }: { label: string; k: keyof Listing }) => (
    <th onClick={() => handleSort(k)}
      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-[#3ECFA0] select-none whitespace-nowrap">
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  )

  if (loading) return <Spinner />
  if (error) return <div className="p-6 text-red-400">Fejl: {error}</div>

  return (
    <div className="p-6 space-y-4">
      {/* Filter bar */}
      <div className="bg-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-6">

          {/* Area */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Område</label>
            <div className="flex flex-wrap gap-2">
              {AREAS.map(a => (
                <button key={a.name} onClick={() => toggleArea(a.name)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    filters.areas.includes(a.name)
                      ? 'bg-[#3ECFA0] text-[#0F1419] font-medium'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}>
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
                  className={`w-10 h-10 rounded text-sm font-medium transition-colors ${
                    filters.rooms.includes(r)
                      ? 'bg-[#3ECFA0] text-[#0F1419]'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}>
                  {r === 6 ? '6+' : r}
                </button>
              ))}
            </div>
          </div>

          {/* Price */}
          <div className="flex-1 min-w-48">
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">
              Pris: {fmt(filters.minPrice)} – {fmt(filters.maxPrice)} kr
            </label>
            <input type="range" min={0} max={20_000_000} step={250_000}
              value={filters.maxPrice}
              onChange={e => setFilters(f => ({ ...f, maxPrice: +e.target.value }))}
              className="w-full accent-[#3ECFA0]" />
          </div>

          {/* Size */}
          <div className="flex-1 min-w-48">
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">
              Størrelse: {filters.minSize} – {filters.maxSize} m²
            </label>
            <input type="range" min={0} max={300} step={5}
              value={filters.maxSize}
              onChange={e => setFilters(f => ({ ...f, maxSize: +e.target.value }))}
              className="w-full accent-[#3ECFA0]" />
          </div>

          {/* Reset */}
          <div className="flex items-end">
            <button onClick={() => setFilters(DEFAULT_FILTERS)}
              className="px-4 py-2 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm transition-colors">
              Nulstil
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Boliger', value: filtered.length.toString() },
            { label: 'Gns. kr/m²', value: fmt(Math.round(kpis.avgSqm)) },
            { label: 'Gns. pris', value: fmt(Math.round(kpis.avgPrice)) + ' kr' },
            { label: 'Gns. dage til salg', value: Math.round(kpis.avgDays).toString() },
          ].map(k => (
            <div key={k.label} className="bg-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{k.label}</div>
              <div className="text-xl font-semibold text-[#F5A623]">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <Col label="Adresse" k="street" />
              <Col label="Postnr" k="zip_code" />
              <Col label="Vær." k="rooms" />
              <Col label="m²" k="size" />
              <Col label="Pris" k="price" />
              <Col label="kr/m²" k="sqm_price" />
              <Col label="Dage" k="days_for_sale" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {sorted.length === 0 && (
              <tr><td colSpan={7}><EmptyState /></td></tr>
            )}
            {sorted.map(l => (
              <tr key={l.id}
                onClick={() => window.open(`https://www.boliga.dk/bolig/${l.id}`, '_blank')}
                className="hover:bg-slate-800 cursor-pointer transition-colors">
                <td className="px-4 py-3 text-slate-200">{l.street}</td>
                <td className="px-4 py-3 text-slate-400">{l.zip_code}</td>
                <td className="px-4 py-3 text-slate-300">{l.rooms}</td>
                <td className="px-4 py-3 text-slate-300">{l.size}</td>
                <td className="px-4 py-3 text-[#F5A623] font-medium">{fmt(l.price)}</td>
                <td className="px-4 py-3 text-slate-300">{fmt(Math.round(l.sqm_price))}</td>
                <td className="px-4 py-3 text-slate-400">{l.days_for_sale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
