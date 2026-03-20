'use client'
// app/summary/page.tsx — 账单页：全量自动分类 + 时间筛选 + AI 分析

import { useChainId } from 'wagmi'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAllTransactions, detectTag } from '../../lib/alchemy'
import { getAnnotations, getWallets, getTagConfig, type TxTag, type WalletInfo } from '../../lib/db'
import { toDisplayTx, type DisplayTx } from '../../types'

// ── Types ──────────────────────────────────────────────────────

type TimePeriod = 'week' | 'month' | '3months' | 'year' | 'custom'
type EnrichedTx = DisplayTx & { isAutoTagged: boolean }

const PERIOD_LABELS: Record<TimePeriod, string> = {
  week: '本周', month: '本月', '3months': '三个月', year: '今年', custom: '自定义',
}

const STABLE = new Set(['ETH', 'USDC', 'USDT', 'WETH', 'DAI', 'WBTC'])
const INCOME_TAGS = new Set<TxTag>(['income', 'airdrop'])
const SPEND_TAGS = new Set<TxTag>(['swap', 'lp', 'staking', 'nft_buy', 'nft_sell', 'transfer', 'lending'])
const TAG_ORDER: TxTag[] = [
  'income', 'airdrop', 'swap', 'lp', 'staking',
  'lending', 'nft_buy', 'nft_sell', 'transfer', 'gas',
]

// ── Helpers ────────────────────────────────────────────────────

function getTimeRange(period: TimePeriod, from?: string, to?: string) {
  const now = new Date()
  if (period === 'custom' && from && to) {
    return { start: new Date(from + 'T00:00:00'), end: new Date(to + 'T23:59:59') }
  }
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  if (period === 'week') {
    const d = now.getDay()
    const mon = new Date(now)
    mon.setDate(now.getDate() - (d === 0 ? 6 : d - 1))
    mon.setHours(0, 0, 0, 0)
    return { start: mon, end }
  }
  if (period === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end }
  if (period === '3months') {
    const s = new Date(now); s.setDate(now.getDate() - 90); s.setHours(0, 0, 0, 0)
    return { start: s, end }
  }
  return { start: new Date(now.getFullYear(), 0, 1), end }
}

function toUsd(tx: DisplayTx, ethPrice: number): number {
  if (!STABLE.has(tx.asset)) return 0
  const n = parseFloat(tx.amountRaw || '0')
  if (!Number.isFinite(n) || n <= 0) return 0
  return (tx.asset === 'ETH' || tx.asset === 'WETH') ? n * ethPrice : n
}

function fmtUsd(n: number, forceSign = true): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : forceSign ? '+' : ''
  if (abs === 0) return '$0'
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}K`
  if (abs >= 1) return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return `${sign}$${abs.toFixed(2)}`
}

function periodTitle(period: TimePeriod, from?: string, to?: string): string {
  const now = new Date()
  if (period === 'custom') return from && to ? `${from} ~ ${to}` : '自定义时段'
  if (period === 'month') return `${now.toLocaleDateString('zh-CN', { month: 'long' })}账单`
  if (period === 'week') return '本周账单'
  if (period === '3months') return '近三个月'
  return `${now.getFullYear()} 年账单`
}

function aiCacheKey(period: TimePeriod, wallets: Set<string>, from?: string, to?: string) {
  const wk = wallets.size === 0 ? 'all' : [...wallets].sort().join(',')
  const pk = period === 'custom' ? `custom_${from}_${to}` : period
  return `fold_ai_${pk}_${wk}`
}

function Skel({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#21262d] rounded ${className}`} />
}

// ── Page ───────────────────────────────────────────────────────

