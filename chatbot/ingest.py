import re
from datetime import datetime

from . import store


def chunk_text(text, size=1200, overlap=150):
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start:start + size])
        start += size - overlap
    return chunks


def add_call(title, transcript, date=None, source="call"):
    """date is 'YYYY-MM-DD'. source is 'call' or 'official'."""
    ts = int(datetime.strptime(date, "%Y-%m-%d").timestamp()) if date else None
    chunks = chunk_text(transcript)
    for c in chunks:
        store.add(source, c, title=title, created_at=ts)
    return len(chunks)


LINE = re.compile(
    r"^\[?(\d{1,2}/\d{1,2}/\d{2,4}),?\s+"
    r"(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s*-?\s*"
    r"([^:]{1,40}): (.*)$"
)


def _clean(raw):
    for bad in ("\u200e", "\u200f"):
        raw = raw.replace(bad, "")
    return raw.replace("\u202f", " ").replace("\u00a0", " ").strip()


def _detect_day_first(lines):
    """Look for a date like 25/12 (day first) or 12/25 (month first)."""
    for line in lines:
        m = LINE.match(line)
        if m:
            a, b = (int(x) for x in m[1].split("/")[:2])
            if a > 12:
                return True
            if b > 12:
                return False
    return False


def _timestamp(date, clock, day_first):
    date_fmts = ["%d/%m/%Y", "%d/%m/%y"] if day_first else ["%m/%d/%Y", "%m/%d/%y"]
    time_fmts = ["%I:%M:%S %p", "%I:%M %p", "%H:%M:%S", "%H:%M"]
    clock = re.sub(r"(\d)\s*([APap][Mm])", r"\1 \2", clock.strip()).upper()
    for d in date_fmts:
        for t in time_fmts:
            try:
                return int(datetime.strptime(f"{date} {clock}", f"{d} {t}").timestamp())
            except ValueError:
                continue
    return None


def import_whatsapp_export(path, chat_id="main"):
    with open(path, encoding="utf-8") as f:
        lines = [_clean(raw) for raw in f]
    day_first = _detect_day_first(lines)

    count, last, last_ts = 0, None, None

    def flush():
        nonlocal count
        if last and "omitted" not in last["text"]:
            store.add(**last)
            count += 1

    for line in lines:
        m = LINE.match(line)
        if m:
            flush()
            ts = _timestamp(m[1], m[2], day_first) or last_ts
            last_ts = ts
            last = dict(source="chat", chat_id=chat_id, author=m[3].strip(),
                        text=m[4], created_at=ts)
        elif last and line:
            last["text"] += "\n" + line  # multi-line message
    flush()
    return count