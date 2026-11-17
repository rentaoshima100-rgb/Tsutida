import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ツチダ映像 DVD・Blu-ray ネット注文",
    template: "%s｜ツチダ映像 DVD・Blu-ray ネット注文",
  },
  description: "ツチダ映像が撮影した、幼稚園・保育園・こども園と小学校の行事のDVD・Blu-rayを注文できるサイトです。",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#23417a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
