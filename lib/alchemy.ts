// lib/alchemy.ts
// 封装 Alchemy SDK 调用，读取钱包的链上交易记录

import { Alchemy, Network, AssetTransfersCategory, SortingOrder } from 'alchemy-sdk'
import type { TxTag } from './db'

export type RawTx = {
  hash: string
  from: string
  to: string | null
  value: string        // 人类可读数值（字符串），用于展示/汇总（不是 wei）
  asset: string        // 'ETH' 等
  category: string     // 'external' | 'internal' | 'erc20' | 'erc721' 等
  blockNum: string
  metadata: {
    blockTimestamp: string  // ISO 8601
  }
  rawContract?: {
    value: string    // hex 原始值，用于高精度显示
    decimal: number  // 小数位数
  }
}

// RawTx + 所属钱包地址（用于多钱包模式判断方向）
export type RawTxWithWallet = RawTx & { walletAddress: string }

// 余额相关类型
export type TokenBalance = {
  symbol: string    // 'ETH' | 'USDC' | 'USDT' | 'WETH'
  balance: number   // 人类可读数量
  usdValue: number  // 折算 USD
}

export type WalletBalances = {
  address: string
  tokens: TokenBalance[]
  totalUsd: number
}

function networkFromChainId(chainId: number): Network {
  if (chainId === 42161) return Network.ARB_MAINNET
  return Network.ETH_MAINNET
}

function getAlchemy(chainId: number): Alchemy {
  const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY
  if (!apiKey) throw new Error('缺少环境变量 NEXT_PUBLIC_ALCHEMY_KEY')
  return new Alchemy({ apiKey, network: networkFromChainId(chainId) })
}

// ── 交易拉取 ──────────────────────────────────────────────

// 用 Alchemy SDK 的 Transfers API 读取地址的历史交易（最近 50 笔）
export async function fetchTransactions(address: string, chainId: number): Promise<RawTx[]> {
  const alchemy = getAlchemy(chainId)

  const categories: AssetTransfersCategory[] = [
    AssetTransfersCategory.EXTERNAL,
    AssetTransfersCategory.INTERNAL,
    AssetTransfersCategory.ERC20,
    AssetTransfersCategory.ERC721,
    AssetTransfersCategory.ERC1155,
  ]

  const [sentRes, receivedRes] = await Promise.all([
    alchemy.core.getAssetTransfers({
      fromAddress: address,
      category: categories,
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: 50,
      order: SortingOrder.DESCENDING,
    }),
    alchemy.core.getAssetTransfers({
      toAddress: address,
      category: categories,
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: 50,
      order: SortingOrder.DESCENDING,
    }),
  ])

  const mapTransfer = (t: any): RawTx => ({
    hash: t.hash,
    from: t.from,
    to: t.to ?? null,
    value: t.value == null ? '0' : String(t.value),
    asset: t.asset ?? 'ETH',
    category: t.category ?? 'external',
    blockNum: t.blockNum ?? '',
    metadata: {
      blockTimestamp: t.metadata?.blockTimestamp ?? new Date().toISOString(),
    },
    rawContract: t.rawContract?.value
      ? { value: t.rawContract.value, decimal: Number(t.rawContract.decimal ?? 18) }
      : undefined,
  })

  const allTxs = [...sentRes.transfers.map(mapTransfer), ...receivedRes.transfers.map(mapTransfer)]
  const seen = new Set<string>()
  const deduped = allTxs.filter(tx => {
    if (seen.has(tx.hash)) return false
    seen.add(tx.hash)
    return true
  })

  return deduped.sort(
    (a, b) =>
      new Date(b.metadata.blockTimestamp).getTime() - new Date(a.metadata.blockTimestamp).getTime(),
  )
}

