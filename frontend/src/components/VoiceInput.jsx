import { useState, useRef, useEffect } from "react";

// Web Speech API voice input component
// Falls back gracefully if browser doesn't support it

export default function VoiceInput({ onTranscript, disabled, language = "en" }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [pulse, setPulse] = useState(false);
  const recogRef = useRef(null);

  // Map our language codes to BCP-47 codes for Speech Recognition
  const LANG_MAP = {
    en: "en-IN",
    hi: "hi-IN",
    kn: "kn-IN",
    ta: "ta-IN"
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SpeechRecognition);
  }, []);

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = LANG_MAP[language] || "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      setListening(true);
      setPulse(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
    };

    recognition.onerror = (event) => {
      console.error("[VoiceInput] Speech recognition error:", event.error);
      setListening(false);
      setPulse(false);
    };

    recognition.onend = () => {
      setListening(false);
      setPulse(false);
    };

    recogRef.current = recognition;
    recognition.start();
  }

  function stopListening() {
    recogRef.current?.stop();
    setListening(false);
    setPulse(false);
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      className={`voice-btn ${listening ? "voice-btn-active" : ""} ${pulse ? "voice-pulse" : ""}`}
      onClick={listening ? stopListening : startListening}
      disabled={disabled}
      title={listening ? "Stop recording" : "Speak your query"}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
    >
      {listening ? "⏹️" : "🎙️"}
    </button>
  );
}
