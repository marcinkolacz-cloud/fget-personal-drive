/**
 * Formats a backend Time (bigint nanoseconds) into a readable English date/time string
 */
export function formatTime(time: bigint | undefined): string {
  if (time === undefined || time === null) {
    return "Unknown";
  }

  try {
    // Convert nanoseconds to milliseconds
    const milliseconds = Number(time / 1_000_000n);
    const date = new Date(milliseconds);

    // Check if date is valid
    if (Number.isNaN(date.getTime())) {
      return "Invalid date";
    }

    // Format using Intl.DateTimeFormat for consistent English output
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch (_error) {
    return "Invalid date";
  }
}

/**
 * Formats a backend Time into a compact date string (no time)
 */
export function formatDate(time: bigint | undefined): string {
  if (time === undefined || time === null) {
    return "Unknown";
  }

  try {
    const milliseconds = Number(time / 1_000_000n);
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      return "Invalid date";
    }

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch (_error) {
    return "Invalid date";
  }
}

/**
 * Formats a backend Time into a compact timestamp with date and time (hour:minute)
 * Uses 24-hour time format and 2-digit year
 * Example: "Feb 9, 26, 14:30"
 */
export function formatCompactTimestamp(time: bigint | undefined): string {
  if (time === undefined || time === null) {
    return "Unknown";
  }

  try {
    const milliseconds = Number(time / 1_000_000n);
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      return "Invalid date";
    }

    return new Intl.DateTimeFormat("en-US", {
      year: "2-digit",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch (_error) {
    return "Invalid date";
  }
}
