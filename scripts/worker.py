#!/usr/bin/env python3
"""
Clip Maker optional local AI/CV worker (100% free, open-source).
Subcommands:
  capabilities
  transcribe <audio_wav> <model_size> <language>
  face_track <video_path> <start_sec> <end_sec>
  audio_events <audio_wav>
"""

import json
import sys
import os


def check_capabilities():
    caps = {
        "faster_whisper": False,
        "opencv": False,
        "mediapipe": False,
        "yamnet": False,
        "cuda": False,
    }
    try:
        import faster_whisper  # noqa: F401
        caps["faster_whisper"] = True
    except Exception:
        pass
    try:
        import cv2  # noqa: F401
        caps["opencv"] = True
    except Exception:
        pass
    try:
        import mediapipe  # noqa: F401
        caps["mediapipe"] = True
    except Exception:
        pass
    try:
        import tensorflow_hub  # noqa: F401
        caps["yamnet"] = True
    except Exception:
        try:
            import panns_inference  # noqa: F401
            caps["yamnet"] = True
        except Exception:
            pass
    try:
        import torch
        caps["cuda"] = bool(torch.cuda.is_available())
    except Exception:
        pass
    print(json.dumps(caps))


def run_transcribe(audio_path: str, model_size: str, language: str):
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"faster-whisper not installed: {exc}"}))
        return

    device = "cpu"
    compute_type = "int8"
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"
    except Exception:
        pass

    model = WhisperModel(model_size or "small", device=device, compute_type=compute_type)

    lang_arg = None
    initial_prompt = None
    if language and language not in ("auto", "ur-en"):
        lang_arg = language
    elif language == "ur-en":
        lang_arg = None
        initial_prompt = "Urdu and English mixed conversation. اردو اور انگلش گفتگو۔"

    segments_iter, info = model.transcribe(
        audio_path,
        language=lang_arg,
        initial_prompt=initial_prompt,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
    )

    segments = []
    for idx, seg in enumerate(segments_iter):
        words = []
        if seg.words:
            for w_idx, w in enumerate(seg.words):
                text = (w.word or "").strip()
                if not text:
                    continue
                words.append({
                    "id": f"w_{idx}_{w_idx}",
                    "word": text,
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                    "confidence": round(float(getattr(w, "probability", 0.9)), 3),
                })
        seg_text = (seg.text or "").strip()
        if not seg_text and not words:
            continue
        segments.append({
            "id": f"seg_{idx}",
            "start": round(float(seg.start), 3),
            "end": round(float(seg.end), 3),
            "text": seg_text,
            "words": words,
        })

    print(json.dumps({
        "ok": True,
        "language": getattr(info, "language", language or "en"),
        "segments": segments,
    }, ensure_ascii=False))


def run_face_track(video_path: str, start_sec: float, end_sec: float):
    try:
        import cv2
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"opencv not installed: {exc}"}))
        return

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(json.dumps({"ok": False, "error": "Unable to open video"}))
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1920.0
    height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1080.0

    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    face_cascade = cv2.CascadeClassifier(cascade_path)

    samples = []
    t = start_sec
    step = 0.5
    while t <= end_sec:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, frame = cap.read()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=4, minSize=(40, 40))
        if len(faces) > 0:
            # Pick largest face
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            cx = (x + w / 2.0) / width
            cy = (y + h / 2.0) / height
            samples.append({"t": round(t - start_sec, 2), "cx": round(cx, 4), "cy": round(cy, 4)})
        t += step

    cap.release()
    if not samples:
        print(json.dumps({"ok": True, "cx": 0.5, "cy": 0.5, "samples": []}))
        return

    # Exponentially smoothed median/mean center to prevent jitter
    avg_cx = sum(s["cx"] for s in samples) / len(samples)
    avg_cy = sum(s["cy"] for s in samples) / len(samples)
    print(json.dumps({
        "ok": True,
        "cx": round(max(0.15, min(0.85, avg_cx)), 4),
        "cy": round(max(0.15, min(0.85, avg_cy)), 4),
        "samples": samples,
    }))


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command"}))
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "capabilities":
        check_capabilities()
    elif cmd == "transcribe":
        if len(sys.argv) < 3:
            print(json.dumps({"ok": False, "error": "Missing audio path"}))
            sys.exit(1)
        audio_path = sys.argv[2]
        model_size = sys.argv[3] if len(sys.argv) > 3 else "small"
        language = sys.argv[4] if len(sys.argv) > 4 else "auto"
        run_transcribe(audio_path, model_size, language)
    elif cmd == "face_track":
        video_path = sys.argv[2]
        start_sec = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
        end_sec = float(sys.argv[4]) if len(sys.argv) > 4 else 30.0
        run_face_track(video_path, start_sec, end_sec)
    else:
        print(json.dumps({"ok": False, "error": f"Unknown command {cmd}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
