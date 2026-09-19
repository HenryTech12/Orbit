import "dotenv/config";

import { GoogleGenAI } from "@google/genai";

import { searchLocalKnowledge } from "./localRetriever.js";
import type { Citation, CopilotAskResponse } from "../types/sentinel.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is required for local Copilot mode.");
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];
export async function askLocalCopilot(
  question: string,
): Promise<CopilotAskResponse> {
  const results = await searchLocalKnowledge(question, 8);


  if (results.length === 0) {
    return {
      answer:
        "I could not find relevant evidence in the available WhatsApp history.",
      status: "UNKNOWN",
      citations: [],
    };
  }

  const context = results
    .slice(0, 3)
    .map(
      (result, index) =>
        `[Source ${index + 1}]
Sender: ${result.message.senderName ?? "Unknown"}
Message:
${result.message.text}`,
    )
    .join("\n\n");

  const prompt = `
You are Sentinel, a grounded team knowledge assistant.

Your task is to answer the user's question from the WhatsApp messages below.

CRITICAL RULES:
1. Use ONLY the provided WhatsApp messages.
2. Read ALL provided messages carefully before answering.
3. If a message explicitly contains information relevant to the question, use that information.
4. Do NOT say information is missing if it is explicitly present in the evidence.
5. Do NOT use outside knowledge.
6. Do NOT invent facts.
7. If the evidence genuinely does not answer the question, say that clearly.
8. Keep the answer concise and useful for WhatsApp.

USER QUESTION:
${question}

WHATSAPP EVIDENCE:

${context}

END OF EVIDENCE.

Now answer the user's question using the evidence above.
`;

  const response = await generateWithFallback(prompt);

  const answer =
    response.text?.trim() ||
    "I could not generate an answer from the available evidence.";

  const citations: Citation[] = results.slice(0, 5).map((result) => ({
    sourceId: result.message.messageId,
    sourceName: result.message.senderName
      ? `WhatsApp — ${result.message.senderName}`
      : "WhatsApp Team Discussion",
    excerpt: result.message.text,
  }));

  return {
    answer,
    status: "CONFIRMED",
    citations,
  };
}
async function generateWithFallback(prompt: string) {
  let lastError: unknown;

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Gemini request: ${model} (attempt ${attempt})`);

        return await ai.models.generateContent({
          model,
          contents: prompt,
        });
      } catch (error) {
        lastError = error;

        const status =
          typeof error === "object" && error !== null && "status" in error
            ? error.status
            : undefined;

        if (status !== 503 && status !== 429) {
          throw error;
        }

        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }
  }

  throw lastError;
}
