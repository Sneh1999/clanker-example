"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { base } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Clanker MVP Example",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "demo",
  chains: [base],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
  },
  ssr: false,
});
