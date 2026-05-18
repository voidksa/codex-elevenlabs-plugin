<div align="center">

<img src="assets/elevenlabs-rounded-icon.png" alt="ElevenLabs" width="96">

<h1>ElevenLabs Codex Plugin</h1>

<p>
Use ElevenLabs from Codex through a local MCP server. Configure your API key once, then generate speech, choose voices, use v3-style delivery presets, create sound effects, clean audio, dub media, and transcribe audio without pasting secrets into chat.
</p>

<p>
Repository: <a href="https://github.com/voidksa/codex-elevenlabs-plugin">github.com/voidksa/codex-elevenlabs-plugin</a>
</p>

</div>

## Features

- Check ElevenLabs account and subscription quota.
- List available voices and recommend voices by text, accent, mood, or use case.
- Generate speech audio files from text with model selection, v3 audio tags, and delivery presets.
- Transcribe local audio files with Speech to Text.
- Generate sound effects and music.
- Isolate speech from noisy audio/video and convert recordings with Voice Changer.
- Start dubbing jobs and download completed dubbed audio/video.
- Create Audio Native embed projects.
- Call advanced ElevenLabs `/v1` API endpoints.
- Create and store service-account API keys when the workspace supports it.

## Authentication

The plugin reads the API key from one of these sources:

1. `ELEVENLABS_API_KEY` environment variable.
2. Windows DPAPI-encrypted local storage created by `scripts/set-api-key.ps1`.

The stored key is not committed to this repository and is never printed by the MCP tools.

## Setup

From this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\set-api-key.ps1
```

On Windows, the key is stored at:

```text
%APPDATA%\Codex\elevenlabs\api-key.dpapi
```

Start a new Codex session after installing or moving the plugin so Codex can discover the MCP server.

## Local Install

To install this plugin into the home-local Codex plugin location:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-home-local.ps1
```

The MCP server installs its Node dependency automatically on first launch if `node_modules` is missing.

## Available Tools

| Tool | Purpose |
| --- | --- |
| `elevenlabs_status` | Verify authentication and show account or quota status. |
| `elevenlabs_list_voices` | List voices available to the configured key. |
| `elevenlabs_recommend_voices` | Suggest ranked voices before generation. |
| `elevenlabs_list_models` | List models available to the account. |
| `elevenlabs_list_delivery_presets` | Show delivery presets such as calm, energetic, whisper, shout, and Saudi conversational. |
| `elevenlabs_text_to_speech` | Generate a speech audio file with optional v3 tags and voice settings. |
| `elevenlabs_speech_to_text` | Transcribe a local audio or video file. |
| `elevenlabs_sound_effect` | Generate sound effects and short musical elements from text. |
| `elevenlabs_audio_isolation` | Clean speech and remove background noise. |
| `elevenlabs_voice_changer` | Convert a local recording into a target ElevenLabs voice. |
| `elevenlabs_music` | Generate music from a prompt or composition plan. |
| `elevenlabs_create_dub` | Start a dubbing job from a local file or URL. |
| `elevenlabs_get_dub_status` | Check dubbing job status. |
| `elevenlabs_get_dubbed_audio` | Download completed dubbed output. |
| `elevenlabs_audio_native_create` | Create an Audio Native embed project. |
| `elevenlabs_audio_native_settings` | Inspect Audio Native player settings. |
| `elevenlabs_list_service_accounts` | List visible ElevenLabs service accounts. |
| `elevenlabs_create_service_account_api_key` | Create and locally store a service-account API key. |
| `elevenlabs_api_request` | Call advanced ElevenLabs `/v1` endpoints. |

## Security

- Do not commit `.env` files, generated audio, `node_modules`, or DPAPI key files.
- Treat ElevenLabs API keys as secrets.
- Rotate a key immediately if it is accidentally shared.

## Trademark

ElevenLabs and the ElevenLabs logo are trademarks of ElevenLabs. This community plugin is not an official ElevenLabs product.
