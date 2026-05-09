import { handleStaticDemoRequest } from "../demo/staticDemoApi";
import { isStaticDemoMode } from "../demo/staticDemoMode";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (isStaticDemoMode()) {
    return handleStaticDemoRequest(path, init);
  }

  return fetch(path, init);
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
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
      status: number;
      data: unknown;
    };

async function readJsonResponse<T>(response: Response): Promise<ApiMutationResult<T>> {
  const data = (await response.json()) as T;

  if (response.ok) {
    return {
      ok: true,
      data,
    };
  }

  return {
    ok: false,
    status: response.status,
    data,
  };
}

export async function apiPostJson<TRequest, TResponse>(
  path: string,
  body: TRequest,
): Promise<ApiMutationResult<TResponse>> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return readJsonResponse<TResponse>(response);
}

export async function apiPostFile<TResponse>(path: string, file: File): Promise<ApiMutationResult<TResponse>> {
  if (isStaticDemoMode()) {
    return {
      ok: false,
      status: 400,
      data: {
        error: {
          message: "静的デモではworkbookの読み書きは利用できません。",
        },
      },
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
