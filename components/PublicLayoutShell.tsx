'use client';

/**
 * Shared background shell for public marketing pages (login, gallery, offer, catalogue).
 * Extracted so routes outside the (public) group can reuse it without changing URLs.
 */
export default function PublicLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative">
      <div
        className="absolute inset-0 min-h-full bg-cover bg-center bg-no-repeat -z-10 md:hidden"
        style={{
          backgroundImage:
            'url(/mobile-bg.png), linear-gradient(165deg, rgba(72, 164, 127, 0.28) 0%, rgba(13, 148, 136, 0.2) 40%, rgba(45, 212, 191, 0.14) 100%)',
        }}
      />
      <div
        className="absolute inset-0 min-h-full bg-cover bg-center bg-no-repeat -z-10 hidden md:block"
        style={{
          backgroundImage:
            'url(/desktop-bg.png), linear-gradient(165deg, rgba(72, 164, 127, 0.28) 0%, rgba(13, 148, 136, 0.2) 40%, rgba(45, 212, 191, 0.14) 100%)',
        }}
      />
      {children}
    </div>
  );
}
