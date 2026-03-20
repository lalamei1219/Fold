import { TransactionReceiptResponse } from 'alchemy-sdk'
import { RawTx } from './alchemy'
import { TxTag } from './db'

// 协议地址 / 事件解析配置，可扩展。
export const PROTOCOL_EVENT_RULES = {
  uniswapV2: {
    swapTopic: '0xd78ad95fa46c994b6551d0da85fc275fe6138f57ddb4f74c09c5977ed71cd8e1',
    mintTopic: '0x0c396cd98908a4ae1de3b37d71a3a9dd3bc6e4141c5aaebe6f1238cc78f709b7',
    burnTopic: '0xd3f667e2b9d9ea7d825ffaf9b30a547f3c764f4847e2187e2b7d76de0824fddc',
    factory: [
      '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // UniswapV2
    ],
  },
  uniswapV3: {
    swapTopic: '0x414bf389c64b6e92bc033693d2f7b4edab80438e806eb7ae81dbc7a1fba42d6f',
    mintTopic: '0x7a6f8b8f5c9f2cd4ef65cc418a4827077a8877713bfc4efe9f4522f4d7f10f4e',
    burnTopic: '0x4d3a427e5f38cde404a3b722f5d7c461eab023cd0a66dece4e8c1f3a7d058d98',
    factory: [
      '0x1F98431c8aD98523631AE4a59f267346ea31F984', // UniswapV3
    ],
  },
  daoTreasury: {
    multiSigTag: 'dao_multisig',
  },
}

export type ProcessorConfig = {
  daoTreasuryAddresses?: string[]
  daoAdminAddresses?: string[]
  daoMemberAddresses?: string[]
}

export type TxCategorization = {
  txHash: string
  nonce: number
  from: string
  to: string | null
  category: TxTag
  action: string
  label: string
  protocol?: string
  tokenIn?: string
  tokenOut?: string
  amountIn?: number
  amountOut?: number
  gasUsed?: number
  gasPrice?: number
  gasFeeNative?: number
  slippageNative?: number
  profitNative?: number
  valueNative?: number
  fiatValue?: number
  owners: string[] // 多钱包来源
}

// 价格接口 placeholder，真实实现可对接 Chainlink、Alchemy 上链 price 机构。
export async function getPriceAtTime(symbol: string, timestamp: number): Promise<number> {
  // TODO: 你可以调整成调用链上 price oracle / 入库存储缓存。
  if (symbol === 'ETH') return 1800
  return 1
}

export function normalizeAddress(address: string | null | undefined): string {
  return (address || '').toLowerCase()
}

export function isDaoAdmin(address: string, cfg: ProcessorConfig): boolean {
  return cfg.daoAdminAddresses?.map(a => a.toLowerCase()).includes(address.toLowerCase()) ?? false
}

export function isDaoTreasury(address: string, cfg: ProcessorConfig): boolean {
  return cfg.daoTreasuryAddresses?.map(a => a.toLowerCase()).includes(address.toLowerCase()) ?? false
}

