import { handleStaticDemoRequest } from "../demo/staticDemoApi";
import { isStaticDemoMode } from "../demo/staticDemoMode";
import type { ApiErrorResponse } from "../contracts/apiError";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isApiErrorResponse(payload: unknown): payload is ApiErrorResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as ApiErrorResponse).code === "string" &&
    (payload as ApiErrorResponse).code.length > 0 &&
    typeof (payload as ApiErrorResponse).message === "string" &&
    (payload as ApiErrorResponse).message.length > 0
  );
}

export async function parseApiError(response: Pick<Response, "json" | "status">): Promise<ApiError> {
  try {
    const payload: unknown = await response.json();
    if (isApiErrorResponse(payload)) {
      return new ApiError(response.status, payload.code, payload.message);
    }
  } catch {
    // Fall through to the non-sensitive fallback when the body is not valid JSON.
  }

  return new ApiError(response.status, "unknown_error", `Request failed: ${response.status}`);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (isStaticDemoMode()) {
    return handleStaticDemoRequest(path, init);
  }

  return fetch(path, init);
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw await parseApiError(response);
  }
  return response.json() as Promise<T>;
}

export type ApiMutationResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: ApiError;
    };

type ApiMutationMethod = "DELETE" | "POST" | "PUT";

async function readJsonResponse<T>(response: Response): Promise<ApiMutationResult<T>> {
  if (response.ok) {
    return {
      ok: true,
      data: (await response.json()) as T,
    };
  }

  return {
    ok: false,
    error: await parseApiError(response),
  };
}

export async function apiPostJson<TRequest, TResponse>(
  path: string,
  body: TRequest,
): Promise<ApiMutationResult<TResponse>> {
  return apiMutateJson<TResponse, TRequest>(path, "POST", body);
}

export async function apiMutateJson<TResponse, TRequest = unknown>(
  path: string,
  method: ApiMutationMethod,
  body?: TRequest,
): Promise<ApiMutationResult<TResponse>> {
  const response = await apiFetch(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });

  return readJsonResponse<TResponse>(response);
}

export async function apiPostFile<TResponse>(path: string, file: File): Promise<ApiMutationResult<TResponse>> {
  if (isStaticDemoMode()) {
    return {
      ok: false,
      error: new ApiError(
        400,
        "static_demo_workbook_unavailable",
        "静的デモではworkbookの読み書きは利用できません。",
      ),
    };
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-workbook-filename": file.name,
    },
    body: file,
  });

  return readJsonResponse<TResponse>(response);
}
