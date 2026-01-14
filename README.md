# Zotero Assistant

Zotero Assistant is a Zotero add-on that brings AI-powered paper understanding into the item pane and a floating window. It supports GitHub Copilot models and local models (LM Studio, Ollama), with image/vision input and PDF page capture.

## Highlights

- Chat with your library items inside Zotero.
- Quick actions: Summarize, Key Points, Methods, Findings, Compare.
- Built-in citation copy (APA, MLA, Chicago, Harvard, IEEE, Vancouver).
- Image input: upload, paste from clipboard, or capture the current PDF page.
- Local model support (LM Studio, Ollama) plus GitHub Copilot models.
- Per-task model overrides in Preferences.

## Requirements

- Zotero 7
- GitHub Copilot subscription if you use Copilot models
- LM Studio or Ollama for local models

## Install (Release)

1) Download the latest `.xpi` from https://github.com/RJ0508/ZoteroAssistant/releases
2) In Zotero: Tools -> Add-ons -> Install Add-on From File... and select the `.xpi`.

## Install (from source)

Requires Node.js >= 18.

1) Install dependencies:

```bash
npm install
```

2) Build the add-on:

```bash
npm run build
```

3) In Zotero: Tools -> Add-ons -> Install Add-on From File... and select the generated XPI in `build/`.

## Configure

Open Zotero Settings -> AI Assistant:

- AI Provider: GitHub Copilot, Ollama (Local), or LM Studio (Local)
- Default Model: used for normal chat
- Task Models: override per action (Summarize, Key Points, Methods, Findings, Compare)
- Local endpoints: set LM Studio or Ollama URL if needed

## How to Use

- Open a paper in Zotero and switch to the AI Assistant pane.
- Ask questions, use quick action buttons, or click Cite/Compare.
- To use vision:
  - Click the attach button to upload or capture a PDF page.
  - Or paste an image directly into the input box.

## Local Models

### LM Studio

- Start the Local Server in LM Studio (Developer tab).
- Default URL: `http://localhost:1234`

### Ollama

- Start Ollama server.
- Default URL: `http://localhost:11434`

## Development Notes

- The UI is rendered with DOM/XHTML to avoid unsafe-node warnings.
- The add-on handles images using OpenAI-compatible message formats and Copilot vision headers.

## Troubleshooting

- No models showing for local provider: make sure the local server is running, then reopen Preferences.
- Copilot not connected: use the Connect button in Settings -> AI Assistant.
