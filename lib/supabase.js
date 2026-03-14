import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export const getParametres = async () => {
  const { data } = await supabase.from('parametres').select('*')
  const obj = {}
  data?.forEach(p => { obj[p.cle] = p.valeur })
  return obj
}