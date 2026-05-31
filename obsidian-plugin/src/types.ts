// Shared types for the Claude Companion plugin.

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  /** Raw markdown content of the message. */
  content: string;
}

export interface ContextToggles {
  activeNote: boolean;
  selection: boolean;
  linkedNotes: boolean;
  searchVault: boolean;
}

export interface ClaudeModel {
  id: string;
  label: string;
  hint?: string;
}

export interface PluginSettings {
  apiKey: string;
  model: string;
  customModel: string;
  maxTokens: number;
  systemPrompt: string;
  artifactFolder: string;
  chatFolder: string;
  context: ContextToggles;
  /** Max characters of vault context to attach to a request. */
  contextCharBudget: number;
  /** How many linked / search-matched notes to include. */
  maxContextNotes: number;
  /** Default render height (px) for inline `claude-html` artifacts. */
  artifactHeight: number;
  /** Max chat conversations to retain in history (oldest pruned). 0 = unlimited. */
  maxConversations: number;

  // ----- local models (Ollama) -----
  /** Base URL of the local Ollama server. */
  ollamaHost: string;
  /** Default local model for utility tasks (summaries, tagging). */
  ollamaModel: string;
  /** Route cheap "utility" work (summarize/tag/ingest) to Ollama. */
  localUtilityEnabled: boolean;

  // ----- indexing -----
  /** Auto-add tags + summary frontmatter when saving artifacts/chats. */
  autoTagOnSave: boolean;
  /** Tags every saved artifact gets, for reliable indexing. */
  artifactBaseTags: string[];
  /** Tags every saved chat gets. */
  chatBaseTags: string[];

  // ----- MCP bridge (vault-as-MCP-server) -----
  /** Run a local MCP server exposing vault tools to Claude Code / Desktop. */
  mcpEnabled: boolean;
  /** Port for the local MCP server (loopback only). */
  mcpPort: number;
  /** Bearer token required by MCP clients. */
  mcpToken: string;
  /** Allow MCP clients to create/append notes (read is always allowed). */
  mcpAllowWrites: boolean;
  /** Default folder for notes created via MCP. */
  mcpWriteFolder: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: "",
  model: "claude-sonnet-4-6",
  customModel: "",
  maxTokens: 4096,
  systemPrompt:
    "You are Claude, working inside the user's Obsidian vault. Be concise and precise. " +
    "When the user asks for a plan, report, diagram, or anything visual, prefer producing a single " +
    "self-contained HTML artifact in a ```claude-html code block using the provided design system.",
  artifactFolder: "Claude/Artifacts",
  chatFolder: "Claude/Chats",
  context: {
    activeNote: true,
    selection: true,
    linkedNotes: false,
    searchVault: false,
  },
  contextCharBudget: 24000,
  maxContextNotes: 6,
  artifactHeight: 640,
  maxConversations: 200,

  ollamaHost: "http://localhost:11434",
  ollamaModel: "llama3.1",
  localUtilityEnabled: false,

  autoTagOnSave: true,
  artifactBaseTags: ["claude", "artifact"],
  chatBaseTags: ["claude", "chat"],

  mcpEnabled: false,
  mcpPort: 22360,
  mcpToken: "",
  mcpAllowWrites: false,
  mcpWriteFolder: "Claude/Inbox",
};

/** Streaming callbacks for a single Claude request. */
export interface StreamHandlers {
  onText: (delta: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
  /** Token usage reported by the provider (Anthropic only). */
  onUsage?: (usage: import("./claude/sse").TokenUsage) => void;
}