// 并行拉取多个钱包的交易，跨钱包去重
// 去重策略：同一 hash 优先保留 from 地址是己方钱包的那条（支出方视角）
export async function fetchAllTransactions(
  addresses: string[],
  chainId: number,
): Promise<RawTxWithWallet[]> {
  if (addresses.length === 0) return []
  if (addresses.length === 1) {
    const txs = await fetchTransactions(addresses[0], chainId)
    return txs.map(tx => ({ ...tx, walletAddress: addresses[0].toLowerCase() }))
  }

  const results = await Promise.all(
    addresses.map(addr => fetchTransactions(addr, chainId)),
  )

  const txMap = new Map<string, RawTxWithWallet>()
  const addrSet = new Set(addresses.map(a => a.toLowerCase()))

  for (let i = 0; i < addresses.length; i++) {
    const walletAddress = addresses[i].toLowerCase()
    for (const tx of results[i]) {
      const existing = txMap.get(tx.hash)
      if (!existing) {
        txMap.set(tx.hash, { ...tx, walletAddress })
      } else if (
        tx.from.toLowerCase() === walletAddress &&
        !addrSet.has(existing.walletAddress)
      ) {
        txMap.set(tx.hash, { ...tx, walletAddress })
      }
    }
  }

  return [...txMap.values()].sort(
    (a, b) =>
      new Date(b.metadata.blockTimestamp).getTime() -
      new Date(a.metadata.blockTimestamp).getTime(),
  )
}

// ── 智能标签识别 ──────────────────────────────────────────

// 合约地址 → 协议类型映射
// 注意：'nft' 是中间态，detectTag 里会根据方向细分为 nft_buy / nft_sell
const KNOWN_CONTRACTS: Record<string, string> = {
  // Uniswap V2/V3 Router → swap
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'swap',  // Uniswap V2 Router
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'swap',  // Uniswap V3 Router
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'swap',  // Uniswap Universal Router
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'swap',  // Uniswap Universal Router v2
  // Uniswap LP → lp
  '0x1f98431c8ad98523631ae4a59f267346ea31f984': 'lp',    // Uniswap V3 Factory
  '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f': 'lp',    // Uniswap V2 Factory
  '0xc36442b4a4522e871399cd717abdd847ab11fe88': 'lp',    // Uniswap V3 NonfungiblePositionManager
  // OpenSea / Blur → nft（方向在 detectTag 里细分）
  '0x00000000006c3852cbef3e08e8df289169ede581': 'nft',   // Seaport 1.1
  '0x0000000000000068f116a894984e2db1123eb395': 'nft',   // Seaport 1.6
  '0x000000000000ad05ccc4f10045630fb830b95127': 'nft',   // Blur
  // Aave → lending
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'lending', // Aave V3
  '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9': 'lending', // Aave V2
  // Compound → lending
  '0xc3d688b66703497daa19211eedff47f25384cdc3': 'lending', // Compound V3
  // Lido → staking
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'staking',  // stETH
  // Rocket Pool → staking
  '0xdd3f50f8a6cafbe9b31a427582963f465e745af8': 'staking',  // rETH deposit
  // ENS → transfer
  '0x253553366da8546fc250f225fe3d25d0c782303b': 'transfer',
}

// 主流资产白名单：收到白名单内的 ERC20 算 income，否则算 airdrop
const ASSET_WHITELIST = new Set(['ETH', 'USDC', 'USDT', 'WETH', 'DAI', 'WBTC'])

// 自动检测标签（不覆盖用户手动标记）
// 识别优先级：合约地址 > 资产类型 > 方向兜底
export function detectTag(tx: RawTx & { walletAddress?: string }, walletAddress: string): TxTag {
  const wallet = (tx.walletAddress ?? walletAddress).toLowerCase()
  const isOutgoing = tx.from.toLowerCase() === wallet
  const toAddr = tx.to?.toLowerCase() ?? ''
  const value = Number.parseFloat(tx.value || '0')

  // 1. 合约地址精准匹配
  const protocol = KNOWN_CONTRACTS[toAddr]
  if (protocol) {
    if (protocol === 'nft') return isOutgoing ? 'nft_buy' : 'nft_sell'
    return protocol as TxTag
  }

  // 2. 资产类型推断
  if (tx.category === 'erc721' || tx.category === 'erc1155') {
    return isOutgoing ? 'nft_sell' : 'nft_buy'
  }

  // 收到 ERC20：白名单内 → income，白名单外（迷因币/小币种）→ airdrop
  if (!isOutgoing && tx.category === 'erc20') {
    return ASSET_WHITELIST.has(tx.asset ?? '') ? 'income' : 'airdrop'
  }

  // 3. 方向兜底
  if (!isOutgoing) return 'income'
  if (value < 0.001 && tx.category === 'external') return 'gas'

  return 'transfer'
}

