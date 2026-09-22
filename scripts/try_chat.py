# scripts/try_chat.py  ->  python -m scripts.try_chat
import asyncio
from chatbot.service import Orbit

async def main():
    orbit = Orbit()
    print("Type 'Name: message'. Try /ask ..., /summary 24. Ctrl+C to quit.")
    while True:
        author, _, text = input("> ").partition(":")
        reply = await orbit.handle("demo-group", author.strip(), text.strip())
        if reply:
            print("Orbit:", reply)

asyncio.run(main())