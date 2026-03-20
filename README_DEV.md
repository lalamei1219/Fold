# fold 开发指南

## 快速开始

```bash
npx create-next-app@latest fold --typescript --tailwind --app --no-src-dir
cd fold
npm install wagmi viem @wagmi/connectors dexie
npm install -D @types/node
```

## 环境变量

在项目根目录创建 `.env.local`：

```
NEXT_PUBLIC_ALCHEMY_KEY=你的Alchemy_API_Key
NEXT_PUBLIC_WALLETCONNECT_ID=你的WalletConnect_Project_ID
```

获取方式：
- Alchemy Key：https://dashboard.alchemy.com → 新建App → 复制API Key（免费）
- WalletConnect ID：https://cloud.walletconnect.com → 新建Project → 复制Project ID（免费）

## 文件结构

```
fold/
├── app/
│   ├── layout.tsx          # 根布局，包裹 WagmiProvider
│   ├── page.tsx            # 连接钱包页
│   ├── txs/
│   │   └── page.tsx        # 交易列表页
│   └── summary/
│       └── page.tsx        # 月度总结页
├── components/
│   ├── ConnectButton.tsx   # 连接钱包按钮
│   ├── TxRow.tsx           # 单笔交易行
│   ├── TxDetail.tsx        # 交易详情（标签+备注）
│   └── SummaryGroup.tsx    # 折叠分组组件
├── lib/
│   ├── wagmi.ts            # wagmi 配置
│   ├── alchemy.ts          # Alchemy SDK 封装
│   └── db.ts               # Dexie IndexedDB 定义
├── types/
│   └── index.ts            # TypeScript 类型定义
└── .env.local
```

## 部署到 Vercel

```bash
npm install -g vercel
vercel
# 按提示操作，自动部署
# 在 Vercel 控制台添加环境变量
```
