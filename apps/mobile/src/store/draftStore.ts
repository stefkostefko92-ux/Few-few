import { create } from 'zustand';

import { config } from '@/config';
import type { GeoPoint, MediaAsset, ReportDraft } from '@/types';
import { emptyDraft } from '@/types';

type DraftState = {
  draft: ReportDraft;
  setCategory: (slug: string) => void;
  setSettlement: (slug: string) => void;
  addMedia: (asset: MediaAsset) => void;
  removeMedia: (uri: string) => void;
  setLocation: (location: GeoPoint | null) => void;
  setDescription: (value: string) => void;
  setReporterName: (value: string) => void;
  setReporterPhone: (value: string) => void;
  reset: () => void;
};

export const useDraftStore = create<DraftState>((set) => ({
  draft: emptyDraft(),
  setCategory: (slug) =>
    set((state) => ({ draft: { ...state.draft, categorySlug: slug } })),
  setSettlement: (slug) =>
    set((state) => ({ draft: { ...state.draft, settlementSlug: slug } })),
  addMedia: (asset) =>
    set((state) => {
      if (asset.kind === 'video') {
        return { draft: { ...state.draft, media: [asset] } };
      }
      const withoutVideo = state.draft.media.filter((m) => m.kind === 'image');
      if (withoutVideo.length >= config.maxPhotos) {
        return state;
      }
      return { draft: { ...state.draft, media: [...withoutVideo, asset] } };
    }),
  removeMedia: (uri) =>
    set((state) => ({
      draft: { ...state.draft, media: state.draft.media.filter((m) => m.uri !== uri) },
    })),
  setLocation: (location) =>
    set((state) => ({ draft: { ...state.draft, location } })),
  setDescription: (value) =>
    set((state) => ({ draft: { ...state.draft, description: value } })),
  setReporterName: (value) =>
    set((state) => ({ draft: { ...state.draft, reporterName: value } })),
  setReporterPhone: (value) =>
    set((state) => ({ draft: { ...state.draft, reporterPhone: value } })),
  reset: () => set({ draft: emptyDraft() }),
}));