// ── 余额查询 ──────────────────────────────────────────────

// 按 chainId 返回对应的 ERC20 token 合约地址
function getTokenAddresses(chainId: number): Record<string, string> {
  if (chainId === 42161) {
    // Arbitrum One
    return {
      USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
      WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    }
  }
  // Ethereum Mainnet
  return {
    USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  }
}

// ERC20 小数位（主网 USDC/USDT 是 6 位，WETH 是 18 位）
const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  WETH: 18,
}

// 拉取单个地址的余额（ETH + USDC/USDT/WETH）
export async function fetchBalances(
  address: string,
  chainId: number,
): Promise<WalletBalances> {
  const alchemy = getAlchemy(chainId)
  const tokenAddrs = getTokenAddresses(chainId)

  // 并行拉 ETH 余额 + ERC20 余额 + 价格
  const [ethBalanceHex, tokenRes, priceRes] = await Promise.all([
    alchemy.core.getBalance(address),
    alchemy.core.getTokenBalances(address, Object.values(tokenAddrs)),
    fetch('/api/prices').then(r => r.json()).catch(() => ({ ETH: 0, USDC: 1, USDT: 1, WETH: 0 })),
  ])

  // ETH 余额（BigNumber → 人类可读）
  const ethBalance = Number(ethBalanceHex.toBigInt()) / 1e18
  const prices: Record<string, number> = priceRes

  const tokens: TokenBalance[] = [
    {
      symbol: 'ETH',
      balance: ethBalance,
      usdValue: ethBalance * (prices.ETH ?? 0),
    },
  ]

  // ERC20 余额
  const addrToSymbol: Record<string, string> = {}
  Object.entries(tokenAddrs).forEach(([sym, addr]) => {
    addrToSymbol[addr.toLowerCase()] = sym
  })

  for (const item of tokenRes.tokenBalances) {
    const sym = addrToSymbol[item.contractAddress.toLowerCase()]
    if (!sym || !item.tokenBalance) continue
    const decimals = TOKEN_DECIMALS[sym] ?? 18
    const raw = BigInt(item.tokenBalance)
    const balance = Number(raw) / Math.pow(10, decimals)
    tokens.push({
      symbol: sym,
      balance,
      usdValue: balance * (prices[sym] ?? 1),
    })
  }

  const totalUsd = tokens.reduce((sum, t) => sum + t.usdValue, 0)
  return { address: address.toLowerCase(), tokens, totalUsd }
}

// 聚合多个钱包的余额
export async function fetchAllBalances(
  addresses: string[],
  chainId: number,
): Promise<{ totalUsd: number; tokens: Record<string, number> }> {
  if (addresses.length === 0) return { totalUsd: 0, tokens: {} }

  const results = await Promise.all(addresses.map(addr => fetchBalances(addr, chainId)))

  const totals: Record<string, number> = {}
  let totalUsd = 0

  for (const wallet of results) {
    totalUsd += wallet.totalUsd
    for (const t of wallet.tokens) {
      totals[t.symbol] = (totals[t.symbol] ?? 0) + t.balance
    }
  }

  return { totalUsd, tokens: totals }
}

// ── 工具函数 ──────────────────────────────────────────────

// 把 wei 转换成 ETH，保留 4 位小数
export function weiToEth(wei: string): string {
  const eth = Number(BigInt(wei)) / 1e18
  return eth.toFixed(4)
}

// 把时间戳格式化成 "Jun 14" 这样的短日期
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// 保留向后兼容（旧代码仍可调用）
export function detectProtocol(toAddress: string | null): string {
  if (!toAddress) return ''
  return KNOWN_CONTRACTS[toAddress.toLowerCase()] ?? ''
}
