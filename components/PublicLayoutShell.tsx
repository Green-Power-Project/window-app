'use client';

/**
 * Login / public routes: full-viewport backdrop. Same asset + img technique as dashboard hero.
 */
export default function PublicLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen min-h-[100dvh] flex-col">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#14532d]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static public asset */}
        <img
          src="/desktop-bg.png"
          alt=""
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full min-h-[100dvh] object-cover object-center"
          loading="eager"
          fetchPriority="high"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(165deg, rgba(72, 164, 127, 0.14) 0%, rgba(13, 148, 136, 0.1) 45%, rgba(0,0,0,0.12) 100%)',
          }}
          aria-hidden
        />
      </div>
      <div className="relative z-10 flex min-h-screen min-h-[100dvh] flex-1 flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
