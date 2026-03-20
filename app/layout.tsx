'use client'
// app/layout.tsx
// 根布局：包裹 WagmiProvider，注入全局样式

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '../lib/wagmi'
import { BottomNav } from './components/BottomNav'
import './globals.css'
import type React from 'react'

const queryClient = new QueryClient()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className="dark">
      <body className="bg-[#0d1117] text-white min-h-screen font-sans antialiased">
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            {/* 最大宽度 430px，模拟手机屏幕宽度，居中显示 */}
            <main className="max-w-[430px] mx-auto min-h-screen pb-20">
              {children}
            </main>
            <BottomNav />
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  )
}
