export type SupportChoice = "star" | "later";

export async function finishOptionalSupport<State>({
  choice,
  complete,
  updateState,
  openRepository,
  onOpenError,
}: {
  choice: SupportChoice;
  complete: () => Promise<State>;
  updateState: (state: State) => void;
  openRepository: () => Promise<unknown>;
  onOpenError: (error: unknown) => void;
}): Promise<void> {
  const state = await complete();
  updateState(state);
  // Access is already granted. A slow, failed or never-resolving browser launch
  // must never hold onboarding open or require a second click to skip it.
  if (choice === "star") void Promise.resolve().then(openRepository).catch(onOpenError);
}
