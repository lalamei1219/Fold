# Cursor 常用提示词备忘

开发过程中遇到问题，直接复制下面对应的提示词粘贴给 Cursor。

---

## 环境问题

**装依赖报错**
```
帮我解决这个 npm 安装错误，我的 Node 版本是 [你的版本]，错误信息如下：[粘贴错误]
```

**类型报错**
```
这段 TypeScript 报类型错误，帮我修复，不要改变函数的逻辑：[粘贴代码和错误]
```

---

## 功能扩展

**支持 Arbitrum 链**
```
在 lib/alchemy.ts 的 fetchTransactions 函数里，
增加一个 chainId 参数，支持传入 1（Ethereum）或 42161（Arbitrum），
自动切换对应的 Alchemy endpoint URL。
```

**加载状态骨架屏**
```
在 app/txs/page.tsx 的加载状态，
把简单的文字"读取链上记录中"替换成骨架屏效果：
3 行灰色占位条，用 CSS animation pulse 实现闪烁，
宽度分别是 100%、75%、90%。
```

**交易金额换算成美元**
```
在 DisplayTx 类型里增加一个 amountUSD 字段，
在 toDisplayTx 函数里调用 CoinGecko 的免费 API：
https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd
把 ETH 金额换算成 USD，保留 2 位小数。
注意做好错误处理，API 失败时 amountUSD 返回 null。
```

**导出月度账单为文本**
```
在 app/summary/page.tsx 的底部，
添加一个"复制账单"按钮，
点击后把本月所有标注过的交易格式化成纯文本，
复制到剪贴板，格式如下：

fold 月度账单 - Jun 2025
==========================
【收益】3 笔  +0.0840 ETH
  Uniswap LP · Jun 10  +0.0840 ETH
  ...
【Swap】2 笔  -0.8000 ETH
  ...
==========================
净结余：+0.0212 ETH
```

---

## 样式调整

**换主色调**
```
把项目里所有 #7F77DD 替换成 #5B8DEF（蓝色系），
同时把 #1e1a3a 背景色替换成 #0f1e35。
```

**增大点击区域**
```
在移动端，把 app/txs/page.tsx 里每一行交易的高度从 py-3 改成 py-4，
让手指更容易点到。
```

---

## 黑客松提交准备

**生成 README**
```
根据以下产品描述，帮我写一个 GitHub README.md：

产品名：fold
一句话：把混乱折成清晰
功能：Web3 玩家的链上交易记账工具，连接钱包后自动读取交易，
      支持打标签（swap/NFT/gas/转账/收益）和备注，月度总结页折叠归类。
技术栈：Next.js 14 + wagmi + Alchemy + Dexie.js + Tailwind
部署：Vercel

README 要包含：项目介绍、功能截图占位、本地运行步骤、环境变量说明。
```

**写黑客松项目简介（英文）**
```
帮我用英文写一段黑客松项目简介，200 字以内，
产品叫 fold，是 Web3 玩家的on-chain transaction ledger，
核心差异化是"automatically reads on-chain history and lets users annotate each transaction with tags and notes, then folds them into a clean monthly summary"，
技术亮点是 local-first（no server, no signup），
目标是 Best Consumer App / Best UX 赛道。
```
