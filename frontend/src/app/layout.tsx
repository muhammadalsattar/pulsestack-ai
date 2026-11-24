import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseStack AI — Multi-Tenant AI Workspace SaaS",
  description:
    "Streaming AI playground, real-time token & cost metering, scoped API keys, and Stripe subscription billing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-0 font-sans text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
