#!/usr/bin/env python3
"""
bubble_ocr.py — Route B: turn a screen-RECORDING of your own bubble chat into text.

Why this route: pulling messages via the app's private API needs your personal
login token + defeating certificate pinning. This route needs neither — you
screen-record your own already-logged-in chat, and this script reconstructs the
text. Personal backup of your own received messages only.

PIPELINE
  video (.mp4 screen recording)
    -> ffmpeg extracts de-duplicated frames
    -> OCR each frame (Korean + English)
    -> merge overlapping frames from scrolling into one ordered transcript
    -> write transcript.json / transcript.md

DEPENDENCIES
  - ffmpeg on PATH            (brew install ffmpeg  /  apt install ffmpeg)
  - pip install easyocr        (bundles a Korean model; first run downloads it)

USAGE
  # record the chat while slowly scrolling from oldest to newest, then:
  python3 scripts/bubble_ocr.py recording.mp4 --out transcript
  # or process a folder of PNG screenshots instead of a video:
  python3 scripts/bubble_ocr.py ./screenshots/ --out transcript

LIMITATIONS (be honest)
  - Cross-frame de-dup is heuristic (fuzzy line matching); scroll slowly with
    overlap between screens for best results.
  - It reconstructs a readable TEXT transcript, not perfect bubble/sender
    structure. Sender/timestamp splitting is best-effort — see --help.
"""
from __future__ import annotations
import argparse
import difflib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

FPS = 1.5                 # frames/sec to sample from the video
DUP_LINE_RATIO = 0.86     # >= this similarity => treat two OCR lines as the same
MIN_LINE_LEN = 1          # drop empty lines


def extract_frames(video: Path, workdir: Path) -> list[Path]:
    """Sample frames, dropping near-identical ones via ffmpeg's mpdecimate."""
    if not _has_ffmpeg():
        sys.exit("ffmpeg not found on PATH. Install it (brew/apt install ffmpeg).")
    out = workdir / "frame_%05d.png"
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
        "-vf", f"fps={FPS},mpdecimate", "-vsync", "vfr", str(out),
    ]
    subprocess.run(cmd, check=True)
    frames = sorted(workdir.glob("frame_*.png"))
    if not frames:
        sys.exit("No frames extracted — is the video readable?")
    print(f"  extracted {len(frames)} frames", file=sys.stderr)
    return frames


def _has_ffmpeg() -> bool:
    from shutil import which
    return which("ffmpeg") is not None


def ocr_frames(frames: list[Path]) -> list[list[str]]:
    """Return, per frame, the list of text lines top-to-bottom."""
    try:
        import easyocr  # type: ignore
    except ImportError:
        sys.exit("Install the OCR engine:  pip install easyocr")
    reader = easyocr.Reader(["ko", "en"], gpu=False)
    per_frame: list[list[str]] = []
    for i, f in enumerate(frames, 1):
        # detail=1 returns (bbox, text, conf); sort by vertical position (top y).
        results = reader.readtext(str(f), detail=1, paragraph=False)
        results.sort(key=lambda r: min(pt[1] for pt in r[0]))
        lines = [txt.strip() for _, txt, conf in results
                 if conf >= 0.3 and len(txt.strip()) >= MIN_LINE_LEN]
        per_frame.append(lines)
        print(f"  OCR frame {i}/{len(frames)}: {len(lines)} lines", file=sys.stderr)
    return per_frame


def merge_scrolling(per_frame: list[list[str]]) -> list[str]:
    """
    Stitch frames captured while scrolling into one ordered, de-duplicated list.
    Assumes chronological scroll (oldest->newest). Each new frame overlaps the
    previous one; we append only the lines that are not already the tail of the
    running transcript.
    """
    transcript: list[str] = []
    for lines in per_frame:
        if not transcript:
            transcript.extend(lines)
            continue
        # Find the longest overlap between transcript tail and this frame's head.
        best_overlap = 0
        max_check = min(len(lines), 40)
        for k in range(max_check, 0, -1):
            head = lines[:k]
            tail = transcript[-k:]
            if _similar_seq(head, tail):
                best_overlap = k
                break
        transcript.extend(lines[best_overlap:])
    return _collapse_adjacent_dups(transcript)


def _similar_seq(a: list[str], b: list[str]) -> bool:
    if len(a) != len(b) or not a:
        return False
    return all(_similar(x, y) for x, y in zip(a, b))


def _similar(a: str, b: str) -> bool:
    if a == b:
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= DUP_LINE_RATIO


def _collapse_adjacent_dups(lines: list[str]) -> list[str]:
    out: list[str] = []
    for ln in lines:
        if out and _similar(out[-1], ln):
            continue
        out.append(ln)
    return out


def load_images(path: Path, workdir: Path) -> list[Path]:
    if path.is_dir():
        imgs = sorted([p for p in path.iterdir()
                       if p.suffix.lower() in {".png", ".jpg", ".jpeg"}])
        if not imgs:
            sys.exit(f"No images found in {path}")
        print(f"  {len(imgs)} images", file=sys.stderr)
        return imgs
    return extract_frames(path, workdir)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Reconstruct a text transcript from a bubble screen recording / screenshots.")
    ap.add_argument("input", help="path to .mp4 recording OR a folder of screenshots")
    ap.add_argument("--out", default="transcript", help="output basename (.json + .md)")
    args = ap.parse_args()

    src = Path(args.input)
    if not src.exists():
        sys.exit(f"Not found: {src}")

    with tempfile.TemporaryDirectory() as tmp:
        frames = load_images(src, Path(tmp))
        per_frame = ocr_frames(frames)

    transcript = merge_scrolling(per_frame)

    json_path = f"{args.out}.json"
    md_path = f"{args.out}.md"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"lines": transcript}, f, ensure_ascii=False, indent=2)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("# bubble transcript\n\n")
        f.write("\n".join(transcript) + "\n")

    print(f"Done: {len(transcript)} lines -> {json_path}, {md_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
