'use client'
// app/wallets/page.tsx

import { useAccount, useConnect } from 'wagmi'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getWallets,
  addWallet,
  removeWallet,
  updateWalletLabel,
  updateWalletEnabled,
  type WalletInfo,
} from '../../lib/db'

function notifyWalletsUpdated() {
  window.dispatchEvent(new Event('wallets-updated'))
}

const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

export default function WalletsPage() {
  const router = useRouter()
  const { address: connectedAddress, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()

  const [mounted, setMounted] = useState(false)
  const [wallets, setWallets] = useState<WalletInfo[]>([])
  // 只有在空状态页主动点击连接时，连接成功后才自动跳转
  const [onboarding, setOnboarding] = useState(false)

  // 添加钱包表单
  const [showManualForm, setShowManualForm] = useState(false)
  const [inputAddr, setInputAddr] = useState('')
  const [inputLabel, setInputLabel] = useState('')
  const [error, setError] = useState('')

  // 编辑标签
  const [editingAddr, setEditingAddr] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')

  useEffect(() => {
    setMounted(true)
    loadWallets()
  }, [])

  // 仅在 onboarding 模式下，连接成功后自动添加并跳转
  useEffect(() => {
    if (!onboarding || !isConnected || !connectedAddress) return
    addWallet(connectedAddress, '').then(() => {
      notifyWalletsUpdated()
      router.push('/txs')
    })
  }, [onboarding, isConnected, connectedAddress, router])

  async function loadWallets() {
    const list = await getWallets()
    setWallets(list)
  }

  function isValidAddress(addr: string) {
    return /^0x[0-9a-fA-F]{40}$/.test(addr.trim())
  }

  async function handleAddManual() {
    const addr = inputAddr.trim()
    if (!isValidAddress(addr)) {
      setError('请输入有效的以太坊地址（0x 开头，42 位）')
      return
    }
    setError('')
    await addWallet(addr, inputLabel.trim())
    notifyWalletsUpdated()
    setInputAddr('')
    setInputLabel('')
    setShowManualForm(false)
    await loadWallets()
    router.push('/txs')
  }

  async function handleRemove(address: string) {
    await removeWallet(address)
    notifyWalletsUpdated()
    await loadWallets()
  }

  async function handleSaveLabel(address: string) {
    await updateWalletLabel(address, editLabel)
    setEditingAddr(null)
    await loadWallets()
  }

  async function handleToggleEnabled(address: string, enabled: boolean) {
    await updateWalletEnabled(address, enabled)
    await loadWallets()
  }

  if (!mounted) return null

  const connectedLower = connectedAddress?.toLowerCase()
  const enabledCount = wallets.filter(w => w.enabled !== false).length

  // ── 状态 A：没有钱包 ─────────────────────────────────────────
  if (wallets.length === 0) {
    const mmConnector = connectors.find(c =>
      c.id === 'injected' || c.name.toLowerCase().includes('metamask') || c.name.toLowerCase().includes('injected')
    )
    const wcConnector = connectors.find(c => c.name.toLowerCase().includes('walletconnect'))

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 pb-20">

        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-14 h-14 bg-[#1d2d50] rounded-2xl flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-3xl font-medium tracking-tight text-white mb-2">fold</h1>
          <p className="text-[#666] text-sm text-center leading-relaxed">把混乱折成清晰</p>
        </div>

        {/* 连接按钮 */}
        <div className="w-full flex flex-col gap-3 mb-4">
          {mmConnector && (
            <button
              onClick={() => { setOnboarding(true); connect({ connector: mmConnector }) }}
              disabled={isPending}
              className="w-full py-4 bg-[#3B82F6] hover:bg-[#2563EB] active:scale-[0.98]
                         rounded-lg text-white font-medium text-base transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? '连接中…' : '连接 MetaMask'}
            </button>
          )}
          {wcConnector && (
            <button
              onClick={() => { setOnboarding(true); connect({ connector: wcConnector }) }}
              disabled={isPending}
              className="w-full py-4 bg-[#1d2d50] border border-[#3B82F6] hover:bg-[#1d2d50]
                         rounded-lg text-[#60A5FA] font-medium text-base transition-all
                         disabled:opacity-50"
            >
              {isPending ? '连接中…' : 'WalletConnect'}
            </button>
          )}
          {/* 其他连接器 */}
          {connectors
            .filter(c => c !== mmConnector && c !== wcConnector)
            .map(c => (
              <button
                key={c.uid}
                onClick={() => { setOnboarding(true); connect({ connector: c }) }}
                disabled={isPending}
                className="w-full py-4 bg-[#161b22] border border-[#21262d] hover:border-[#8b949e]
                           rounded-lg text-[#888] font-medium text-base transition-all
                           disabled:opacity-50"
              >
                {isPending ? '连接中…' : c.name}
              </button>
            ))}
        </div>

        {/* 手动输入分隔 */}
        <button
          onClick={() => setShowManualForm(v => !v)}
          className="text-[13px] text-[#8b949e] hover:text-[#888] transition-colors mb-3"
        >
          {showManualForm ? '收起' : '手动输入地址 →'}
        </button>

        {showManualForm && (
          <div className="w-full flex flex-col gap-2 mb-4">
            <input
              value={inputAddr}
              onChange={e => { setInputAddr(e.target.value); setError('') }}
              placeholder="0x... 钱包地址"
              className="w-full bg-[#161b22] border border-[#21262d] rounded-lg
                         text-sm text-[#ccc] placeholder:text-[#6e7681]
                         px-3 py-3 focus:outline-none focus:border-[#3B82F6] font-mono"
            />
            <div className="flex gap-2">
              <input
                value={inputLabel}
                onChange={e => setInputLabel(e.target.value)}
                placeholder="备注（可选）"
                className="flex-1 bg-[#161b22] border border-[#21262d] rounded-lg
                           text-sm text-[#ccc] placeholder:text-[#6e7681]
                           px-3 py-2 focus:outline-none focus:border-[#3B82F6]"
              />
              <button
                onClick={handleAddManual}
                className="px-5 py-2 bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg
                           text-white text-sm font-medium transition-all"
              >
                添加
              </button>
            </div>
            {error && <p className="text-xs text-[#f85149]">{error}</p>}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-[#6e7681]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="#6e7681" strokeWidth="1" />
            <path d="M6 4v3M6 8.5v.5" stroke="#6e7681" strokeWidth="1" strokeLinecap="round" />
          </svg>
          <p>仅读取权限，不操作资产</p>
        </div>
      </div>
    )
  }

  // ── 状态 B：已有钱包 ─────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen pb-24">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <span className="text-xl font-medium text-white">我的钱包</span>
        <button
          onClick={() => setShowManualForm(v => !v)}
          className="text-sm text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
        >
          {showManualForm ? '收起' : '+ 添加钱包'}
        </button>
      </div>

      <div className="flex-1 px-4 flex flex-col gap-3">

        {/* 添加表单（折叠） */}
        {showManualForm && (
          <div className="bg-[#161b22] rounded-lg p-4 flex flex-col gap-3">
            {/* 连接钱包按钮（当前未连接时显示） */}
            {!isConnected && connectors.slice(0, 2).map(c => (
              <button
                key={c.uid}
                onClick={() => connect({ connector: c })}
                disabled={isPending}
                className="w-full py-3 bg-[#1d2d50] border border-[#3B82F6] rounded-lg
                           text-[#60A5FA] text-sm font-medium hover:bg-[#1d2d50] transition-all
                           disabled:opacity-50"
              >
                {isPending ? '连接中…' : `连接 ${c.name}`}
              </button>
            ))}
            {/* 已连接但未添加 */}
            {isConnected && connectedAddress && !wallets.some(w => w.address === connectedLower) && (
              <button
                onClick={async () => {
                  await addWallet(connectedAddress, '')
                  notifyWalletsUpdated()
                  await loadWallets()
                }}
                className="w-full py-3 bg-[#1d2d50] border border-[#3B82F6] rounded-lg
                           text-[#60A5FA] text-sm font-medium hover:bg-[#1d2d50] transition-all"
              >
                添加已连接钱包 · {shortAddr(connectedAddress)}
              </button>
            )}
            {/* 手动输入 */}
            <input
              value={inputAddr}
              onChange={e => { setInputAddr(e.target.value); setError('') }}
              placeholder="0x... 手动输入地址"
              className="w-full bg-[#0d1117] border border-[#21262d] rounded-lg
                         text-sm text-[#ccc] placeholder:text-[#6e7681]
                         px-3 py-3 focus:outline-none focus:border-[#3B82F6] font-mono"
            />
            <div className="flex gap-2">
              <input
                value={inputLabel}
                onChange={e => setInputLabel(e.target.value)}
                placeholder="备注（可选）"
                className="flex-1 bg-[#0d1117] border border-[#21262d] rounded-lg
                           text-sm text-[#ccc] placeholder:text-[#6e7681]
                           px-3 py-2 focus:outline-none focus:border-[#3B82F6]"
              />
              <button
                onClick={handleAddManual}
                className="px-5 py-2 bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg
                           text-white text-sm font-medium transition-all"
              >
                添加
              </button>
            </div>
            {error && <p className="text-xs text-[#f85149]">{error}</p>}
          </div>
        )}

        {/* 钱包列表 */}
        <div className="flex flex-col gap-2">
          {wallets.map(w => (
            <div
              key={w.address}
              className="bg-[#161b22] rounded-lg px-4 py-3 flex items-center gap-3"
            >
              <input
                type="checkbox"
                checked={w.enabled !== false}
                onChange={e => handleToggleEnabled(w.address, e.target.checked)}
                className="w-4 h-4 flex-shrink-0 cursor-pointer accent-[#3B82F6]"
              />

              <div className="flex-1 min-w-0">
                {editingAddr === w.address ? (
                  <div className="flex gap-2 items-center">
                    <input
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      autoFocus
                      className="flex-1 bg-[#0d1117] border border-[#3B82F6] rounded-lg
                                 text-sm text-[#ccc] px-2 py-1 focus:outline-none"
                    />
                    <button onClick={() => handleSaveLabel(w.address)} className="text-xs text-[#3B82F6] px-2 py-1">✓</button>
                    <button onClick={() => setEditingAddr(null)} className="text-xs text-[#8b949e] px-1 py-1">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingAddr(w.address); setEditLabel(w.label) }}
                    className="text-left w-full"
                  >
                    {w.label && <p className="text-sm text-[#ddd]">{w.label}</p>}
                    <p className={`font-mono ${w.label ? 'text-xs text-[#8b949e]' : 'text-sm text-[#888]'}`}>
                      {shortAddr(w.address)}
                      {w.address === connectedLower && (
                        <span className="ml-2 text-[10px] text-[#3fb950]">● 已连接</span>
                      )}
                    </p>
                  </button>
                )}
              </div>

              <button
                onClick={() => handleRemove(w.address)}
                className="text-xs text-[#f85149] hover:text-[#ff8888] transition-colors px-2 py-1"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 底部 CTA */}
      <div className="fixed bottom-[60px] left-0 right-0 max-w-[430px] mx-auto px-4 pb-3 pt-3 bg-black/90 backdrop-blur-sm">
        <button
          onClick={() => router.push('/txs')}
          className="w-full py-3.5 bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg
                     text-white text-sm font-medium transition-all"
        >
          查看 {enabledCount} 个钱包的交易 →
        </button>
      </div>
    </div>
  )
}
