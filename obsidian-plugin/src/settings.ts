import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ClaudeCompanionPlugin from "./main";
import { CLAUDE_MODELS } from "./claude/models";
import type { ProviderStatus } from "./providers/types";
import { generateToken, bridgeUrl, claudeCodeCommand, claudeDesktopConfig } from "./mcp/clientConfig";

export class ClaudeCompanionSettingTab extends PluginSettingTab {
  /** Cached list of Ollama models from the last Detect, for the dropdown. */
  private detectedOllamaModels: string[] | null = null;

  constructor(
    app: App,
    private plugin: ClaudeCompanionPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Connection").setHeading();

    new Setting(containerEl)
      .setName("Anthropic API key")
      .setDesc("Bring your own key from console.anthropic.com. Stored locally in this vault's plugin data.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.style.width = "320px";
        text
          .setPlaceholder("sk-ant-…")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.apiKey = v.trim();
            await this.plugin.saveSettings();
          });
      });

    // Save & Test connection — explicit confirmation that settings are saved
    // and the key actually works.
    const claudeStatus = containerEl.createDiv({ cls: "cc-conn-status" });
    new Setting(containerEl)
      .setName("Save & test connection")
      .setDesc("Saves settings and sends a tiny request to verify your Anthropic key.")
      .addButton((btn) =>
        btn
          .setButtonText("Save & test")
          .setCta()
          .onClick(async () => {
            await this.plugin.saveSettings();
            this.renderStatus(claudeStatus, { ok: true, detail: "Testing…" });
            const status = await this.plugin.router().anthropic.test();
            this.renderStatus(claudeStatus, status);
          }),
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Pick a default model. A custom id below overrides this.")
      .addDropdown((dd) => {
        for (const m of CLAUDE_MODELS) dd.addOption(m.id, m.label);
        dd.setValue(this.plugin.settings.model).onChange(async (v) => {
          this.plugin.settings.model = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
      });

    new Setting(containerEl)
      .setName("Custom model id")
      .setDesc("Optional. Overrides the dropdown — useful for new or dated model snapshots.")
      .addText((text) =>
        text
          .setPlaceholder("e.g. claude-sonnet-4-6-20250930")
          .setValue(this.plugin.settings.customModel)
          .onChange(async (v) => {
            this.plugin.settings.customModel = v.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          }),
      );

    new Setting(containerEl)
      .setName("Max response tokens")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxTokens)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.maxTokens = Math.min(n, 64000);
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl).setName("Behavior").setHeading();

    new Setting(containerEl)
      .setName("System prompt")
      .setDesc("Prepended to every conversation. The artifact design system is always appended automatically.")
      .addTextArea((ta) => {
        ta.inputEl.rows = 5;
        ta.inputEl.style.width = "100%";
        ta.setValue(this.plugin.settings.systemPrompt).onChange(async (v) => {
          this.plugin.settings.systemPrompt = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Context character budget")
      .setDesc("Max characters of vault context attached to a request.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.contextCharBudget)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.contextCharBudget = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Max context notes")
      .setDesc("How many linked / search-matched notes to include.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxContextNotes)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.maxContextNotes = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl).setName("Storage").setHeading();

    new Setting(containerEl)
      .setName("Artifacts folder")
      .setDesc("Where saved artifacts (interactive HTML notes) are written.")
      .addText((text) =>
        text.setValue(this.plugin.settings.artifactFolder).onChange(async (v) => {
          this.plugin.settings.artifactFolder = v.trim() || "Claude/Artifacts";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Chats folder")
      .setDesc("Where saved chat transcripts are written.")
      .addText((text) =>
        text.setValue(this.plugin.settings.chatFolder).onChange(async (v) => {
          this.plugin.settings.chatFolder = v.trim() || "Claude/Chats";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Inline artifact height")
      .setDesc("Default pixel height for artifacts rendered inside notes.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.artifactHeight)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.artifactHeight = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Conversation history limit")
      .setDesc("How many past chats to keep (oldest are pruned). Use 0 for unlimited.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.maxConversations)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.maxConversations = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    // ---------- local models (Ollama) ----------
    new Setting(containerEl).setName("Local models (Ollama)").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Run cheap, bulk work — summarizing, tagging, ingestion — on a local model to save Anthropic tokens. Chat and plans still use Claude unless you route them here.",
    });

    new Setting(containerEl)
      .setName("Use local model for utility tasks")
      .setDesc("Summaries, auto-tagging, and ingestion go to Ollama instead of Claude.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.localUtilityEnabled).onChange(async (v) => {
          this.plugin.settings.localUtilityEnabled = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Ollama host")
      .setDesc("Base URL of your local Ollama server.")
      .addText((text) =>
        text.setValue(this.plugin.settings.ollamaHost).onChange(async (v) => {
          this.plugin.settings.ollamaHost = v.trim() || "http://localhost:11434";
          await this.plugin.saveSettings();
        }),
      );

    // Local model: a dropdown auto-populated from the Ollama server when
    // models have been detected, otherwise a free-text field.
    const modelSetting = new Setting(containerEl)
      .setName("Local model")
      .setDesc("Choose a detected model, or type one (e.g. llama3.1, qwen2.5). Click Detect to refresh the list.");

    const detected = this.detectedOllamaModels;
    if (detected && detected.length > 0) {
      modelSetting.addDropdown((dd) => {
        for (const m of detected) dd.addOption(m, m);
        // Keep the current value selectable even if not in the detected list.
        if (!detected.includes(this.plugin.settings.ollamaModel)) dd.addOption(this.plugin.settings.ollamaModel, `${this.plugin.settings.ollamaModel} (current)`);
        dd.setValue(this.plugin.settings.ollamaModel).onChange(async (v) => {
          this.plugin.settings.ollamaModel = v;
          await this.plugin.saveSettings();
        });
      });
    } else {
      modelSetting.addText((text) =>
        text.setValue(this.plugin.settings.ollamaModel).onChange(async (v) => {
          this.plugin.settings.ollamaModel = v.trim() || "llama3.1";
          await this.plugin.saveSettings();
        }),
      );
    }
    modelSetting.addButton((btn) =>
      btn
        .setButtonText("Detect")
        .setTooltip("Query the Ollama server for installed models")
        .onClick(async () => {
          await this.plugin.saveSettings();
          btn.setButtonText("Detecting…").setDisabled(true);
          const models = await this.plugin.router().ollama.listModels();
          this.detectedOllamaModels = models;
          if (models.length === 0) {
            new Notice("No Ollama models detected. Is `ollama serve` running, and have you pulled a model?");
          } else {
            if (!models.includes(this.plugin.settings.ollamaModel)) {
              this.plugin.settings.ollamaModel = models[0];
              await this.plugin.saveSettings();
            }
            new Notice(`Detected ${models.length} model(s).`);
          }
          this.display(); // re-render so the dropdown appears/updates
        }),
    );

    const ollamaStatus = containerEl.createDiv({ cls: "cc-conn-status" });
    new Setting(containerEl)
      .setName("Test local connection")
      .setDesc("Checks that Ollama is reachable and lists pulled models.")
      .addButton((btn) =>
        btn.setButtonText("Test Ollama").onClick(async () => {
          await this.plugin.saveSettings();
          this.renderStatus(ollamaStatus, { ok: true, detail: "Testing…" });
          this.renderStatus(ollamaStatus, await this.plugin.router().ollama.test());
        }),
      );

    // ---------- indexing ----------
    new Setting(containerEl).setName("Indexing & tags").setHeading();

    new Setting(containerEl)
      .setName("Auto-tag on save")
      .setDesc("When saving an artifact or chat, generate topic tags + a one-line summary (uses the utility provider above) so notes are indexed correctly.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoTagOnSave).onChange(async (v) => {
          this.plugin.settings.autoTagOnSave = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Artifact base tags")
      .setDesc("Comma-separated tags every saved artifact gets (for reliable filtering).")
      .addText((text) =>
        text.setValue(this.plugin.settings.artifactBaseTags.join(", ")).onChange(async (v) => {
          this.plugin.settings.artifactBaseTags = splitTags(v);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Chat base tags")
      .setDesc("Comma-separated tags every saved chat gets.")
      .addText((text) =>
        text.setValue(this.plugin.settings.chatBaseTags.join(", ")).onChange(async (v) => {
          this.plugin.settings.chatBaseTags = splitTags(v);
          await this.plugin.saveSettings();
        }),
      );

    this.renderMcpSection(containerEl);
  }

  private renderMcpSection(containerEl: HTMLElement): void {
    const s = this.plugin.settings;
    new Setting(containerEl).setName("Unified bridge (MCP server)").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Expose this vault as a local MCP server so Claude Code and Claude Desktop can search, read, and (optionally) write your notes — unifying all three on one knowledge base. Bound to 127.0.0.1 and protected by a token.",
    });

    new Setting(containerEl)
      .setName("Enable MCP server")
      .setDesc("Runs a local server on the port below. Turn off to stop sharing your vault.")
      .addToggle((t) =>
        t.setValue(s.mcpEnabled).onChange(async (v) => {
          s.mcpEnabled = v;
          if (v && !s.mcpToken) s.mcpToken = generateToken();
          await this.plugin.saveSettings();
          this.display(); // refresh status + snippets
        }),
      );

    new Setting(containerEl)
      .setName("Port")
      .setDesc("Local port for the MCP server (loopback only).")
      .addText((text) =>
        text.setValue(String(s.mcpPort)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0 && n < 65536) {
            s.mcpPort = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Access token")
      .setDesc("Required by clients as a bearer token. Keep it secret.")
      .addText((text) => {
        text.inputEl.style.width = "260px";
        text.setValue(s.mcpToken).onChange(async (v) => {
          s.mcpToken = v.trim();
          await this.plugin.saveSettings();
        });
      })
      .addButton((btn) =>
        btn.setButtonText("Regenerate").onClick(async () => {
          s.mcpToken = generateToken();
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName("Allow writes")
      .setDesc("Let connected clients create and append notes (read & search are always allowed).")
      .addToggle((t) =>
        t.setValue(s.mcpAllowWrites).onChange(async (v) => {
          s.mcpAllowWrites = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Write folder")
      .setDesc("Default folder for notes created via MCP.")
      .addText((text) =>
        text.setValue(s.mcpWriteFolder).onChange(async (v) => {
          s.mcpWriteFolder = v.trim() || "Claude/Inbox";
          await this.plugin.saveSettings();
        }),
      );

    // Live status.
    const status = containerEl.createDiv({ cls: "cc-conn-status" });
    const running = this.plugin.mcpRunning();
    status.toggleClass("is-ok", running && s.mcpEnabled);
    status.toggleClass("is-err", s.mcpEnabled && !running);
    if (!s.mcpEnabled) status.setText("Server disabled.");
    else status.setText(running ? `✓ Running at ${bridgeUrl(s.mcpPort)}` : "✗ Not running — check the port isn't in use.");

    // Connection snippets.
    if (s.mcpEnabled) {
      const info = { port: s.mcpPort, token: s.mcpToken };
      this.codeBlock(containerEl, "Claude Code (run in a terminal):", claudeCodeCommand(info));
      this.codeBlock(containerEl, "Claude Desktop (add to claude_desktop_config.json):", claudeDesktopConfig(info));
    }
  }

  private codeBlock(containerEl: HTMLElement, label: string, code: string): void {
    const wrap = containerEl.createDiv({ cls: "cc-snippet" });
    const head = wrap.createDiv({ cls: "cc-snippet-head" });
    head.createSpan({ text: label });
    const copy = head.createEl("button", { cls: "cc-action", text: "Copy" });
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(code);
      copy.setText("Copied");
      setTimeout(() => copy.setText("Copy"), 1200);
    });
    wrap.createEl("pre", { cls: "cc-snippet-pre" }).createEl("code", { text: code });
  }

  private renderStatus(el: HTMLElement, status: ProviderStatus): void {
    el.empty();
    el.toggleClass("is-ok", status.ok);
    el.toggleClass("is-err", !status.ok);
    el.setText((status.ok ? "✓ " : "✗ ") + status.detail);
  }
}

function splitTags(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
