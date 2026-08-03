import { describe, expect, it } from "vitest";
import { mobileModelChoices } from "../src/view/mobileModelChoices";

describe("mobileModelChoices", () => {
  it("keeps configured local and endpoint models reachable when desktop controls are hidden", () => {
    expect(mobileModelChoices({
      ollamaModels: [],
      configuredOllamaModel: "llama3.1:8b",
      openaiCompatHost: "http://127.0.0.1:1234",
      openaiCompatModel: "mlx-3b",
    })).toEqual(expect.arrayContaining([
      { value: "ollama:llama3.1:8b", label: "llama3.1:8b · local", provider: "local" },
      { value: "custom:mlx-3b", label: "mlx-3b · endpoint", provider: "custom" },
    ]));
  });
});
