# 蘭因（Lain）程式語言

> **⚠️ 早期試作**：本語言方在草創之際，介面、語法與諸般機能，皆可能驟更。請審慎試用，自負其責。

> **⚠️ 網路與安全告示（研究原型）**
>
> 蘭因現階段之設計，意在 **本地或同處之網域**（如 LAN／工作室／實驗室／工坊），並以 **受邀或半可信同儕** 為用。
>
> 今尚 **未以公開或敵對網路之部署為範圍**，切勿曝露於公網。
>
> 供試驗與示範之便，請遵循：
> - 視其運行如「同室共作」，非私密匿名之境；
> - 勿於存有真實祕密之機器上試跑（API 金鑰、SSH 金鑰、個人憑證等）；
> - 宜另設開發帳號、容器或虛擬機以行之。
>
> 安全強固與沙箱隔離，固為要務，然此期非本研究之首務；本期重心在 **共在、漸進、多端協作之程式互動環境**。

萊因者，傳衍立道，活演四達。
視文如生，定更輒化。
鑄樞降式入圖，鑄道自衍，感而漸就。
藏術即換，綱動而目張，態勢悉存。
籌格感輸自更，矢時定序，因果不紊。

蘭因為實驗研究系統，設計日新。歡迎回饋、討論與審慎試驗。

## 示範（DEMO）

`https://www.youtube.com/watch?v=yg91Hchd1hI`

## 安裝

### 先決條件

- [Bun](https://bun.sh)（建議使用最新版本）
- Git

### 速啟（Quick Start）

1. 取回本倉庫：

```bash
git clone https://github.com/Semi-0/lain-lang.git
cd lain-lang
```

2. 執行安裝腳本：

```bash
./install.sh
```

此腳本將：
- 自動辨識倉庫結構
- 於上層目錄備妥工作區（workspace）骨架
- 自 GitHub 取回所需工作區相依（Propagator、GenericProcedure、PMatcher、Sando）
- 以 `bun install` 安裝一切相依

3. 以測試驗證安裝：

```bash
cd ..
bun test lain-lang/lain-lang/test
```

或於工作區根目錄直行：

```bash
cd lain-lang/lain-lang
bun test
```

### 手動設置（Manual Setup）

若欲手動配置，請依次為之：

1. 建立工作區目錄並取回本倉庫：

```bash
mkdir lain-lang-workspace
cd lain-lang-workspace
git clone https://github.com/Semi-0/lain-lang.git lain-lang
```

2. 取回工作區相依倉庫：

```bash
git clone https://github.com/Semi-0/Propagator.git Propogator
git clone https://github.com/Semi-0/GenericProcedure.git GenericProcedure
git clone https://github.com/Semi-0/PMatcher.git PMatcher
git clone https://github.com/Semi-0/Sando.git Sando
```

3. 建立工作區 `package.json`：

```json
{
  "name": "lain-lang-workspace",
  "private": true,
  "version": "0.0.0",
  "workspaces": [
    "lain-lang",
    "Propogator",
    "GenericProcedure",
    "PMatcher",
    "Sando"
  ]
}
```

4. 安裝相依：

```bash
bun install
```

## 用法

### 執行測試

```bash
cd lain-lang
bun test
```

### 命令列（CLI）諸令

安裝既畢，可用下列命令：

- **主機（Host Server）**：`bun run lain-host`
- **同儕（Peer Client）**：`bun run lain-peer`
- **互動式殼（REPL）**：`bun run lain-repl`

## 要旨與特色

### 分散式即時編碼

蘭因之分散式即時編碼，具下列要點：

- **閉包跨端展開**：閉包得於多端連線間展開並分享，使分散式函式定義可同步一致。
- **熱更而不失態**：任一同儕可改易閉包定義，變更即自動傳播至所有連線同儕；熱更之際仍保全既有計算狀態，使運行不致中斷。
- **端對端同步**：以 Gun.js 為基之去中心同步；任一端可為主亦可為客，拓樸可隨事而變。
- **漸進式編譯**：程式更動僅觸發受影響部件之重編，縱代碼浩繁，亦能從容。

## 工程結構

- `compiler/` - 編譯器實作
- `DB/` - 資料庫介面與序列化
- `src/cli/` - 命令列入口
- `src/p2p/` - P2P 同步設置
- `test/` - 測試檔

## 工作區相依

本專案以 Bun workspace 管理相依，主要包含：

- **Propogator** - 傳播子網路實作
- **GenericProcedure** - 泛型程序（generic procedure）之處理器
- **PMatcher** - 模式比對函式庫
- **Sando** - 分層資料結構

以上皆各自為獨立 Git 倉庫，由安裝腳本自動設置。

## 開發備註

本專案主要使用：

- **Bun**：套件管理與執行環境
- **TypeScript**：型別安全
- **Gun.js**：P2P 同步

## 鳴謝（Credits）

蘭因承繼並受惠於下列基礎工程：

- **[Gun.js](https://gun.eco/)** - 提供端對端同步層，使分散式即時編碼與多機即時資料同步得以成形；其去中心架構，使任一同儕皆可為主為客。
- **[ppropagator](https://github.com/Semi-0/Propagator)** - 實作傳播子網路之骨幹，以 cell／propagator 之反應式模型承載計算；並含向量鐘之因果追蹤，使分散情境之更新得其序。
- **[sando-layer](https://github.com/Semi-0/Sando)** - 提供分層資料結構以處理副作用與元資訊；其 layer 機制可將支援資訊、時間戳與錯誤狀態與基值同傳遞，對熱更保態尤為要。
- **[pmatcher](https://github.com/Semi-0/PMatcher)** - 具回溯與詞法作用域之強力模式比對庫；蘭因編譯器多處用以比對語法樹，俾利轉換與分析。
- **[generic-handler](https://github.com/Semi-0/GenericProcedure)** - 提供可擴充之泛型程序處理器，使多型派發與跨資料型別之通用操作得以從容擴展。

## 授權

詳見 `LICENSE`。

## 背景與淵源

蘭因之設計，受 propagator 網路與可擴充解譯器等先行研究所啟迪，尤以 Chris Hanson 與 Gerald Jay Sussman 於《Software Design for Flexibility》及其 SDF（Scheme）實作之論述為要。

SDF 提供一套關於傳播子計算、泛型解譯器與漸進式求值之奠基探索。蘭因並不直接挪用其程式碼，惟以 TypeScript 為器，面向分散與即時編碼之旨趣，重釋並伸展其觀念；其架構與語義皆有顯著之更張。

版權所有 © 2024–2026 semi-0（Pandi Lin）

本專案依 GNU General Public License v3.0 授權。
詳見 `LICENSE`。

