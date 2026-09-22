# scripts/import_chat.py  ->  python -m scripts.import_chat "WhatsApp Chat.txt"
import sys
from chatbot import store, ingest

store.init_db()
print("Imported", ingest.import_whatsapp_export(sys.argv[1]), "messages")