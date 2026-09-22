// import "dotenv/config";

// import type {
//   CopilotAskRequest,
//   CopilotAskResponse,
// } from "../types/sentinel.js";

// import { MOCK_ASK_RESPONSE } from "../mock/mockData.js";

// const USE_MOCK = process.env.WHATSAPP_USE_MOCK === "true";

// const API_BASE_URL =
//   process.env.SENTINEL_API_BASE_URL || "http://localhost:8000/api/v1";

// export const copilotApi = {
//   async ask(payload: CopilotAskRequest): Promise<CopilotAskResponse> {
//     if (USE_MOCK) {
//       return MOCK_ASK_RESPONSE;
//     }

//     const controller = new AbortController();

//     const timeout = setTimeout(() => {
//       controller.abort();
//     }, 15_000);

//     try {
//       const response = await fetch(`${API_BASE_URL}/copilot/ask`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(payload),
//         signal: controller.signal,
//       });

//       if (!response.ok) {
//         throw new Error(
//           `Copilot API error: ${response.status} ${response.statusText}`,
//         );
//       }

//       return response.json() as Promise<CopilotAskResponse>;
//     } catch (error) {
//       if (error instanceof DOMException && error.name === "AbortError") {
//         throw new Error("Copilot API request timed out after 15 seconds.");
//       }

//       throw error;
//     } finally {
//       clearTimeout(timeout);
//     }
//   },
// };
import "dotenv/config";

import type {
  CopilotAskRequest,
  CopilotAskResponse,
} from "../types/sentinel.js";

import { searchLocalKnowledge } from "../local/localRetriever.js";
import { askLocalCopilot } from "../local/localCopilot.js";

const USE_MOCK = process.env.WHATSAPP_USE_MOCK === "true";

const API_BASE_URL =
  process.env.SENTINEL_API_BASE_URL || "http://localhost:8000/api/v1";

export const copilotApi = {
  async ask(payload: CopilotAskRequest): Promise<CopilotAskResponse> {
    if (USE_MOCK) {
      return askLocalCopilot(payload.question);
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 15_000);

    try {
      const response = await fetch(`${API_BASE_URL}/copilot/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Copilot API error: ${response.status} ${response.statusText}`,
        );
      }

      return response.json() as Promise<CopilotAskResponse>;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Copilot API request timed out after 15 seconds.");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
};

// async function askLocalKnowledge(
//   payload: CopilotAskRequest,
// ): Promise<CopilotAskResponse> {
//   const results = await searchLocalKnowledge(payload.question, 5);

//   if (results.length === 0) {
//     return {
//       answer:
//         "I could not find enough evidence in the available WhatsApp history to answer this question confidently.",
//       status: "UNKNOWN",
//       citations: [],
//     };
//   }

//   const topScore = results[0].score;

//   const citations = results.map((result) => ({
//     sourceId: result.message.messageId,
//     sourceName: result.message.senderName
//       ? `WhatsApp — ${result.message.senderName}`
//       : "WhatsApp Team Discussion",
//     excerpt: result.message.text,
//   }));

//   return {
//     answer: buildLocalAnswer(results),
//     status: topScore >= 2 ? "CONFIRMED" : "UNKNOWN",
//     citations,
//   };
// }

function buildLocalAnswer(
  results: Awaited<ReturnType<typeof searchLocalKnowledge>>,
): string {
  const topResults = results.slice(0, 3);

  if (topResults.length === 1) {
    return `Based on the WhatsApp history: ${topResults[0].message.text}`;
  }

  return [
    "Based on the available WhatsApp history, the relevant discussion includes:",
    "",
    ...topResults.map(
      (result) =>
        `• ${result.message.senderName ?? "Unknown"}: ${result.message.text}`,
    ),
  ].join("\n");
}
