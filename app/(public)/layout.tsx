'use client';

/**
 * Shared layout for login and gallery. Keeps the same background mounted
 * when switching between /login and /gallery so the screen does not blink.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Shared background – same on login and gallery, stays mounted on navigation */}
      <div
        className="absolute inset-0 min-h-full bg-cover bg-center bg-no-repeat -z-10 md:hidden"
        style={{
          backgroundImage: 'url(/mobile-bg.png), linear-gradient(165deg, rgba(72, 164, 127, 0.28) 0%, rgba(13, 148, 136, 0.2) 40%, rgba(45, 212, 191, 0.14) 100%)',
        }}
      />
      <div
        className="absolute inset-0 min-h-full bg-cover bg-center bg-no-repeat -z-10 hidden md:block"
        style={{
          backgroundImage: 'url(/desktop-bg.png), linear-gradient(165deg, rgba(72, 164, 127, 0.28) 0%, rgba(13, 148, 136, 0.2) 40%, rgba(45, 212, 191, 0.14) 100%)',
        }}
      />
      {children}
    </div>
  );
}
