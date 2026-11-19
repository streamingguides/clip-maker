# Vyro Campaign Mode — Update Report (2026-11-19)

Scope: ONLY Vyro terms & conditions wiring was added. Nothing else in the tool
was changed, refactored, or "fixed".

## Files changed

| File | Change |
|---|---|
| `config/campaigns.json` | **NEW.** Vyro campaign presets. Fields per preset: `platform: "Vyro"`, `campaignName`, `requiredHashtags[]`, `requiredMention`, `disclosureText: "#ad"`, `allowedPlatforms: [TikTok, Instagram Reels, YouTube Shorts, X]` (Facebook is NOT in the list — Vyro does not count it), `defaultRatio: "9:16"`, `clipLength {minSec 15, maxSec 60, defaultSec 30}`, `faceVisibleRequired: true`, plus the joined-campaign `noteLine` and the 6-item Vyro `submitChecklist`. Ships with one blank template preset and one clearly-labelled EXAMPLE preset — edit the JSON to match the real campaign joined on Vyro. |
| `server/campaigns.ts` | **NEW.** Loads/caches the presets; builds post captions (`#ad` always first line, then hook, title, campaign hashtags + mention, campaign name, allowed platforms); builds the submit checklist; merges required hashtags into clip hashtags; keeps a small used-moments log at `storage/campaign-used-moments.json` (per campaign + per source video) for duplicate protection. |
| `src/shared/types.ts` | Two OPTIONAL fields on `ClipStyleConfig`: `campaignId` and `disclosureText`. Style is stored as JSON, so old projects/settings are unaffected. |
| `server/app.ts` | (1) New `GET /api/campaigns` endpoint serving the presets. (2) `buildNewProject`: when a `campaignId` is posted, the preset pins ratio to 9:16, clamps clip length into 15–60s (Auto length → 30s), and stamps `campaignId` + `disclosureText` into the project style. No campaign = old behaviour, untouched. (3) Manual clip creation: ranges already used for the campaign are skipped, and created clips get the campaign hashtags + `#ad`-first caption as their description. (4) ZIP download: campaign projects get one extra file, `post_captions.txt` (checklist + one ready-to-paste caption per clip). |
| `server/queue.ts` | Auto/mixed analysis passes the campaign's used-moment ranges into the existing moment detector (which already avoids overlaps), stamps campaign meta on auto clips, and records the new moments in the log. "Find more moments" does the same. |
| `server/render.ts` | One addition in the subtitle generator: if the style carries `disclosureText`, a `#ad` dialogue line in a new top-right "Disclosure" ASS style is burned for the **whole clip duration**. Because it comes from the project style (set by the preset), it cannot be silently dropped per clip. Non-campaign renders are byte-identical to before. |
| `src/components/StartScreen.tsx` | Small additions only: fetches `/api/campaigns`, a "Campaign Mode (optional)" dropdown above the Generate button, `campaignId` included in the sample/URL/upload create requests, and — when a campaign is selected — the note under the permission checkbox: *"Campaign Mode: only clip footage from Vyro campaigns you have joined."* No existing logic was altered. |

## How each Vyro rule maps into the tool

- **Joining a campaign = permission; clip only its named footage** → preset is
  chosen deliberately per project; the joined-campaign note sits under the
  permission checkbox in Campaign Mode and at the top of the checklist file.
- **#ad disclosure, on by default, cannot be dropped** → preset stamps
  `disclosureText` into the project style; render burns `#ad` for the full
  clip; every generated post caption starts with `#ad`.
- **Only TikTok / Instagram Reels / YouTube Shorts / X count; Facebook doesn't**
  → `allowedPlatforms` in the preset, printed in every caption and the
  checklist (rule 2 states Facebook views do NOT count).
- **Views count from link submission, not posting** → checklist rule 3:
  submit the post link on Vyro IMMEDIATELY after posting.
