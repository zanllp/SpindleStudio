// Extract a human-readable message from an axios/unknown error.
// Handles AggregateError (e.g. Windows ETIMEDOUT) where .message is empty
// and the real reason lives in .errors[].
export function extractErrorMessage(error: any, fallback = 'unknown error'): string {
  return (
    error?.response?.data?.error?.message ||
    (typeof error?.response?.data?.error === 'string' ? error.response.data.error : '') ||
    error?.message ||
    error?.errors?.[0]?.message ||
    error?.code ||
    fallback
  )
}
