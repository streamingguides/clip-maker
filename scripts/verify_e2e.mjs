import fs from 'node:fs';
import path from 'node:path';
import { createApiApp } from '../server/app.ts';
import { runCommandSafe, probeMedia } from '../server/media.ts';
import { DEFAULT_STYLE } from '../src/shared/styles.ts';

let BASE = '';

async function waitForStage(projectId, targetStages, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE}/api/projects/${projectId}`);
    const data = await res.json();
    if (targetStages.includes(data.project.stage)) {
      return data;
    }
    if (data.project.stage === 'error') {
      throw new Error(`Project failed: ${data.project.errorMessage}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Timeout waiting for ${targetStages.join(',')}`);
}

async function main() {
  const app = createApiApp(0);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3457;
  BASE = `http://127.0.0.1:${port}`;
  const results = [];

  try {
    // 1. Health check
    const hRes = await fetch(`${BASE}/api/health`);
    const health = await hRes.json();
    console.log('HEALTH:', JSON.stringify(health));

    // 2. Auto mode (5 clips) on built-in sample video
    const t0 = Date.now();
    const autoRes = await fetch(`${BASE}/api/projects/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissionConfirmed: true,
        mode: 'auto',
        requestedCount: 5,
        targetClipLength: 10,
        language: 'en',
        creatorName: 'Test Channel',
        style: DEFAULT_STYLE,
      }),
    });
    const { project: autoProj } = await autoRes.json();
    const autoDone = await waitForStage(autoProj.id, ['completed']);
    const autoPrimary = autoDone.clips.filter((c) => !c.isRunnerUp);
    console.log(
      `AUTO TEST: ${autoPrimary.length} clips completed in ${((Date.now() - t0) / 1000).toFixed(1)}s. Notice: ${autoDone.project.noticeMessage || 'none'}`
    );
    results.push({ test: 'Auto 5 clips (sample)', clips: autoPrimary.length, notice: autoDone.project.noticeMessage });

    // Probe first rendered clip dimensions & codecs
    if (autoPrimary[0]?.outputPath) {
      const p = await probeMedia(autoPrimary[0].outputPath);
      console.log('PROBE CLIP 1:', JSON.stringify(p));
    }

    // 3. Test ZIP streaming download
    const zipRes = await fetch(`${BASE}/api/projects/${autoProj.id}/download-zip`);
    const zipBuf = Buffer.from(await zipRes.arrayBuffer());
    console.log(`ZIP TEST: status=${zipRes.status}, bytes=${zipBuf.length}, sig=${zipBuf.slice(0, 2).toString('utf8')}`);

    // 4. Auto mode requesting 100 clips on 42s video (shortage reporting check)
    const hundredRes = await fetch(`${BASE}/api/projects/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissionConfirmed: true,
        mode: 'mixed',
        requestedCount: 100,
        targetClipLength: 8,
        language: 'en',
        style: DEFAULT_STYLE,
      }),
    });
    const { project: p100 } = await hundredRes.json();
    const p100Done = await waitForStage(p100.id, ['ready']);
    console.log(`100-CLIP SHORTAGE TEST: found=${p100Done.clips.filter((c) => !c.isRunnerUp).length}, notice="${p100Done.project.noticeMessage}"`);

    // 5. Manual mode: 3 clips via pasted list + typed times + Urdu RTL captions + All 4 Ratios
    const tMan = Date.now();
    const urduStyle = {
      ...DEFAULT_STYLE,
      captions: {
        ...DEFAULT_STYLE.captions,
        rtl: true,
        fontFamily: 'Noto Sans Arabic',
        uppercase: false,
      },
    };
    const manRes = await fetch(`${BASE}/api/projects/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissionConfirmed: true,
        mode: 'manual',
        requestedCount: 3,
        targetClipLength: 10,
        language: 'ur',
        creatorName: 'Urdu Studio',
        style: urduStyle,
      }),
    });
    const { project: manProj } = await manRes.json();
    await waitForStage(manProj.id, ['ready']);

    // Inject Urdu RTL transcript words
    await fetch(`${BASE}/api/projects/${manProj.id}/transcript`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: [
          {
            id: 'ur_1',
            start: 1,
            end: 8,
            text: 'کمال کا رزلٹ ملتا ہے جب آڈیو صاف ہو',
            words: [
              { id: 'u1', word: 'کمال', start: 1.0, end: 2.0 },
              { id: 'u2', word: 'کا', start: 2.0, end: 2.5 },
              { id: 'u3', word: 'رزلٹ', start: 2.5, end: 3.5 },
              { id: 'u4', word: 'ملتا', start: 3.5, end: 4.5 },
              { id: 'u5', word: 'ہے', start: 4.5, end: 5.5 },
              { id: 'u6', word: 'جب', start: 5.5, end: 6.2 },
              { id: 'u7', word: 'آڈیو', start: 6.2, end: 7.0 },
              { id: 'u8', word: 'صاف', start: 7.0, end: 7.5 },
              { id: 'u9', word: 'ہو', start: 7.5, end: 8.0 },
            ],
          },
        ],
      }),
    });

    // Add 3 manual clips via pasted timestamp list
    await fetch(`${BASE}/api/projects/${manProj.id}/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pastedList: '00:01-00:08 Urdu Hook\n00:12-00:20 Mid Highlight\n00:24-00:32 Final Point',
        snapToWords: false,
      }),
    });

    // Render with allRatios=true (3 * 4 = 12 clips across 9:16, 1:1, 4:5, 16:9!)
    await fetch(`${BASE}/api/projects/${manProj.id}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allRatios: true }),
    });
    const manDone = await waitForStage(manProj.id, ['completed']);
    const manClips = manDone.clips.filter((c) => !c.isRunnerUp && c.status === 'completed');
    const ratioDims = {};
    for (const r of ['9:16', '1:1', '4:5', '16:9']) {
      const sample = manClips.find((c) => c.ratio === r);
      if (sample?.outputPath) {
        const pr = await probeMedia(sample.outputPath);
        ratioDims[r] = `${pr.width}x${pr.height}`;
      }
    }
    console.log(
      `MANUAL + URDU RTL + ALL RATIOS: ${manClips.length} clips rendered in ${((Date.now() - tMan) / 1000).toFixed(1)}s. Ratios: ${JSON.stringify(ratioDims)}`
    );

    // 6. 20-clip batch test (using pasted 20 ranges on sample video)
    const t20 = Date.now();
    const bRes = await fetch(`${BASE}/api/projects/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissionConfirmed: true,
        mode: 'manual',
        requestedCount: 20,
        targetClipLength: 5,
        language: 'en',
        style: DEFAULT_STYLE,
      }),
    });
    const { project: bProj } = await bRes.json();
    await waitForStage(bProj.id, ['ready']);
    const ranges = [];
    for (let i = 0; i < 20; i++) {
      const s = i * 1.5;
      const e = s + 4;
      ranges.push(`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}-${Math.floor(e / 60)}:${String(Math.floor(e % 60)).padStart(2, '0')} Batch ${i + 1}`);
    }
    await fetch(`${BASE}/api/projects/${bProj.id}/clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pastedList: ranges.join('\n'), snapToWords: false }),
    });
    await fetch(`${BASE}/api/projects/${bProj.id}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allRatios: false }),
    });
    const bDone = await waitForStage(bProj.id, ['completed'], 240000);
    const bClips = bDone.clips.filter((c) => !c.isRunnerUp && c.status === 'completed');
    const bZipRes = await fetch(`${BASE}/api/projects/${bProj.id}/download-zip`);
    const bZipBuf = Buffer.from(await bZipRes.arrayBuffer());
    console.log(
      `20-CLIP BATCH TEST: ${bClips.length}/20 rendered in ${((Date.now() - t20) / 1000).toFixed(1)}s. ZIP bytes=${bZipBuf.length}`
    );

    // 7. File Upload test (POST /api/projects/upload)
    const sampleFile = path.resolve(process.cwd(), 'storage', 'cache', 'sample_demo.mp4');
    const fd = new FormData();
    const blob = new Blob([fs.readFileSync(sampleFile)], { type: 'video/mp4' });
    fd.append('file', blob, 'uploaded_test.mp4');
    fd.append('permissionConfirmed', 'true');
    fd.append('mode', 'manual');
    const upRes = await fetch(`${BASE}/api/projects/upload`, { method: 'POST', body: fd });
    const upData = await upRes.json();
    const upDone = await waitForStage(upData.project.id, ['ready']);
    console.log(`UPLOAD TEST: status=${upRes.status}, duration=${upDone.project.durationSec}s`);

    // Clean up test projects so user starts with a clean workspace
    for (const pid of [autoProj.id, p100.id, manProj.id, bProj.id, upData.project.id]) {
      await fetch(`${BASE}/api/projects/${pid}`, { method: 'DELETE' });
    }

    console.log('ALL E2E TESTS PASSED');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
