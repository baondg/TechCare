import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse fetch/apiClient Error message (often JSON body as string). */
export function getReadableApiError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Something went wrong. Please try again.";
  }

  const raw = String(error.message || "").trim();
  if (!raw) return "Something went wrong. Please try again.";

  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    if (parsed?.message) return parsed.message;
    if (parsed?.error) return parsed.error;
  } catch {
    // Non-JSON message, continue below.
  }

  if (raw.toLowerCase() === "failed to fetch") {
    return "Không kết nối được tới máy chủ. Hãy kiểm tra backend đang chạy và biến VITE_API_BASE_URL.";
  }

  return raw;
}