import { useState } from "react";

type EntryFormValues = Record<string, string>;

export type EntryFormOutcome = {
  blockingMessage?: string;
  infoMessage?: string;
  warnings?: string[];
};

export function useEntryForm<TValues extends EntryFormValues>(initialValues: TValues) {
  const [values, setValues] = useState(initialValues);
  const [blockingMessage, setBlockingMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setValue<K extends keyof TValues>(field: K, value: TValues[K]) {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  }

  function clearFeedback() {
    setBlockingMessage("");
    setInfoMessage("");
    setWarnings([]);
  }

  async function submit(
    action: () => Promise<EntryFormOutcome>,
    fallbackMessage: string,
  ) {
    setIsSubmitting(true);
    clearFeedback();

    try {
      const outcome = await action();
      setBlockingMessage(outcome.blockingMessage ?? "");
      setInfoMessage(outcome.infoMessage ?? "");
      setWarnings(outcome.warnings ?? []);
    } catch {
      setBlockingMessage(fallbackMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    blockingMessage,
    infoMessage,
    isSubmitting,
    setValue,
    submit,
    values,
    warnings,
  };
}
