# python -m scripts.rebuild_db
import glob
import os
import time

from chatbot import config, ingest, store

if os.path.exists(config.DB_PATH):
    os.remove(config.DB_PATH)
store.init_db()

if os.path.exists("data/chat.txt"):
    print("Chat messages imported:", ingest.import_whatsapp_export("data/chat.txt"))
else:
    print("No data/chat.txt found, skipping chat import.")

for path in sorted(glob.glob("official/*.txt")):
    title = os.path.splitext(os.path.basename(path))[0].replace("_", " ")
    date = time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(path)))
    with open(path, encoding="utf-8") as f:
        n = ingest.add_call(title, f.read(), date, source="official")
    print(f"Official '{title}': {n} chunks")