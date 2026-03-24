import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Spinner from '../components/Spinner'

interface Config {
  address: string
  zip_code: string
  size: string
  rooms: string
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
  price_change: number
}

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

function areaForZip(zip: number) {
  return AREAS.find(a => a.zips(zip)) ?? null
}

const STORAGE_KEY = 'boligtracker_config'
const fmt = (n: number) => Math.round(n).toLocaleString('da-DK')

const DEFAULT_CONFIG: Config = {
  address: 'Rosenørns Alle 68, 2', zip_code: '2000', size: '85', rooms: '3',
  purchase_price: '', purchase_date: '',
}

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG
  } catch { return DEFAULT_CONFIG }
}

function Stars({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s}
          onClick={() => onChange(s === value ? 0 : s)}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          className="text-lg leading-none transition-colors"
          title={s === value ? 'Fjern vurdering' : `${s} stjerner`}>
          <span className={(hover || value) >= s ? 'text-[#F5A623]' : 'text-slate-600'}>★</span>
        </button>
      ))}
    </div>
  )
}

export default function VoresLejlighed() {
  const [config, setConfig] = useState<Config>(loadConfig)
  const [draft, setDraft] = useState<Config>(loadConfig)
  const [loading, setLoading] = useState(true)
  const [avgSqm, setAvgSqm] = useState<number | null>(null)
  const [stdDev, setStdDev] = useState<number | null>(null)
  const [sampleSize, setSampleSize] = useState(0)
  const [similar, setSimilar] = useState<SoldRecord[]>([])
  const [ratings, setRatings] = useState<Record<number, number>>({})

  useEffect(() => {
    const zip = parseInt(config.zip_code)
    const size = parseFloat(config.size)
    const rooms = parseFloat(config.rooms)
    if (!zip || !size) { setLoading(false); return }

    const area = areaForZip(zip)
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const since = threeMonthsAgo.toISOString().slice(0, 10)

    setLoading(true)

    const areaZips = area
      ? Array.from({ length: 9999 }, (_, i) => i + 1000).filter(z => area.zips(z))
      : [zip]

    // Fetch area-wide recent sales for fallback valuation
    supabase
      .from('sold')
      .select('sqm_price')
      .in('zip_code', areaZips)
      .gte('sold_date', since)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const prices = data.map(r => r.sqm_price).filter(Boolean)
          const avg = prices.reduce((s, v) => s + v, 0) / prices.length
          const variance = prices.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / prices.length
          setAvgSqm(avg)
          setStdDev(Math.sqrt(variance))
          setSampleSize(prices.length)
        } else {
          setAvgSqm(null); setStdDev(null); setSampleSize(0)
        }
      })

    // Fetch similar sold
    supabase
      .from('sold')
      .select('estate_id,address,sold_date,price,size,rooms,sqm_price,price_change')
      .in('zip_code', areaZips)
      .gte('size', size - 15)
      .lte('size', size + 15)
      .gte('rooms', rooms - 1)
      .lte('rooms', rooms + 1)
      .order('sold_date', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        const records = data || []
        setSimilar(records)

        // Fetch existing ratings for these estate_ids
        if (records.length > 0) {
          supabase
            .from('comparable_ratings')
            .select('estate_id,stars')
            .in('estate_id', records.map(r => r.estate_id))
            .then(({ data: rdata }) => {
              const map: Record<number, number> = {}
              rdata?.forEach(r => { map[r.estate_id] = r.stars })
              setRatings(map)
              setLoading(false)
            })
        } else {
          setLoading(false)
        }
      })
  }, [config])

  const rate = async (estateId: number, stars: number) => {
    if (stars === 0) {
      await supabase.from('comparable_ratings').delete().eq('estate_id', estateId)
      setRatings(r => { const next = { ...r }; delete next[estateId]; return next })
    } else {
      await supabase.from('comparable_ratings').upsert({ estate_id: estateId, stars, rated_at: new Date().toISOString() })
      setRatings(r => ({ ...r, [estateId]: stars }))
    }
  }

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
    setConfig(draft)
  }

  const size = parseFloat(config.size) || 0
  const purchasePrice = parseFloat(config.purchase_price) || 0
  const area = areaForZip(parseInt(config.zip_code))

  // Valuation: use rated comparables weighted by stars, fall back to area average
  const ratedSimilar = similar.filter(s => ratings[s.estate_id] > 0)
  const effectiveSqm = (() => {
    if (ratedSimilar.length > 0) {
      const totalWeight = ratedSimilar.reduce((s, r) => s + ratings[r.estate_id], 0)
      return ratedSimilar.reduce((s, r) => s + r.sqm_price * ratings[r.estate_id], 0) / totalWeight
    }
    return avgSqm
  })()

  const estimatedValue = effectiveSqm && size ? effectiveSqm * size : null
  const gain = estimatedValue && purchasePrice ? estimatedValue - purchasePrice : null
  const gainPct = gain && purchasePrice ? (gain / purchasePrice) * 100 : null
  const usingRatings = ratedSimilar.length > 0

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
              {!usingRatings && stdDev && (
                <div className="text-sm text-slate-400">
                  Konfidensinterval: {fmt(estimatedValue - stdDev * size)} – {fmt(estimatedValue + stdDev * size)} kr
                  <span className="ml-2 text-slate-500">(±1 std.afv. på kr/m²)</span>
                </div>
              )}
              <div className="text-xs text-slate-500">
                {usingRatings
                  ? `Baseret på ${ratedSimilar.length} vurderede sammenligninger · ${fmt(effectiveSqm!)} kr/m² vægtet gennemsnit`
                  : `Baseret på ${sampleSize} salg i ${area?.name ?? config.zip_code} de seneste 3 måneder · ${fmt(avgSqm!)} kr/m² gennemsnit`
                }
              </div>

              {gain !== null && (
                <div className="flex items-center gap-6 pt-2 border-t border-slate-700">
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
              Ingen solgte boliger fundet i {area?.name ?? config.zip_code} de seneste 3 måneder til beregning.
            </div>
          )}

          {/* Similar sold */}
          {similar.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-semibold text-white">Lignende solgte boliger</h2>
                <span className="text-xs text-slate-500">— bedøm hvor sammenlignelige de er</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {similar.map(s => (
                  <div key={s.estate_id}
                    className={`bg-slate-800 rounded-lg p-4 space-y-2 border transition-colors ${ratings[s.estate_id] ? 'border-[#F5A623]/40' : 'border-transparent'}`}>
                    <div className="text-sm text-slate-200 font-medium leading-snug">{s.address}</div>
                    <div className="text-xs text-slate-400">{s.sold_date} · {s.size} m² · {s.rooms} vær.</div>
                    <div className="text-lg font-semibold text-[#F5A623]">{fmt(s.price)} kr</div>
                    <div className="text-xs text-slate-400">{fmt(s.sqm_price)} kr/m²</div>
                    {s.price_change != null && (
                      <div className={`text-xs font-medium ${s.price_change < 0 ? 'text-[#3ECFA0]' : 'text-red-400'}`}>
                        {s.price_change.toFixed(1)}% ift. udbudspris
                      </div>
                    )}
                    <Stars value={ratings[s.estate_id] ?? 0} onChange={stars => rate(s.estate_id, stars)} />
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
