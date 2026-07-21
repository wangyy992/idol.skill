#!/usr/bin/env python3
"""
bubble_pull.py — Route D: pull one's OWN Dear U bubble message history to JSON.

SCOPE / RED LINES (do not remove):
  - Personal use only: your own account, your own received messages, for personal backup.
  - No public redistribution of idol message content.
  - No scraping of other users' accounts, no bypassing paywalls, no scale scraping.
  - This hits a private app API and may touch DearU's ToS — you accept that risk.

STATUS: SKELETON. It will not run end-to-end until you fill the four CONFIG values
below from a packet capture (see docs appendix C). The TODOs mark exactly what the
capture must reveal. Send the captured request/response back and this gets finished.

Usage (after filling CONFIG):
  python3 scripts/bubble_pull.py --out messages.json
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from typing import Any

try:
    import requests  # pip install requests
except ImportError:
    sys.exit("Install deps first:  pip install requests")


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — fill these from your mitmproxy/Proxyman capture (docs appendix C).
# ─────────────────────────────────────────────────────────────────────────────

# TODO(capture #1): base host + message-list path, exactly as seen in the capture.
BASE_URL = "https://ba-api.dear-u.co"          # verify the real host
MESSAGES_PATH = "/TODO/messages"               # e.g. /v1/artists/{id}/messages

# TODO(capture #2): auth. Copy the header(s) the app actually sends.
#   Most likely a bearer token; could be a cookie or a custom header instead.
AUTH_HEADERS = {
    # "Authorization": "Bearer <YOUR_TOKEN_FROM_CAPTURE>",
    # "X-Some-Header": "...",
}

# TODO(capture #3): pagination. Set the style the API actually uses and the param names.
PAGINATION = {
    "style": "cursor",        # one of: "cursor" | "page" | "before_id" | "timestamp"
    "param": "cursor",        # query-param name the API expects for the next page
    "size_param": "limit",    # query-param name for page size (or None)
    "size": 50,               # page size to request
}

# TODO(capture #4): where the message array and the "next page" token live in the JSON.
#   Given one sample response, set these dotted paths / keys.
RESPONSE_MAP = {
    "items_path": "data.items",   # dotted path to the list of messages in the response
    "next_path": "data.next",     # dotted path to the next cursor/token (None if absent)
    # field names inside one message object:
    "msg_id": "id",
    "msg_text": "content",
    "msg_time": "createdAt",
    "msg_sender": "senderType",   # e.g. artist vs. me
}

REQUEST_TIMEOUT = 20
SLEEP_BETWEEN_PAGES = 0.6   # be gentle; this is your own data, not a stress test


# ─────────────────────────────────────────────────────────────────────────────
# Generic plumbing — should not need changes once CONFIG is correct.
# ─────────────────────────────────────────────────────────────────────────────

def _dig(obj: Any, dotted: str | None) -> Any:
    """Walk a dotted path like 'data.items' through nested dicts; None-safe."""
    if not dotted:
        return None
    cur = obj
    for key in dotted.split("."):
        if isinstance(cur, dict) and key in cur:
            cur = cur[key]
        else:
            return None
    return cur


def _build_params(next_token: Any) -> dict:
    params: dict[str, Any] = {}
    if PAGINATION.get("size_param"):
        params[PAGINATION["size_param"]] = PAGINATION["size"]
    if next_token is not None:
        params[PAGINATION["param"]] = next_token
    return params


def fetch_all() -> list[dict]:
    if "TODO" in MESSAGES_PATH or not AUTH_HEADERS:
        sys.exit(
            "CONFIG not filled yet. Complete the capture (docs appendix C) and set\n"
            "BASE_URL / MESSAGES_PATH / AUTH_HEADERS / PAGINATION / RESPONSE_MAP."
        )

    session = requests.Session()
    session.headers.update(AUTH_HEADERS)
    url = BASE_URL.rstrip("/") + MESSAGES_PATH

    all_msgs: list[dict] = []
    next_token: Any = None
    page = 0
    while True:
        page += 1
        resp = session.get(url, params=_build_params(next_token), timeout=REQUEST_TIMEOUT)
        if resp.status_code == 401:
            sys.exit("401 Unauthorized — token expired? Re-capture a fresh AUTH header.")
        resp.raise_for_status()
        body = resp.json()

        items = _dig(body, RESPONSE_MAP["items_path"]) or []
        for m in items:
            all_msgs.append({
                "id": _dig(m, RESPONSE_MAP["msg_id"]),
                "text": _dig(m, RESPONSE_MAP["msg_text"]),
                "time": _dig(m, RESPONSE_MAP["msg_time"]),
                "sender": _dig(m, RESPONSE_MAP["msg_sender"]),
            })
        print(f"  page {page}: +{len(items)} (total {len(all_msgs)})", file=sys.stderr)

        next_token = _dig(body, RESPONSE_MAP["next_path"])
        if not items or next_token is None:
            break
        time.sleep(SLEEP_BETWEEN_PAGES)

    return all_msgs


def main() -> None:
    ap = argparse.ArgumentParser(description="Pull your own bubble message history to JSON.")
    ap.add_argument("--out", default="messages.json", help="output JSON path")
    args = ap.parse_args()

    msgs = fetch_all()
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(msgs, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(msgs)} messages -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
