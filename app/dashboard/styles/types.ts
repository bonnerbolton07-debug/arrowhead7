export interface StyleListRow {
  id: string;
  name: string;
  reference_video_url: string;
  status: 'analyzing' | 'ready' | 'failed';
  cuts_per_minute: number | null;
  avg_cut_duration_ms: number | null;
  bpm_target: number | null;
  energy: string | null;
  palette: string[];
  created_at: string;
  updated_at: string;
}
