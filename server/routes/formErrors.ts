import type { FastifyReply } from "fastify";
import { ZodError } from "zod";
import {
  isEntryWorkflowDomainError,
  type EntryWorkflowErrorCode,
} from "../services/entryWorkflowErrors";
import {
  CATEGORY_HAS_LINKED_ENTRIES_ERROR,
  FUND_NOT_FOUND_ERROR,
  INVALID_CATEGORY_UPDATE_ERROR,
} from "../services/fundCreation";
import { INVALID_CLASSIFICATION_ASSIGNMENT_ERROR } from "../services/classifications";

type ApiErrorResponse = {
  code: string;
  error: string;
  message: string;
};

function getFriendlyValidationMessage(error: ZodError) {
  const firstIssue = error.issues[0];
  if (firstIssue?.code !== "custom" || !("params" in firstIssue)) {
    return undefined;
  }

  return firstIssue.params?.friendlyMessage ? firstIssue.message : undefined;
}

function sendFormError(reply: FastifyReply, payload: ApiErrorResponse) {
  reply.code(400).send(payload);
}

function sendApiError(reply: FastifyReply, statusCode: number, payload: ApiErrorResponse) {
  reply.code(statusCode).send(payload);
}

function isForeignKeyError(error: Error) {
  return error.message.includes("FOREIGN KEY constraint failed");
}

function sendEntryWorkflowError(reply: FastifyReply, code: EntryWorkflowErrorCode) {
  switch (code) {
    case "invalid_reference":
      sendFormError(reply, {
        code: "invalid_reference",
        error: "Invalid request payload",
        message: "選択した資金IDまたは費目IDを確認してください。",
      });
      return true;
    case "category_fund_mismatch":
      sendFormError(reply, {
        code: "category_fund_mismatch",
        error: "Invalid request payload",
        message: "選択した費目が資金に紐づいていません。",
      });
      return true;
    case "planned_item_mismatch":
      sendFormError(reply, {
        code: "planned_item_mismatch",
        error: "Linked planned item does not match actual entry",
        message: "予定項目IDが選択した資金または費目と一致していません。",
      });
      return true;
    case "planned_item_not_found":
      sendApiError(reply, 404, {
        code: "planned_item_not_found",
        error: "Planned item not found",
        message: "対象の計画項目が見つかりません。",
      });
      return true;
    case "planned_item_has_actuals":
      sendApiError(reply, 409, {
        code: "planned_item_has_actuals",
        error: "Planned item already has actual entries",
        message: "精算が紐づいている計画項目は取り消せません。",
      });
      return true;
    case "planned_item_delete_has_actuals":
      sendApiError(reply, 409, {
        code: "planned_item_delete_has_actuals",
        error: "Planned item already has actual entries",
        message: "精算が紐づいている計画項目は削除できません。",
      });
      return true;
    case "planned_item_not_deletable":
      sendApiError(reply, 409, {
        code: "planned_item_not_deletable",
        error: "Planned item is not deletable",
        message: "この計画項目は削除できません。",
      });
      return true;
    case "planned_item_complete_requires_actuals":
      sendApiError(reply, 409, {
        code: "planned_item_complete_requires_actuals",
        error: "Planned item is not partially settled",
        message: "精算が紐づいている未精算の計画項目のみ完了にできます。",
      });
      return true;
    case "planned_item_complete_requires_remaining":
      sendApiError(reply, 409, {
        code: "planned_item_complete_requires_remaining",
        error: "Planned item has no remaining amount",
        message: "残予定額がある計画項目のみ完了にできます。",
      });
      return true;
    case "planned_item_not_cancelled_for_restore":
      sendApiError(reply, 409, {
        code: "planned_item_not_cancelled_for_restore",
        error: "Planned item is not cancelled",
        message: "完了または取消済みの計画項目のみ計画に戻せます。",
      });
      return true;
    case "actual_entry_not_found":
      sendApiError(reply, 404, {
        code: "actual_entry_not_found",
        error: "Actual entry not found",
        message: "対象の精算項目が見つかりません。",
      });
      return true;
  }
}

export function handlePlannedItemRouteError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    sendFormError(reply, {
      code: "invalid_payload",
      error: "Invalid request payload",
      message: getFriendlyValidationMessage(error) ?? "入力内容を確認してください。",
    });
    return true;
  }

  if (isEntryWorkflowDomainError(error)) {
    return sendEntryWorkflowError(reply, error.code);
  }

  if (error instanceof Error && error.message === INVALID_CLASSIFICATION_ASSIGNMENT_ERROR) {
    sendFormError(reply, {
      code: "invalid_classification_assignment",
      error: "Invalid request payload",
      message: "タグまたは補助ラベルの選択内容を確認してください。",
    });
    return true;
  }

  if (error instanceof Error && isForeignKeyError(error)) {
    sendEntryWorkflowError(reply, "invalid_reference");
    return true;
  }

  return false;
}

export function handleActualEntryRouteError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    sendFormError(reply, {
      code: "invalid_payload",
      error: "Invalid request payload",
      message: getFriendlyValidationMessage(error) ?? "入力内容を確認してください。",
    });
    return true;
  }

  if (isEntryWorkflowDomainError(error)) {
    return sendEntryWorkflowError(reply, error.code);
  }

  if (error instanceof Error && error.message === INVALID_CLASSIFICATION_ASSIGNMENT_ERROR) {
    sendFormError(reply, {
      code: "invalid_classification_assignment",
      error: "Invalid request payload",
      message: "タグまたは補助ラベルの選択内容を確認してください。",
    });
    return true;
  }

  if (error instanceof Error && isForeignKeyError(error)) {
    sendEntryWorkflowError(reply, "invalid_reference");
    return true;
  }

  return false;
}

export function handleFundRouteError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    reply.code(400).send({
      error: "Invalid request payload",
      message: "入力内容を確認してください。",
    });
    return true;
  }

  if (error instanceof Error && error.message === FUND_NOT_FOUND_ERROR) {
    reply.code(404).send({
      code: "fund_not_found",
      error: FUND_NOT_FOUND_ERROR,
      message: "対象の予算が見つかりません。",
    });
    return true;
  }

  if (error instanceof Error && error.message === INVALID_CATEGORY_UPDATE_ERROR) {
    sendFormError(reply, {
      code: "invalid_category_reference",
      error: "Invalid request payload",
      message: "編集対象の費目IDを確認してください。",
    });
    return true;
  }

  if (error instanceof Error && error.message === INVALID_CLASSIFICATION_ASSIGNMENT_ERROR) {
    sendFormError(reply, {
      code: "invalid_classification_assignment",
      error: "Invalid request payload",
      message: "タグまたは補助ラベルの選択内容を確認してください。",
    });
    return true;
  }

  if (error instanceof Error && error.message === CATEGORY_HAS_LINKED_ENTRIES_ERROR) {
    reply.code(409).send({
      code: "category_has_entries",
      error: CATEGORY_HAS_LINKED_ENTRIES_ERROR,
      message: "計画項目または精算項目がある費目は削除できません。",
    });
    return true;
  }

  return false;
}
