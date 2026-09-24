import 'dotenv/config';

process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED REJECTION:', e);
  process.exit(1);
});

process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT EXCEPTION:', e);
  process.exit(1);
});

async function main() {
  console.log('=== testEmbedder starting ===');

  const { embed, isOllamaReady, cosineSim } = await import('./embedder.js');

  console.log('Checking Ollama...');
  const ready = await isOllamaReady();
  console.log('Ollama ready:', ready);

  if (!ready) {
    console.error('Ollama is NOT ready. Check:');
    console.error('  1. Is Ollama running? Open a PowerShell: ollama serve');
    console.error('  2. Is the model pulled? ollama list');
    console.error(
      '  3. Can you reach the API? curl.exe -s http://localhost:11434/api/tags',
    );
    process.exit(1);
  }

  console.log('Embedding test string A...');
  const a = await embed('which bot is being tested today');
  console.log('Got A. Dims:', a.length);

  console.log('Embedding test string B...');
  const b = await embed('what bot is running right now');
  console.log('Got B. Dims:', b.length);

  console.log('Embedding test string C...');
  const c = await embed('the hackathon deadline is Thursday');
  console.log('Got C. Dims:', c.length);

  console.log('---');
  console.log('Similar (should be HIGH):  ', cosineSim(a, b).toFixed(3));
  console.log('Unrelated (should be LOW): ', cosineSim(a, c).toFixed(3));
  console.log('=== testEmbedder done ===');
}

main().catch((e) => {
  console.error('main() threw:', e);
  process.exit(1);
});
