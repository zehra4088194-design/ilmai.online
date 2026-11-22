# Provider logos (light and dark)

Upload provider brand marks directly into this folder: \`public/providers/\`.

Use two files per provider so the mark stays visible on both app themes. The filename is the exact provider key from the part before the slash in the OpenRouter model ID (without a leading \`~\`), followed by \`-light\` or \`-dark\`.

| Provider | Light theme | Dark theme |
|---|---|---|
| Anthropic | \`anthropic-light.svg\` | \`anthropic-dark.svg\` |
| OpenAI | \`openai-light.svg\` | \`openai-dark.svg\` |
| Google | \`google-light.svg\` | \`google-dark.svg\` |
| DeepSeek | \`deepseek-light.svg\` | \`deepseek-dark.svg\` |
| Perplexity | \`perplexity-light.svg\` | \`perplexity-dark.svg\` |
| Moonshot AI | \`moonshotai-light.svg\` | \`moonshotai-dark.svg\` |
| Meta | \`meta-llama-light.svg\` | \`meta-llama-dark.svg\` |
| Mistral | \`mistralai-light.svg\` | \`mistralai-dark.svg\` |
| Qwen | \`qwen-light.svg\` | \`qwen-dark.svg\` |
| xAI | \`x-ai-light.svg\` | \`x-ai-dark.svg\` |
| Z.AI | \`z-ai-light.svg\` | \`z-ai-dark.svg\` |

## Accepted formats

SVG is preferred. PNG and WebP also work. Keep each provider mark square, transparent where possible, and visually centred with a little clear space around it.

Examples for Anthropic:
- \`public/providers/anthropic-light.svg\`
- \`public/providers/anthropic-dark.svg\`

The app tries SVG, then PNG, then WebP for each theme. It also supports the previous shared names (for example \`anthropic.svg\`) as a compatibility fallback while you upload the new variants. If no image exists for one theme, the provider initials are shown for that theme.
