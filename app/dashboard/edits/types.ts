import type { EditStatus } from '@/types';

export interface EditListRow {
  id: string;
  title: string;
  status: EditStatus;
  output_thumbnail_url: string | null;
  output_video_url: string | null;
  source_video_url: string | null;
  style_dna_id: string | null;
  style_dna_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
