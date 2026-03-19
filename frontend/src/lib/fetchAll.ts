import { supabase } from '../supabase'

// Supabase caps at 1000 rows per request — this paginates until done
export async function fetchAll<T>(
  table: string,
  columns: string,
  filters: (q: any) => any
): Promise<T[]> {
  const PAGE = 1000
  let from = 0
  const all: T[] = []

  while (true) {
    const query = supabase.from(table).select(columns)
    const { data, error } = await filters(query).range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}
