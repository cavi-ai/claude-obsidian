# Companion Local for iPhone

A native SwiftUI app for explicit, foreground writing tasks using MLX and Metal.
It works with Companion's **Send selection to on-device MLX** command. It does
not run a local server or require SSH.

## Build and install

Requires Xcode with Swift 6.2 or later and an iPhone running iOS 17 or later.
Open `CompanionLocal.xcodeproj`, select your development team in Signing &
Capabilities, select your connected iPhone, and run the `CompanionLocal` scheme.
Apple provisioning and Developer Mode are required for development installs.
Model availability and generation depend on the device's available memory.

The project pins MLX Swift LM 3.32.3, MLX Swift 0.32.3, Swift Transformers 1.3.4,
and transitive dependencies in `Package.resolved`. Regenerate the project after
adding source files with `python3 tools/generate-project.py`.
Regenerate the app icon with `swift tools/generate-app-icon.swift`.

## Use with Obsidian

1. Install Companion Local and the corresponding Companion plugin build.
2. Open Companion Local, choose the **vault folder** containing `.obsidian`
   (for iCloud, browse to Obsidian's folder in iCloud Drive), then download the model.
3. In Obsidian on iPhone, select a passage and run **Send selection to on-device MLX**.
   Enter an instruction and open the native app.
4. Review the instruction and generate. Keep the app in the foreground.
5. Review the result and choose **Send result to Obsidian**. Companion creates a
   new note under `Claude/MLX`; the source note is preserved.

The first model is [Qwen3.5 0.8B, 4-bit](https://huggingface.co/mlx-community/Qwen3.5-0.8B-4bit)
(Apache-2.0), pinned to an immutable revision. Its assets total about 646 MB.
Downloads stream to disk and are checked against bundled SHA-256 hashes before
use. Generation loads those local files; it does not download models implicitly
or send prompts to an inference endpoint. **Remove downloaded model** clears the
local assets. Download size does not describe peak memory use.

Handoffs use bounded JSON files in the vault's plugin folder. URLs contain a job
identifier and path, not passage text. Those files follow the vault's sync and
backup settings, including iCloud. Imported jobs are deleted after successful
note creation; abandoned jobs remain in `.obsidian/plugins/claude-companion/native-jobs`
and can be deleted. Requests expire after one hour; resend an expired selection.

## Resource limits and recovery

Nothing starts inference on launch. Download and generation require explicit
actions. Only one operation runs at a time. Backgrounding the app, pressing
Cancel, or receiving a memory warning cancels the operation. Generation joins
its producer before releasing the model and accepting another task.

Inputs are capped at 2,048 tokens, outputs at 512 tokens, passages at 12,000 UTF-16
code units, and handoff files at 32 KiB. Generation requires at least 1 GiB of
available process memory before loading, bounds MLX allocations, and limits its
reusable cache to 16 MiB. These limits do not guarantee against iOS termination.
For a memory error, close other apps and retry with a shorter passage. An
interrupted download can be retried; already verified assets are reused.

## Checks

```sh
swift test
xcodebuild -project CompanionLocal.xcodeproj -scheme CompanionLocal \
  -destination 'generic/platform=iOS' -derivedDataPath DerivedData \
  -onlyUsePackageVersionsFromResolvedFile CODE_SIGNING_ALLOWED=NO build
```
