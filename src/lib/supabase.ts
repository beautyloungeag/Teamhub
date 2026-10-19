import { createClient } from '@supabase/supabase-js'

// Supabase-Projekt „Teamhub“ im Beautylounge-Konto (vdekbelklbctqwucibzn, Zürich).
// URL und Anon-Key sind öffentlich (landen ohnehin im ausgelieferten Code, Schutz über RLS),
// deshalb als Standard hier. .env bzw. Netlify-Variablen überschreiben sie bei Bedarf.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://vdekbelklbctqwucibzn.supabase.co'
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkZWtiZWxrbGJjdHF3dWNpYnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTk1MjEsImV4cCI6MjEwMzM3NTUyMX0.PrDnuLksOUTU6arX5-D-C4MTW6vF79YXAUeSteZ-514'

export const supabase = url && anonKey ? createClient(url, anonKey) : null