- **5,000 views per post before it earns** → checklist rule 4.
- **Don't delete the post during the campaign** → checklist rule 5.
- **No duplicate reposting / no fake views** → checklist rule 6, PLUS active
  duplicate protection: the used-moments log stops the same timestamp range
  being clipped twice for the same campaign + source video (auto mode via the
  detector's existing overlap avoidance; manual mode ranges are skipped).
- **Face visible** → `faceVisibleRequired` adds checklist rule 7 reminding the
  poster to keep the streamer's face visible.
- **Clip length / shape** → preset defaults: 9:16, length clamped to 15–60s.

## Verification (the only tests run, per scope)

- `npm install` — plain install FAILS on a **pre-existing** peer conflict in
  the shipped `package.json` (vite 8 wants esbuild ^0.27/^0.28 as a peer; the
  project pins esbuild ^0.25). Deps were installed with
  `npm install --legacy-peer-deps --no-package-lock` (230 packages) WITHOUT
  modifying `package.json`. This conflict existed before this update and was
  left untouched per scope — but it should be fixed before a public release,
  because every new user running plain `npm install` will hit it.
- `npm run lint` (`tsc --noEmit`) — **PASS** (before and after the changes).
- `npm run build` (`vite build`) — **PASS** after the changes
  (dist built cleanly, ~2.9s).
- `config/campaigns.json` validated as parseable JSON with all required
  fields on both presets.
- No e2e/pipeline tests were run (dropped from scope), so the campaign flow
  is verified by type-check + build, not by an end-to-end render.

## NOT done (would require touching other parts — listed, not forced)

- **Per-clip `post_caption.txt` files on disk next to each MP4** in the
  outputs folder: the existing results pattern is the batch ZIP + the
  in-app description/copy field, so the caption package ships as one
  `post_captions.txt` inside the ZIP and as each clip's description
  (copyable in the Results screen). Writing extra files beside outputs
  would mean changing the render/output bookkeeping.
- **Blocking renders that violate the preset** (e.g. hard-stopping a
  campaign render if a user manually switches the ratio away from 9:16 in
  the Style Customizer, or verifying face visibility with OpenCV before
  render): the preset sets the defaults and the checklist carries the face
  rule, but hard enforcement would require changing the style-editor and
  render-gate logic, which was out of scope.
- **Platform selection per post** (TikTok vs Reels vs Shorts vs X) is not
  tracked per clip; the allowed-platform list is printed in captions and
  the checklist instead.
- Runner-up moments promoted later are not re-checked against the campaign
  used-moments log at promotion time (they were unused when generated, and
  promoting one does not record it). Primary auto/manual flows are covered.

---

## Fixes applied — 2026-11-19 (issue-fix pass, user-approved)

Scope: only the items below. No feature code was changed.

1. **npm install conflict fixed** — `package.json` (devDependencies): `"esbuild": "^0.25.0"` → `"^0.27.0"`. vite 8 requires esbuild ^0.27/^0.28; the old pin made a plain `npm install` fail with ERESOLVE for every new user.
2. **Gemini leftovers removed** (re-verified first: `grep` for `genai|GEMINI|Gemini|gemini` across all `.ts/.tsx/.js/.mjs/.py` files returned zero matches — the package was never imported anywhere):
   - `package.json` (dependencies): removed the `"@google/genai": "^2.4.0"` line.
   - `.env.example`: rewritten — it previously said `GEMINI_API_KEY` was "Required". It now states plainly that NO API key is needed (transcription is local faster-whisper, moment detection is local). `APP_URL` was also dropped: a grep confirmed it is not referenced anywhere in the code.
   - `metadata.json`: `majorCapabilities` no longer lists `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` (now an empty array; name/description unchanged, JSON still valid).
3. **Content Rewards campaign presets merged** — `config/campaigns.json` now holds 4 presets: the existing `vyro-template` plus `content-rewards-dylan-page`, `content-rewards-kreekcraft`, and `content-rewards-kai-cenat` (from the prepared draft, schema-validated against `server/campaigns.ts` — all required fields present, no mismatches to fix). The placeholder `vyro-example-streamer` preset was dropped since real presets replace it. Each Content Rewards checklist already contained all five required facts (join-first, submit link within 30 minutes, strip GTA radio music, no spoilers, re-check live rate/budget before joining), so nothing had to be added. The draft file `config/campaigns-content-rewards-draft.json` was deleted after the merge.

### Verification (2026-11-19, after the fixes)
- Fresh plain `npm install` (node_modules deleted first, NO `--legacy-peer-deps`): **PASS** — 193 packages added in ~25s, no ERESOLVE.
- `npm run lint` (`tsc --noEmit`): **PASS** (exit 0).
- `npm run build` (`vite build`): **PASS** — dist built cleanly.
- Server smoke test (`node server.ts`, then stopped): **PASS** — `GET /api/campaigns` returned all 4 presets; "Dylan Page", "KreekCraft", and "Kai Cenat" campaign names all present in the response.
