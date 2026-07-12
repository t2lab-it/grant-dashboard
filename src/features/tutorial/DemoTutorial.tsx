import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ModalShell } from "../../app/ModalShell";
import { setFiscalYearInSearch } from "../../app/fiscalYear";
import {
  advancedDemoTutorialSteps,
  demoTutorialSteps,
  standardDemoTutorialSteps,
} from "./tutorialSteps";

type DemoTutorialProps = {
  eligible: boolean;
  firstFundId?: number;
  selectedFiscalYear: number | null;
};

function setActiveTourTarget(targetId: string | null) {
  if (typeof document === "undefined") {
    return false;
  }

  document.querySelectorAll("[data-tour-active]").forEach((element) => {
    element.removeAttribute("data-tour-active");
  });

  if (!targetId) {
    return true;
  }

  const target = document.querySelector(`[data-tour-id="${targetId}"]`);
  target?.setAttribute("data-tour-active", "true");
  if (typeof target?.scrollIntoView === "function") {
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }
  return target !== null;
}

export function DemoTutorial({ eligible, firstFundId, selectedFiscalYear }: DemoTutorialProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [hasPromptedThisStartup, setHasPromptedThisStartup] = useState(false);
  const activeStep = activeStepIndex === null ? null : demoTutorialSteps[activeStepIndex] ?? null;
  const canGoBack = activeStepIndex !== null && activeStepIndex > 0;
  const isStandardLastStep = activeStepIndex === standardDemoTutorialSteps.length - 1;
  const isLastStep = activeStepIndex === demoTutorialSteps.length - 1;
  const isAdvancedStep = activeStepIndex !== null && activeStepIndex >= standardDemoTutorialSteps.length;
  const stepCountLabel = isAdvancedStep
    ? `発展 ${activeStepIndex - standardDemoTutorialSteps.length + 1} / ${advancedDemoTutorialSteps.length}`
    : `${(activeStepIndex ?? 0) + 1} / ${standardDemoTutorialSteps.length}`;
  const firstFundPath = useMemo(
    () =>
      selectedFiscalYear === null
        ? `/funds/${firstFundId ?? 1}`
        : `/funds/${firstFundId ?? 1}${setFiscalYearInSearch("", selectedFiscalYear)}`,
    [firstFundId, selectedFiscalYear],
  );
  const plannedItemPath = useMemo(
    () =>
      `/planned-items/new${
        selectedFiscalYear === null
          ? `?fundId=${firstFundId ?? 1}`
          : setFiscalYearInSearch(`?fundId=${firstFundId ?? 1}`, selectedFiscalYear)
      }`,
    [firstFundId, selectedFiscalYear],
  );
  const actualEntryPath = useMemo(
    () =>
      `/actual-entries/new${
        selectedFiscalYear === null
          ? `?fundId=${firstFundId ?? 1}`
          : setFiscalYearInSearch(`?fundId=${firstFundId ?? 1}`, selectedFiscalYear)
      }`,
    [firstFundId, selectedFiscalYear],
  );

  useEffect(() => {
    if (!eligible || location.pathname !== "/" || activeStepIndex !== null || hasPromptedThisStartup) {
      return;
    }

    setIsPromptOpen(true);
    setHasPromptedThisStartup(true);
  }, [activeStepIndex, eligible, hasPromptedThisStartup, location.pathname]);

  useEffect(() => {
    if (!activeStep) {
      setActiveTourTarget(null);
      return;
    }
    const currentStep = activeStep;

    if (currentStep.route === "overview" && location.pathname !== "/") {
      navigate(selectedFiscalYear === null ? "/" : `/${setFiscalYearInSearch("", selectedFiscalYear)}`);
      return;
    }

    if (
      (currentStep.route === "fund-detail" ||
        currentStep.route === "export-preview" ||
        currentStep.route === "fund-edit") &&
      `${location.pathname}${location.search}` !== firstFundPath
    ) {
      navigate(firstFundPath);
      return;
    }

    if (
      currentStep.route === "planned-item-form" &&
      `${location.pathname}${location.search}` !== plannedItemPath
    ) {
      navigate(plannedItemPath);
      return;
    }

    if (
      currentStep.route === "actual-entry-form" &&
      `${location.pathname}${location.search}` !== actualEntryPath
    ) {
      navigate(actualEntryPath);
      return;
    }

    if (currentStep.route === "export-preview") {
      window.dispatchEvent(new CustomEvent("budget-dashboard:open-workbook-export"));
    }

    if (currentStep.route === "fund-edit") {
      window.dispatchEvent(new CustomEvent("budget-dashboard:open-fund-edit"));
    }

    let retryCount = 0;
    let retryTimer: number | null = null;

    function activateTarget() {
      if (setActiveTourTarget(currentStep.targetId)) {
        return;
      }

      retryCount += 1;
      if (retryCount <= 10) {
        retryTimer = window.setTimeout(activateTarget, 50);
      }
    }

    activateTarget();

    return () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      setActiveTourTarget(null);
    };
  }, [
    activeStep,
    actualEntryPath,
    firstFundPath,
    location.pathname,
    location.search,
    navigate,
    plannedItemPath,
    selectedFiscalYear,
  ]);

  function startTutorial() {
    setIsPromptOpen(false);
    setActiveStepIndex(0);
  }

  function dismissPrompt() {
    setIsPromptOpen(false);
  }

  function closeTutorial() {
    setActiveStepIndex(null);
  }

  function continueToAdvancedTutorial() {
    window.dispatchEvent(new CustomEvent("budget-dashboard:close-workbook-export"));
    setActiveStepIndex(standardDemoTutorialSteps.length);
  }

  function goNext() {
    if (activeStepIndex === null) {
      return;
    }

    if (isStandardLastStep || isLastStep) {
      closeTutorial();
      return;
    }

    setActiveStepIndex(activeStepIndex + 1);
  }

  return (
    <>
      {isPromptOpen ? (
        <ModalShell
          ariaLabel="チュートリアルを始めますか？"
          className="demo-tutorial-prompt"
          onRequestClose={dismissPrompt}
        >
          <h2>チュートリアルを始めますか？</h2>
          <p>デモデータを使って、予算の確認から精算、workbook 差分確認まで案内します。</p>
          <div className="demo-tutorial-actions">
            <button type="button" className="detail-action-button" onClick={startTutorial}>
              チュートリアルを始める
            </button>
            <button type="button" className="detail-action-button detail-action-button-edit" onClick={dismissPrompt}>
              今回は始めない
            </button>
          </div>
        </ModalShell>
      ) : null}

      {activeStep ? (
        <section
          className="demo-tutorial-callout"
          role="dialog"
          aria-label="チュートリアル"
          aria-live="polite"
        >
          <div className="demo-tutorial-step-count">
            {stepCountLabel}
          </div>
          <h2>{activeStep.title}</h2>
          <p>{activeStep.body}</p>
          <div className="demo-tutorial-actions">
            <button
              type="button"
              className="detail-action-button detail-action-button-edit"
              disabled={!canGoBack}
              onClick={() => setActiveStepIndex((current) => Math.max((current ?? 0) - 1, 0))}
            >
              戻る
            </button>
            <button type="button" className="detail-action-button" onClick={goNext}>
              {isStandardLastStep || isLastStep ? "完了" : "次へ"}
            </button>
            {isStandardLastStep ? (
              <button
                type="button"
                className="detail-action-button detail-action-button-edit"
                onClick={continueToAdvancedTutorial}
              >
                発展
              </button>
            ) : (
              <button
                type="button"
                className="detail-action-button detail-action-button-edit"
                onClick={closeTutorial}
              >
                閉じる
              </button>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
