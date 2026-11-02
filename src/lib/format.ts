const DAY_MS = 24 * 60 * 60 * 1000;

/** 1 -> "1 ngày", 45 -> "1,5 tháng", 400 -> "1,1 năm" */
export function formatInterval(days: number): string {
  if (days < 1) return "hôm nay";
  if (days < 30) return `${days} ngày`;
  const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  if (days < 365) return `${fmt(days / 30)} tháng`;
  return `${fmt(days / 365)} năm`;
}

/** Thời gian đến lần ôn tiếp theo, dạng ngắn gọn. */
export function formatDue(dueAt: string, now: Date = new Date()): string {
  const diff = new Date(dueAt).getTime() - now.getTime();
  if (diff <= 0) return "Đến hạn";
  return `Sau ${formatInterval(Math.ceil(diff / DAY_MS))}`;
}
