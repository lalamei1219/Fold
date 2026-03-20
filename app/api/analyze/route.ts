// app/api/analyze/route.ts
// AI 分析接口：接收月度交易摘要，返回链上行为分析

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { txData, month } = await req.json()

    const { total, byTag, netPnl, totalGas, gasRatio, topTag } = txData

    const prompt = `你是一位 Web3 链上财务分析师，用朋友的语气分析用户的月度链上行为。

用户 ${month} 数据：
- 总交易 ${total} 笔，净盈亏 ${netPnl > 0 ? '+' : ''}${netPnl.toFixed(4)} ETH
- Gas 消耗 ${totalGas.toFixed(4)} ETH（占支出 ${gasRatio.toFixed(1)}%）
- 最活跃标签：${topTag}
- 各标签笔数：${Object.entries(byTag as Record<string, number>).map(([k, v]) => `${k}(${v})`).join('、')}

请给出 100 字以内的分析，要求：
1. 先用 1 句话点出最突出的特征
2. 再给 1 条具体可行的建议
3. 语气轻松，像朋友聊天
4. 不要重复列出数字，侧重解读行为模式`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ analysis: text })
  } catch (e) {
    console.error('AI 分析失败', e)
    return NextResponse.json({ error: '分析失败，请稍后重试' }, { status: 500 })
  }
}
