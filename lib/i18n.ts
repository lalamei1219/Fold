export type Locale = 'zh' | 'en' | 'jp' | 'kr'

export const LOCALES: Locale[] = ['zh', 'en', 'jp', 'kr']

export interface I18nTexts {
  slogan: string
  subtitle: string
  footer: string
  connectMetaMask: string
  connectWalletConnect: string
  disconnect: string
  month: string
  txsCountLabel: string
  untaggedLabel: string
  noTxs: string
  noTaggedTxs: string
  readOnlyWarning: string
  pageTitle: string
  detailBack: string
  amountLabel: string
  timeLabel: string
  tagsLabel: string
  notesLabel: string
  saveButton: string
  loadingHistory: string
  loadingSummary: string
  billTitle: string
  totalIncome: string
  totalSpend: string
  totalGas: string
  netBalance: string
  noTaggedTransactions: string
  goTagTx: string
  txLabel: string
  walletsTitle: string
  walletsManage: string
  walletsEmpty: string
  walletsAddPlaceholder: string
  walletsAdd: string
  walletsRemove: string
  walletsAddConnected: string
  walletsLabelPlaceholder: string
}

export const I18N: Record<Locale, I18nTexts> = {
  zh: {
    slogan: '把混乱折成清晰',
    subtitle: '自动读取链上交易，本地存储，不上链',
    footer: '仅读取权限，无法操作你的资产',
    connectMetaMask: '连接 MetaMask',
    connectWalletConnect: '连接 WalletConnect',
    disconnect: '断开钱包',
    month: '本月',
    txsCountLabel: '交易笔数',
    untaggedLabel: '未标记',
    noTxs: '本月暂无链上记录',
    noTaggedTxs: '还没有标记任何交易',
    readOnlyWarning: '仅读取权限，无法操作你的资产',
    pageTitle: 'fold',
    detailBack: '← 返回',
    amountLabel: '金额',
    timeLabel: '时间',
    tagsLabel: '标签',
    notesLabel: '备注',
    saveButton: '保存 → 折叠归类',
    loadingHistory: '读取链上记录中…',
    loadingSummary: '整理账单中…',
    billTitle: '本月账单',
    totalIncome: '总收益',
    totalSpend: '总支出',
    totalGas: 'Gas 总计',
    netBalance: '净结余',
    noTaggedTransactions: '还没有标记任何交易',
    goTagTx: '去标记交易 →',
    txLabel: '交易',
    walletsTitle: '钱包管理',
    walletsManage: '钱包',
    walletsEmpty: '还没有添加钱包',
    walletsAddPlaceholder: '输入钱包地址 0x…',
    walletsAdd: '添加',
    walletsRemove: '删除',
    walletsAddConnected: '添加已连接钱包',
    walletsLabelPlaceholder: '昵称（可选）',
  },
  en: {
    slogan: 'Fold the chaos, find the clarity',
    subtitle: 'Auto-reads on-chain txs. Local only.',
    footer: 'Read-only. Cannot move your assets.',
    connectMetaMask: 'Connect MetaMask',
    connectWalletConnect: 'Connect WalletConnect',
    disconnect: 'Disconnect',
    month: 'This month',
    txsCountLabel: 'Tx count',
    untaggedLabel: 'Untagged',
    noTxs: 'No on-chain records this month',
    noTaggedTxs: 'No tagged transactions yet',
    readOnlyWarning: 'Read-only. Cannot move your assets.',
    pageTitle: 'fold',
    detailBack: '← Back',
    amountLabel: 'Amount',
    timeLabel: 'Time',
    tagsLabel: 'Tag',
    notesLabel: 'Note',
    saveButton: 'Save → Fold',
    loadingHistory: 'Loading history…',
    loadingSummary: 'Summarizing bills…',
    billTitle: 'This month bill',
    totalIncome: 'Total income',
    totalSpend: 'Total spend',
    totalGas: 'Total gas',
    netBalance: 'Net balance',
    noTaggedTransactions: 'No tagged transactions yet',
    goTagTx: 'Tag transactions →',
    txLabel: 'Tx',
    walletsTitle: 'Wallets',
    walletsManage: 'Wallets',
    walletsEmpty: 'No wallets added yet',
    walletsAddPlaceholder: 'Enter address 0x…',
    walletsAdd: 'Add',
    walletsRemove: 'Remove',
    walletsAddConnected: 'Add connected wallet',
    walletsLabelPlaceholder: 'Nickname (optional)',
  },
  jp: {
    slogan: '混沌を整理する',
    subtitle: 'チェーン上の取引を自動読取。ローカル保存。',
    footer: '読み取り専用。資産は操作できません。',
    connectMetaMask: 'MetaMask を接続',
    connectWalletConnect: 'WalletConnect を接続',
    disconnect: '切断する',
    month: '今月',
    txsCountLabel: '取引数',
    untaggedLabel: '未タグ',
    noTxs: '今月は取引がありません',
    noTaggedTxs: 'タグ付き取引がまだありません',
    readOnlyWarning: '読み取り専用。資産は操作できません。',
    pageTitle: 'fold',
    detailBack: '← 戻る',
    amountLabel: '金額',
    timeLabel: '時間',
    tagsLabel: 'タグ',
    notesLabel: 'メモ',
    saveButton: '保存 → フォルダ',
    loadingHistory: '取引を読み込み中…',
    loadingSummary: '請求書を整理中…',
    billTitle: '今月の請求',
    totalIncome: '総収入',
    totalSpend: '総支出',
    totalGas: '総ガス',
    netBalance: '純残高',
    noTaggedTransactions: 'タグ付き取引がまだありません',
    goTagTx: '取引にタグを付ける →',
    txLabel: '取引',
    walletsTitle: 'ウォレット管理',
    walletsManage: 'ウォレット',
    walletsEmpty: 'ウォレットが追加されていません',
    walletsAddPlaceholder: 'アドレスを入力 0x…',
    walletsAdd: '追加',
    walletsRemove: '削除',
    walletsAddConnected: '接続中のウォレットを追加',
    walletsLabelPlaceholder: 'ニックネーム（任意）',
  },
  kr: {
    slogan: '혼란을 정리하다',
    subtitle: '온체인 거래 자동 읽기. 로컬 저장.',
    footer: '읽기 전용. 자산 조작 불가.',
    connectMetaMask: 'MetaMask 연결',
    connectWalletConnect: 'WalletConnect 연결',
    disconnect: '지갑 연결 해제',
    month: '이번 달',
    txsCountLabel: '거래 수',
    untaggedLabel: '미태그',
    noTxs: '이번 달 온체인 기록 없음',
    noTaggedTxs: '태그된 거래가 없습니다',
    readOnlyWarning: '읽기 전용. 자산 조작 불가.',
    pageTitle: 'fold',
    detailBack: '← 뒤로',
    amountLabel: '금액',
    timeLabel: '시간',
    tagsLabel: '태그',
    notesLabel: '메모',
    saveButton: '저장 → 폴드',
    loadingHistory: '기록 로딩 중…',
    loadingSummary: '청구서 정리 중…',
    billTitle: '이번 달 청구',
    totalIncome: '총 수입',
    totalSpend: '총 지출',
    totalGas: '총 가스',
    netBalance: '순 잔액',
    noTaggedTransactions: '태그된 거래가 없습니다',
    goTagTx: '거래 태그하기 →',
    txLabel: '거래',
    walletsTitle: '지갑 관리',
    walletsManage: '지갑',
    walletsEmpty: '추가된 지갑이 없습니다',
    walletsAddPlaceholder: '주소 입력 0x…',
    walletsAdd: '추가',
    walletsRemove: '삭제',
    walletsAddConnected: '연결된 지갑 추가',
    walletsLabelPlaceholder: '닉네임 (선택)',
  },
}

const STORAGE_KEY = 'fold_locale'

export function loadLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return 'zh'
  return LOCALES.includes(raw as Locale) ? (raw as Locale) : 'zh'
}

export function saveLocale(locale: Locale) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, locale)
}
