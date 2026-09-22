from fastapi import FastAPI
from pydantic import BaseModel

from chatbot.service import Orbit

app = FastAPI(title="Orbit")
orbit = Orbit()


class Incoming(BaseModel):
    chat_id: str
    author: str
    text: str
    is_dm: bool = False


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/handle")
async def handle(m: Incoming):
    reply = await orbit.handle(m.chat_id, m.author, m.text, m.is_dm)
    return {"reply": reply}  # null means "stay quiet"