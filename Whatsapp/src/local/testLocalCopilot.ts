import { askLocalCopilot } from "./localCopilot.js";

const questions = [
  "What did we plan for September 22?"
];

for (const question of questions) {
  console.log("\n================================");
  console.log(`QUESTION: ${question}`);
  console.log("================================\n");

  const response = await askLocalCopilot(question);

  console.log("ANSWER:");
  console.log(response.answer);

  console.log("\nTRUST:");
  console.log(response.status);

  console.log("\nSOURCES:");

  for (const citation of response.citations) {
    console.log(`- ${citation.sourceName}`);
    console.log(`  ${citation.excerpt}`);
  }
}
