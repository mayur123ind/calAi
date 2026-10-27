// AI providers, models and speech-to-text options. Shared by the settings screen and the server.

export const AI_PROVIDERS = [
  {
    id: "gemini",
    label: "Google Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    // The app's own Gemini key is used when the person hasn't added theirs.
    keyOptional: true,
    models: ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest"],
    defaultModel: "gemini-flash-latest",
    defaultFallback: "gemini-flash-lite-latest",
    freeText: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyOptional: false,
    models: ["gpt-5-mini", "gpt-5", "gpt-5-nano", "gpt-4.1-mini"],
    defaultModel: "gpt-5-mini",
    defaultFallback: "gpt-4.1-mini",
    freeText: true,
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    keyUrl: "https://platform.claude.com/settings/keys",
    keyOptional: false,
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
    defaultModel: "claude-opus-5-5",
    // Claude declines are retried server-side on Anthropic's recommended model, so no client fallback by default.
    defaultFallback: "",
    freeText: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyOptional: false,
    models: ["openai/gpt-5-mini", "google/gemini-2.5-flash", "meta-llama/llama-4-maverick"],
    defaultModel: "openai/gpt-5-mini",
    defaultFallback: "google/gemini-2.5-flash",
    freeText: true,
  },
  {
    id: "groq",
    label: "Groq",
    keyUrl: "https://console.groq.com/keys",
    keyOptional: false,
    models: ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"],
    defaultModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    defaultFallback: "meta-llama/llama-4-maverick-17b-128e-instruct",
    freeText: true,
  },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];

/** Speech-to-text: the browser's own recogniser, or audio sent to one of five services. */
export const SPEECH_PROVIDERS = [
  { id: "browser", label: "On-device (browser)", hint: "Free, no key. Chrome, Edge and Safari.", key: null },
  { id: "gemini", label: "Google Gemini", hint: "Uses your Gemini key, or the app's.", key: "gemini" },
  { id: "openai", label: "OpenAI transcribe", hint: "gpt-4o-mini-transcribe", key: "openai" },
  { id: "groq", label: "Groq Whisper", hint: "whisper-large-v3-turbo, very fast", key: "groq" },
  { id: "deepgram", label: "Deepgram", hint: "Nova-3", key: "deepgram" },
  { id: "elevenlabs", label: "ElevenLabs Scribe", hint: "scribe_v1", key: "elevenlabs" },
] as const;

export type SpeechProviderId = (typeof SPEECH_PROVIDERS)[number]["id"];

/** Every provider whose API key can be stored, chat and speech together. */
export const KEY_PROVIDERS = ["gemini", "openai", "anthropic", "openrouter", "groq", "deepgram", "elevenlabs"] as const;
export type KeyProviderId = (typeof KEY_PROVIDERS)[number];

/** Spoken languages: ISO code, browser locale, and which speech providers recognise it. */
export const SPEECH_LANGUAGES: { code: string; locale: string; label: string; deepgram?: boolean }[] = [
  { code: "en", locale: "en-IN", label: "English (India)", deepgram: true },
  { code: "en", locale: "en-US", label: "English (US)", deepgram: true },
  { code: "hi", locale: "hi-IN", label: "Hindi", deepgram: true },
  { code: "mr", locale: "mr-IN", label: "Marathi" },
  { code: "gu", locale: "gu-IN", label: "Gujarati" },
  { code: "ta", locale: "ta-IN", label: "Tamil", deepgram: true },
  { code: "te", locale: "te-IN", label: "Telugu" },
  { code: "kn", locale: "kn-IN", label: "Kannada" },
  { code: "bn", locale: "bn-IN", label: "Bengali" },
  { code: "ar", locale: "ar-SA", label: "Arabic", deepgram: true },
  { code: "az", locale: "az-AZ", label: "Azerbaijani" },
  { code: "cs", locale: "cs-CZ", label: "Czech", deepgram: true },
  { code: "nl", locale: "nl-NL", label: "Dutch", deepgram: true },
  { code: "fr", locale: "fr-FR", label: "French", deepgram: true },
  { code: "de", locale: "de-DE", label: "German", deepgram: true },
  { code: "it", locale: "it-IT", label: "Italian", deepgram: true },
  { code: "ja", locale: "ja-JP", label: "Japanese", deepgram: true },
  { code: "ko", locale: "ko-KR", label: "Korean", deepgram: true },
  { code: "pl", locale: "pl-PL", label: "Polish", deepgram: true },
  { code: "pt", locale: "pt-BR", label: "Portuguese (Brazil)", deepgram: true },
  { code: "ro", locale: "ro-RO", label: "Romanian", deepgram: true },
  { code: "ru", locale: "ru-RU", label: "Russian", deepgram: true },
  { code: "zh", locale: "zh-CN", label: "Chinese (Simplified)", deepgram: true },
  { code: "es", locale: "es-ES", label: "Spanish", deepgram: true },
  { code: "tr", locale: "tr-TR", label: "Turkish", deepgram: true },
  { code: "uk", locale: "uk-UA", label: "Ukrainian", deepgram: true },
];

export function languagesFor(provider: SpeechProviderId) {
  return provider === "deepgram" ? SPEECH_LANGUAGES.filter((l) => l.deepgram) : SPEECH_LANGUAGES;
}

export type AiSettings = {
  provider: AiProviderId;
  model: string;
  fallbackModel: string;
  /** Added to every AI request: diet, cuisine, how to talk to them. */
  instructions: string;
  speech: { provider: SpeechProviderId; languages: Partial<Record<SpeechProviderId, string>> };
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "gemini",
  model: "",
  fallbackModel: "",
  instructions: "",
  speech: { provider: "browser", languages: {} },
};

export const providerInfo = (id: AiProviderId) => AI_PROVIDERS.find((p) => p.id === id)!;

/** The language locale chosen for a speech provider, defaulting to English (India). */
export const speechLocale = (s: AiSettings, provider: SpeechProviderId = s.speech.provider) =>
  s.speech.languages[provider] ?? "en-IN";
