<div align="center">

<img src="plugins/elevenlabs/assets/elevenlabs-rounded-icon.png" alt="ElevenLabs" width="112">

<h1>ElevenLabs for Codex</h1>

<p>Use ElevenLabs in Codex without pasting your API key into every chat. Generate speech, pick voices, use v3-style delivery presets, clean audio, create sound effects, compose music, dub media, and transcribe files.</p>

<br>

<h2>Add to Codex</h2>

<p>Open <strong>Plugins</strong>, choose <strong>Add more</strong>, then add this marketplace.</p>

<img src="docs/images/step-1-choose-marketplace.png" alt="Choose a plugin marketplace" width="360">

<br>

<img src="docs/images/step-2-add-more.png" alt="Add more marketplace" width="360">

<h3>Source</h3>

<pre><code>voidksa/codex-elevenlabs-plugin</code></pre>

<h3>Git ref</h3>

<pre><code>main</code></pre>

<h3>Sparse paths</h3>

<pre><code>.agents/plugins
plugins/elevenlabs</code></pre>

<img src="docs/images/step-3-add-marketplace.png" alt="Add the ElevenLabs marketplace" width="620">

<p>Click <strong>Add marketplace</strong>. After it is added, select <strong>ElevenLabs</strong> from the marketplace menu.</p>

<img src="docs/images/step-4-marketplace-visible.png" alt="ElevenLabs marketplace selected in Codex" width="720">

<p>Open the ElevenLabs card, then click <strong>Install ElevenLabs</strong>.</p>

<img src="docs/images/step-5-install-elevenlabs.png" alt="Install ElevenLabs plugin in Codex" width="520">

<p>Restart Codex if ElevenLabs does not appear right away.</p>

<p>If Codex shows <strong>Failed to add marketplace</strong>, check the Source field first. Use <code>voidksa/codex-elevenlabs-plugin</code>, not the browser URL.</p>

<br>

<h2>Connect ElevenLabs</h2>

<p>Each person uses their own ElevenLabs API key. The key is stored locally on their computer and is not committed to this repository.</p>

<p>From the plugin folder:</p>

<pre><code>cd plugins\elevenlabs
powershell -ExecutionPolicy Bypass -File .\scripts\set-api-key.ps1</code></pre>

<p>On Windows, the key is saved outside the repo at:</p>

<pre><code>%APPDATA%\Codex\elevenlabs\api-key.dpapi</code></pre>

<br>

<h2>Security</h2>

<p>This repo does not include any API keys. Do not commit <code>.env</code>, generated audio, <code>node_modules</code>, or DPAPI key files.</p>

<br>

<h2>Trademark</h2>

<p>ElevenLabs and the ElevenLabs logo are trademarks of ElevenLabs. This community plugin is not an official ElevenLabs product.</p>

</div>
