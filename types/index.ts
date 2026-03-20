// types/index.ts
// fold 全局类型定义

import type { TxTag } from '../lib/db'
import type { RawTx } from '../lib/alchemy'

// 前端展示用的交易对象（原始链上数据 + 用户标注合并）
export interface DisplayTx {
  hash: string
  summary: string        // 如 "ETH → USDC"，自动生成
  from: string
  to: string | null
  amount: string         // 格式化后的金额，如 "-0.8 ETH"
  amountRaw: string      // 原始 value（字符串，人类可读，用于汇总）
  isOutgoing: boolean    // true = 支出，false = 收入
  asset: string          // 'ETH' / 'USDC' 等
  category: string       // 链上原始分类
  date: string           // 格式化日期，如 "Jun 14"
  timestamp: number      // 毫秒时间戳，用于排序
  walletAddress: string  // 所属钱包地址（多钱包模式）
  // 用户标注（可能为空）
  tag: TxTag
  note: string
}

// 月度总结的分组数据
export interface TagGroup {
  tag: TxTag
  txs: DisplayTx[]
  total: number          // 该分组金额汇总（正=收益，负=支出）
  count: number
}

// 月度总览数据
export interface MonthlySummary {
  totalIncome: number    // 总收益（USD 估算，MVP 阶段可先用 ETH）
  totalSpend: number     // 总支出
  totalGas: number       // Gas 消耗
  netBalance: number     // 净结余 = income - spend - gas
  groups: TagGroup[]
  month: string          // 如 "Jun 2025"
}

// 金额格式化：> 1000 整数，1-1000 两位小数，< 1 四位小数
export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  if (value >= 1000) return Math.round(value).toLocaleString('en-US')
  if (value >= 1) return value.toFixed(2)
  return value.toFixed(4)
}

// 把 RawTx 转换成 DisplayTx（需传入用户的钱包地址判断方向）
export function toDisplayTx(raw: RawTx & { walletAddress?: string }, walletAddress: string, tag: TxTag = '', note = ''): DisplayTx {
  const resolvedWallet = (raw.walletAddress ?? walletAddress).toLowerCase()
  const isOutgoing = raw.from.toLowerCase() === resolvedWallet

  // 优先用 rawContract 高精度值，fallback 到 Alchemy 已换算的 value
  let amountNum: number
  if (raw.rawContract?.value && raw.rawContract.value !== '0x' && raw.rawContract.value !== '0x0') {
    const decimals = raw.rawContract.decimal ?? 18
    amountNum = Number(BigInt(raw.rawContract.value)) / Math.pow(10, decimals)
  } else {
    amountNum = Number.parseFloat(raw.value || '0')
  }

  const amount = `${isOutgoing ? '-' : '+'}${formatAmount(amountNum)} ${raw.asset || 'ETH'}`

  // 自动生成交易摘要
  let summary = ''
  if (raw.category === 'erc721' || raw.category === 'erc1155') {
    summary = isOutgoing ? `NFT 转出` : `NFT 收入`
  } else if (raw.asset && raw.asset !== 'ETH') {
    summary = isOutgoing ? `ETH → ${raw.asset}` : `${raw.asset} → ETH`
  } else {
    summary = isOutgoing ? `转出 ETH` : `收入 ETH`
  }

  return {
    hash: raw.hash,
    summary,
    from: raw.from,
    to: raw.to,
    amount,
    amountRaw: raw.value || '0',
    isOutgoing,
    asset: raw.asset || 'ETH',
    category: raw.category,
    date: new Date(raw.metadata.blockTimestamp).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    }),
    timestamp: new Date(raw.metadata.blockTimestamp).getTime(),
    walletAddress: resolvedWallet,
    tag,
    note,
  }
}
