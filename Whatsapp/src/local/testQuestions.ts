import { askLocalCopilot } from './localCopilot.js';

const questions = [
  'are you a boy or girl?',
  'tell me about your self',
  'tell me about METI bot',
  'when does the hackathon end?',
  'give me details about the hackaton',
  'what is the prize?',
  'can I deploy my bot myself?',
  'can a team have 3 members from the same country?',
  'what is the budget?',
  'what did I miss?',
  'when is the next wadhwani session?',
  "what's coming this week?",
  'make me summary of everything that happened last week',
  'tell me what is being discussed today',
  'what was the first message?',
  "who's testing tomorrow?",
  'without following evidence, how many bots are being tested?',
  'what is RAG?',
];

for (const q of questions) {
  const r = await askLocalCopilot(q);
  console.log(`\nQ: ${q}\nA: ${r.answer}\nTrust: ${r.status}`);
  console.log(
    `Sources: ${r.citations.map((c) => c.sourceName).join(' | ') || '(none)'}`,
  );
}
