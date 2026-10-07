import { FakeElement } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { SlashMenu } from "../../src/view/SlashMenu";

describe("SlashMenu", () => {
  it("chooses a command when activated by click only", () => {
    const onChoose = vi.fn();
    const parent = new FakeElement() as unknown as HTMLElement;
    const menu = new SlashMenu(parent, [{ name: "research", description: "Open Research Desk" }], onChoose);

    menu.show("research");
    (parent as unknown as FakeElement).querySelector(".cc-slash-item")!.dispatchEvent({ type: "click" });

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith({ name: "research", description: "Open Research Desk" });
  });

  it("waits for a completed tap instead of selecting on finger down", () => {
    const onChoose = vi.fn();
    const parent = new FakeElement() as unknown as HTMLElement;
    const menu = new SlashMenu(parent, [{ name: "research", description: "Open Research Desk" }], onChoose);

    menu.show("research");
    const option = (parent as unknown as FakeElement).querySelector(".cc-slash-item")!;
    const preventDefault = vi.fn();
    option.dispatchEvent({ type: "pointerdown", pointerType: "touch", pointerId: 1, clientX: 10, clientY: 10, preventDefault });
    expect(onChoose).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    option.dispatchEvent({ type: "pointerup", pointerId: 1 });
    option.dispatchEvent({ type: "mousedown", preventDefault });
    expect(onChoose).not.toHaveBeenCalled();
    option.dispatchEvent({ type: "click", preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith({ name: "research", description: "Open Research Desk" });
  });

  it.each(["pointermove", "pointercancel"])("keeps the menu open after %s cancels a tap", (type) => {
    const onChoose = vi.fn();
    const parent = new FakeElement();
    const menu = new SlashMenu(parent as unknown as HTMLElement, [{ name: "research", description: "Open Research Desk" }], onChoose);
    menu.show("research");
    const option = parent.querySelector(".cc-slash-item")!;
    option.dispatchEvent({ type: "pointerdown", pointerType: "touch", pointerId: 1, clientX: 10, clientY: 80, preventDefault: vi.fn() });
    option.dispatchEvent({ type, pointerId: 1, clientX: 10, clientY: 20, preventDefault: vi.fn() });
    option.dispatchEvent({ type: "pointerup", pointerId: 1 });
    option.dispatchEvent({ type: "click" });
    expect(menu.isOpen()).toBe(true);
    expect(onChoose).not.toHaveBeenCalled();
    option.dispatchEvent({ type: "pointerdown", pointerType: "touch", pointerId: 2, clientX: 10, clientY: 20, preventDefault: vi.fn() });
    option.dispatchEvent({ type: "pointerup", pointerId: 2 });
    option.dispatchEvent({ type: "click" });
    expect(onChoose).toHaveBeenCalledOnce();
  });

  it("preserves rows while hovering so scrolling does not reset the list", () => {
    const parent = new FakeElement();
    const menu = new SlashMenu(parent as unknown as HTMLElement, [{ name: "research", description: "Open Research Desk" }], vi.fn());
    menu.show("research");
    const option = parent.querySelector(".cc-slash-item")!;
    option.dispatchEvent({ type: "mouseenter" });
    expect(parent.querySelector(".cc-slash-item")).toBe(option);
  });
});
