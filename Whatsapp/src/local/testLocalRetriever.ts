import 'dotenv/config';

process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED REJECTION:', e);
  process.exit(1);
});

async function main() {
  console.log('=== testLocalRetriever starting ===');

  const { retrieveForQuestion } = await import('./localRetriever.js');

  const questions = [
    'which bot is being tested today',
    'how many bots ran yesterday',
    'who is running the bot',
    'what did we plan for September 22',
    'when is the hackathon deadline',
  ];

  for (const q of questions) {
    console.log('\n========================================');
    console.log(`QUESTION: ${q}`);
    console.log('========================================');

    const t0 = Date.now();
    const retrieval = await retrieveForQuestion(q);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

    console.log(`Retrieved ${retrieval.results.length} results in ${elapsed}s`);

    if (retrieval.notes.length) {
      console.log('Notes:', retrieval.notes.join(' | '));
    }

    retrieval.results.slice(0, 3).forEach((r, i) => {
      const sender = r.message.senderName ?? r.message.senderId;
      const preview = r.message.text.slice(0, 150).replace(/\n/g, ' ').trim();
      console.log(`\n[${i + 1}] score=${r.score.toFixed(3)} sender=${sender}`);
      console.log(`    ${preview}...`);
    });
  }

  console.log('\n=== done ===');
}

main().catch((err) => {
  console.error('main() threw:', err);
  process.exit(1);
});
