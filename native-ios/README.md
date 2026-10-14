# Legacy native MLX client

This directory contains the legacy Companion Local iPhone app. Current
Companion runs on-device inference inside Obsidian and does not launch this
app. No separate app installation is required. See the
[local models guide](../guides/local-models.md) for current setup.

Companion retains a result-import handler for jobs created by older installs.
It validates the request, vault, result, and expiry before creating a note
under `Claude/MLX`, then removes the completed handoff files. The source note
is preserved. Unfinished legacy files remain under
`.obsidian/plugins/claude-companion/native-jobs` and follow the vault sync
and backup settings.

The legacy project pins its Swift dependencies in `Package.resolved` and its
[Qwen3.5 0.8B model](https://huggingface.co/mlx-community/Qwen3.5-0.8B-4bit)
in `Resources/Model.json`. This project is separate from the current
Companion embedding and chat workers.
