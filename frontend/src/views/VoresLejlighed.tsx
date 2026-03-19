import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Spinner from '../components/Spinner'

interface Config {
  address: string
  zip_code: string
  size: string
  rooms: string
  build_year: string
  purchase_price: string
  purchase_date: string
}

interface SoldRecord {
  estate_id: number
  address: string
  sold_date: string
  price: number
  size: number
  rooms: number
  sqm_price: number
}

const STORAGE_KEY = 'boligtracker_config'
const fmt = (n: number) => Math.round(n).toLocaleString('da-DK')

const DEFAULT_CONFIG: Config = {
  address: '', zip_code: '2000', size: '85', rooms: '3',
  build_year: '', purchase_price: '', purchase_date: '',
}

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG
  } catch { return DEFAULT_CONFIG }
}

export default function VoresLejlighed() {
  const [config, setConfig] = useState<Config>(loadConfig)
  const [draft, setDraft] = useState<Config>(loadConfig)
  const [loading, setLoading] = useState(true)
  const [avgSqm, setAvgSqm] = useState<number | null>(null)
  const [stdDev, setStdDev] = useState<number | null>(null)
  const [similar, setSimilar] = useState<SoldRecord[]>([])

  useEffect(() => {
    const zip = parseInt(config.zip_code)
    const size = parseFloat(config.size)
    const rooms = parseFloat(config.rooms)
    if (!zip || !size) { setLoading(false); return }

    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const since = threeMonthsAgo.toISOString().slice(0, 10)

    setLoading(true)

    // Fetch recent sales in same zip for valuation
    supabase
      .from('sold')
      .select('sqm_price')
      .eq('zip_code', zip)
      .gte('sold_date', since)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const prices = data.map(r => r.sqm_price).filter(Boolean)
          const avg = prices.reduce((s, v) => s + v, 0) / prices.length
          const variance = prices.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / prices.length
          setAvgSqm(avg)
          setStdDev(Math.sqrt(variance))
        } else {
          setAvgSqm(null)
          setStdDev(null)
        }
      })

    // Fetch 3 similar recently sold
    supabase
      .from('sold')
      .select('estate_id,address,sold_date,price,size,rooms,sqm_price')
      .eq('zip_code', zip)
      .gte('size', size - 15)
      .lte('size', size + 15)
      .gte('rooms', rooms - 1)
      .lte('rooms', rooms + 1)
      .order('sold_date', { ascending: false })
      .limit(3)
      .then(({ data }) => { setSimilar(data || []); setLoading(false) })

  }, [config])

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    setConfig(draft)
  }

  const size = parseFloat(config.size) || 0
  const purchasePrice = parseFloat(config.purchase_price) || 0
  const estimatedValue = avgSqm && size ? avgSqm * size : null
  const gain = estimatedValue && purchasePrice ? estimatedValue - purchasePrice : null
  const gainPct = gain && purchasePrice ? (gain / purchasePrice) * 100 : null

  const field = (label: string, key: keyof Config, placeholder?: string) => (
    <div>
      <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">{label}</label>
      <input
        type="text"
        value={draft[key]}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full bg-slate-700 text-slate-200 rounded px-3 py-2 text-sm border border-slate-600 focus:outline-none focus:border-[#3ECFA0]"
      />
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Config form */}
      <div className="bg-slate-800 rounded-lg p-5">
        <h2 className="text-base font-semibold text-white mb-4">Vores lejlighed</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {field('Adresse', 'address', 'Eksempel Alle 12, 2. tv')}
          {field('Postnummer', 'zip_code', '2000')}
          {field('Størrelse (m²)', 'size', '85')}
          {field('Værelser', 'rooms', '3')}
          {field('Byggeår', 'build_year', '1930')}
          {field('Købspris (kr)', 'purchase_price', '3500000')}
          {field('Købsdato', 'purchase_date', '2020-06-01')}
        </div>
        <button onClick={save}
          className="mt-4 px-5 py-2 bg-[#3ECFA0] text-[#0F1419] rounded font-medium text-sm hover:opacity-90 transition-opacity">
          Gem
        </button>
      </div>

      {loading ? <Spinner label="Beregner værdi…" /> : (
        <>
          {/* Valuation */}
          {estimatedValue ? (
            <div className="bg-slate-800 rounded-lg p-5 space-y-4">
              <h2 className="text-base font-semibold text-white">Estimeret markedsværdi</h2>
              <div className="text-4xl font-bold text-[#3ECFA0]">{fmt(estimatedValue)} kr</div>
              {stdDev && (
                <div className="text-sm text-slate-400">
                  Konfidensinterval: {fmt(estimatedValue - stdDev * size)} – {fmt(estimatedValue + stdDev * size)} kr
                  <span className="ml-2 text-slate-500">(±1 std.afv. på kr/m²)</span>
                </div>
              )}
              <div className="text-xs text-slate-500">
                Baseret på {config.zip_code} salgspriser de seneste 3 måneder · {fmt(avgSqm!)} kr/m² gennemsnit
              </div>

              {gain !== null && (
                <div className={`flex items-center gap-3 pt-2 border-t border-slate-700`}>
                  <div>
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Urealiseret gevinst</div>
                    <div className={`text-2xl font-semibold ${gain >= 0 ? 'text-[#3ECFA0]' : 'text-red-400'}`}>
                      {gain >= 0 ? '+' : ''}{fmt(gain)} kr
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Afkast</div>
                    <div className={`text-2xl font-semibold ${gainPct! >= 0 ? 'text-[#3ECFA0]' : 'text-red-400'}`}>
                      {gainPct! >= 0 ? '+' : ''}{gainPct!.toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-800 rounded-lg p-5 text-slate-400 text-sm">
              Ingen solgte boliger fundet i postnummer {config.zip_code} de seneste 3 måneder til beregning.
            </div>
          )}

          {/* Similar sold */}
          {similar.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-white">Lignende solgte boliger</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {similar.map(s => (
                  <div key={s.estate_id} className="bg-slate-800 rounded-lg p-4 space-y-2">
                    <div className="text-sm text-slate-200 font-medium leading-snug">{s.address}</div>
                    <div className="text-xs text-slate-400">{s.sold_date} · {s.size} m² · {s.rooms} vær.</div>
                    <div className="text-lg font-semibold text-[#F5A623]">{fmt(s.price)} kr</div>
                    <div className="text-xs text-slate-400">{fmt(s.sqm_price)} kr/m²</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
