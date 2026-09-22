# scripts/add_call.py  ->  python -m scripts.add_call call.mp3 "Weekly sync" 2026-09-10
# (a .txt/.vtt transcript from Zoom/Meet/Teams also works, and is free and fastest)
import asyncio, sys
from chatbot import store, ingest
from chatbot.llm import LLM

async def main(path, title, date=None):
    store.init_db()
    if path.endswith((".txt", ".vtt")):
        transcript = open(path, encoding="utf-8").read()
    else:
        transcript = await LLM().transcribe(path)
    print("Stored", ingest.add_call(title, transcript, date), "chunks")

asyncio.run(main(*sys.argv[1:]))