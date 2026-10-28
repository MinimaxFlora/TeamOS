#!/usr/bin/env python3
"""Transcribe an audio file with faster-whisper (CPU). Prints a JSON result."""
import json
import os
import sys


def fail(message):
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    return 0


def main():
    if len(sys.argv) < 2:
        return fail("缺少音频文件")
    path = sys.argv[1]
    if not os.path.exists(path):
        return fail("音频文件不存在")
    try:
        from faster_whisper import WhisperModel
    except Exception:
        return fail("服务器未安装语音转写组件（faster-whisper）")

    model_name = os.environ.get("STT_MODEL", "base")
    download_root = os.environ.get("STT_MODEL_DIR", "/opt/stt-models")
    threads = int(os.environ.get("STT_THREADS", str(max(1, (os.cpu_count() or 2) - 1))))
    try:
        model = WhisperModel(
            model_name,
            device="cpu",
            compute_type="int8",
            cpu_threads=threads,
            download_root=download_root,
            local_files_only=os.environ.get("STT_LOCAL_ONLY") == "1",
        )
        segments, info = model.transcribe(
            path,
            language=os.environ.get("STT_LANGUAGE") or None,
            vad_filter=True,
            beam_size=1,
            condition_on_previous_text=False,
        )
        pieces = []
        last_end = 0.0
        for segment in segments:
            text = (segment.text or "").strip()
            if text:
                pieces.append(text)
            last_end = float(getattr(segment, "end", last_end) or last_end)
        print(
            json.dumps(
                {
                    "ok": True,
                    "text": "".join(pieces),
                    "durationSec": round(last_end or float(getattr(info, "duration", 0) or 0), 1),
                    "language": getattr(info, "language", "") or "",
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:  # Model download or decoding failure.
        return fail(str(exc))


if __name__ == "__main__":
    sys.exit(main())
