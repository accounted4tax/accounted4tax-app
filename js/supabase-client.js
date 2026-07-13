// Accounted4Tax Practice Manager — Supabase client
// The anon key below is safe to be public: it is enforced entirely by your
// Row Level Security (RLS) policies on the database, not by secrecy.

const SUPABASE_URL = 'https://luctaleodfjrrtubqble.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1Y3RhbGVvZGZqcnJ0dWJxYmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NTA5MjQsImV4cCI6MjA5ODQyNjkyNH0.58cb-1ZotANCvo55r-5-2M4sO3TKQsErBAQeOQQp6bo';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
