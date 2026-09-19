import 'dotenv/config';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from 'baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

const ORBIT_URL = process.env.ORBIT_URL || 'http://127.0.0.1:8000/handle';
const ALLOWED = (process.env.ALLOWED_GROUPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  let pairingRequested = false;

  sock.ev.on(
    'connection.update',
    async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        if (process.env.PAIRING_NUMBER && !sock.authState.creds.registered) {
          if (!pairingRequested) {
            pairingRequested = true;
            const code = await sock.requestPairingCode(
              process.env.PAIRING_NUMBER,
            );
            console.log('PAIRING CODE:', code);
            console.log(
              'On the phone: WhatsApp > Linked devices > Link a device > Link with phone number instead',
            );
          }
        } else {
          console.log(
            'Scan this QR (it refreshes every ~20 seconds, scan the newest one):',
          );
          qrcode.generate(qr, { small: true });
        }
      }
      if (connection === 'open') {
        console.log('Connected to WhatsApp.');
        const groups = await sock.groupFetchAllParticipating();
        console.log('Groups (copy the ID you want into ALLOWED_GROUPS):');
        for (const g of Object.values(groups))
          console.log(`  ${g.subject}  ->  ${g.id}`);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log(
          'Closed. Status code:',
          code,
          '-',
          lastDisconnect?.error?.message,
        );
        pairingRequested = false;
        if (code === DisconnectReason.loggedOut) {
          console.log("Logged out. Delete the 'auth' folder and run again.");
        } else {
          setTimeout(start, 3000); // wait 3s so it doesn't spam reconnects
        }
      }
    },
  );

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue;
        const jid = m.key.remoteJid;
        if (!jid || jid === 'status@broadcast') continue;

        const isGroup = jid.endsWith('@g.us');
        // Only work in approved groups (DMs are always allowed)
        if (isGroup && !ALLOWED.includes(jid)) continue;

        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          m.message.imageMessage?.caption ||
          '';
        if (!text.trim()) continue;

        const sender = (m.key.participant || jid).split('@')[0];
        const author = m.pushName || sender;

        const res = await fetch(ORBIT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: isGroup ? 'main' : jid, // "main" = same id as the imported chat
            author,
            text,
            is_dm: !isGroup,
          }),
        });
        const { reply } = await res.json();
        if (!reply) continue;

        await sock.sendPresenceUpdate('composing', jid);
        await sleep(1000 + Math.random() * 2000); // human-like pause
        await sock.sendMessage(jid, { text: reply }, { quoted: m });
        await sock.sendPresenceUpdate('paused', jid);
      } catch (err) {
        console.error('Error handling message:', err.message);
      }
    }
  });
}

start();
