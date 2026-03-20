// lib/wagmi.ts
// wagmi + WalletConnect 配置，支持 Ethereum 主网和 Arbitrum

import { createConfig, http } from 'wagmi'
import { mainnet, arbitrum } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_ID

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum],
  connectors: [
    injected(), // MetaMask 等浏览器钱包
    ...(projectId ? [walletConnect({ projectId })] : []), // WalletConnect 二维码（可选）
  ],
  transports: {
    [mainnet.id]:  http(`https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_KEY}`),
    [arbitrum.id]: http(`https://arb-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_KEY}`),
  },
})
