import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Space_Mono, Syne } from "next/font/google";

import { WalletContextProvider } from "@/lib/wallet-provider";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "500", "600", "700", "800"],
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "QhronoX Protocol — Where time becomes value",
  description:
    "QhronoX Protocol: Real yield ecosystem participation on Solana. Stake QHUBX tokens and earn 70% of all transaction fees. Powered by Token-2022 transfer fee mechanics.",
  keywords: ["QhronoX", "QHUBX", "Solana staking", "real yield", "DeFi", "Token-2022"],
  openGraph: {
    title: "QhronoX Protocol",
    description: "Where time becomes value. Real yield from ecosystem fees.",
    images: ["/qhronox-logo.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QhronoX Protocol",
    description: "Where time becomes value.",
    images: ["/qhronox-logo.png"],
  },
  icons: {
    icon: "/qhronox-logo.png",
    apple: "/qhronox-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#080c14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${spaceMono.variable}`}>
      <body className={`${syne.variable} ${spaceMono.variable} bg-[#080c14] text-white antialiased`}>
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
