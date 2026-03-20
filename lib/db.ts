// lib/db.ts
// 用 Dexie.js 管理本地 IndexedDB 存储
// 只存用户添加的「标签」和「备注」，不存链上原始数据
// 数据完全在用户设备本地，不上传服务器

import Dexie, { type Table } from 'dexie'

// 标签类型定义（10 个正式标签 + 空标签）
export type TxTag =
  | 'swap'     // Swap 兑换
  | 'lp'       // LP 流动性
  | 'staking'  // Staking 质押
  | 'nft_buy'  // NFT 买入
  | 'nft_sell' // NFT 卖出
  | 'airdrop'  // 空投
  | 'gas'      // Gas 手续费
  | 'transfer' // 转账
  | 'lending'  // 借贷
  | 'income'   // 收益
  | ''

// 存储结构：以交易 hash 为主键
export interface TxAnnotation {
  hash: string       // 主键，链上唯一标识
  tag: TxTag         // 用户选择的标签
  note: string       // 用户备注，最多 200 字
  updatedAt: number  // 最后修改时间戳（毫秒）
}

// 钱包信息
export interface WalletInfo {
  address: string    // 主键（小写）
  label: string      // 用户自定义昵称
  addedAt: number    // 添加时间戳（毫秒）
  enabled: boolean   // 是否参与数据聚合（旧记录读取时默认 true）
}

// 标签显示名和颜色配置
export const TAG_CONFIG: Record<TxTag, { label: string; color: string; bg: string }> = {
  swap:     { label: 'Swap',    color: '#9b95e8', bg: '#1e1a3a' },
  lp:       { label: 'LP',      color: '#b06de8', bg: '#2a1a3a' },
  staking:  { label: 'Staking', color: '#e8c26d', bg: '#2a220a' },
  nft_buy:  { label: 'NFT买入', color: '#6dbf6d', bg: '#1a2a1a' },
  nft_sell: { label: 'NFT卖出', color: '#a8e86d', bg: '#202a1a' },
  airdrop:  { label: 'Airdrop', color: '#6de8d4', bg: '#0a2a26' },
  gas:      { label: 'Gas',     color: '#d4934a', bg: '#2a1e0a' },
  transfer: { label: '转账',    color: '#4a9fd4', bg: '#0a1e2a' },
  lending:  { label: 'Lending', color: '#e86d9b', bg: '#2a0a1a' },
  income:   { label: '收益',    color: '#4ad4a0', bg: '#0a2a1a' },
  '':       { label: '未标记',  color: '#666666', bg: '#222222' },
}

// 获取 TAG_CONFIG 的安全版本（兼容旧数据中可能存在 'nft' 等废弃标签）
export function getTagConfig(tag: string): typeof TAG_CONFIG[TxTag] {
  return (TAG_CONFIG as Record<string, typeof TAG_CONFIG[TxTag]>)[tag] ?? TAG_CONFIG['']
}

// 定义数据库
class FoldDB extends Dexie {
  annotations!: Table<TxAnnotation>
  wallets!: Table<WalletInfo>

  constructor() {
    super('fold_db')
    this.version(1).stores({
      annotations: 'hash, tag, updatedAt',
    })
    this.version(2).stores({
      annotations: 'hash, tag, updatedAt',
      wallets: 'address, addedAt',
    })
    // version 3: 把旧的 'nft' 标签迁移为 'nft_buy'
    this.version(3).stores({
      annotations: 'hash, tag, updatedAt',
      wallets: 'address, addedAt',
    }).upgrade(tx => {
      return tx.table('annotations').toCollection().modify((ann: TxAnnotation) => {
        if ((ann.tag as string) === 'nft') ann.tag = 'nft_buy'
      })
    })
  }
}

// 导出单例
export const db = new FoldDB()

// ── 工具函数 ─────────────────────────────────────

// 保存或更新一条标注
export async function saveAnnotation(hash: string, tag: TxTag, note: string) {
  await db.annotations.put({
    hash,
    tag,
    note: note.slice(0, 200),
    updatedAt: Date.now(),
  })
}

// 批量读取多个 hash 的标注（返回 Map，方便列表页查询）
export async function getAnnotations(hashes: string[]): Promise<Map<string, TxAnnotation>> {
  const results = await db.annotations.where('hash').anyOf(hashes).toArray()
  return new Map(results.map(r => [r.hash, r]))
}

// 读取单条标注
export async function getAnnotation(hash: string): Promise<TxAnnotation | undefined> {
  return db.annotations.get(hash)
}

// 按标签分组统计（给月度总结页用）
export async function getTagSummary(): Promise<Record<TxTag, TxAnnotation[]>> {
  const all = await db.annotations.toArray()
  const summary: Record<string, TxAnnotation[]> = {}

  for (const ann of all) {
    if (!summary[ann.tag]) summary[ann.tag] = []
    summary[ann.tag].push(ann)
  }

  return summary as Record<TxTag, TxAnnotation[]>
}

// ── 钱包工具函数 ─────────────────────────────────────

// 获取所有钱包（按添加时间排序），兼容旧记录没有 enabled 字段
export async function getWallets(): Promise<WalletInfo[]> {
  const rows = await db.wallets.orderBy('addedAt').toArray()
  return rows.map(w => ({ ...w, enabled: w.enabled ?? true }))
}

// 添加钱包（已存在则忽略）
export async function addWallet(address: string, label = ''): Promise<void> {
  const lower = address.toLowerCase()
  const existing = await db.wallets.get(lower)
  if (existing) return
  await db.wallets.put({ address: lower, label, addedAt: Date.now(), enabled: true })
}

// 更新钱包昵称
export async function updateWalletLabel(address: string, label: string): Promise<void> {
  await db.wallets.update(address.toLowerCase(), { label })
}

// 更新钱包勾选状态
export async function updateWalletEnabled(address: string, enabled: boolean): Promise<void> {
  await db.wallets.update(address.toLowerCase(), { enabled })
}

// 删除钱包
export async function removeWallet(address: string): Promise<void> {
  await db.wallets.delete(address.toLowerCase())
}
