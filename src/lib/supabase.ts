import { createClient } from '@supabase/supabase-js'

// Supabase-Projekt „Teamhub“ im Beautylounge-Konto (vdekbelklbctqwucibzn, Zürich).
// Werte kommen aus .env (lokal) bzw. den Netlify-Umgebungsvariablen — nie ins Repo.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = url && anonKey ? createClient(url, anonKey) : null
