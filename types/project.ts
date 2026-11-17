export interface Project {
  id: string;
  user_id: string;
  name: string;
  site_url: string;
  api_key: string;
  created_at?: string;
}

export interface SupabaseEnvConfig {
  url: string;
  anonKey: string;
}
