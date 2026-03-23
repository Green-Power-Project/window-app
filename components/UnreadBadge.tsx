'use client';

/** Small numeric badge for unread counts (chat, folders, totals). */
export default function UnreadBadge({
  count,
  className = '',
  size = 'md',
  variant = 'folder',
}: {
  count: number;
  className?: string;
  size?: 'sm' | 'md';
  /** `folder` vs `chat` kept for semantics; both use red for unread counts. */
  variant?: 'folder' | 'chat';
}) {
  if (count <= 0) return null;
  const sizeCls =
    size === 'sm'
      ? 'min-w-[16px] h-4 px-1 text-[10px]'
      : 'min-w-[20px] h-5 px-1.5 text-xs';
  const variantCls =
    variant === 'chat' ? 'bg-red-500 ring-1 ring-white/25' : 'bg-red-500';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-bold leading-none ${variantCls} ${sizeCls} ${className}`}
      aria-label={String(count)}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