export default function SummaryPage() {
  const router = useRouter()
  const chainId = useChainId()

  const [allTxs, setAllTxs] = useState<EnrichedTx[]>([])
  const [wallets, setWallets] = useState<WalletInfo[]>([])
  const [ethPrice, setEthPrice] = useState(0)
  const [loading, setLoading] = useState(true)

  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(new Set())
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)

  useEffect(() => { loadData(chainId) }, [chainId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAiText(null); setAiError(false) }, [timePeriod, customFrom, customTo, selectedWallets])

  async function loadData(cid: number) {
    setLoading(true)
    try {
      const walletInfos = await getWallets()
      setWallets(walletInfos)
      const addresses = walletInfos.filter(w => w.enabled !== false).map(w => w.address)
      if (!addresses.length) { setLoading(false); return }

      const [rawTxs, priceData] = await Promise.all([
        fetchAllTransactions(addresses, cid),
        fetch('/api/prices').then(r => r.json()).catch(() => ({ ETH: 0 })),
      ])
      setEthPrice(priceData.ETH ?? 0)

      const anns = await getAnnotations(rawTxs.map(t => t.hash))

      // 手动标签 > detectTag() 自动识别
      const enriched: EnrichedTx[] = rawTxs.map(raw => {
        const ann = anns.get(raw.hash)
        const hasManual = !!ann?.tag
        const tag = (ann?.tag || detectTag(raw, raw.walletAddress)) as TxTag
        return { ...toDisplayTx(raw, raw.walletAddress, tag, ann?.note ?? ''), isAutoTagged: !hasManual }
      })

      setAllTxs(enriched)
    } catch (e) {
      console.error('加载失败', e)
    } finally {
      setLoading(false)
    }
  }

  const filteredTxs = useMemo(() => {
    const { start, end } = getTimeRange(timePeriod, customFrom, customTo)
    let txs = allTxs.filter(tx => { const d = new Date(tx.timestamp); return d >= start && d <= end })
    if (selectedWallets.size > 0) txs = txs.filter(tx => selectedWallets.has(tx.walletAddress))
    return txs
  }, [allTxs, timePeriod, customFrom, customTo, selectedWallets])

  const groups = useMemo(() => {
    const map = new Map<TxTag, EnrichedTx[]>()
    for (const tx of filteredTxs) {
      if (!tx.tag) continue
      if (!map.has(tx.tag)) map.set(tx.tag, [])
      map.get(tx.tag)!.push(tx)
    }
    return TAG_ORDER.filter(t => map.has(t)).map(t => ({ tag: t, txs: map.get(t)! }))
  }, [filteredTxs])

  const stats = useMemo(() => {
    const total = filteredTxs.length
    const autoTagged = filteredTxs.filter(tx => tx.isAutoTagged).length
    const incomeUsd = filteredTxs.filter(tx => INCOME_TAGS.has(tx.tag)).reduce((s, tx) => s + toUsd(tx, ethPrice), 0)
    const spendUsd = filteredTxs.filter(tx => SPEND_TAGS.has(tx.tag)).reduce((s, tx) => s + toUsd(tx, ethPrice), 0)
    const gasUsd = filteredTxs.filter(tx => tx.tag === 'gas').reduce((s, tx) => s + toUsd(tx, ethPrice), 0)
    return { total, autoTagged, manualTagged: total - autoTagged, incomeUsd, spendUsd, gasUsd, netUsd: incomeUsd - spendUsd - gasUsd }
  }, [filteredTxs, ethPrice])

  async function runAiAnalysis() {
    const cacheKey = aiCacheKey(timePeriod, selectedWallets, customFrom, customTo)
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const { text, ts } = JSON.parse(cached)
        if (Date.now() - ts < 86_400_000) { setAiText(text); return }
      }
    } catch { /* ignore */ }

    setAiLoading(true)
    setAiError(false)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const byCategory: Record<string, number> = {}
      for (const g of groups) byCategory[g.tag] = g.txs.length
      const { start, end } = getTimeRange(timePeriod, customFrom, customTo)
      const rangeLabel = `${start.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          txData: {
            period: rangeLabel,
            totalTxs: stats.total,
            recognized: stats.autoTagged,
            byCategory,
            netPnlUSD: Math.round(stats.netUsd),
            gasUSD: Math.round(stats.gasUsd),
            hasNotes: filteredTxs.filter(tx => tx.note).length,
          },
          month: rangeLabel,
        }),
      })
      clearTimeout(timeout)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      if (!data.analysis) throw new Error('empty')
      setAiText(data.analysis)
      try { localStorage.setItem(cacheKey, JSON.stringify({ text: data.analysis, ts: Date.now() })) } catch { /* ignore */ }
    } catch {
      clearTimeout(timeout)
      setAiError(true)
    } finally {
      setAiLoading(false)
    }
  }

  const enabledWallets = wallets.filter(w => w.enabled !== false)
  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
  const toggleGroup = (tag: string) => setOpenGroups(prev => {
    const n = new Set(prev); n.has(tag) ? n.delete(tag) : n.add(tag); return n
  })

  return (
    <div className="flex flex-col min-h-screen pb-24">

      <div className="px-4 pt-5 pb-3">
        <span className="text-xl font-medium text-white">{periodTitle(timePeriod, customFrom, customTo)}</span>
      </div>

      <div className="px-4 flex flex-col gap-3">

        {/* 时间筛选 */}
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setTimePeriod(p)}
              className="rounded-full text-[12px] font-medium border transition-all"
              style={{
                padding: '5px 12px',
                background: timePeriod === p ? '#1d2d50' : 'transparent',
                color: timePeriod === p ? '#60A5FA' : '#8b949e',
                borderColor: timePeriod === p ? '#3B82F6' : '#21262d',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* 自定义日期范围 */}
        {timePeriod === 'custom' && (
          <div className="flex gap-2 items-center">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="flex-1 bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2 text-[12px] text-white" />
            <span className="text-[#6e7681] text-xs">至</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="flex-1 bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2 text-[12px] text-white" />
          </div>
        )}

        {/* 钱包筛选 */}
        {enabledWallets.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedWallets(new Set())}
              className="rounded-full text-[12px] font-medium border transition-all"
              style={{
                padding: '5px 12px',
                background: selectedWallets.size === 0 ? '#1d2d50' : 'transparent',
                color: selectedWallets.size === 0 ? '#60A5FA' : '#8b949e',
                borderColor: selectedWallets.size === 0 ? '#3B82F6' : '#21262d',
              }}
            >全部</button>
            {enabledWallets.map(w => {
              const on = selectedWallets.has(w.address)
              return (
                <button key={w.address}
                  onClick={() => setSelectedWallets(prev => { const n = new Set(prev); n.has(w.address) ? n.delete(w.address) : n.add(w.address); return n })}
                  className="rounded-full text-[12px] font-medium border transition-all"
                  style={{ padding: '5px 12px', background: on ? '#1d2d50' : 'transparent', color: on ? '#60A5FA' : '#8b949e', borderColor: on ? '#3B82F6' : '#21262d' }}
                >
                  {w.label || shortAddr(w.address)}
                </button>
              )
            })}
          </div>
        )}

        {/* 骨架屏 */}
        {loading ? (
          <div className="flex flex-col gap-3 mt-1">
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4 flex flex-col gap-3">
              <Skel className="h-4 w-3/4" />
              <Skel className="h-3 w-1/2" />
              <div className="border-t border-[#21262d] my-1" />
              <Skel className="h-4 w-1/3 ml-auto" />
              <Skel className="h-4 w-2/5 ml-auto" />
              <Skel className="h-4 w-1/4 ml-auto" />
              <div className="border-t border-[#21262d] my-1" />
              <Skel className="h-6 w-2/5 ml-auto" />
            </div>
            <div className="bg-[#161b22] border border-[#1d2d50] rounded-lg p-4 flex flex-col gap-3">
              <Skel className="h-5 w-1/3 rounded-full" />
              <Skel className="h-9 w-full rounded-lg" />
            </div>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-3 flex justify-between">
                <Skel className="h-5 w-16 rounded-full" />
                <Skel className="h-5 w-10" />
              </div>
            ))}
          </div>

        ) : filteredTxs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-[#8b949e]">这段时间没有链上记录</p>
            <button onClick={() => router.push('/txs')} className="text-xs text-[#3B82F6]">查看全部交易 →</button>
          </div>

        ) : (
          <>
            {/* 总览卡片 */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
              <p className="text-[#c9d1d9] text-sm mb-1">
                这段时间共 <span className="text-white font-semibold">{stats.total}</span> 笔交易
              </p>
              <p className="text-[11px] text-[#6e7681] mb-4">
                自动识别 {stats.autoTagged} 笔{stats.manualTagged > 0 && `，你手动标记了 ${stats.manualTagged} 笔`}
              </p>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-[#8b949e]">收益</span>
                  <span className={`text-sm font-medium ${stats.incomeUsd > 0 ? 'text-[#3fb950]' : 'text-[#6e7681]'}`}>
                    {stats.incomeUsd > 0 ? fmtUsd(stats.incomeUsd) : '$0'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-[#8b949e]">支出</span>
                  <span className={`text-sm font-medium ${stats.spendUsd > 0 ? 'text-[#f85149]' : 'text-[#6e7681]'}`}>
                    {stats.spendUsd > 0 ? fmtUsd(-stats.spendUsd) : '$0'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-[#8b949e]">Gas</span>
                  <span className={`text-sm font-medium ${stats.gasUsd > 0 ? 'text-[#d29922]' : 'text-[#6e7681]'}`}>
                    {stats.gasUsd > 0 ? `-${fmtUsd(stats.gasUsd, false)}` : '$0'}
                  </span>
                </div>
                <div className="border-t border-[#21262d] my-1" />
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-[#8b949e]">净结余</span>
                  <span className={`text-base font-semibold ${stats.netUsd >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {fmtUsd(stats.netUsd)}{stats.netUsd >= 0 && <span className="ml-1 text-sm font-normal">✓</span>}
                  </span>
                </div>
              </div>
            </div>

            {/* AI 分析 */}
            <div className="bg-[#161b22] border border-[#1d2d50] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[#1a2d50] text-[#60A5FA]">✦ AI 分析</span>
                {aiText && !aiLoading && (
                  <button
                    onClick={() => {
                      setAiText(null); setAiError(false)
                      try { localStorage.removeItem(aiCacheKey(timePeriod, selectedWallets, customFrom, customTo)) } catch { /* ignore */ }
                    }}
                    className="text-[11px] text-[#6e7681] hover:text-[#8b949e] transition-colors"
                  >重新生成</button>
                )}
              </div>

              {aiLoading ? (
                <div className="flex items-center gap-1.5 py-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                  <span className="text-[11px] text-[#8b949e] ml-1">分析中…</span>
                </div>
              ) : aiError ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[13px] text-[#6e7681]">暂时无法生成分析，请稍后重试</p>
                  <button onClick={runAiAnalysis}
                    className="w-full py-2 bg-[#1d2d50] border border-[#3B82F6] rounded-lg text-[#60A5FA] text-[13px] font-medium">
                    重试
                  </button>
                </div>
              ) : aiText ? (
                <p className="text-[13px] text-[#c9d1d9] leading-relaxed">{aiText}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-[13px] text-[#8b949e]">生成这段时间的链上行为分析</p>
                  <button onClick={runAiAnalysis}
                    className="w-full py-2.5 bg-[#1d2d50] border border-[#3B82F6] rounded-lg text-[#60A5FA] text-[13px] font-medium active:opacity-70 transition-opacity">
                    生成 AI 分析
                  </button>
                </div>
              )}
            </div>

            {/* 分类列表 */}
            <div className="flex flex-col gap-2 pb-2">
              {groups.map(group => {
                const cfg = getTagConfig(group.tag)
                const isOpen = openGroups.has(group.tag)
                const isIncome = INCOME_TAGS.has(group.tag)
                const groupUsd = group.txs.reduce((s, tx) => s + toUsd(tx, ethPrice), 0)

                return (
                  <div key={group.tag}>
                    <button
                      onClick={() => toggleGroup(group.tag)}
                      className="w-full flex items-center justify-between bg-[#161b22] border border-[#21262d] hover:bg-[#1c2128] rounded-lg px-4 py-3 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-[#6e7681]">{group.txs.length} 笔</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {groupUsd > 0 ? (
                          <span className={`text-sm font-medium ${isIncome ? 'text-[#3fb950]' : group.tag === 'gas' ? 'text-[#d29922]' : 'text-[#f85149]'}`}>
                            {isIncome ? fmtUsd(groupUsd) : fmtUsd(-groupUsd)}
                          </span>
                        ) : (
                          <span className="text-xs text-[#6e7681]">价值待估</span>
                        )}
                        <span className="text-[#6e7681] text-sm inline-block transition-transform duration-200"
                          style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>›</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-1 ml-3 pl-3 border-l border-[#21262d] flex flex-col">
                        {group.txs.map(tx => (
                          <div key={tx.hash} className="flex justify-between items-start py-2 pr-1">
                            <div className="flex-1 min-w-0 mr-3">
                              <p className="text-xs text-[#8b949e] truncate">
                                {tx.summary} · {tx.date}
                                {!tx.isAutoTagged && <span className="ml-1 text-[10px] text-[#6e7681]">✎</span>}
                              </p>
                              {tx.note && (
                                <p className="text-[10px] text-[#60A5FA] mt-0.5 truncate">
                                  📝 {tx.note.slice(0, 20)}{tx.note.length > 20 ? '…' : ''}
                                </p>
                              )}
                            </div>
                            <p className={`text-xs font-medium flex-shrink-0 ${tx.isOutgoing ? 'text-[#f85149]' : 'text-[#3fb950]'}`}>
                              {tx.amount}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
