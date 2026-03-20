// app/api/prices/route.ts
// 服务端代理 CoinGecko 价格接口，避免浏览器直接调用的 CORS 限制

import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin,tether,weth&vs_currencies=usd',
      { next: { revalidate: 60 } },   // Next.js 缓存 60 秒
    )

    if (!res.ok) {
      throw new Error(`CoinGecko HTTP ${res.status}`)
    }

    const data = await res.json()

    return NextResponse.json({
      ETH:  data.ethereum?.usd  ?? 0,
      USDC: data['usd-coin']?.usd ?? 1,
      USDT: data.tether?.usd    ?? 1,
      WETH: data.weth?.usd      ?? 0,
    })
  } catch {
    // CoinGecko 失败时返回合理默认值，不影响主界面
    return NextResponse.json(
      { ETH: 0, USDC: 1, USDT: 1, WETH: 0 },
      { status: 200 },
    )
  }
}
