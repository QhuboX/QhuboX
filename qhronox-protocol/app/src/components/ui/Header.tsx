"use client";

import Image from "next/image";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { Tab } from "@/app/page";

const TABS: { id: Tab; label: string }[] = [
  { id: "stake",      label: "Stake" },
  { id: "qvaultx",   label: "QvaultX" },
  { id: "governance",label: "Governance" },
  { id: "access",    label: "Premium" },
];

interface Props {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
}

export default function Header({ activeTab, setActiveTab }: Props) {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);

  const shortAddr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <header style={{
      position: "sticky",
      top: 0,
      zIndex: 50,
      borderBottom: "0.5px solid rgba(255,255,255,0.06)",
      background: "rgba(8,12,20,0.97)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    }}>
      <div style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}>

        {/* ── Logo ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div style={{ position: "relative", width: "34px", height: "34px", borderRadius: "8px", overflow: "hidden", flexShrink: 0 }}>
            <Image
              src="/qhronox-logo.png"
              alt="QhronoX Protocol"
              fill
              style={{ objectFit: "contain" }}
              priority
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{
              fontSize: "15px",
              fontWeight: 800,
              color: "white",
              letterSpacing: "-0.3px",
              lineHeight: "1.2",
              display: "block",
            }}>
              QhronoX{" "}
              <span style={{ color: "#b8a96a" }}>Protocol</span>
            </span>
            <span style={{
              fontSize: "8px",
              fontFamily: "monospace",
              color: "rgba(255,255,255,0.22)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              lineHeight: "1",
              marginTop: "5px",
              display: "block",
            }}>
              Where time becomes value
            </span>
          </div>
        </div>

        {/* ── Nav desktop ── */}
        <nav style={{
          display: "flex",
          gap: "2px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: "10px",
          padding: "3px",
          border: "0.5px solid rgba(255,255,255,0.07)",
          flexWrap: "nowrap",
        }}
          className="nav-desktop"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "6px 14px",
                borderRadius: "7px",
                fontSize: "12px",
                fontWeight: activeTab === tab.id ? 700 : 500,
                background: activeTab === tab.id ? "#b8a96a" : "transparent",
                color: activeTab === tab.id ? "#000" : "rgba(255,255,255,0.4)",
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ── Right: network + wallet ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {/* Network badge — hidden on small screens */}
          <div
            className="net-badge"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              borderRadius: "20px",
              border: "0.5px solid rgba(255,255,255,0.1)",
              padding: "5px 10px",
            }}
          >
            <span style={{
              width: "6px", height: "6px",
              borderRadius: "50%",
              background: "#b8a96a",
              animation: "pulse 2s infinite",
              display: "inline-block",
            }} />
            <span style={{
              fontFamily: "monospace",
              fontSize: "9px",
              fontWeight: 700,
              color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}>
              Solana
            </span>
          </div>

          {/* Wallet button */}
          {connected && shortAddr ? (
            <button
              onClick={disconnect}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderRadius: "8px",
                border: "0.5px solid rgba(184,169,106,0.4)",
                background: "rgba(184,169,106,0.1)",
                padding: "7px 12px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#b8a96a",
                cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#b8a96a", display: "inline-block" }} />
              {shortAddr}
            </button>
          ) : (
            <button
              onClick={() => setVisible(true)}
              style={{
                borderRadius: "8px",
                background: "#b8a96a",
                padding: "7px 14px",
                fontSize: "12px",
                fontWeight: 700,
                color: "#000",
                border: "none",
                cursor: "pointer",
                transition: "opacity 0.15s",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              Connect Wallet
            </button>
          )}

          {/* Hamburger — mobile only */}
          <button
            className="hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              display: "none",
              background: "transparent",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: "7px",
              padding: "6px 8px",
              cursor: "pointer",
              color: "rgba(255,255,255,0.5)",
              fontSize: "16px",
              lineHeight: 1,
              fontFamily: "inherit",
            }}
            aria-label="Menu"
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* ── Mobile nav dropdown ── */}
      {menuOpen && (
        <div
          className="mobile-nav"
          style={{
            display: "none",
            flexDirection: "column",
            gap: "4px",
            padding: "10px 16px 14px",
            borderTop: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setMenuOpen(false); }}
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: activeTab === tab.id ? 700 : 500,
                background: activeTab === tab.id ? "#b8a96a" : "rgba(255,255,255,0.04)",
                color: activeTab === tab.id ? "#000" : "rgba(255,255,255,0.5)",
                border: "0.5px solid rgba(255,255,255,0.07)",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .hamburger   { display: block !important; }
          .mobile-nav  { display: flex !important; }
          .net-badge   { display: none !important; }
        }
        @media (max-width: 480px) {
          .hamburger { display: block !important; }
        }
      `}</style>
    </header>
  );
}