const SARVAM_TTS_API_KEY =
  process.env.SARVAM_TTS_API_KEY ||
  process.env.SARM_TTS_API ||
  process.env.SARVAM_API_KEY ||
  "";

const SARVAM_TTS_URL = process.env.SARVAM_TTS_URL || "https://api.sarvam.ai/text-to-speech";

const LANGUAGE_MAP = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  ta: "ta-IN"
};

const DEFAULT_SPEAKER_BY_MODEL = {
  "bulbul:v2": "anushka",
  "bulbul:v3": "anushka",
  "bulbul:v3-beta": "priya"
};

function normalizeAudioFromJson(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (typeof data.audio === "string") return data.audio;
  if (typeof data.audio_base64 === "string") return data.audio_base64;
  if (typeof data.audioContent === "string") return data.audioContent;

  if (Array.isArray(data.audios) && data.audios.length > 0) {
    const first = data.audios[0];
    if (typeof first === "string") return first;
    if (first && typeof first.audio === "string") return first.audio;
    if (first && typeof first.audio_base64 === "string") return first.audio_base64;
  }

  return null;
}

async function synthesizeWithSarvam(text, language = "en") {
  const cleanedText = (text || "").trim();

  if (!cleanedText) {
    return { used: false, error: "text is required" };
  }

  if (!SARVAM_TTS_API_KEY) {
    return {
      used: false,
      error: "SARVAM_TTS_API_KEY (or SARM_TTS_API) not set"
    };
  }

  const languageCode = LANGUAGE_MAP[language] || "en-IN";
  const configuredModel = process.env.SARVAM_TTS_MODEL || "bulbul:v3";
  const configuredSpeaker = (process.env.SARVAM_TTS_SPEAKER || "").trim();
  const modelCandidates = configuredModel === "bulbul:v3-beta"
    ? ["bulbul:v3-beta", "bulbul:v3"]
    : [configuredModel, "bulbul:v3", "bulbul:v3-beta"];

  let response = null;
  let lastErrorText = "";
  let hasTriedAnyCandidate = false;

  outer:
  for (const model of modelCandidates) {
    const modelDefaultSpeaker = DEFAULT_SPEAKER_BY_MODEL[model] || "anushka";
    const speakersToTry = configuredSpeaker
      ? [configuredSpeaker, modelDefaultSpeaker]
      : [modelDefaultSpeaker];

    for (const speaker of speakersToTry) {
      hasTriedAnyCandidate = true;
      response = await fetch(SARVAM_TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": SARVAM_TTS_API_KEY
        },
        body: JSON.stringify({
          inputs: [cleanedText],
          target_language_code: languageCode,
          speaker,
          model,
          speech_sample_rate: Number(process.env.SARVAM_TTS_SAMPLE_RATE || 22050),
          enable_preprocessing: true
        })
      });

      if (response.ok) {
        break outer;
      }

      lastErrorText = await response.text();
      const lowerError = lastErrorText.toLowerCase();
      const isModelError = lowerError.includes("model");
      const isSpeakerError = lowerError.includes("speaker") && lowerError.includes("compatible");

      if (isSpeakerError) {
        // Try another speaker for the same model before switching model.
        continue;
      }

      if (isModelError) {
        // Switch to next model candidate.
        break;
      }

      return {
        used: false,
        error: lastErrorText || `Sarvam TTS request failed with status ${response.status}`
      };
    }
  }

  if (!hasTriedAnyCandidate || !response || !response.ok) {
    return {
      used: false,
      error: lastErrorText || `Sarvam TTS request failed${response ? ` with status ${response.status}` : ""}`
    };
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("audio/")) {
    const arrayBuffer = await response.arrayBuffer();
    return {
      used: true,
      mimeType: contentType.split(";")[0],
      audioBase64: Buffer.from(arrayBuffer).toString("base64")
    };
  }

  const data = await response.json();
  const audioBase64 = normalizeAudioFromJson(data);

  if (!audioBase64) {
    return {
      used: false,
      error: "Sarvam TTS response did not include audio"
    };
  }

  return {
    used: true,
    audioBase64,
    mimeType: data.mime_type || data.mimeType || "audio/wav",
    requestId: data.request_id || data.requestId || null
  };
}

module.exports = { synthesizeWithSarvam };