import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const API_BASE_URL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";
const appDataDir = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const CONFIG_DIR = process.env.ELEVENLABS_CODEX_CONFIG_DIR || path.join(appDataDir, "Codex", "elevenlabs");
const ENCRYPTED_KEY_PATH = path.join(CONFIG_DIR, "api-key.dpapi");

const MODEL_HINTS = {
  eleven_v3: "Most expressive for creative speech, emotion, and audio tags. Higher latency and more variable than v2/Flash.",
  eleven_multilingual_v2: "Best default for natural long-form multilingual speech and consistency.",
  eleven_flash_v2_5: "Best for fast low-latency generation and agent-style responses.",
  eleven_turbo_v2_5: "Balanced quality and speed for interactive generation.",
};

const DELIVERY_PRESETS = {
  natural: {
    description: "Natural, balanced delivery.",
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: 1 },
  },
  calm: {
    description: "Calm and steady.",
    voice_settings: { stability: 0.75, similarity_boost: 0.82, style: 0.12, use_speaker_boost: true, speed: 0.95 },
  },
  energetic: {
    description: "Energetic and social.",
    voice_settings: { stability: 0.35, similarity_boost: 0.78, style: 0.72, use_speaker_boost: true, speed: 1.04 },
    v3_tag: "[happily]",
  },
  confident: {
    description: "Confident and clear.",
    voice_settings: { stability: 0.48, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true, speed: 1 },
  },
  dramatic: {
    description: "Dramatic and expressive.",
    voice_settings: { stability: 0.28, similarity_boost: 0.78, style: 0.9, use_speaker_boost: true, speed: 0.98 },
  },
  angry: {
    description: "Angry v3 delivery.",
    voice_settings: { stability: 0.3, similarity_boost: 0.75, style: 0.85, use_speaker_boost: true, speed: 1.04 },
    v3_tag: "[angry]",
  },
  sad: {
    description: "Sad v3 delivery.",
    voice_settings: { stability: 0.62, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true, speed: 0.92 },
    v3_tag: "[sad]",
  },
  whisper: {
    description: "Whispered v3 delivery.",
    voice_settings: { stability: 0.45, similarity_boost: 0.78, style: 0.55, use_speaker_boost: false, speed: 0.94 },
    v3_tag: "[whispers]",
  },
  shout: {
    description: "Shouted v3 delivery.",
    voice_settings: { stability: 0.32, similarity_boost: 0.76, style: 0.8, use_speaker_boost: true, speed: 1.03 },
    v3_tag: "[shouts]",
  },
  saudi_conversational: {
    description: "Conversational Arabic/Saudi-style delivery.",
    voice_settings: { stability: 0.45, similarity_boost: 0.82, style: 0.45, use_speaker_boost: true, speed: 0.98 },
    language_code: "ar",
  },
};

const textContent = (payload) => ({
  content: [
    {
      type: "text",
      text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
    },
  ],
});

class ElevenLabsConfigError extends Error {
  constructor() {
    super("ElevenLabs is not connected yet.");
    this.name = "ElevenLabsConfigError";
    this.code = "ELEVENLABS_API_KEY_MISSING";
    this.details = {
      code: this.code,
      reason: "The ElevenLabs plugin is installed, but no ElevenLabs API key is configured for this local user.",
      setup_steps: [
        "Open the ElevenLabs plugin folder.",
        "Run: powershell -ExecutionPolicy Bypass -File .\\scripts\\set-api-key.ps1",
        "Paste the ElevenLabs API key only into the local PowerShell prompt, not into chat.",
        "Try the ElevenLabs request again.",
      ],
      reply_instruction: "Detect the user's language from the chat and write the setup response in that language. Keep it short and do not ask the user to paste the API key into chat.",
    };
  }
}

const failContent = (message, details = {}) => ({
  isError: true,
  content: [
    {
      type: "text",
      text: JSON.stringify({ error: message, ...details }, null, 2),
    },
  ],
});

