# fold — Cursor 启动提示词

把这段话直接粘贴到 Cursor 的 Chat 里，作为第一条消息发送。

---

## 粘贴给 Cursor 的内容

```
你是我的全栈开发搭档，我们要一起用 Next.js 14 (App Router) + TypeScript 构建一个叫 fold 的 Web3 记账工具。

## 产品定义
fold 是 Web3 玩家的链上交易记账本：
- 连接钱包（MetaMask / WalletConnect）
- 自动读取链上交易记录（只读，不签名）
- 用户为每笔交易打标签（swap/NFT/gas/转账/收益）+ 加备注
- 月度总结页按标签折叠归类，显示净结余

## 技术栈
- Next.js 14 App Router + TypeScript
- wagmi v2 + viem（钱包连接）
- Alchemy SDK（读取链上交易）
- Dexie.js（IndexedDB 本地存储标签和备注）
- Tailwind CSS（样式，暗色主题）
- Vercel 部署

## 第一步任务
请帮我完成项目初始化：
1. 创建 Next.js 14 项目（已有 package.json 就跳过）
2. 安装依赖：wagmi viem @wagmi/connectors @alchemy-sdk dexie tailwindcss
3. 配置 wagmi provider（支持 Ethereum mainnet + Arbitrum）
4. 配置 Tailwind 暗色主题（背景 #111，主色 #7F77DD）
5. 创建基础页面结构：/ (连接页) /txs (交易列表) /summary (月度总结)
6. 在 /txs 页面用 Alchemy SDK 读取已连接钱包的最近 50 笔交易并渲染列表

环境变量：
NEXT_PUBLIC_ALCHEMY_KEY=（我会填入）
NEXT_PUBLIC_WALLETCONNECT_ID=（我会填入）

代码风格要求：
- 所有组件用函数式 + TypeScript
- 文件结构清晰，每个页面单独目录
- 注释用中文，方便我理解
- 遇到复杂逻辑先说思路再写代码
```

---
