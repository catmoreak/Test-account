// Sarvam AI translation service
// API: https://api.sarvam.ai/translate
// Used to translate AI responses into Hindi/Kannada/Tamil

const SARVAM_API_KEY = process.env.SARVAM_API_KEY || "";
const SARVAM_API_URL = "https://api.sarvam.ai/translate";

// Sarvam language codes
const LANG_MAP = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  ta: "ta-IN"
};

async function translateWithSarvam(text, targetLanguage, sourceLanguage = "en") {
  if (!SARVAM_API_KEY) {
    console.warn("[Sarvam] SARVAM_API_KEY not set — skipping translation");
    return { translated: text, used: false };
  }

  // If source and target are same, skip
  if (sourceLanguage === targetLanguage || targetLanguage === "en") {
    return { translated: text, used: false };
  }

  const sourceLangCode = LANG_MAP[sourceLanguage] || "en-IN";
  const targetLangCode = LANG_MAP[targetLanguage] || "hi-IN";

  try {
    const response = await fetch(SARVAM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": SARVAM_API_KEY
      },
      body: JSON.stringify({
        input: text,
        source_language_code: sourceLangCode,
        target_language_code: targetLangCode,
        speaker_gender: "Female",
        mode: "formal",
        model: "mayura:v1",
        enable_preprocessing: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Sarvam] Translation API error:", errText);
      return { translated: text, used: false, error: errText };
    }

    const data = await response.json();
    const translated = data.translated_text || text;

    return { translated, used: true, model: "mayura:v1" };
  } catch (err) {
    console.error("[Sarvam] Translation failed:", err.message);
    return { translated: text, used: false, error: err.message };
  }
}

module.exports = { translateWithSarvam };
