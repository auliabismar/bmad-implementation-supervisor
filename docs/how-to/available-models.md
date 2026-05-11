# Available Models

This guide explains how to discover available models for each agent harness.

## Codex

Run the following command to list available models:

```bash
codex models
```

Common model names:
- `gpt-5.4` - GPT-5 with 4-bit quantization
- `o3` - OpenAI o3 model
- `o4-mini` - OpenAI o4-mini model

## OpenCode

Run the following command to list available models:

```bash
opencode models
```

Common model names:
- `openai/gpt-5.4` - OpenAI GPT-5.4
- `google/gemini-2.5-pro` - Google Gemini 2.5 Pro
- `anthropic/claude-sonnet-4-6` - Anthropic Claude Sonnet 4.6

## CommandCode

Run the following command to list available models:

```bash
commandcode models
```

If the command is not available, start the interactive session and use:

```
/model
```

## Model Naming Convention

Models are specified as `provider/model` format:

| Provider | Example |
|----------|---------|
| OpenAI | `openai/gpt-5.4` |
| Anthropic | `anthropic/claude-sonnet-4-6` |
| Google | `google/gemini-2.5-pro` |

## Configuration

In `supervisor.config.yaml`, specify models in the `model_pool` section:

```yaml
model_pool:
  create_story:
    - { harness: codex, model: gpt-5.4 }
    - { harness: opencode, model: openai/gpt-5.4 }
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Command not found | Ensure harness is installed and in PATH |
| No models listed | Check API keys in environment |
| Model not found | Verify model name matches provider's naming |
