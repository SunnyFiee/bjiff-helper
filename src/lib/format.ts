const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  weekday: "short"
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

export function formatDateLabel(dateText: string) {
  return dateFormatter.format(new Date(`${dateText}T00:00:00`));
}

export function formatDateTimeLabel(dateTime: string) {
  const value = new Date(dateTime);
  return `${dateFormatter.format(value)} ${timeFormatter.format(value)}`;
}

export function formatTimeLabel(dateTime: string) {
  return timeFormatter.format(new Date(dateTime));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDuration(minutes: number) {
  if (!minutes) {
    return "时长待定";
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) {
    return `${remaining} 分钟`;
  }
  if (!remaining) {
    return `${hours} 小时`;
  }
  return `${hours} 小时 ${remaining} 分钟`;
}

