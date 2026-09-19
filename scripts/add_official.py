# python -m scripts.add_official official_facts.txt "Official hackathon info" 2026-09-16
import sys
from chatbot import store, ingest

store.init_db()
path, title = sys.argv[1], sys.argv[2]
date = sys.argv[3] if len(sys.argv) > 3 else None
text = open(path, encoding="utf-8").read()
print("Stored", ingest.add_call(title, text, date, source="official"), "chunks")