export type TrackStatus = 'pending' | 'resolving' | 'downloading' | 'inspecting' | 'audio_review' | 'transcoding' | 'tagging' | 'done' | 'skipped' | 'cancelled' | 'error';
export interface RequestedRecording {title: string; artist: string; mix: string; durationSec: number}
export interface SelectedRecording {url: string; title: string; durationSec: number; originalUrl: string | null; method: 'local' | 'original' | 'automatic' | 'manual'}
export interface AudioInspection {
  version: number; durationSec: number; codec: string; sourceSha256?: string;
  sourceBitrateKbps: number | null; peakDb: number; rmsDb: number; waveform: number[];
  silenceIntervals: Array<{startSec: number; endSec: number}>;
  ending: {startSec: number; endSec: number; suggestedEndSec: number} | null; warnings: string[];
}
export interface TrimDecision {action: 'keep' | 'trim'; endSec: number | null; sourceSha256: string; approvedAt: string; analysisVersion: number}
export interface Track extends RequestedRecording {
  id: string; index: number; selected: boolean; status: TrackStatus; requested: RequestedRecording;
  source: string; localPath?: string; directUrl?: string; matchUrl?: string;
  selectedRecording?: SelectedRecording; inspection?: AudioInspection; verification?: AudioInspection;
  trimDecision?: TrimDecision; outputPath?: string; errorCode?: string; errorMessage?: string;
}
