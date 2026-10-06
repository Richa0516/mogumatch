# MoguMatch

友人同士で行きたい飲食店を選ぶ、スワイプ投票型のWebアプリです。ホストが候補店舗を集め、共有リンクから参加したメンバーが「いいね」「良くない」を選び、グループの投票結果を確認できます。

JPHACKS 2025の「Mogufinder」を参考に、アプリ開発を勉強するために実装しています。参考作品の開発者とは関係ありません。画面・API・データベースの仕組みを学習するために、Codexを用いながら開発しました。

## できること

- 検索条件を指定して投票ルームを作成し、参加リンクを共有する
- 会員登録なしで、ニックネームを入力して参加する
- 店舗カードを左右にスワイプして投票する（ボタン・キーボード操作にも対応）
- 投票中に直前の投票を取り消す
- 途中結果や、ホストが締め切った後の最終結果を見る
- ホストがルームを削除する

ルームの利用期限は作成から1時間です。期限切れのルーム・参加者・投票は定期処理で削除します。ローカル環境では開発サーバー稼働中に実行され、PCの停止・スリープ中は削除が遅れます。

参加者はブラウザのCookieで識別します。別ブラウザへの移動やCookieの削除後は、同じ参加者として復帰できません。投票開始後の新規参加、締切後の投票変更には対応していません。

## 技術スタック

| 分野 | 技術・用途 |
| --- | --- |
| フロントエンド | React 19、TypeScript、CSS / Tailwind CSS 4 |
| アプリ基盤 | Vinext（Next.js互換・ベータ版）、Vite |
| バックエンド | TypeScriptによるAPI、Cloudflare Workers向けの実装 |
| データベース | Cloudflare D1（SQLite）、SQLによる読み書き |
| DB定義・移行 | Drizzle ORM / Drizzle Kit、SQLマイグレーション |
| 開発環境 | Node.js、Wrangler、Cloudflare Viteプラグイン |
| 店舗検索 | ホットペッパーグルメ Webサービス |

ブラウザからアプリのAPIへリクエストを送り、サーバーが参加者や期限を確認してDBへ投票を保存します。店舗検索APIもサーバーから呼び出し、APIキーをブラウザに渡さない構成です。

## 起動方法

### 必要なもの

- Node.js 22.13.0以上とnpm
- このリポジトリのソースコード
- 実店舗モードを利用する場合のみ、ご自身のホットペッパーグルメ WebサービスのAPIキー

以下のコマンドは、`package.json`があるフォルダーで実行してください。

### 初回セットアップ

依存パッケージをインストールし、ローカルDBの設定ファイルを生成します。

```sh
npm ci
npm run build
```

続いて、新しいローカルDBに次のSQLを順番に適用します。すでにセットアップ済みのDBには再実行せず、未適用のものだけを適用してください。

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_furry_morlocks.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_loving_molten_man.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_minimize_provider_data.sql
```

### 開発サーバーの起動

```sh
npm run dev
```

ターミナルに表示されたURL（通常は `http://localhost:5173`）を開きます。停止は `Ctrl+C` です。次のコマンドでも起動できます。

```sh
node scripts/run-framework.mjs dev
```

Windowsでは、依存パッケージとDBの準備後に次の起動スクリプトも使えます。

```powershell
.\start-dev.cmd
```

このスクリプトはPATH上のNode.js、または対応するCodexローカル環境のNode.jsを探します。どちらもない場合はNode.jsをインストールしてください。

### 1台のPCで複数人の投票を試す

1. 通常のブラウザでホストとしてルームを作成します。
2. 参加リンクを別ブラウザ、またはシークレットウィンドウで開きます。
3. 別のニックネームで参加し、ホストが投票を開始します。
4. 両方で投票し、取り消し・集計・締切を試します。

同じブラウザの通常タブ同士ではCookieを共有するため、同じ参加者として扱われます。`localhost`のリンクは別の端末からは利用できません。友人のスマートフォンなどから参加するには、別途アクセス可能なサーバー環境が必要です。

## デモモードと実店舗モード

| 項目 | デモモード | 実店舗モード |
| --- | --- | --- |
| 店舗情報 | 架空のサンプル | APIから取得した実店舗 |
| APIキー | 不要 | 必要 |
| 検索 | サンプルを距離・予算で絞り込み | 現在地周辺、または地名・住所のキーワード検索 |
| 写真 | 共通の参考写真 | APIで提供される店舗写真（ない場合もあります） |
| 参加・投票・集計 | ローカルDBを使って動作 | 同じ仕組みで動作 |

### デモモード

`RESTAURANT_MODE`が未設定の場合はデモモードです。明示的に指定する場合は、プロジェクト直下に`.dev.vars`を作成して次を記入します。

```dotenv
RESTAURANT_MODE="demo"
```

デモの店舗・距離・価格は架空で、選択したエリアの実店舗を検索するものではありません。

### 実店舗モード

[リクルートWEBサービス](https://webservice.recruit.co.jp/)でAPIキーを取得し、プロジェクト直下の`.dev.vars`に設定します。

```dotenv
RESTAURANT_MODE="live"
HOTPEPPER_API_KEY="ここにご自身のAPIキーを入力"
```

設定を変更したら開発サーバーを再起動してください。`.dev.vars`はGitの管理対象から除外しています。APIキーやローカルDBをリポジトリに追加しないでください。

- 現在地検索にはブラウザの位置情報へのアクセス許可が必要です。
- 距離は検索地点からの半径による圏内表示です。徒歩・車などの移動距離ではありません。
- 地名・住所はキーワードとして検索します。住所を座標へ変換して、その周辺を半径検索する仕組みではありません。
- 掲載予算はディナーの目安です。営業時間や料金などは店舗ページで確認してください。
- 店舗名・住所・写真URLなどの詳細はDBに保存せず、表示時に取得します。投票の紐付けに必要な店舗ID等は一時保存します。

APIの利用条件への対応と、店舗ID等の一時保存についての提供元回答は [API_COMPLIANCE.md](./API_COMPLIANCE.md) に記録しています。

## 学習・開発について

参考にした作品は、JPHACKS 2025の「Mogufinder」（OS_2504 / million遍）です。グループで飲食店を選ぶ体験を題材に、Webアプリの開発を学ぶ目的で制作しています。

Codexを用いながら、機能の実装、不具合の修正、動作確認、ドキュメントの作成を進めています。コードの理解を深め、自分でも変更・実装できるようになることを目指しています。

コードを読みながら学ぶ場合は [LEARNING_GUIDE.md](./LEARNING_GUIDE.md) を参照してください。

| 主なファイル | 役割 |
| --- | --- |
| `app/mogu-app.tsx` | ルーム作成・参加・投票・結果の画面 |
| `lib/room-server.ts` | 参加者確認、投票処理、保存、集計 |
| `lib/hotpepper.ts` | 店舗検索APIとの通信 |
| `db/schema.ts` | データベースの構造 |
| `lib/room-cleanup.ts` | 期限切れデータの削除 |
| `worker/index.ts` | サーバーの入り口と定期処理 |

現時点ではローカルでの学習・動作確認用です。GitHubでのソースコード公開と、アプリを利用できるサーバーへの公開は別です。本番環境での定期削除や無料枠の確認など、一般公開前の作業は [BETA_RELEASE.md](./BETA_RELEASE.md) を参照してください。
