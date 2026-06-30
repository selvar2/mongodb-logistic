import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { GlowMain } from "@/components/GlowMain";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ResilioChain — Supply-Chain Disruption AI",
  description: "Agentic supply-chain disruption response on MongoDB Atlas + LangGraph + Bedrock.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <div className="flex min-h-screen">
          <Nav />
          <GlowMain>{children}</GlowMain>
        </div>
      </body>
    </html>
  );
}
