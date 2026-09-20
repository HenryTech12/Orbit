import React from 'react';
import { Mic, MicOff, Loader2, VolumeX } from 'lucide-react';

interface VoiceInputButtonProps {
  isRecording: boolean;
  isTranscribing: boolean;
  isPlayingAudio: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancelSpeech: () => void;
  disabled?: boolean;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  isRecording,
  isTranscribing,
  isPlayingAudio,
  onStart,
  onStop,
  onCancelSpeech,
  disabled,
}) => {
  if (isPlayingAudio) {
    return (
      <button
        type="button"
        onClick={onCancelSpeech}
        className="p-2 rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors"
        title="Stop speaking"
      >
        <VolumeX className="w-4 h-4" />
      </button>
    );
  }

  if (isTranscribing) {
    return (
      <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-400 animate-pulse">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onMouseDown={onStart}
      onMouseUp={onStop}
      onTouchStart={onStart}
      onTouchEnd={onStop}
      disabled={disabled}
      title={isRecording ? 'Release to transcribe' : 'Press & hold to speak'}
      className={`p-2 rounded-lg transition-all ${
        isRecording
          ? 'bg-rose-600 text-white animate-pulse scale-110 shadow-md shadow-rose-500/30'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
      } disabled:opacity-50`}
    >
      {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
};