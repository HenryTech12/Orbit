import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { sentinelApi } from "@/services/api";
import type { CopilotAskResponse } from "@/types/sentinel";
import { ChatMessage, type ChatMessageItem } from "./ChatMessage";
import { EvidenceDrawer } from "../citations/EvidenceDrawer";
import { Send, Loader2, Sparkles } from "lucide-react";
import { useVoiceInteraction } from "@/hooks/useVoiceInteraction";
import { VoiceInputButton } from "@/components/chat/VoiceInputButton";

const INITIAL_MESSAGE: ChatMessageItem = {
  id: "initial",
  sender: "assistant",
  response: {
    answer: "Hello! I am Sentinel, your UniPods Knowledge Copilot. Ask me about announcements, deadlines, meetings, or decisions across our channels.",
    status: "CONFIRMED",
    citations: [],
  },
  timestamp: new Date().toISOString(),
};

export const ChatWindow: React.FC = () => {
  const [input, setInput] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([INITIAL_MESSAGE]);

  // Fetch persisted history from backend
  const { data: history, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["sentinelChatHistory", "default-session"],
    queryFn: () => sentinelApi.getHistory("default-session"),
  });

  useEffect(() => {
    if (history && history.length > 0) {
      setMessages(history);
    }
  }, [history]);

  const handleSendText = (textToSend: string, shouldSpeakResponse = false) => {
    const trimmed = textToSend.trim();
    if (!trimmed || askMutation.isPending) return;

    const userMessage: ChatMessageItem = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    askMutation.mutate({ question: trimmed, shouldSpeak: shouldSpeakResponse });
  };

  const {
    isRecording,
    isTranscribing,
    isPlayingAudio,
    startRecording,
    stopRecording,
    speakText,
    stopSpeaking,
  } = useVoiceInteraction({
    onTranscriptionComplete: (transcript) => {
      if (transcript.trim()) {
        handleSendText(transcript, true);
      }
    },
  });

  const askMutation = useMutation({
    mutationFn: ({ question }: { question: string; shouldSpeak: boolean }) =>
      sentinelApi.ask({ question, sessionId: "default-session" }),
    onSuccess: (data: CopilotAskResponse, variables) => {
      const assistantMessage: ChatMessageItem = {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        response: data,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (variables.shouldSpeak && data.answer) {
        speakText(data.answer);
      }
    },
    onError: () => {
      const errorMessage: ChatMessageItem = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        response: {
          answer:
            "Unable to reach the Sentinel knowledge engine. Please check your connection or try again.",
          status: "UNKNOWN",
          citations: [],
        },
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || askMutation.isPending) return;
    handleSendText(input, false);
    setInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      {/* Chat Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {isHistoryLoading && messages.length <= 1 ? (
          <div className="flex items-center justify-center h-32 text-zinc-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading conversation history...
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              onSelectCitation={(sourceId) => setSelectedSourceId(sourceId)}
            />
          ))
        )}

        {askMutation.isPending && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs pl-2 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>
              Consulting UniPods knowledge base & verifying sources...
            </span>
          </div>
        )}
      </div>

      {/* Input Form Bar */}
      <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Sentinel (e.g., 'When is the project submission due?')"
              className="w-full px-4 py-2.5 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Sparkles className="absolute right-3 top-3 w-4 h-4 text-zinc-400 pointer-events-none" />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || askMutation.isPending}
            className="p-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>

          <VoiceInputButton
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            isPlayingAudio={isPlayingAudio}
            onStart={startRecording}
            onStop={stopRecording}
            onCancelSpeech={stopSpeaking}
            disabled={askMutation.isPending}
          />
        </form>
      </div>

      {/* Slide-over Evidence Drawer */}
      <EvidenceDrawer
        sourceId={selectedSourceId}
        onClose={() => setSelectedSourceId(null)}
      />
    </div>
  );
};