import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voice Compliance Agent — AI proposes · Rules verify · Voice executes",
  description:
    "Customer Experience Committee + Compliance Governor: listening agents propose responses, a deterministic rules engine approves or rejects them, TTS executes the compliant script. Counterfactual memory and post-call learning included.",
  keywords: ["voice agent", "compliance", "AI governance", "call center", "deterministic rules engine", "counterfactual memory"],
  authors: [{ name: "Voice Compliance Agent" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Voice Compliance Agent",
    description: "AI proposes. Rules verify. Voice executes.",
    siteName: "Voice Compliance Agent",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
