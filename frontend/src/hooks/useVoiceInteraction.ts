import { useState, useRef, useCallback } from 'react';

interface UseVoiceInteractionOptions {
  onTranscriptionComplete?: (transcript: string) => void;
}

export const useVoiceInteraction = ({ onTranscriptionComplete }: UseVoiceInteractionOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 1. Audio Recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access failed:', err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // 2. Transcription Pipeline (Mock / Whisper API bridge)
  const processAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      // If mock mode is active, simulate a realistic question
      const useMock = import.meta.env.VITE_USE_MOCK_API === 'true';
      let text = '';

      if (useMock) {
        await new Promise((res) => setTimeout(res, 1200));
        text = 'What are the core deadlines for Milestone 1 submission?';
      } else {
        const formData = new FormData();
        formData.append('file', blob, 'audio.webm');
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/audio/transcribe`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        text = data.text || '';
      }

      if (text && onTranscriptionComplete) {
        onTranscriptionComplete(text);
      }
    } catch (error) {
      console.error('Transcription error:', error);
    } finally {
      setIsTranscribing(false);
    }
  };

  // 3. Browser-Native Text-to-Speech (Zero dependencies, offline-capable)
  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel(); // Stop ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
    }
  }, []);

  return {
    isRecording,
    isTranscribing,
    isPlayingAudio,
    startRecording,
    stopRecording,
    speakText,
    stopSpeaking,
  };
};