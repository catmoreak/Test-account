import { useEffect, useRef, useState } from "react";
import { transcribeVoiceMessage } from "../api/client";

export default function VoiceInput({ onTranscript, onError, disabled, language = "en" }) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pulse, setPulse] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    const isSupported =
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== "undefined";

    setSupported(isSupported);

    return () => {
      streamRef.current?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.warn("[VoiceInput] Recording error:", event.error || event.name || "unknown");
        onError?.("Voice recording failed. Please try again or type your message.");
        setRecording(false);
        setUploading(false);
        setPulse(false);
        stopStream();
      };

      recorder.onstop = async () => {
        try {
          setUploading(true);
          const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const result = await transcribeVoiceMessage(audioBlob, language);
          if (result?.transcript) {
            onTranscript(result.transcript);
          } else {
            onError?.("No speech was detected. Please try again.");
          }
        } catch (error) {
          console.warn("[VoiceInput] Transcription failed:", error);
          onError?.("Voice input is unavailable right now. Please type your message instead.");
        } finally {
          setRecording(false);
          setUploading(false);
          setPulse(false);
          stopStream();
        }
      };

      recorder.start();
      setRecording(true);
      setPulse(true);
      onError?.("");
    } catch (error) {
      console.warn("[VoiceInput] Could not start recording:", error);
      onError?.("Microphone access is blocked. Allow mic permission and try again.");
      setRecording(false);
      setUploading(false);
      setPulse(false);
      stopStream();
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  if (!supported) return null;

  const isBusy = disabled || uploading;

  return (
    <button
      type="button"
      className={`voice-btn ${recording ? "voice-btn-active" : ""} ${pulse ? "voice-pulse" : ""}`}
      onClick={recording ? stopRecording : startRecording}
      disabled={isBusy}
      title={recording ? "Stop recording" : "Speak your query"}
      aria-label={recording ? "Stop voice input" : "Start voice input"}
    >
      {uploading ? "⏳" : recording ? "⏹️" : "🎙️"}
    </button>
  );
}
