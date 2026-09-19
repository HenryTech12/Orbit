import os
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-large-v3-turbo")
BOT_NAME = os.getenv("BOT_NAME", "orbit")
DB_PATH = os.getenv("DB_PATH", "orbit.db")
# TOP_K = 15 # how many past snippets to give the model
FALLBACK_REPLY = "Sorry, I'm having trouble right now. Please try again in a moment."
IGNORED_AUTHORS = [a.strip() for a in os.getenv("IGNORED_AUTHORS", "").split(",") if a.strip()]
TRUSTED_AUTHORS = [a.strip() for a in os.getenv("TRUSTED_AUTHORS", "").split(",") if a.strip()]
TOP_K = 8
GROQ_FAST_MODEL = os.getenv("GROQ_FAST_MODEL", "openai/gpt-oss-20b")
GROQ_FALLBACK_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "openai/gpt-oss-20b")