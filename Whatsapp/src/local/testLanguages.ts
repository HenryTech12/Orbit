import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const QUESTIONS = [
  // --- Major World Languages ---
  { lang: 'English', q: 'When is the hackathon deadline?' },
  { lang: 'French', q: 'Quand est la date limite du hackathon ?' },
  { lang: 'Spanish', q: '¿Cuándo es la fecha límite del hackathon?' },
  { lang: 'Portuguese', q: 'Quando é o prazo do hackathon?' },
  { lang: 'German', q: 'Wann ist die Frist für den Hackathon?' },
  { lang: 'Italian', q: "Qual è la scadenza dell'hackathon?" },
  { lang: 'Hindi', q: 'हैकाथॉन की समय सीमा कब है?' },
  { lang: 'Arabic', q: 'متى هو الموعد النهائي للهاكاثون؟' },
  { lang: 'Chinese', q: '黑客马拉松的截止日期是什么时候？' },
  { lang: 'Japanese', q: 'ハッカソンの締め切りはいつですか？' },
  { lang: 'Korean', q: '해커톤 마감일은 언제인가요?' },
  { lang: 'Russian', q: 'Когда крайний срок хакатона?' },

  // --- African Languages (Widely Supported) ---
  { lang: 'Swahili', q: 'Tarehe ya mwisho ya hackathon ni lini?' },
  { lang: 'Amharic', q: 'የሃካቶን ማብቂያ ቀን መቼ ነው?' },
  { lang: 'Hausa', q: 'Yaushe ne ranar ƙarshe ta hackathon?' },
  { lang: 'Yoruba', q: 'Nigbawo ni ọjọ ipari ti hackathon?' },
  { lang: 'Igbo', q: 'Kedu mgbe ngwụcha oge nke hackathon?' },
  { lang: 'Zulu', q: 'Yini usuku lokugcina lwe-hackathon?' },
  { lang: 'Shona', q: 'Ndeupi zuva rekupedzisira rehackathon?' },

  // --- African Languages (Low-Resource) ---
  { lang: 'Nigerian Pidgin', q: 'When be di deadline for di hackathon?' },
  { lang: 'Bambara', q: 'Hackathon ka waati laban ye mun ye?' },
  { lang: 'Fulfulde', q: 'Ko honnde woni nyalnde sakkitiinde hackathon nden?' },
  { lang: 'Wolof', q: 'Kañ lañu wàññi hackathon bi?' },
  { lang: 'Twi', q: 'Bere bɛn na hackathon no bɛ ba?' },
  { lang: 'Oromo', q: 'Guyyaan xumuraa hackathon kami?' },
];

const SYSTEM = `You are a helpful assistant. Answer briefly in the SAME language as the question.`;

const MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

async function testModel(model: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`MODEL: ${model}`);
  console.log('='.repeat(60));

  for (const { lang, q } of QUESTIONS) {
    try {
      const t0 = Date.now();
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: q },
        ],
        temperature: 0.3,
        max_tokens: 120,
      });
      const elapsed = Date.now() - t0;
      const text = completion.choices[0]?.message?.content?.trim() ?? '(empty)';

      console.log(`\n[${lang}] (${elapsed}ms)`);
      console.log(`  Q: ${q}`);
      console.log(`  A: ${text.replace(/\n/g, ' ').slice(0, 160)}`);
    } catch (error) {
      const status = (error as { status?: number })?.status;
      console.log(
        `\n[${lang}] FAILED (${status ?? 'error'}): ${(error as Error).message.slice(0, 100)}`,
      );
    }
  }
}

async function main(): Promise<void> {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY missing from .env');
    process.exit(1);
  }

  console.log('Testing Groq model language support\n');
  console.log('Models:', MODELS.join(', '));
  console.log('Total languages:', QUESTIONS.length);

  for (const model of MODELS) {
    await testModel(model);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done.');
}

main().catch((err) => {
  console.error('Test threw:', err);
  process.exit(1);
});
