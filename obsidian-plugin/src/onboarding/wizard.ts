// First-run setup wizard: a pure 3-step state machine over the same
// persisted flags `firstRun.ts` already orders. No new migration — a step is
// in the plan only while it still has something to decide.

export type WizardStep = "connect" | "vault-tools" | "index";

export interface WizardState {
  /** True while chat would fail for want of a credential (see setupState.ts). */
  needsCredential: boolean;
  /** Desktop only: the "Connect vault tools to Claude Code" flow applies. */
  isDesktop: boolean;
  /** Desktop-integrations offer already made (own flag; step 2 folds it in). */
  desktopIntegrationsOffered: boolean;
  /** Built-in embeddings download prompt already made. */
  semanticModelPrompted: boolean;
  /** Ontology seed prompt already made. */
  ontologySeedPrompted: boolean;
}

/** Which wizard steps still have something to decide, in display order. */
export function wizardPlan(state: WizardState): WizardStep[] {
  const steps: WizardStep[] = [];
  if (state.needsCredential) steps.push("connect");
  if (state.isDesktop && !state.desktopIntegrationsOffered) steps.push("vault-tools");
  if (!state.semanticModelPrompted || !state.ontologySeedPrompted) steps.push("index");
  return steps;
}

/**
 * Settings both Finish and Skip/close persist: the wizard doesn't reopen on
 * its own next launch. A dismissal without a credential does not lie about
 * still needing one — `wizardPlan` is unaffected, so the chat setup card
 * keeps covering that gap.
 */
export const WIZARD_DISMISSED_SETTINGS = { setupWizardDone: true } as const;
