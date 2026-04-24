const SARVAM_API_KEY = process.env.SARVAM_API_KEY || "";
const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";

const LANGUAGE_MAP = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  ta: "ta-IN"
};

async function transcribeWithSarvam(buffer, language = "en", mimeType = "audio/webm") {
  if (!SARVAM_API_KEY) {
    return { used: false, transcript: "", error: "SARVAM_API_KEY not set" };
  }

  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: mimeType }), "voice-input.webm");
  formData.append("model", "saaras:v3");
  formData.append("mode", "transcribe");

  const languageCode = LANGUAGE_MAP[language] || "unknown";
  if (languageCode) {
    formData.append("language_code", languageCode);
  }

  const response = await fetch(SARVAM_STT_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": SARVAM_API_KEY
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      used: false,
      transcript: "",
      error: errorText || `Sarvam STT request failed with status ${response.status}`
    };
  }

  const data = await response.json();
  return {
    used: true,
    transcript: data.transcript || "",
    languageCode: data.language_code || null,
    requestId: data.request_id || null
  };
}

module.exports = { transcribeWithSarvam };