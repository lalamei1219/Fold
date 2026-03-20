'use client'
// app/txs/page.tsx
// 交易列表页：核心页面，展示链上交易 + 标签/备注功能

import { useAccount, useChainId, useDisconnect } from 'wagmi'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAllTransactions, fetchAllBalances, detectTag } from '../../lib/alchemy'
import { I18N, loadLocale, saveLocale, type Locale } from '../../lib/i18n'
import {
  getAnnotations,
  saveAnnotation,
  addWallet,
  getWallets,
  getTagConfig,
  TAG_CONFIG,
  type TxTag,
  type WalletInfo,
} from '../../lib/db'
import { toDisplayTx, type DisplayTx } from '../../types'

const ALL_TAGS: TxTag[] = [
  'swap', 'lp', 'staking', 'nft_buy', 'nft_sell',
  'airdrop', 'gas', 'transfer', 'lending', 'income',
]

// 盈亏计算只统计这些主流资产，过滤迷因币/空投的天文数字
const STABLE_WHITELIST = new Set(['ETH', 'USDC', 'USDT', 'WETH', 'DAI', 'WBTC'])

// 金额缩写（USD）
function formatCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}K`
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default function TxsPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { disconnect } = useDisconnect()

  // 全量数据
  const [txs, setTxs] = useState<DisplayTx[]>([])
  const [walletInfos, setWalletInfos] = useState<WalletInfo[]>([])
  const [loading, setLoading] = useState(true)

  // 筛选状态（空 = 全部）
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(new Set())
  const [selectedTag, setSelectedTag] = useState<TxTag | ''>('')
  const [filterHasNote, setFilterHasNote] = useState(false)

  // 详情编辑
  const [selected, setSelected] = useState<DisplayTx | null>(null)
  const [editTag, setEditTag] = useState<TxTag>('')
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)

  // 保存成功 Toast
  const [toast, setToast] = useState<string | null>(null)

  // 余额 & 价格
  const [balances, setBalances] = useState<{ totalUsd: number; tokens: Record<string, number> } | null>(null)
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [ethPrice, setEthPrice] = useState<number>(0)

  const [locale, setLocale] = useState<Locale>('zh')
  useEffect(() => { setLocale(loadLocale()) }, [])
  useEffect(() => { saveLocale(locale) }, [locale])
  const text = I18N[locale]

  useEffect(() => { loadTxs(chainId) }, [chainId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTxs(currentChainId: number) {
    setLoading(true)
    try {
      // 如果有已连接的钱包地址，顺便加入 DB
      if (address) await addWallet(address, '')
      const infos = await getWallets()
      setWalletInfos(infos)

      // 只拉 enabled 的钱包
      const addresses = infos.filter(w => w.enabled !== false).map(w => w.address)
      const rawTxs = await fetchAllTransactions(addresses, currentChainId)
      const hashes = rawTxs.map(t => t.hash)
      const annotations = await getAnnotations(hashes)

      const displayTxs = rawTxs.map(raw => {
        const ann = annotations.get(raw.hash)
        const tag: TxTag = (ann?.tag as TxTag) || detectTag(raw, raw.walletAddress)
        return toDisplayTx(raw, raw.walletAddress, tag, ann?.note ?? '')
      })
      setTxs(displayTxs)

      // 余额 & 价格（不阻塞）
      loadBalances(addresses, currentChainId)
      fetch('/api/prices').then(r => r.json()).then(p => setEthPrice(p.ETH ?? 0)).catch(() => {})
    } catch (e) {
      console.error('加载交易失败', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadBalances(addresses: string[], currentChainId: number) {
    setBalancesLoading(true)
    try {
      setBalances(await fetchAllBalances(addresses, currentChainId))
    } catch (e) {
      console.error('加载余额失败', e)
    } finally {
      setBalancesLoading(false)
    }
  }

  // 派生：经过钱包 + 标签 + 有备注筛选后的交易列表
  const filteredTxs = useMemo(() => {
    let result = txs
    if (selectedWallets.size > 0) {
      result = result.filter(tx => selectedWallets.has(tx.walletAddress))
    }
    if (selectedTag !== '') {
      result = result.filter(tx => tx.tag === selectedTag)
    }
    if (filterHasNote) {
      result = result.filter(tx => tx.note && tx.note.trim().length > 0)
    }
    return result
  }, [txs, selectedWallets, selectedTag, filterHasNote])

  // 派生：资产健康卡数据（基于全量 txs，只统计白名单资产换算 USD）
  const currentMonthStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const monthlyStats = useMemo(() => {
    const now = new Date()
    const monthTxs = txs.filter(tx => {
      const d = new Date(tx.timestamp)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })

    // 只统计白名单资产，换算 USD（防止迷因币/NFT tokenId 产生天文数字）
    function toUsd(tx: DisplayTx): number {
      if (!STABLE_WHITELIST.has(tx.asset)) return 0
      const raw = parseFloat(tx.amountRaw || '0')
      if (!Number.isFinite(raw)) return 0
      if (tx.asset === 'ETH' || tx.asset === 'WETH') return raw * ethPrice
      return raw  // USDC / USDT / DAI ≈ 1 USD
    }

    const income = monthTxs
      .filter(tx => !tx.isOutgoing && (tx.tag === 'income' || tx.tag === 'airdrop'))
      .reduce((s, tx) => s + toUsd(tx), 0)
    const spend = monthTxs
      .filter(tx => tx.isOutgoing && tx.tag !== 'gas')
      .reduce((s, tx) => s + toUsd(tx), 0)
    const gas = monthTxs
      .filter(tx => tx.tag === 'gas')
      .reduce((s, tx) => s + toUsd(tx), 0)
    const pnl = income - spend - gas

    const tagCount: Record<string, number> = {}
    for (const tx of monthTxs) { if (tx.tag) tagCount[tx.tag] = (tagCount[tx.tag] ?? 0) + 1 }
    const topEntry = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0]
    const topTag = topEntry?.[0] as TxTag | undefined
    const topCount = topEntry?.[1] ?? 0
    return { pnl, gas, topTag, topCount }
  }, [txs, ethPrice])

  function openDetail(tx: DisplayTx) {
    setSelected(tx)
    setEditTag(tx.tag)
    setEditNote(tx.note)
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    await saveAnnotation(selected.hash, editTag, editNote)
    setTxs(prev => prev.map(t =>
      t.hash === selected.hash ? { ...t, tag: editTag, note: editNote } : t
    ))
    setSaving(false)
    setSelected(null)
    const label = editTag ? TAG_CONFIG[editTag]?.label ?? editTag : '未分类'
    setToast(`已归类到 ${label} ✓`)
    setTimeout(() => setToast(null), 1500)
  }

  function toggleWalletFilter(addr: string) {
    setSelectedWallets(prev => {
      const next = new Set(prev)
      next.has(addr) ? next.delete(addr) : next.add(addr)
      return next
    })
  }

  const enabledWallets = walletInfos.filter(w => w.enabled !== false)

  return (
    <div className="flex flex-col min-h-screen">
      {/* 保存成功 Toast */}
      {toast && (
        <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="bg-[#0d2a1a] border border-[#2a6a3a] text-[#3fb950] text-[13px] font-medium
                          px-4 py-2.5 rounded-lg shadow-lg animate-[fadeSlideIn_0.2s_ease]">
            {toast}
          </div>
        </div>
      )}

      {/* 顶部导航 */}
      <div className="px-4 pt-5 pb-3">
        <span className="text-xl font-medium text-white tracking-tight">交易记录</span>
        <p className="text-[11px] text-[#8b949e] mt-0.5">
          {selectedWallets.size === 0 ? '全部钱包' : `${selectedWallets.size} 个钱包`}
          {' · '}
          {filterHasNote ? '📝 有备注' : selectedTag === '' ? '全部类型' : TAG_CONFIG[selectedTag]?.label ?? selectedTag}
          {' · '}
          共 {filteredTxs.length} 笔
        </p>
      </div>

      {/* 资产健康卡片 */}
      <div className="px-4 mb-3">
        <div className="bg-[#161b22] rounded-lg p-4">

          {/* 行1: 标题 + 最活跃标签 */}
          <div className="flex justify-between items-center mb-1">
            <p className="text-[10px] text-[#8b949e] uppercase tracking-wide">
              总资产 · {currentMonthStr.toUpperCase()}
            </p>
            {monthlyStats.topTag && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: getTagConfig(monthlyStats.topTag).bg,
                  color: getTagConfig(monthlyStats.topTag).color,
                }}
              >
                最活跃 {getTagConfig(monthlyStats.topTag).label} ×{monthlyStats.topCount}
              </span>
            )}
          </div>

          {/* 行2: 总资产大字 */}
          <div className="mb-3">
            {balancesLoading ? (
              <p className="text-sm text-[#6e7681]">计算中…</p>
            ) : balances ? (
              <p className="text-2xl font-medium text-white">
                ${balances.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            ) : (
              <p className="text-2xl font-medium text-[#6e7681]">—</p>
            )}
          </div>

          {/* 分隔线 */}
          <div className="border-t border-[#21262d] mb-3" />

          {/* 行4: 本月盈亏 */}
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-[#8b949e]">本月盈亏</span>
            <span className={`text-sm font-medium ${monthlyStats.pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
              {monthlyStats.pnl >= 0 ? '+' : ''}{formatCompact(monthlyStats.pnl)}
            </span>
          </div>

          {/* 行5: Gas 消耗 + 占比 */}
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] text-[#8b949e]">Gas 消耗</span>
            <span className="text-sm font-medium text-[#d29922]">
              {formatCompact(monthlyStats.gas)}
              {monthlyStats.gas > 0 && (monthlyStats.gas + Math.abs(monthlyStats.pnl)) > 0 && (
                <span className="text-[10px] text-[#666] ml-1">
                  (占支出 {(monthlyStats.gas / (monthlyStats.gas + Math.abs(monthlyStats.pnl)) * 100).toFixed(0)}%)
                </span>
              )}
            </span>
          </div>

          {/* 分隔线 + 余额小字 */}
          {balances && (
            <>
              <div className="border-t border-[#21262d] mb-2" />
              <div className="flex gap-3 flex-wrap">
                {Object.entries(balances.tokens)
                  .filter(([symbol]) => STABLE_WHITELIST.has(symbol))
                  .map(([symbol, amount]) => (
                    <span key={symbol} className="text-[10px] text-[#6e7681]">
                      {symbol} {amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </span>
                  ))}
              </div>
            </>
          )}

        </div>
      </div>

      {/* 筛选区域：钱包（蓝色）+ 分隔线 + 类型（紫色） */}
      <div className="px-4 mb-3 bg-[#161b22] rounded-lg mx-4 p-3">

        {/* 第一排：钱包筛选（蓝色系） */}
        {enabledWallets.length > 1 && (
          <>
            <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-2">钱包</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => setSelectedWallets(new Set())}
                className="rounded-full text-[12px] font-medium border transition-all"
                style={{
                  padding: '5px 12px',
                  background: selectedWallets.size === 0 ? '#0a1e2a' : 'transparent',
                  color: selectedWallets.size === 0 ? '#4a9fd4' : '#8b949e',
                  borderColor: selectedWallets.size === 0 ? '#4a9fd4' : '#21262d',
                }}
              >
                全部
              </button>
              {enabledWallets.map(w => {
                const active = selectedWallets.has(w.address)
                return (
                  <button
                    key={w.address}
                    onClick={() => toggleWalletFilter(w.address)}
                    className="rounded-full text-[12px] font-medium border transition-all"
                    style={{
                      padding: '5px 12px',
                      background: active ? '#0a1e2a' : 'transparent',
                      color: active ? '#4a9fd4' : '#8b949e',
                      borderColor: active ? '#4a9fd4' : '#21262d',
                    }}
                  >
                    {w.label || `${w.address.slice(0, 6)}…${w.address.slice(-4)}`}
                  </button>
                )
              })}
            </div>
            {/* 分隔线 */}
            <div className="border-t border-[#21262d] mb-3" />
          </>
        )}

        {/* 第二排：类型筛选（紫色系） */}
        <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-2">类型</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedTag('')}
            className="rounded-full text-[12px] font-medium border transition-all"
            style={{
              padding: '5px 12px',
              background: selectedTag === '' ? '#1d2d50' : 'transparent',
              color: selectedTag === '' ? '#60A5FA' : '#8b949e',
              borderColor: selectedTag === '' ? '#3B82F6' : '#21262d',
            }}
          >
            全部
          </button>
          {ALL_TAGS.map(tag => {
            const cfg = TAG_CONFIG[tag]
            const active = selectedTag === tag
            return (
              <button
                key={tag}
                onClick={() => setSelectedTag(active ? '' : tag)}
                className="rounded-full text-[12px] font-medium border transition-all"
                style={{
                  padding: '5px 12px',
                  background: active ? '#1d2d50' : 'transparent',
                  color: active ? '#60A5FA' : '#8b949e',
                  borderColor: active ? '#3B82F6' : '#21262d',
                }}
              >
                {cfg.label}
              </button>
            )
          })}
          {/* 有备注筛选 */}
          <button
            onClick={() => setFilterHasNote(v => !v)}
            className="rounded-full text-[12px] font-medium border transition-all"
            style={{
              padding: '5px 12px',
              background: filterHasNote ? '#1a2a1a' : 'transparent',
              color: filterHasNote ? '#3fb950' : '#8b949e',
              borderColor: filterHasNote ? '#2a6a3a' : '#21262d',
            }}
          >
            📝 有备注
          </button>
        </div>

      </div>

      {/* 数据概览卡片 */}
      <div className="grid grid-cols-2 gap-2 px-4 mb-4">
        <div className="bg-[#161b22] rounded-lg p-3">
          <p className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-1">{text.txsCountLabel}</p>
          <p className="text-base font-medium text-white">{filteredTxs.length} {text.txLabel}</p>
        </div>
        <div className="bg-[#161b22] rounded-lg p-3">
          <p className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-1">{text.untaggedLabel}</p>
          <p className="text-base font-medium text-[#d29922]">
            {filteredTxs.filter(t => !t.tag).length} {text.txLabel}
          </p>
        </div>
      </div>

      {/* 交易列表 / 详情 */}
      <div className="flex-1 px-4">
        {selected ? (
          // ── 交易详情视图 ──────────────────────────────────
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-1.5 text-[#8b949e] hover:text-[#888] text-sm transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
              交易列表
            </button>

            <div className="bg-[#161b22] rounded-lg p-4">
              <p className="text-base font-medium text-white mb-1">{selected.summary}</p>
              <p className="text-xs text-[#8b949e] font-mono mb-3">{selected.hash.slice(0, 20)}…</p>
              <div className="flex justify-between text-sm">
                <span className="text-[#666]">{text.amountLabel}</span>
                <span className={selected.isOutgoing ? 'text-[#f85149]' : 'text-[#3fb950]'}>{selected.amount}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-[#666]">{text.timeLabel}</span>
                <span className="text-[#888]">{selected.date}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-[#666]">{text.walletsManage}</span>
                <span className="text-[#8b949e] font-mono text-xs">
                  {selected.walletAddress.slice(0, 6)}…{selected.walletAddress.slice(-4)}
                </span>
              </div>
            </div>

            {/* 标签选择 */}
            <div>
              <p className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-2">{text.tagsLabel}</p>
              <div className="flex flex-wrap gap-2">
                {ALL_TAGS.map(tag => {
                  const cfg = TAG_CONFIG[tag]
                  const active = editTag === tag
                  return (
                    <button
                      key={tag}
                      onClick={() => setEditTag(active ? '' : tag)}
                      className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                      style={{
                        background: active ? cfg.bg : 'transparent',
                        color: active ? cfg.color : '#8b949e',
                        borderColor: active ? cfg.color + '60' : '#21262d',
                      }}
                    >
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 备注输入 */}
            <div>
              <p className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-2">{text.notesLabel}</p>
              <textarea
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="这笔是干嘛的…"
                className="w-full bg-[#161b22] border border-[#21262d] rounded-lg
                           text-sm text-[#ccc] placeholder:text-[#6e7681]
                           px-3 py-2 resize-none focus:outline-none focus:border-[#3B82F6]"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-[#1d2d50] border border-[#3B82F6]
                         rounded-lg text-[#60A5FA] text-sm font-medium
                         hover:bg-[#1d2d50] transition-all disabled:opacity-50"
            >
              {saving ? '保存中…' : text.saveButton}
            </button>

            {/* Etherscan 跳转链接 */}
            <div className="flex items-center justify-center gap-2 text-xs text-[#666] pt-1">
              <a
                href={`https://etherscan.io/tx/${selected.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                在 Etherscan 查看 ↗
              </a>
              <span>·</span>
              <a
                href={`https://etherscan.io/address/${selected.walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                前往 Etherscan 转账 ↗
              </a>
            </div>
          </div>
        ) : (
          // ── 交易列表视图 ──────────────────────────────────
          <div className="flex flex-col gap-2">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-[#8b949e] text-sm">{text.loadingHistory}</p>
              </div>
            ) : filteredTxs.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-[#8b949e] text-sm">
                  {txs.length === 0 ? text.noTxs : '没有符合筛选条件的交易'}
                </p>
              </div>
            ) : (
              filteredTxs.map(tx => {
                const tagCfg = getTagConfig(tx.tag)
                return (
                  <button
                    key={tx.hash}
                    onClick={() => openDetail(tx)}
                    className="flex items-center gap-3 bg-[#161b22] hover:bg-[#21262d]
                               rounded-lg px-3 py-3 text-left transition-all w-full"
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tagCfg.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#ddd] truncate">{tx.summary}</p>
                      <p className="text-[11px] text-[#8b949e] font-mono mt-0.5">
                        {tx.hash.slice(0, 6)}…{tx.hash.slice(-4)} · {tx.date}
                        {enabledWallets.length > 1 && ` · ${tx.walletAddress.slice(0, 6)}…${tx.walletAddress.slice(-4)}`}
                      </p>
                      {tx.note && tx.note.trim() && (
                        <p className="text-[11px] text-[#4a4a4a] mt-0.5 truncate">
                          📝 {tx.note.slice(0, 20)}{tx.note.length > 20 ? '…' : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-medium ${tx.isOutgoing ? 'text-[#f85149]' : 'text-[#3fb950]'}`}>
                        {tx.amount}
                      </p>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium mt-0.5 inline-block"
                        style={{ background: tagCfg.bg, color: tagCfg.color }}
                      >
                        {tagCfg.label}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {!selected && (
        <div className="px-4 py-4">
          <button
            onClick={() => { disconnect(); router.push('/') }}
            className="w-full py-2 text-xs text-[#6e7681] hover:text-[#666] transition-colors"
          >
            {text.disconnect}
          </button>
        </div>
      )}
    </div>
  )
}
