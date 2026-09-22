import re
import sqlite3
import time
from contextlib import contextmanager

from . import config

STOPWORDS = {
    "the", "and", "for", "what", "when", "who", "where", "why", "how", "was",
    "are", "did", "does", "can", "you", "have", "has", "about", "with", "this",
    "that", "there", "from", "which", "our", "any", "been", "will", "would",
}


@contextmanager
def db():
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS docs(
            id INTEGER PRIMARY KEY,
            source TEXT NOT NULL,          -- 'chat' or 'call'
            chat_id TEXT DEFAULT 'main',
            title TEXT,                    -- call title
            author TEXT,                   -- chat sender
            text TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
            text, content='docs', content_rowid='id', tokenize='porter unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
            INSERT INTO docs_fts(rowid, text) VALUES (new.id, new.text);
        END;
        """)


def _norm(s):
    return re.sub(r"[^0-9a-z]", "", (s or "").lower())


def is_ignored(author):
    n = _norm(author)
    return bool(n) and n in {_norm(a) for a in config.IGNORED_AUTHORS}


def add(source, text, author=None, title=None, chat_id="main", created_at=None):
    if source == "chat" and is_ignored(author):
        return  # never learn from other bots
    with db() as c:
        ...  # rest stays exactly the same
        c.execute(
            "INSERT INTO docs(source, chat_id, title, author, text, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (source, chat_id, title, author, text, created_at or int(time.time())),
        )


def is_trusted(author):
    n = _norm(author)
    return bool(n) and n in {_norm(a) for a in config.TRUSTED_AUTHORS}


def search(question, limit=None, extra_terms=None, source=None):
    terms = re.findall(r"\w+", question.lower()) + list(extra_terms or [])
    terms = [w for w in dict.fromkeys(terms) if len(w) > 2 and w not in STOPWORDS]
    if not terms:
        return []
    query = " OR ".join(f'"{w}"' for w in terms)
    sql = ("SELECT d.* FROM docs_fts f JOIN docs d ON d.id = f.rowid "
           "WHERE docs_fts MATCH ?")
    args = [query]
    if source:
        sql += " AND d.source = ?"
        args.append(source)
    sql += " ORDER BY bm25(docs_fts) LIMIT ?"
    args.append(limit or config.TOP_K)
    with db() as c:
        rows = c.execute(sql, args).fetchall()
    return [dict(r) for r in rows]


def expand(hits, radius=1):
    """Add the messages just before/after each hit, in time order."""
    wanted = set()
    for h in hits:
        wanted.update(range(h["id"] - radius, h["id"] + radius + 1))
    marks = ",".join("?" * len(wanted))
    with db() as c:
        rows = c.execute(
            f"SELECT * FROM docs WHERE id IN ({marks}) ORDER BY created_at, id",
            list(wanted),
        ).fetchall()
    return [dict(r) for r in rows]


def recent_chat(chat_id, since_ts, limit=2000):
    with db() as c:
        rows = c.execute(
            "SELECT * FROM docs WHERE source='chat' AND chat_id=? AND created_at>=? "
            "ORDER BY created_at, id LIMIT ?",
            (chat_id, since_ts, limit),
        ).fetchall()
    return [dict(r) for r in rows]