import { searchLocalKnowledge } from "./localRetriever.js";

const question = "What did we plan for September 22?";

const results = await searchLocalKnowledge(question, 5);

console.log("\nLocal retrieval results:\n");

for (const result of results) {
  console.log(`Score: ${result.score}`);
  console.log(`Sender: ${result.message.senderName}`);
  console.log(`Message: ${result.message.text}`);
  console.log("---");
}