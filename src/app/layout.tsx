import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ilm AI — Your ideas, made intelligent",
  description: "A thoughtful AI workspace for students and teachers. Learn, create, and explore with your favourite AI models.",
  applicationName: "Ilm AI"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}