function decryptKeyWithPowerShell() {
  if (process.platform !== "win32" || !existsSync(ENCRYPTED_KEY_PATH)) {
    return null;
  }

  const command = `
$ErrorActionPreference = 'Stop'
$encrypted = (Get-Content -Raw -LiteralPath $env:ELEVENLABS_KEY_PATH).Trim()
$secure = ConvertTo-SecureString -String $encrypted
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}
`;

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ELEVENLABS_KEY_PATH: ENCRYPTED_KEY_PATH,
      },
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    throw new Error(`Could not decrypt stored ElevenLabs API key: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  const key = result.stdout.trim();
  return key || null;
}

function storeKeyWithPowerShell(apiKey) {
  if (process.platform !== "win32") {
    throw new Error("Local encrypted key storage is only implemented for Windows DPAPI.");
  }

  const command = `
$ErrorActionPreference = 'Stop'
$configDir = Split-Path -Parent $env:ELEVENLABS_KEY_PATH
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
$secure = ConvertTo-SecureString -String $env:ELEVENLABS_NEW_API_KEY -AsPlainText -Force
$secure | ConvertFrom-SecureString | Set-Content -LiteralPath $env:ELEVENLABS_KEY_PATH -Encoding ASCII
`;

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ELEVENLABS_KEY_PATH: ENCRYPTED_KEY_PATH,
        ELEVENLABS_NEW_API_KEY: apiKey,
      },
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    throw new Error(`Could not store new ElevenLabs API key: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

function loadApiKey() {
  if (process.env.ELEVENLABS_API_KEY?.trim()) {
    return {
      key: process.env.ELEVENLABS_API_KEY.trim(),
      source: "ELEVENLABS_API_KEY",
    };
  }

  const storedKey = decryptKeyWithPowerShell();
  if (storedKey) {
    return {
      key: storedKey,
      source: ENCRYPTED_KEY_PATH,
    };
  }

  throw new ElevenLabsConfigError();
}

function normalizeApiPath(apiPath) {
  if (typeof apiPath !== "string" || !apiPath.startsWith("/v1/")) {
    throw new Error("API path must start with /v1/.");
  }
  return apiPath;
}

function buildUrl(apiPath, query = {}) {
  const url = new URL(normalizeApiPath(apiPath), API_BASE_URL);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function elevenFetch(apiPath, options = {}) {
  const { key } = loadApiKey();
  const headers = {
    "xi-api-key": key,
    ...(options.headers || {}),
  };

  const response = await fetch(buildUrl(apiPath, options.query), {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  if (!response.ok) {
    const responseText = await response.text();
    let detail = responseText;
    try {
      detail = JSON.parse(responseText);
    } catch {
      // Keep the raw API response text.
    }

    throw new Error(JSON.stringify({
      status: response.status,
      statusText: response.statusText,
      detail,
    }));
  }

  return response;
}

async function elevenJson(apiPath, options = {}) {
  const response = await elevenFetch(apiPath, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return response.json();
}

function extensionForContentType(contentType, fallbackExtension) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("audio/mpeg") || normalized.includes("audio/mp3")) {
    return ".mp3";
  }
  if (normalized.includes("audio/wav") || normalized.includes("audio/wave")) {
    return ".wav";
  }
  if (normalized.includes("audio/ogg")) {
    return ".ogg";
  }
  if (normalized.includes("video/mp4")) {
    return ".mp4";
  }
  return fallbackExtension;
}

async function saveResponseBody(response, outputPath, defaultExtension) {
  const defaultOutputExtension = extensionForContentType(response.headers.get("content-type"), defaultExtension);
  const resolvedOutputPath = path.resolve(
    outputPath || `elevenlabs-${new Date().toISOString().replace(/[:.]/g, "-")}${defaultOutputExtension}`,
  );

  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(resolvedOutputPath, buffer);

  return {
    output_path: resolvedOutputPath,
    bytes: buffer.byteLength,
    content_type: response.headers.get("content-type") || null,
  };
}

async function appendFile(formData, fieldName, filePath) {
  const resolvedPath = path.resolve(filePath);
  const fileBytes = await fs.readFile(resolvedPath);
  formData.append(fieldName, new Blob([fileBytes]), path.basename(resolvedPath));
}

async function pickVoiceId(explicitVoiceId) {
  if (explicitVoiceId) {
    return explicitVoiceId;
  }

  const voices = await elevenJson("/v1/voices");
  const firstVoice = voices.voices?.[0];
  if (!firstVoice?.voice_id) {
    throw new Error("No ElevenLabs voice_id was provided and no voices were returned by /v1/voices.");
  }
  return firstVoice.voice_id;
}

async function pickModelId(explicitModelId) {
  if (explicitModelId) {
    return explicitModelId;
  }

  try {
    const models = await elevenJson("/v1/models");
    const ttsModels = (Array.isArray(models) ? models : [])
      .filter((model) => model.can_do_text_to_speech);
    const preferred = ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5"];
    return preferred.find((modelId) => ttsModels.some((model) => model.model_id === modelId)) || "eleven_multilingual_v2";
  } catch {
    return "eleven_multilingual_v2";
  }
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function maybeTagTextForV3(text, modelId, deliveryPreset, applyTags = true) {
  const preset = DELIVERY_PRESETS[deliveryPreset];
  if (!applyTags || !preset?.v3_tag || modelId !== "eleven_v3") {
    return text;
  }

  if (/^\s*\[[^\]]+\]/.test(text)) {
    return text;
  }

  return `${preset.v3_tag} ${text}`;
}

function voiceSearchBlob(voice) {
  return normalizeText([
    voice.name,
    voice.category,
    voice.description,
    JSON.stringify(voice.labels || {}),
  ].filter(Boolean).join(" "));
}

function scoreVoice(voice, criteria = {}) {
  const blob = voiceSearchBlob(voice);
  let score = 0;
  const reasons = [];

  for (const [key, weight] of [
    ["search", 4],
    ["language", 3],
    ["accent", 3],
    ["gender", 2],
    ["age", 1],
    ["use_case", 2],
    ["mood", 2],
  ]) {
    const value = normalizeText(criteria[key]);
    if (value && blob.includes(value)) {
      score += weight;
      reasons.push(`${key}: ${criteria[key]}`);
    }
  }

  const text = normalizeText(criteria.text);
  if (text && /[\u0600-\u06ff]/.test(text) && (blob.includes("arabic") || blob.includes("saudi") || blob.includes("middle eastern"))) {
    score += 4;
    reasons.push("Arabic text");
  }

  if (!reasons.length) {
    if (voice.category === "professional" || voice.category === "premade") {
      score += 1;
      reasons.push(voice.category);
    } else {
      reasons.push("available voice");
    }
  }

  return { score, reasons };
}

const tools = [
  {
    name: "elevenlabs_status",
    description: "Verify ElevenLabs authentication and return account/subscription status without revealing the API key.",
    inputSchema: {
      type: "object",
      properties: {
        include_subscription: {
          type: "boolean",
          description: "Include subscription and quota details.",
          default: true,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_list_voices",
    description: "List available ElevenLabs voices for the configured API key.",
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Optional case-insensitive search text for voice names or labels.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_recommend_voices",
    description: "Recommend a short ranked list of ElevenLabs voices for a text, language, accent, mood, or use case so the user can choose before generation.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Optional text that will be synthesized. Arabic text boosts Arabic/Saudi voice matches.",
        },
        search: {
          type: "string",
          description: "Optional free-text search across voice name, description, labels, and category.",
        },
        language: {
          type: "string",
          description: "Preferred language, such as Arabic or English.",
        },
        accent: {
          type: "string",
          description: "Preferred accent, such as Saudi, American, British, or Gulf.",
        },
        gender: {
          type: "string",
          description: "Preferred gender label when available.",
        },
        age: {
          type: "string",
          description: "Preferred age label when available.",
        },
        mood: {
          type: "string",
          description: "Desired mood or delivery style, such as calm, energetic, confident, sad, or angry.",
        },
        use_case: {
          type: "string",
          description: "Desired use case, such as narration, social media, conversational, audiobook, or advertisement.",
        },
        limit: {
          type: "integer",
          description: "Maximum number of recommendations.",
          default: 5,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_list_models",
    description: "List ElevenLabs models available to the account, including Text to Speech capability and practical recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        tts_only: {
          type: "boolean",
          description: "Only return models that can do Text to Speech.",
          default: true,
        },
        language_code: {
          type: "string",
          description: "Optional language code filter such as ar or en.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_list_delivery_presets",
    description: "List built-in delivery presets for Text to Speech, including v3 audio-tag behavior and voice settings.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_text_to_speech",
    description: "Generate a speech audio file with ElevenLabs Text to Speech.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: {
          type: "string",
          description: "Text to synthesize.",
        },
        voice_id: {
          type: "string",
          description: "ElevenLabs voice ID. If omitted, the first available voice is used.",
        },
        model_id: {
          type: "string",
          description: "ElevenLabs model ID. If omitted, the plugin prefers eleven_v3 when the account exposes it, then falls back to multilingual/Flash models.",
        },
        language_code: {
          type: "string",
          description: "Optional ISO 639-1 language code, such as ar or en.",
        },
        delivery_preset: {
          type: "string",
          enum: ["natural", "calm", "energetic", "confident", "dramatic", "angry", "sad", "whisper", "shout", "saudi_conversational"],
          description: "Built-in delivery style. For eleven_v3, compatible presets add audio tags such as [happily], [angry], [whispers], or [shouts].",
          default: "natural",
        },
        apply_v3_audio_tags: {
          type: "boolean",
          description: "Apply v3 audio tags from delivery_preset when model_id is eleven_v3 and the text does not already start with a tag.",
          default: true,
        },
        output_format: {
          type: "string",
          description: "ElevenLabs output format query value.",
          default: "mp3_44100_128",
        },
        output_path: {
          type: "string",
          description: "Absolute or relative path for the generated audio file. Defaults to the current working directory.",
        },
        voice_settings: {
          type: "object",
          description: "Optional ElevenLabs voice settings, such as stability, similarity_boost, style, and use_speaker_boost.",
          additionalProperties: true,
        },
        seed: {
          type: "integer",
          description: "Optional seed for best-effort deterministic generation.",
        },
        previous_text: {
          type: "string",
          description: "Optional previous text for continuity.",
        },
        next_text: {
          type: "string",
          description: "Optional next text for continuity.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_speech_to_text",
    description: "Transcribe a local audio file with ElevenLabs Speech to Text.",
    inputSchema: {
      type: "object",
      required: ["file_path"],
      properties: {
        file_path: {
          type: "string",
          description: "Path to a local audio file.",
        },
        model_id: {
          type: "string",
          description: "Speech to Text model ID.",
          default: "scribe_v2",
        },
        language_code: {
          type: "string",
          description: "Optional ISO language code.",
        },
        diarize: {
          type: "boolean",
          description: "Enable speaker diarization.",
        },
        tag_audio_events: {
          type: "boolean",
          description: "Tag non-speech audio events when supported.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_sound_effect",
    description: "Generate a sound effect or short musical audio element from a text prompt.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: {
          type: "string",
          description: "Sound effect prompt, such as 'cinematic whoosh transition' or 'soft rain ambience'.",
        },
        duration_seconds: {
          type: "number",
          description: "Optional duration in seconds. ElevenLabs supports 0.5 to 30 seconds.",
        },
        loop: {
          type: "boolean",
          description: "Create a smoothly looping sound effect when supported by the model.",
          default: false,
        },
        prompt_influence: {
          type: "number",
          description: "0 to 1. Higher values follow the prompt more strictly.",
        },
        model_id: {
          type: "string",
          description: "Sound generation model ID.",
          default: "eleven_text_to_sound_v2",
        },
        output_format: {
          type: "string",
          description: "ElevenLabs output format query value.",
          default: "mp3_44100_128",
        },
        output_path: {
          type: "string",
          description: "Path for the generated audio file.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_audio_isolation",
    description: "Remove background noise and isolate speech from an audio or video file.",
    inputSchema: {
      type: "object",
      required: ["file_path"],
      properties: {
        file_path: {
          type: "string",
          description: "Path to a local audio or video file.",
        },
        file_format: {
          type: "string",
          enum: ["other", "pcm_s16le_16"],
          description: "Input format. Use other for normal encoded audio/video files.",
          default: "other",
        },
        output_path: {
          type: "string",
          description: "Path for the cleaned audio output.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_voice_changer",
    description: "Transform a local audio file into a target ElevenLabs voice while preserving timing and delivery.",
    inputSchema: {
      type: "object",
      required: ["file_path", "voice_id"],
      properties: {
        file_path: {
          type: "string",
          description: "Path to the source audio file.",
        },
        voice_id: {
          type: "string",
          description: "Target ElevenLabs voice ID.",
        },
        model_id: {
          type: "string",
          description: "Speech-to-speech model ID.",
          default: "eleven_multilingual_sts_v2",
        },
        output_format: {
          type: "string",
          description: "ElevenLabs output format query value.",
          default: "mp3_44100_128",
        },
        remove_background_noise: {
          type: "boolean",
          description: "Remove background noise from the input before voice conversion.",
          default: false,
        },
        file_format: {
          type: "string",
          enum: ["other", "pcm_s16le_16"],
          default: "other",
        },
        voice_settings: {
          type: "object",
          description: "Optional voice settings. Sent as JSON for the Voice Changer API.",
          additionalProperties: true,
        },
        seed: {
          type: "integer",
          description: "Optional best-effort deterministic seed.",
        },
        output_path: {
          type: "string",
          description: "Path for the converted audio output.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_music",
    description: "Compose music from a prompt or composition plan. The ElevenLabs Music API may require a paid plan.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Music prompt. Cannot be used together with composition_plan.",
        },
        composition_plan: {
          type: "object",
          description: "Advanced composition plan. Cannot be used together with prompt.",
          additionalProperties: true,
        },
        music_length_ms: {
          type: "integer",
          description: "Optional length from 3000 to 600000 ms when using prompt.",
        },
        force_instrumental: {
          type: "boolean",
          description: "Guarantee an instrumental track when using prompt.",
          default: false,
        },
        model_id: {
          type: "string",
          description: "Music model ID.",
          default: "music_v1",
        },
        output_format: {
          type: "string",
          description: "ElevenLabs output format query value.",
          default: "mp3_44100_128",
        },
        output_path: {
          type: "string",
          description: "Path for the generated music file.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_create_dub",
    description: "Start an ElevenLabs dubbing job from a local file or source URL.",
    inputSchema: {
      type: "object",
      required: ["target_lang"],
      properties: {
        file_path: {
          type: "string",
          description: "Optional local audio/video file to dub.",
        },
        source_url: {
          type: "string",
          description: "Optional public source URL to dub.",
        },
        target_lang: {
          type: "string",
          description: "Target language code, such as ar or en.",
        },
        source_lang: {
          type: "string",
          description: "Source language code, or auto.",
          default: "auto",
        },
        target_accent: {
          type: "string",
          description: "Optional target accent hint.",
        },
        name: {
          type: "string",
          description: "Optional dubbing project name.",
        },
        num_speakers: {
          type: "integer",
          description: "Number of speakers, or 0 for auto-detect.",
        },
        watermark: {
          type: "boolean",
          default: false,
        },
        drop_background_audio: {
          type: "boolean",
          default: false,
        },
        disable_voice_cloning: {
          type: "boolean",
          default: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_get_dubbed_audio",
    description: "Download the completed dubbed audio/video file for a dubbing job.",
    inputSchema: {
      type: "object",
      required: ["dubbing_id", "language_code"],
      properties: {
        dubbing_id: {
          type: "string",
          description: "Dubbing project ID.",
        },
        language_code: {
          type: "string",
          description: "Dubbed language code.",
        },
        output_path: {
          type: "string",
          description: "Path for the downloaded dub output.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_get_dub_status",
    description: "Get the current status and metadata for an ElevenLabs dubbing job.",
    inputSchema: {
      type: "object",
      required: ["dubbing_id"],
      properties: {
        dubbing_id: {
          type: "string",
          description: "Dubbing project ID.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_audio_native_create",
    description: "Create an Audio Native project and return the embeddable HTML snippet.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
          description: "Audio Native project name.",
        },
        file_path: {
          type: "string",
          description: "Optional local TXT or HTML file containing the article content.",
        },
        title: {
          type: "string",
          description: "Optional title displayed in the player.",
        },
        author: {
          type: "string",
          description: "Optional author displayed in the player.",
        },
        voice_id: {
          type: "string",
          description: "Optional voice ID used to read the content.",
        },
        model_id: {
          type: "string",
          description: "Optional TTS model ID used by the player.",
        },
        text_color: {
          type: "string",
          description: "Optional player text color, such as #000000.",
        },
        background_color: {
          type: "string",
          description: "Optional player background color, such as #FFFFFF.",
        },
        auto_convert: {
          type: "boolean",
          description: "Start converting the project to audio immediately.",
          default: false,
        },
        apply_text_normalization: {
          type: "string",
          enum: ["auto", "on", "off", "apply_english"],
          description: "Optional text normalization mode.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_audio_native_settings",
    description: "Get Audio Native player settings for a project.",
    inputSchema: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: {
          type: "string",
          description: "Audio Native or Studio project ID.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_list_service_accounts",
    description: "List ElevenLabs service accounts visible to the configured key.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_create_service_account_api_key",
    description: "Create a new API key for an ElevenLabs service account and store it locally without printing the secret.",
    inputSchema: {
      type: "object",
      required: ["service_account_user_id", "name"],
      properties: {
        service_account_user_id: {
          type: "string",
          description: "Service account user ID, such as svcacc_...",
        },
        name: {
          type: "string",
          description: "Name for the new API key.",
        },
        permissions: {
          anyOf: [
            {
              type: "string",
              enum: ["all"],
            },
            {
              type: "array",
              items: { type: "string" },
            },
          ],
          description: "Use \"all\" only when full access is explicitly wanted. Otherwise pass a permission list.",
          default: "all",
        },
        character_limit: {
          type: "integer",
          description: "Optional monthly character limit for the new key.",
        },
        allowed_ips: {
          type: "array",
          items: { type: "string" },
          description: "Optional public IP or CIDR allowlist.",
        },
        store_as_active_key: {
          type: "boolean",
          description: "Store the returned key in the local encrypted store and do not print the secret.",
          default: true,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "elevenlabs_api_request",
    description: "Call an advanced ElevenLabs /v1 API endpoint without exposing the configured API key.",
    inputSchema: {
      type: "object",
      required: ["method", "path"],
      properties: {
        method: {
          type: "string",
          enum: ["GET", "POST", "PATCH", "DELETE"],
        },
        path: {
          type: "string",
          description: "ElevenLabs API path. Must start with /v1/.",
        },
        query: {
          type: "object",
          description: "Optional query parameters.",
          additionalProperties: true,
        },
        body: {
          description: "Optional JSON request body.",
        },
        output_path: {
          type: "string",
          description: "Optional path for binary responses.",
        },
      },
      additionalProperties: false,
    },
  },
];

async function callTool(name, args = {}) {
  if (name === "elevenlabs_status") {
    loadApiKey();
    const user = await elevenJson("/v1/user");
    const payload = {
      ok: true,
      key_configured: true,
      user,
    };

    if (args.include_subscription !== false) {
      payload.subscription = await elevenJson("/v1/user/subscription");
    }

    return textContent(payload);
  }

  if (name === "elevenlabs_list_voices") {
    const payload = await elevenJson("/v1/voices");
    const search = args.search?.toLowerCase();
    const voices = (payload.voices || [])
      .filter((voice) => {
        if (!search) {
          return true;
        }
        return [
          voice.name,
          voice.category,
          JSON.stringify(voice.labels || {}),
        ].some((value) => value?.toLowerCase().includes(search));
      })
      .map((voice) => ({
        voice_id: voice.voice_id,
        name: voice.name,
        category: voice.category,
        labels: voice.labels || {},
        description: voice.description || null,
      }));

    return textContent({ voices });
  }

  if (name === "elevenlabs_recommend_voices") {
    const payload = await elevenJson("/v1/voices");
    const limit = Math.max(1, Math.min(Number(args.limit || 5), 20));
    const recommendations = (payload.voices || [])
      .map((voice) => {
        const ranking = scoreVoice(voice, args);
        return { voice, ...ranking };
      })
      .sort((a, b) => b.score - a.score || String(a.voice.name).localeCompare(String(b.voice.name)))
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        voice_id: entry.voice.voice_id,
        name: entry.voice.name,
        category: entry.voice.category,
        labels: entry.voice.labels || {},
        description: entry.voice.description || null,
        score: entry.score,
        why: entry.reasons,
      }));

    return textContent({
      recommendations,
      next_step: "Ask the user to choose a rank or voice_id, then call elevenlabs_text_to_speech with that voice_id and a delivery_preset.",
    });
  }

  if (name === "elevenlabs_list_models") {
    const payload = await elevenJson("/v1/models");
    const languageCode = normalizeText(args.language_code);
    const models = (Array.isArray(payload) ? payload : [])
      .filter((model) => args.tts_only === false || model.can_do_text_to_speech)
      .filter((model) => {
        if (!languageCode) {
          return true;
        }
        return (model.languages || []).some((language) => normalizeText(language.language_id) === languageCode);
      })
      .map((model) => ({
        model_id: model.model_id,
        name: model.name,
        can_do_text_to_speech: model.can_do_text_to_speech,
        can_use_style: model.can_use_style,
        can_use_speaker_boost: model.can_use_speaker_boost,
        requires_alpha_access: model.requires_alpha_access,
        maximum_text_length_per_request: model.maximum_text_length_per_request,
        languages: model.languages || [],
        recommendation: MODEL_HINTS[model.model_id] || model.description || null,
      }));

    return textContent({ models });
  }

  if (name === "elevenlabs_list_delivery_presets") {
    return textContent({
      presets: Object.entries(DELIVERY_PRESETS).map(([id, preset]) => ({
        id,
        description: preset.description,
        voice_settings: preset.voice_settings,
        language_code: preset.language_code || null,
        v3_tag: preset.v3_tag || null,
      })),
    });
  }

  if (name === "elevenlabs_text_to_speech") {
    const voiceId = await pickVoiceId(args.voice_id);
    const modelId = await pickModelId(args.model_id);
    const deliveryPreset = args.delivery_preset || "natural";
    const preset = DELIVERY_PRESETS[deliveryPreset] || DELIVERY_PRESETS.natural;
    const requestText = maybeTagTextForV3(args.text, modelId, deliveryPreset, args.apply_v3_audio_tags !== false);
    const voiceSettings = {
      ...(preset.voice_settings || {}),
      ...(args.voice_settings || {}),
    };
    const languageCode = args.language_code || preset.language_code;
    const body = {
      text: requestText,
      model_id: modelId,
      ...(languageCode ? { language_code: languageCode } : {}),
      ...(Object.keys(voiceSettings).length ? { voice_settings: voiceSettings } : {}),
      ...(args.seed !== undefined ? { seed: args.seed } : {}),
      ...(args.previous_text ? { previous_text: args.previous_text } : {}),
      ...(args.next_text ? { next_text: args.next_text } : {}),
    };

    const response = await elevenFetch(`/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      query: {
        output_format: args.output_format || "mp3_44100_128",
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    const saved = await saveResponseBody(response, args.output_path, ".mp3");
    return textContent({
      ok: true,
      voice_id: voiceId,
      model_id: modelId,
      delivery_preset: deliveryPreset,
      language_code: languageCode || null,
      text: requestText,
      voice_settings: voiceSettings,
      ...saved,
    });
  }

  if (name === "elevenlabs_speech_to_text") {
    const filePath = path.resolve(args.file_path);
    const fileBytes = await fs.readFile(filePath);
    const formData = new FormData();
    formData.append("file", new Blob([fileBytes]), path.basename(filePath));
    formData.append("model_id", args.model_id || "scribe_v2");

    for (const key of ["language_code", "diarize", "tag_audio_events"]) {
      if (args[key] !== undefined && args[key] !== null) {
        formData.append(key, String(args[key]));
      }
    }

    const response = await elevenFetch("/v1/speech-to-text", {
      method: "POST",
      body: formData,
    });

    return textContent(await response.json());
  }

  if (name === "elevenlabs_sound_effect") {
    const body = {
      text: args.text,
      model_id: args.model_id || "eleven_text_to_sound_v2",
      loop: Boolean(args.loop),
      ...(args.duration_seconds !== undefined ? { duration_seconds: args.duration_seconds } : {}),
      ...(args.prompt_influence !== undefined ? { prompt_influence: args.prompt_influence } : {}),
    };

    const response = await elevenFetch("/v1/sound-generation", {
      method: "POST",
      query: {
        output_format: args.output_format || "mp3_44100_128",
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    return textContent({
      ok: true,
      text: args.text,
      model_id: body.model_id,
      ...(await saveResponseBody(response, args.output_path, ".mp3")),
    });
  }

  if (name === "elevenlabs_audio_isolation") {
    const formData = new FormData();
    await appendFile(formData, "audio", args.file_path);
    formData.append("file_format", args.file_format || "other");

    const response = await elevenFetch("/v1/audio-isolation", {
      method: "POST",
      body: formData,
    });

    return textContent({
      ok: true,
      ...(await saveResponseBody(response, args.output_path, ".mp3")),
    });
  }

  if (name === "elevenlabs_voice_changer") {
    const formData = new FormData();
    await appendFile(formData, "audio", args.file_path);
    formData.append("model_id", args.model_id || "eleven_multilingual_sts_v2");
    formData.append("remove_background_noise", String(Boolean(args.remove_background_noise)));
    formData.append("file_format", args.file_format || "other");
    if (args.voice_settings) {
      formData.append("voice_settings", JSON.stringify(args.voice_settings));
    }
    if (args.seed !== undefined) {
      formData.append("seed", String(args.seed));
    }

    const response = await elevenFetch(`/v1/speech-to-speech/${encodeURIComponent(args.voice_id)}`, {
      method: "POST",
      query: {
        output_format: args.output_format || "mp3_44100_128",
      },
      body: formData,
    });

    return textContent({
      ok: true,
      voice_id: args.voice_id,
      model_id: args.model_id || "eleven_multilingual_sts_v2",
      ...(await saveResponseBody(response, args.output_path, ".mp3")),
    });
  }

  if (name === "elevenlabs_music") {
    if (!args.prompt && !args.composition_plan) {
      throw new Error("Provide either prompt or composition_plan.");
    }
    if (args.prompt && args.composition_plan) {
      throw new Error("Use either prompt or composition_plan, not both.");
    }

    const body = {
      model_id: args.model_id || "music_v1",
      ...(args.prompt ? { prompt: args.prompt } : {}),
      ...(args.composition_plan ? { composition_plan: args.composition_plan } : {}),
      ...(args.music_length_ms !== undefined ? { music_length_ms: args.music_length_ms } : {}),
      ...(args.force_instrumental !== undefined ? { force_instrumental: Boolean(args.force_instrumental) } : {}),
    };

    const response = await elevenFetch("/v1/music", {
      method: "POST",
      query: {
        output_format: args.output_format || "mp3_44100_128",
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    return textContent({
      ok: true,
      model_id: body.model_id,
      song_id: response.headers.get("song-id") || null,
      ...(await saveResponseBody(response, args.output_path, ".mp3")),
    });
  }

  if (name === "elevenlabs_create_dub") {
    if (!args.file_path && !args.source_url) {
      throw new Error("Provide file_path or source_url.");
    }

    const formData = new FormData();
    if (args.file_path) {
      await appendFile(formData, "file", args.file_path);
    }

    for (const key of [
      "source_url",
      "target_lang",
      "source_lang",
      "target_accent",
      "name",
      "num_speakers",
      "watermark",
      "drop_background_audio",
      "disable_voice_cloning",
    ]) {
      if (args[key] !== undefined && args[key] !== null && args[key] !== "") {
        formData.append(key, String(args[key]));
      }
    }

    const response = await elevenFetch("/v1/dubbing", {
      method: "POST",
      body: formData,
    });

    return textContent(await response.json());
  }

  if (name === "elevenlabs_get_dubbed_audio") {
    const response = await elevenFetch(
      `/v1/dubbing/${encodeURIComponent(args.dubbing_id)}/audio/${encodeURIComponent(args.language_code)}`,
      { method: "GET" },
    );

    return textContent({
      ok: true,
      dubbing_id: args.dubbing_id,
      language_code: args.language_code,
      ...(await saveResponseBody(response, args.output_path, ".mp3")),
    });
  }

  if (name === "elevenlabs_get_dub_status") {
    return textContent(await elevenJson(`/v1/dubbing/${encodeURIComponent(args.dubbing_id)}`));
  }

  if (name === "elevenlabs_audio_native_create") {
    const formData = new FormData();
    for (const key of [
      "name",
      "title",
      "author",
      "voice_id",
      "model_id",
      "text_color",
      "background_color",
      "auto_convert",
      "apply_text_normalization",
    ]) {
      if (args[key] !== undefined && args[key] !== null && args[key] !== "") {
        formData.append(key, String(args[key]));
      }
    }
    if (args.file_path) {
      await appendFile(formData, "file", args.file_path);
    }

    const response = await elevenFetch("/v1/audio-native", {
      method: "POST",
      body: formData,
    });

    return textContent(await response.json());
  }

  if (name === "elevenlabs_audio_native_settings") {
    return textContent(await elevenJson(`/v1/audio-native/${encodeURIComponent(args.project_id)}/settings`));
  }

  if (name === "elevenlabs_list_service_accounts") {
    return textContent(await elevenJson("/v1/service-accounts"));
  }

  if (name === "elevenlabs_create_service_account_api_key") {
    const body = {
      name: args.name,
      permissions: args.permissions || "all",
    };
    if (args.character_limit !== undefined) {
      body.character_limit = args.character_limit;
    }
    if (args.allowed_ips !== undefined) {
      body.allowed_ips = args.allowed_ips;
    }

    const created = await elevenJson(
      `/v1/service-accounts/${encodeURIComponent(args.service_account_user_id)}/api-keys`,
      {
        method: "POST",
        body,
      },
    );

    const returnedKey = created["xi-api-key"];
    if (args.store_as_active_key !== false && returnedKey) {
      storeKeyWithPowerShell(returnedKey);
    }

    return textContent({
      ok: true,
      key_id: created.key_id,
      stored_as_active_key: args.store_as_active_key !== false && Boolean(returnedKey),
      secret_printed: false,
      note: args.store_as_active_key === false
        ? "The API returned a secret, but this tool intentionally did not print it. Re-run with store_as_active_key=true to keep it."
        : "The returned secret was stored locally and not printed.",
    });
  }

  if (name === "elevenlabs_api_request") {
    const body = args.body === undefined || args.body === null
      ? undefined
      : typeof args.body === "string"
        ? args.body
        : JSON.stringify(args.body);
    const response = await elevenFetch(args.path, {
      method: args.method,
      query: args.query,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body,
    });

    const contentType = response.headers.get("content-type") || "";
    if (args.output_path || contentType.startsWith("audio/") || contentType.includes("octet-stream")) {
      return textContent({
        ok: true,
        ...(await saveResponseBody(response, args.output_path, ".bin")),
      });
    }

    const text = await response.text();
    try {
      return textContent(JSON.parse(text));
    } catch {
      return textContent(text);
    }
  }

  throw new Error(`Unknown ElevenLabs tool: ${name}`);
}

if (process.env.ELEVENLABS_MCP_SELF_TEST === "1") {
  let keyConfigured = false;
  try {
    loadApiKey();
    keyConfigured = true;
  } catch {
    keyConfigured = false;
  }

  console.log(JSON.stringify({
    ok: true,
    tools: tools.map((tool) => tool.name),
    key_configured: keyConfigured,
    presets: Object.keys(DELIVERY_PRESETS),
  }, null, 2));
  process.exit(0);
}

const server = new Server(
  {
    name: "elevenlabs",
    version: "0.1.5",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await callTool(request.params.name, request.params.arguments || {});
  } catch (error) {
    if (error instanceof ElevenLabsConfigError) {
      return failContent(error.message, error.details);
    }
    return failContent(error instanceof Error ? error.message : String(error));
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
