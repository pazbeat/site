import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "../globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Админка · Imbir Thai Spa",
  robots: { index: false, follow: false },
};

// Админка вне i18n; данные всегда свежие
export const dynamic = "force-dynamic";

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${montserrat.variable} h-full`}>
      <body className="min-h-full bg-brand-purple-50/40 font-sans text-brand-purple-950 antialiased">
        {children}
      </body>
    </html>
  );
}
