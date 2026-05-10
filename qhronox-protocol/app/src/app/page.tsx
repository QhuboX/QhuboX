"use client";

import { useState } from "react";
import Header from "@/components/ui/Header";
import TickerBar from "@/components/ui/TickerBar";
import KPIGrid from "@/components/ui/KPIGrid";
import StakingPanel from "@/components/staking/StakingPanel";
import QvaultX from "@/components/vault/QvaultX";
import GovernancePanel from "@/components/governance/GovernancePanel";
import PremiumAccess from "@/components/access/PremiumAccess";
import TransactionHistory from "@/components/staking/TransactionHistory";
import RewardHourglass from "@/components/ui/RewardHourglass";

export type Tab = "stake" | "qvaultx" | "governance" | "access";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("stake");

  return (
    <div className="flex min-h-screen flex-col bg-[#080c14]">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 py-6 flex flex-col gap-5">
        <TickerBar />
        <KPIGrid />

        {activeTab === "stake" && (
          <>
            <StakingPanel />
            <TransactionHistory />
          </>
        )}

        {activeTab === "qvaultx" && <QvaultX />}
        {activeTab === "governance" && <GovernancePanel />}
        {activeTab === "access" && <PremiumAccess />}
      </main>

    <footer className="border-t border-white/5 py-8 text-center text-xs text-white/20 relative">
        <div className="font-mono">
          QhronoX Protocol · QvaultX · Solana Mainnet · Token-2022 · © 2026 QhuboX. All rights reserved.
        </div>
        <div className="mt-1 italic text-white/10">
          "QhronoX Protocol: Where time becomes value."
        </div>

        {/* Social Links Container - Fuera de etiquetas <p> para evitar errores */}
        <div className="flex flex-row justify-center items-center gap-6 mt-6 md:fixed md:right-8 md:top-1/2 md:-translate-y-1/2 md:flex-col md:mt-0 z-[9999]">
          
          {/* X (Twitter) */}
          <a 
            href="https://x.com/qhuboxecosystem" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-white hover:text-cyan-400 transition-all duration-300 transform hover:scale-125"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>

          {/* Discord */}
          <a 
            href="https://discord.gg/JhuHNFCRqd" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-white hover:text-[#5865F2] transition-all duration-300 transform hover:scale-125"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" />
            </svg>
          </a>

          {/* Instagram */}
          <a 
            href="https://www.instagram.com/qhubox/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-white hover:text-[#E1306C] transition-all duration-300 transform hover:scale-125"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058z" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
}