export function classifyTransferEvent(
  tx: RawTx,
  receipt: TransactionReceiptResponse | null,
  cfg: ProcessorConfig,
): TxCategorization {
  const from = normalizeAddress(tx.from)
  const to = normalizeAddress(tx.to)
  const txHash = tx.hash

  const isDaoFrom = isDaoTreasury(from, cfg)
  const isDaoTo = isDaoTreasury(to, cfg)

  let category: TxTag = 'transfer'
  let action = 'transfer'
  let label = '普通转账'
  let protocol: string | undefined = undefined

  if (isDaoFrom && !isDaoTo) {
    category = 'dao_spend'
    action = 'dao_spend'
    label = 'DAO 支出'
  } else if (!isDaoFrom && isDaoTo) {
    category = 'dao_revenue'
    action = 'dao_revenue'
    label = 'DAO 募资'
  } else if (isDaoFrom && isDaoTo) {
    category = 'dao_internal'
    action = 'dao_internal'
    label = 'DAO 内转'
  }

  // event log 识别
  const logs = receipt?.logs ?? []

  const hasEvent = (topic: string) => logs.some(log => log.topics?.[0] === topic)

  if (hasEvent(PROTOCOL_EVENT_RULES.uniswapV2.swapTopic)) {
    category = 'swap'
    action = 'swap'
    label = 'UniswapV2 Swap'
    protocol = 'uniswapV2'
  } else if (hasEvent(PROTOCOL_EVENT_RULES.uniswapV3.swapTopic)) {
    category = 'swap'
    action = 'swap'
    label = 'UniswapV3 Swap'
    protocol = 'uniswapV3'
  } else if (hasEvent(PROTOCOL_EVENT_RULES.uniswapV2.mintTopic)) {
    category = 'lp_add'
    action = 'lp_add'
    label = 'UniswapV2 LP 增加'
    protocol = 'uniswapV2'
  } else if (hasEvent(PROTOCOL_EVENT_RULES.uniswapV2.burnTopic)) {
    category = 'lp_remove'
    action = 'lp_remove'
    label = 'UniswapV2 LP 移除'
    protocol = 'uniswapV2'
  } else if (hasEvent(PROTOCOL_EVENT_RULES.uniswapV3.mintTopic)) {
    category = 'lp_add'
    action = 'lp_add'
    label = 'UniswapV3 LP 增加'
    protocol = 'uniswapV3'
  } else if (hasEvent(PROTOCOL_EVENT_RULES.uniswapV3.burnTopic)) {
    category = 'lp_remove'
    action = 'lp_remove'
    label = 'UniswapV3 LP 移除'
    protocol = 'uniswapV3'
  }

  // DAO Reco：多签执行
  const daoExecLog = logs.some(log => log.topics?.[0]?.includes('0x2c9205cde8140bd54f1a2bfa3cd3f1f41fca9e71')); // example
  if (daoExecLog) {
    category = 'dao_spend'
    action = 'dao_multisig_exec'
    label = 'DAO 多签执行'
  }

  return {
    txHash,
    nonce: 0,
    from,
    to,
    category,
    action,
    label,
    protocol,
    owners: [],
    valueNative: Number(tx.value || 0),
    tokenIn: undefined,
    tokenOut: undefined,
  }
}

export function dedupeTransactions(
  items: TxCategorization[],
  existingHashes: Set<string>,
): TxCategorization[] {
  const result: TxCategorization[] = []
  for (const item of items) {
    if (!existingHashes.has(item.txHash)) {
      existingHashes.add(item.txHash)
      result.push(item)
    } else {
      // 已存在则合并 owners，避免重复
      const existing = result.find(i => i.txHash === item.txHash)
      if (existing) {
        existing.owners = Array.from(new Set([...existing.owners, ...item.owners]))
      }
    }
  }
  return result
}

export async function computeProfit(row: TxCategorization): Promise<TxCategorization> {
  const gasNative = (row.gasPrice ?? 0) * (row.gasUsed ?? 0) / 1e18
  const priceNative = await getPriceAtTime('ETH', Date.now())
  const priceIn = row.valueNative ?? 0
  const priceOut = row.amountOut ?? 0

  const profitNative = (priceOut - priceIn) - gasNative - (row.slippageNative ?? 0)
  const fiatValue = profitNative * priceNative

  return {
    ...row,
    gasFeeNative: gasNative,
    profitNative,
    fiatValue,
  }
}

export function mergeWalletAggregates(
  all: TxCategorization[],
): {
  totalTx: number
  profitsNative: number
  profitsFiat: number
  byCategory: Record<string, { txCount: number; profitNative: number; profitFiat: number }>
} {
  const summary = {
    totalTx: 0,
    profitsNative: 0,
    profitsFiat: 0,
    byCategory: {} as Record<string, { txCount: number; profitNative: number; profitFiat: number }>,
  }

  for (const tx of all) {
    summary.totalTx++
    summary.profitsNative += tx.profitNative ?? 0
    summary.profitsFiat += tx.fiatValue ?? 0
    const key = tx.category
    if (!summary.byCategory[key]) {
      summary.byCategory[key] = { txCount: 0, profitNative: 0, profitFiat: 0 }
    }
    summary.byCategory[key].txCount += 1
    summary.byCategory[key].profitNative += tx.profitNative ?? 0
    summary.byCategory[key].profitFiat += tx.fiatValue ?? 0
  }

  return summary
}
