'use client'
// app/components/BottomNav.tsx

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getWallets } from '../../lib/db'

const TABS = [
  {
    href: '/txs',
    label: '交易',
    needsWallets: true,
    icon: (color: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 16V4m0 0L3 8m4-4l4 4" />
        <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    href: '/summary',
    label: '账单',
    needsWallets: true,
    icon: (color: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="12" y2="17" />
      </svg>
    ),
  },
  {
    href: '/wallets',
    label: '钱包',
    needsWallets: false,
    icon: (color: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12V8H6a2 2 0 100-4h12v4" />
        <rect x="2" y="8" width="20" height="12" rx="2" />
        <circle cx="17" cy="14" r="1.5" fill={color} stroke="none" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [hasWallets, setHasWallets] = useState(false)
  const [toast, setToast] = useState(false)

  async function checkWallets() {
    const list = await getWallets()
    setHasWallets(list.length > 0)
  }

  useEffect(() => {
    checkWallets()
    const handler = () => checkWallets()
    window.addEventListener('wallets-updated', handler)
    return () => window.removeEventListener('wallets-updated', handler)
  }, [])

  function handleTabClick(tab: typeof TABS[number]) {
    if (tab.needsWallets && !hasWallets) {
      setToast(true)
      setTimeout(() => setToast(false), 2000)
      return
    }
    router.push(tab.href)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Toast 提示 */}
      {toast && (
        <div className="max-w-[430px] mx-auto px-4 pb-2 pointer-events-none">
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-2.5 text-center
                          text-[13px] text-[#888] shadow-lg">
            请先在「钱包」页添加钱包
          </div>
        </div>
      )}

      <div
        className="max-w-[430px] mx-auto bg-[#010409]"
        style={{ borderTop: '0.5px solid #21262d', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-[60px]">
          {TABS.map(tab => {
            const active = pathname === tab.href
            const disabled = tab.needsWallets && !hasWallets
            const color = disabled ? '#21262d' : active ? '#60A5FA' : '#8b949e'
            return (
              <button
                key={tab.href}
                onClick={() => handleTabClick(tab)}
                className="flex-1 flex flex-col items-center justify-center gap-0.5"
              >
                {tab.icon(color)}
                <span style={{ fontSize: 11, color, lineHeight: 1.2 }}>
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
