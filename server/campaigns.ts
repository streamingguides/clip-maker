import fs from 'node:fs';
import path from 'node:path';
import { STORAGE_ROOT } from './db.ts';
import type { ClipItem } from '../src/shared/types.ts';

/**
 * Vyro Campaign Mode (added 2026-11-19).
 * Presets live in config/campaigns.json — edit that file to match the real
 * campaign you joined on Vyro (name, required hashtags, required mention).
 * Nothing in this module changes the normal (non-campaign) flow.
 */

export interface CampaignPreset {
  id: string;
  platform: string; // "Vyro"
  campaignName: string;
  requiredHashtags: string[];
  requiredMention: string; // e.g. "@streamer" or ""
  disclosureText: string; // "#ad"
  allowedPlatforms: string[]; // TikTok, Instagram Reels, YouTube Shorts, X (NOT Facebook)
  defaultRatio: string; // "9:16"
  clipLength: { minSec: number; maxSec: number; defaultSec: number };
  faceVisibleRequired: boolean;
  noteLine: string;
  submitChecklist: string[];
}

let cachedCampaigns: CampaignPreset[] | null = null;

export function loadCampaigns(): CampaignPreset[] {
  if (cachedCampaigns) return cachedCampaigns;
  const p = path.resolve(process.cwd(), 'config', 'campaigns.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      campaigns?: CampaignPreset[];
    };
    cachedCampaigns = Array.isArray(parsed.campaigns) ? parsed.campaigns : [];
  } catch {
    cachedCampaigns = [];
  }
  return cachedCampaigns;
}

export function getCampaign(id: string | null | undefined): CampaignPreset | null {
  if (!id) return null;
  return loadCampaigns().find((c) => c.id === id) ?? null;
}

/** Required campaign hashtags first, then the clip's own tags, de-duplicated. */
export function mergeCampaignHashtags(
  campaign: CampaignPreset,
  existing: string[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of [...campaign.requiredHashtags, ...existing]) {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * The post caption for one clip. The disclosure ("#ad") is ALWAYS the first
 * line — Vyro campaigns require a clear disclosure and it must not be dropped.
 */
export function buildPostCaption(
  campaign: CampaignPreset,
  clip: Pick<ClipItem, 'title' | 'hookText' | 'hashtags'>
): string {
  const tags = mergeCampaignHashtags(campaign, clip.hashtags);
  const tagLine = [...tags, campaign.requiredMention].filter(Boolean).join(' ');
  return [
    campaign.disclosureText,
    clip.hookText || clip.title,
    '',
    clip.title,
    '',
    tagLine,
    '',
    `Campaign: ${campaign.campaignName} (${campaign.platform})`,
    `Post on: ${campaign.allowedPlatforms.join(' / ')}`,
  ]
    .join('\n')
    .trim();
}

/** The Vyro submit checklist (rules a–f) + the joined-campaign note on top. */
export function buildSubmitChecklist(campaign: CampaignPreset): string {
  const lines = [
    `SUBMIT CHECKLIST — ${campaign.campaignName} (${campaign.platform})`,
    campaign.noteLine,
    '',
    ...campaign.submitChecklist.map((item, i) => `${i + 1}. ${item}`),
  ];
  if (campaign.faceVisibleRequired) {
    lines.push(
      `${campaign.submitChecklist.length + 1}. Keep the streamer's face visible in the clip — this campaign requires it.`
    );
  }
  return lines.join('\n');
}

/** One combined file for a batch: checklist once, then a caption per clip. */
export function buildBatchPostCaptions(
  campaign: CampaignPreset,
  clips: ClipItem[]
): string {
  const sections = clips.map((clip, i) => {
    const idx = String(i + 1).padStart(3, '0');
    return `===== CLIP ${idx}: ${clip.title} =====\n${buildPostCaption(campaign, clip)}`;
  });
  return `${buildSubmitChecklist(campaign)}\n\n${sections.join('\n\n')}\n`;
}

/** Mutates a clip's hashtags + description into the campaign post package. */
export function applyCampaignMeta(campaign: CampaignPreset, clip: ClipItem): void {
  clip.hashtags = mergeCampaignHashtags(campaign, clip.hashtags);
  clip.description = buildPostCaption(campaign, clip);
}

// ---------------------------------------------------------------------------
// Duplicate protection: a tiny used-moments log per campaign + source video,
// stored at storage/campaign-used-moments.json. The auto moment detector
// already avoids overlap inside one project; this log extends the same
// protection across projects so a moment is never clipped twice for a campaign.
// ---------------------------------------------------------------------------

interface MomentRange {
  start: number;
  end: number;
}

const USED_LOG_PATH = path.join(STORAGE_ROOT, 'campaign-used-moments.json');

function usedLogKey(campaignId: string, sourceKey: string): string {
  return `${campaignId}::${sourceKey}`;
}

function readUsedLog(): Record<string, MomentRange[]> {
  try {
    return JSON.parse(fs.readFileSync(USED_LOG_PATH, 'utf8')) as Record<
      string,
      MomentRange[]
    >;
  } catch {
    return {};
  }
}

export function getCampaignUsedRanges(
  campaignId: string,
  sourceKey: string
): MomentRange[] {
  return readUsedLog()[usedLogKey(campaignId, sourceKey)] ?? [];
}

export function isCampaignMomentUsed(
  campaignId: string,
  sourceKey: string,
  start: number,
  end: number
): boolean {
  return getCampaignUsedRanges(campaignId, sourceKey).some(
    (r) => start < r.end - 0.5 && end > r.start + 0.5
  );
}

export function recordCampaignMoments(
  campaignId: string,
  sourceKey: string,
  ranges: MomentRange[]
): void {
  if (ranges.length === 0) return;
  try {
    const log = readUsedLog();
    const key = usedLogKey(campaignId, sourceKey);
    log[key] = [...(log[key] ?? []), ...ranges];
    fs.writeFileSync(USED_LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
  } catch {
    // Duplicate protection is best-effort; never break rendering over it.
  }
}
