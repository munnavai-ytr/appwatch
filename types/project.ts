export interface Project {
  id: string;
  user_id: string;
  name: string;
  site_url: string;
  api_key: string;
  created_at?: string;
}

export type IncidentSeverity = 'low' | 'medium' | 'high';

export interface Incident {
  id: string;
  project_id: string;
  title: string;
  severity: IncidentSeverity | string;
  status: string;
  event_count: number;
  fingerprint?: string;
  resolved_at?: string | null;
  created_at: string;
}

export interface Check {
  id: string;
  project_id: string;
  is_up: boolean;
  status_code: number | null;
  response_ms: number | null;
  created_at: string;
}

export interface SupabaseEnvConfig {
  url: string;
  anonKey: string;
}
