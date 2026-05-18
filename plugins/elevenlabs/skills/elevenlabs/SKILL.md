---
name: elevenlabs
description: Use when the user asks Codex to work with ElevenLabs, generate speech/audio, inspect quota or voices, transcribe audio, or manage ElevenLabs API keys through this local plugin.
---

# ElevenLabs

Use the `elevenlabs` MCP tools when available.

## Authentication

- Do not ask the user to paste an ElevenLabs API key into chat by default.
- Say that the ElevenLabs plugin is configured and usable; do not say that you can see, inspect, or access the user's API key.
- Do not narrate key-loading internals, storage paths, DPAPI, encryption, or implementation details unless the user specifically asks about setup or security.
- If the MCP tools report that no key is configured, tell the user to run `scripts/set-api-key.ps1` from this plugin folder.
- When the configured-key error includes setup instructions, infer the user's language from the conversation and write the setup response in that language. Explain that the plugin is installed but ElevenLabs is not connected yet, then give the short PowerShell setup command.
- `ELEVENLABS_API_KEY` in the environment is also supported.
- Never print or repeat an API key in responses.

## API key creation boundary

- Normal user API keys are created in the ElevenLabs dashboard.
- Service-account API keys can be created through the ElevenLabs service-account API only when the user already has a stored key with the required workspace/admin permissions and a valid `service_account_user_id`.
- Prefer least-privilege permissions. Use `permissions: "all"` only if the user explicitly asks for full access.

## Common workflows

- Use `elevenlabs_status` to verify authentication and quota.
- Use `elevenlabs_list_voices` before generating speech unless the user supplies a voice ID.
- Use `elevenlabs_recommend_voices` when the user asks for a style, accent, language, or does not specify a voice. Show 3-5 good options and ask the user to choose before generating when the request is not urgent.
- Use `elevenlabs_list_delivery_presets` when the user asks for a delivery style such as calm, energetic, angry, sad, whisper, shout, or Saudi conversational.
- Use `elevenlabs_list_models` when the user asks for the latest/best model or mentions v3. Prefer `eleven_v3` for expressive non-realtime speech when available; prefer Flash/Turbo for low latency; prefer Multilingual v2 for stable long-form multilingual narration.
- Use `elevenlabs_text_to_speech` to generate audio files.
- Use `elevenlabs_speech_to_text` to transcribe local audio.
- Use `elevenlabs_sound_effect` for sound effects, ambience, impacts, transitions, and short musical audio elements.
- Use `elevenlabs_audio_isolation` to clean speech or remove background noise from a local audio/video file.
- Use `elevenlabs_voice_changer` to convert a local recording into a target ElevenLabs voice.
- Use `elevenlabs_music` for music generation. Mention that account plan/permissions may affect availability.
- Use `elevenlabs_create_dub`, `elevenlabs_get_dub_status`, and `elevenlabs_get_dubbed_audio` for dubbing audio/video into another language.
- Use `elevenlabs_audio_native_create` and `elevenlabs_audio_native_settings` for Audio Native embed projects.
- Use `elevenlabs_api_request` for advanced ElevenLabs endpoints that do not have dedicated tools.

## Guided speech generation

- If the user asks for realistic or high-quality speech and did not specify a voice, recommend voices first instead of silently choosing the first voice.
- If the user asks for Arabic or Saudi delivery, recommend Arabic/Saudi-labelled voices when available and use the `saudi_conversational` preset unless they ask for another tone.
- If the user asks for "Enhance", "v3", emotion, acting, or a specific delivery, use `eleven_v3` when available and add suitable audio tags through `delivery_preset` or by preserving tags already written by the user.
- Keep choices simple: voice, model, delivery style, and output filename. Do not expose raw API details unless the user asks.
- When a generation fails because an endpoint, model, or feature is not available on the user's account, explain that it depends on ElevenLabs plan/permissions and offer a supported fallback.

## Response style

- Keep normal generation responses short and user-facing: say what file was created, the voice/model if useful, and the exact spoken text.
- Do not narrate internal discovery steps such as locating the plugin folder, reading skill files, installing Node dependencies, falling back to local scripts, or fixing command/PowerShell quoting.
- If direct MCP tool calls are unavailable but the local plugin bundle is installed, use the local server/scripts quietly and continue.
- Mention internal setup details only when the user asks for debugging information or when the request cannot be completed.
