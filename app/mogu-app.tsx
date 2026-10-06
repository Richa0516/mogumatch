"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Copy,
  Heart,
  MapPin,
  Users,
  X,
  Utensils,
  ArrowLeft,
  CircleHelp,
  Trophy,
  LoaderCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  areas,
  findSamples,
  priceLabel,
  radiusOptions,
  distanceBandLabel,
  restaurantBudgetLabel,
  type Restaurant,
} from "@/lib/restaurants";
import type { Room } from "@/lib/room-types";

class ApiClientError extends Error { constructor(message: string, public status: number) { super(message); } }
async function api<T = Room>(path: string, body?: object): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    signal: AbortSignal.timeout(15000),
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiClientError(
      (data as { error?: string }).error ||
        "通信に失敗しました。もう一度お試しください。", response.status
    );
  return data as T;
}
function mergeRoomState(next: Room, previous: Room | null): Room {
  if (next.detailsIncluded || !previous || previous.id !== next.id) return next;
  const old = new Map(previous.candidates.map(r => [r.id, r]));
  return { ...next, detailsFetchedAt: previous.detailsFetchedAt,
    candidates: next.candidates.map(r => old.get(r.id) ?? r),
    results: next.results.map(r => ({ ...r, ...(old.get(r.id) ?? {}) })) };
}
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="choice">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function FoodPhoto({ restaurant }: { restaurant?: Restaurant }) {
  return (
    <div
      className="food-photo"
      style={{ backgroundColor: restaurant?.color ?? "#edb34d" }}
    >
      {(!restaurant?.source || restaurant.imageUrl) && <img
        src={restaurant?.imageUrl ?? (restaurant?.source ? undefined : "/food.jpg")}
        alt={restaurant?.source ? `${restaurant.name}の掲載写真` : "カレーの参考写真。掲載店舗の料理ではありません。"}
        referrerPolicy="no-referrer"
        draggable={false}
      />}
      <span>{restaurant?.source ? (restaurant.imageUrl ? "画像提供：ホットペッパー グルメ" : "写真なし") : "参考写真"}</span>
    </div>
  );
}
export default function MoguApp() {
  const [mode, setMode] = useState<"demo" | "live" | null>(null);
  const [searchMode, setSearchMode] = useState("keyword");
  const [keyword, setKeyword] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    void api<{ restaurantMode: "demo" | "live" }>("/api/rooms").then(value => setMode(value.restaurantMode)).catch(() => setError("設定を読み込めませんでした。ページを再読み込みしてください。"));
  }, []);
  async function locate() {
    if (!navigator.geolocation) { setError("このブラウザでは現在地を取得できません。地名・住所で検索してください。"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      setLatitude(String(position.coords.latitude)); setLongitude(String(position.coords.longitude)); setLocating(false);
    }, () => { setLocating(false); setError("現在地を取得できませんでした。許可設定を確認するか、地名・住所で検索してください。"); }, { timeout: 10000, maximumAge: 60000 });
  }
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const roomSnapshot = useRef<Room | null>(null);
  roomSnapshot.current = room;
  const [initialized, setInitialized] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState(areas[0]);
  const [radius, setRadius] = useState("1000");
  const [budget, setBudget] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [drag, setDrag] = useState(0);
  const [help, setHelp] = useState(false);
  const dragStart = useRef<number | null>(null);
  const mutation = useRef(false);
  const refreshVersion = useRef(0);
  const unavailable = useRef(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const candidates = findSamples(Number(radius), Number(budget));
  useEffect(() => {
    const sync = () => {
      unavailable.current = false;
      setRoom(null);
      setResultsVisible(false);
      setRoomId(new URLSearchParams(location.search).get("room"));
      setInitialized(true);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const refresh = useCallback(async () => {
    if (!roomId || mutation.current) return;
    const version = ++refreshVersion.current;
    try {
      const previous = roomSnapshot.current;
      const fresh = previous?.id === roomId && previous.detailsFetchedAt && Date.now() - previous.detailsFetchedAt < 3600000;
      const next = await api(`/api/rooms/${roomId}${fresh ? "?state=1" : ""}`);
      if (version === refreshVersion.current && !mutation.current) {
        setRoom(previous => mergeRoomState(next, previous));
        setError("");
      }
    } catch (e) {
      if (version !== refreshVersion.current) return;
      if (e instanceof ApiClientError && [404, 410].includes(e.status)) { unavailable.current = true; setRoom(null); }
      if (version === refreshVersion.current) {
        if (roomSnapshot.current?.detailsFetchedAt && Date.now() - roomSnapshot.current.detailsFetchedAt! >= 3600000) setRoom(null);
        setError((e as Error).message);
      }
    }
  }, [roomId]);
  useEffect(() => {
    if (!roomId) return;
    void refresh();
    const checkExpiry = () => {
      const value = roomSnapshot.current;
      if (value && (value.expiresAt <= Date.now() || Date.now() - (value.detailsFetchedAt ?? 0) >= 3600000)) {
        roomSnapshot.current = null; setRoom(null);
        if (!document.hidden) void refresh();
        return true;
      }
      return false;
    };
    document.addEventListener("visibilitychange", checkExpiry);
    const timer = setInterval(() => {
      if (checkExpiry()) return;
      if (!document.hidden && !unavailable.current && (roomSnapshot.current?.status !== "closed" || roomSnapshot.current.expiresAt <= Date.now() || Date.now() - (roomSnapshot.current.detailsFetchedAt ?? 0) >= 3600000)) void refresh();
    }, 3000);
    return () => {
      document.removeEventListener("visibilitychange", checkExpiry);
      clearInterval(timer);
      refreshVersion.current++;
    };
  }, [roomId, refresh]);
  useEffect(() => {
    if (!room) return;
    const timeout = setTimeout(() => {
      roomSnapshot.current = null;
      unavailable.current = true;
      setRoom(null);
      setError("このルームは1時間の有効期限を過ぎました。新しく作成してください。");
    }, Math.max(0, room.expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [room?.id, room?.expiresAt]);
  const act = useCallback(
    async (body: object) => {
      if (!roomId || mutation.current) return false;
      mutation.current = true;
      refreshVersion.current++;
      setBusy(true);
      setError("");
      try {
        const next = await api(`/api/rooms/${roomId}`, body);
        setRoom(previous => mergeRoomState(next, previous));
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        mutation.current = false;
        setBusy(false);
      }
    },
    [roomId],
  );
  const current = room?.candidates.find((r) => !(r.id in room.myVotes));
  const previous = room?.candidates.filter(r => r.id in room.myVotes).at(-1);
  async function undoVote() {
    if (!previous || room?.status !== "voting") return;
    if (await act({ action: "undo", restaurantId: previous.id })) {
      setResultsVisible(false);
      setDrag(0);
      dragStart.current = null;
    }
  }
  const vote = useCallback(
    async (liked: boolean) => {
      if (!current || room?.status !== "voting") return;
      await act({ action: "vote", restaurantId: current.id, liked });
      setDrag(0);
    },
    [act, current, room?.status],
  );
  useEffect(() => {
    if (!current || resultsVisible || room?.status !== "voting") return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        (e.target as HTMLElement).closest(
          "input,button,[role=dialog],[role=alertdialog],select,textarea",
        )
      )
        return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        void vote(e.key === "ArrowRight");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, resultsVisible, room?.status, vote]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "read_mogumatch_room",
            description:
              "Read the current room and aggregate vote progress without modifying data.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                Object.keys(input).length
              )
                throw new Error("Expected empty object");
              const value = roomSnapshot.current;
              return value
                ? {
                    area: value.area,
                    status: value.status,
                    participants: value.members.length,
                    votes: value.totalVotes,
                    allDone: value.allDone,
                    results: value.results.map(r => ({ likes: r.likes, dislikes: r.dislikes, pending: r.pending })),
                  }
                : { status: "no_room" };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(console.error);
    } catch (e) {
      console.error(e);
    }
    return () => controller.abort();
  }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ id: string }>("/api/rooms", {
        name,
        area,
        radius: mode === "live" && searchMode === "keyword" ? 0 : Number(radius),
        budget: Number(budget),
        ...(mode === "live" ? { searchMode, keyword, latitude: Number(latitude), longitude: Number(longitude) } : {}),
      });
      history.pushState({}, "", `/?room=${data.id}`);
      setRoomId(data.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      linkRef.current?.select();
      setError("リンク欄を選択しました。コピーして共有してください。");
    }
  }
  const showResults =
    room &&
    (resultsVisible ||
      room.status === "closed" ||
      (room.status === "voting" && !current));
  const showingLive = room ? room.candidates.some(r => r.source === "hotpepper") : mode === "live";
  const steps = ["ルームをつくる", "みんなで選ぶ", "結果を見る"];
  const step = !room || room.status === "lobby" ? 0 : showResults ? 2 : 1;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Utensils size={22} />
          </span>
          Mogu<span>Match</span>
        </a>
        <div className="top-actions">
          <span className="demo-tag">{showingLive ? "ベータ版" : "学習用デモ"}</span>
          <button
            className="icon-button"
            onClick={() => setHelp(!help)}
            aria-label="使い方"
            aria-expanded={help}
          >
            <CircleHelp size={21} />
          </button>
        </div>
      </header>
      <main>
        {help && (
          <aside className="help-panel">
            <strong>はじめてのMoguMatch</strong>
            <p>
              ① 条件を選んで作成 → ② リンクを共有して参加 → ③ ホストが投票開始 →
              ④ 左右スワイプ → ⑤ 結果を確認。
            </p>
            <p>
              同じブラウザは同じ参加者です。1台で試すときは別のブラウザを使ってください。ルームの有効期限は作成から1時間です。
            </p>
          </aside>
        )}
        <nav className="steps" aria-label="利用の流れ">
          {steps.map((label, i) => (
            <div
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={i === step ? "active" : ""}
            >
              <span>{i < step ? <Check size={14} /> : `0${i + 1}`}</span>
              {label}
              {i < 2 && <i />}
            </div>
          ))}
        </nav>
        {error && (
          <div className="error" role="alert">
            {error}
            {roomId && (
              <button onClick={() => void refresh()}>再読み込み</button>
            )}
          </div>
        )}
        {!roomId ? (
          <div className="create-layout">
            <section className="create-panel">
              <div className="eyebrow">LET’S EAT TOGETHER</div>
              <h1>
                今日のごはん、
                <br />
                <em>みんなの「いいね」</em>で。
              </h1>
              <p className="intro">
                お店選びを、もっと気軽に。
                <br />
                ルームをつくって、友だちを誘おう。
              </p>
              <form onSubmit={create} className="create-form">
                <label className="field">
                  あなたの名前
                  <input
                    required
                    maxLength={20}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例：けいた"
                    autoComplete="nickname"
                  />
                </label>
                {mode !== "live" ? <Choice
                  label="どのエリアで食べる？"
                  value={area}
                  onChange={setArea}
                  options={areas.map((a) => ({ value: a, label: a }))}
                /> : <>
                  <Choice label="場所の指定方法" value={searchMode} onChange={setSearchMode} options={[{value:"keyword",label:"地名・住所で探す"},{value:"current",label:"現在地の近くで探す"}]} />
                  {searchMode === "keyword" ? <>
                    <label className="field">地名・住所<input required minLength={2} maxLength={80} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="例：梅田、東大阪市小若江" /></label>
                    <p className="fine">店舗の住所・駅名などに一致するお店を探します。同じ地名がある場合は市区町村も入力してください。</p>
                  </> : <>
                    <button type="button" className="secondary" onClick={() => void locate()} disabled={locating}>{locating ? "現在地を取得中…" : latitude ? "現在地を取得し直す" : "現在地を取得する"}</button>
                    <p className="fine" role="status">{latitude ? "現在地を取得しました。この場所の周辺を検索します。" : "現在地の取得を許可してください。"}</p>
                    <p className="fine">位置情報は店舗検索のためホットペッパーに送信します。表示する圏内は、検索地点を中心とした半径の目安です。道路の距離・所要時間ではありません。</p>
                  </>}
                </>}
                <div className="two-fields">
                  {mode === "live" && searchMode === "keyword" ? <div className="field"><span>検索範囲</span><p>指定した地名・住所に一致する店舗<br /><small>距離制限なし</small></p></div> : <Choice
                    label="検索する範囲"
                    value={radius}
                    onChange={setRadius}
                    options={radiusOptions.map((v) => ({
                      value: String(v),
                      label: `${v / 1000}km圏内`,
                    }))}
                  />}
                  <Choice
                    label="予算の目安"
                    value={budget}
                    onChange={setBudget}
                    options={[0, 1000, 2000, 3000].map((v) => ({
                      value: String(v),
                      label: v === 0 ? "指定しない" : `${priceLabel(v)}まで`,
                    }))}
                  />
                </div>
                {mode === "live" && <p className="fine">ランチ・夕食など、用途を問わず探せます。予算で絞る場合は掲載されたディナー予算を使用します。ランチ料金は店舗ページで確認してください。</p>}
                <div className="form-summary">
                  <Utensils size={17} />
                  <span>
                    {mode === "live" ? "実店舗を最大20軒検索" : <>サンプル候補 <b>{candidates.length}軒</b></>}
                  </span>
                  <span>登録不要</span>
                </div>
                <button
                  className="primary"
                  disabled={busy || !initialized || !mode || (mode === "live" && searchMode === "current" && (!latitude || locating)) || (mode === "demo" && !candidates.length)}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={20} />
                  ) : (
                    <>
                      ルームをつくる
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>
                <p className="fine">ルームは作成から1時間有効です。作成後に参加リンクが発行されます。検索・作成は1時間5回まで。</p>
              </form>
            </section>
            <aside className="preview-panel">
              <div className="preview-top">
                <span>こんなふうに、選ぼう。</span>
                <span>SWIPE & MATCH</span>
              </div>
              <div className="sample-card">
                <FoodPhoto />
                <div className="sample-card-body">
                  <span className="category">カレー</span>
                  <h2>スパイス食堂 ひとさじ</h2>
                  <div className="card-meta">
                    <span>
                      <MapPin size={15} />
                      0.5km圏内
                    </span>
                    <span>¥950 / 人</span>
                  </div>
                  <p>香りのよいスパイスと、じっくり煮込んだチキン。</p>
                </div>
              </div>
              <div className="sample-actions" aria-hidden="true">
                <span className="no">
                  <X />
                </span>
                <p>直感で、左右にスワイプ</p>
                <span className="yes">
                  <Heart fill="currentColor" />
                </span>
              </div>
              <p className="preview-note">画面イメージ・サンプル店舗</p>
            </aside>
          </div>
        ) : !room ? (
          <section className="loading">
            <LoaderCircle className="spin" />
            <p>ルームを読み込んでいます…</p>
            <a href="/">トップへ戻る</a>
          </section>
        ) : (
          <>
            <div className="room-heading">
              <div>
                <div className="eyebrow">
                  {room.status === "closed"
                    ? "THE TABLE IS READY"
                    : "YOUR FOOD ROOM"}
                </div>
                <h1>
                  {room.area}
                  <span>のごはん選び</span>
                </h1>
                <p>
                  <MapPin size={15} /> {room.radius ? `検索地点から${room.radius / 1000}km圏内` : "地名・住所で検索（距離制限なし）"}{" "}
                  <span>·</span> {room.budget === 0 ? "予算指定なし" : `${priceLabel(room.budget)}まで`} <span>·</span>{" "}
                  {room.candidates.length}軒の候補
                </p>
              </div>
              <span className="room-status">
                {room.status === "lobby"
                  ? "参加受付中"
                  : room.status === "closed"
                    ? "投票終了"
                    : "投票中"}
              </span>
            </div>
            {!room.me ? (
              <section className="join-panel">
                <Users size={36} />
                <h2>一緒に、お店を選ぼう。</h2>
                <p>表示する名前を入力して参加してください。</p>
                {room.status === "lobby" ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act({ action: "join", name });
                    }}
                  >
                    <label className="field">
                      あなたの名前
                      <input
                        required
                        maxLength={20}
                        placeholder="例：あおい"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      ルームに参加する
                      <ArrowRight size={20} />
                    </button>
                  </form>
                ) : (
                  <p className="notice">
                    投票が始まっているため、新しく参加できません。ホストに新しいルームの作成を依頼してください。
                  </p>
                )}
              </section>
            ) : (
              <div className="room-layout">
                <section className="room-work">
                  {room.status === "lobby" ? (
                    <div className="lobby">
                      <div className="lobby-icon">
                        <Users size={32} />
                      </div>
                      <h2>みんなを、このルームに。</h2>
                      <p>リンクを共有して、参加を待ちましょう。</p>
                      <label className="field">
                        参加リンク
                        <div className="share-box">
                          <input
                            ref={linkRef}
                            aria-label="参加リンク"
                            readOnly
                            value={
                              typeof location === "undefined"
                                ? ""
                                : location.href
                            }
                            onFocus={(e) => e.target.select()}
                          />
                          <button
                            onClick={copy}
                            aria-label="参加リンクをコピー"
                          >
                            {copied ? (
                              <CheckCheck size={20} />
                            ) : (
                              <Copy size={20} />
                            )}
                          </button>
                        </div>
                      </label>
                      <p className="copy-status" aria-live="polite">
                        {copied
                          ? "コピーしました！友だちに送ってください。"
                          : "同じブラウザで開くと、同じ参加者として入ります。"}
                      </p>
                      <div className="candidate-strip">
                        {room.candidates.slice(0, 4).map((r) => (
                          <span key={r.id}>{r.genre}</span>
                        ))}
                        <span>{room.candidates.length}軒</span>
                      </div>
                      {room.me.isHost ? (
                        <>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => void act({ action: "start" })}
                          >
                            {room.members.length}人で投票をはじめる
                            <ArrowRight size={20} />
                          </button>
                          <p className="fine">
                            全員が参加してから開始してください。開始後の追加参加はできません。
                          </p>
                        </>
                      ) : (
                        <div className="waiting">
                          <LoaderCircle className="spin" size={18} />
                          ホストが投票を始めるのを待っています
                        </div>
                      )}
                    </div>
                  ) : showResults ? (
                    <div className="results">
                      <div className="results-heading">
                        <div>
                          <div className="eyebrow">
                            {room.status === "closed"
                              ? "FINAL RESULTS"
                              : "LIVE RESULTS"}
                          </div>
                          <h2>
                            {room.status === "closed"
                              ? "みんなの「いいね」が集まりました。"
                              : room.allDone
                                ? "全員の投票がそろいました！"
                                : "みんなの投票を待っています。"}
                          </h2>
                        </div>
                        <Trophy size={32} />
                      </div>
                      <p className="result-note">
                        {room.status !== "closed"
                          ? "途中集計です。ホストが締め切ると最終結果になります。"
                          : "いいね数の多い順。同票のお店は同順位で、近い順に表示します。"}
                      </p>
                      {room.results.every((r) => r.likes === 0) && (
                        <div className="notice">
                          {room.totalVotes === 0
                            ? "まだ投票がありません。"
                            : "今のところ「いいね」のあるお店はありません。無理に選ばず、別の条件でも試してみましょう。"}
                        </div>
                      )}
                      {room.results.map((r) => (
                        <article
                          className={`result-row ${r.likes > 0 && r.likes === room.results[0].likes ? "winner" : ""}`}
                          key={r.id}
                        >
                          <span className="rank">
                            {1 +
                              room.results.filter(
                                (other) => other.likes > r.likes,
                              ).length}
                          </span>
                          <div className="result-info">
                            <div>
                              {r.likes === room.members.length &&
                                r.pending === 0 && (
                                  <span className="match-tag">
                                    全員いいね！
                                  </span>
                                )}
                            </div>
                            <h3>{r.detailUrl ? <a href={r.detailUrl} target="_blank" rel="noopener noreferrer">{r.name} ↗</a> : r.name}</h3>
                            <p>
                              {r.genre} · {distanceBandLabel(r.distance, r.distanceUnknown, room.me?.isHost ? "現在地" : "検索地点")} · {restaurantBudgetLabel(r)}
                            </p>
                            <small>
                              良くない {r.dislikes} · 未投票 {r.pending}
                            </small>
                          </div>
                          <div className="like-score">
                            <Heart size={17} />
                            <b>{r.likes}</b>
                            <span>/ {room.members.length}人</span>
                          </div>
                        </article>
                      ))}
                      {current && room.status === "voting" && (
                        <button
                          className="secondary"
                          onClick={() => setResultsVisible(false)}
                        >
                          <ArrowLeft size={17} />
                          投票にもどる
                        </button>
                      )}
                    </div>
                  ) : current ? (
                    <div className="voting">
                      <div className="vote-top">
                        <span>あなたの投票</span>
                        <b>
                          {Object.keys(room.myVotes).length} /{" "}
                          {room.candidates.length}
                        </b>
                      </div>
                      <Progress
                        value={
                          (Object.keys(room.myVotes).length /
                            room.candidates.length) *
                          100
                        }
                        aria-label="あなたの投票進捗"
                      />
                      <div className="swipe-frame">
                        <article
                          className="swipe-card"
                          aria-label={`投票する店舗：${current.name}`}
                          style={{
                            transform: `translateX(${drag}px) rotate(${drag / 18}deg)`,
                          }}
                          onPointerDown={(e) => {
                            if (busy) return;
                            dragStart.current = e.clientX;
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            if (dragStart.current !== null)
                              setDrag(
                                Math.max(
                                  -160,
                                  Math.min(160, e.clientX - dragStart.current),
                                ),
                              );
                          }}
                          onPointerUp={(e) => {
                            if (dragStart.current === null) return;
                            const delta = e.clientX - dragStart.current;
                            dragStart.current = null;
                            if (Math.abs(delta) > 75) void vote(delta > 0);
                            else setDrag(0);
                          }}
                          onPointerCancel={() => {
                            dragStart.current = null;
                            setDrag(0);
                          }}
                        >
                          <FoodPhoto restaurant={current} />
                          {Math.abs(drag) > 30 && (
                            <strong
                              className={`swipe-stamp ${drag > 0 ? "good" : "bad"}`}
                            >
                              {drag > 0 ? "いいね！" : "今回はパス"}
                            </strong>
                          )}
                          <div className="sample-card-body">
                            <span className="category">{current.genre}</span>
                            <h2>{current.name}</h2>
                            <div className="card-meta">
                              <span>
                                <MapPin size={16} />
                                {distanceBandLabel(current.distance, current.distanceUnknown, room.me?.isHost ? "現在地" : "検索地点")}
                              </span>
                              <span>{restaurantBudgetLabel(current)}</span>
                            </div>
                            <p>{current.description}</p>
                            {current.address && <p className="fine">{current.address}</p>}
                          </div>
                        </article>
                      </div>
                      <div className="vote-actions">
                        <button
                          className="vote-no"
                          disabled={busy}
                          onClick={() => void vote(false)}
                        >
                          <X size={27} />
                          <span>良くない</span>
                        </button>
                        <span className="gesture-hint">
                          {busy ? "保存中…" : "← スワイプ →"}
                          <small>ボタンでも選べます</small>
                        </span>
                        <button
                          className="vote-yes"
                          disabled={busy}
                          onClick={() => void vote(true)}
                        >
                          <Heart size={27} fill="currentColor" />
                          <span>いいね</span>
                        </button>
                      </div>
                      <div className="vote-links">
                        <button onClick={() => setResultsVisible(true)}>
                          途中結果を見る
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {room.status === "voting" && (
                    <div className="vote-links">
                      <button className="secondary" disabled={busy || !previous} onClick={() => void undoVote()}>
                        <ArrowLeft size={17} />ひとつ前に戻る
                      </button>
                      <p className="fine">前のお店への投票を取り消して選び直せます。締め切り後は変更できません。</p>
                    </div>
                  )}
                </section>
                <aside className="participants">
                  <div className="aside-title">
                    <h2>このルームのメンバー</h2>
                    <span>
                      <Users size={16} />
                      {room.members.length}
                    </span>
                  </div>
                  {room.members.map((m, i) => (
                    <div className="member-row" key={m.id}>
                      <span className={`avatar avatar-${i % 4}`}>
                        {m.name.slice(0, 1)}
                      </span>
                      <div>
                        <strong>
                          {m.name}
                          {m.id === room.me?.id && <small>あなた</small>}
                        </strong>
                        <p>{m.isHost ? "ホスト" : "メンバー"}</p>
                      </div>
                      <span className="member-progress">
                        {room.status === "lobby" ? (
                          <Check size={18} />
                        ) : (
                          `${m.voted}/${room.candidates.length}`
                        )}
                      </span>
                    </div>
                  ))}
                  <div className="room-progress">
                    <div>
                      <span>みんなの投票</span>
                      <b>
                        {room.totalVotes} /{" "}
                        {room.members.length * room.candidates.length}
                      </b>
                    </div>
                    <Progress
                      value={
                        (room.totalVotes /
                          (room.members.length * room.candidates.length || 1)) *
                        100
                      }
                      aria-label="全員の投票進捗"
                    />
                  </div>
                  <p className="fine">投票中は約3秒ごとに更新されます。</p>
                  {room.me.isHost && room.status === "voting" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="secondary" disabled={busy}>
                          投票を締め切る
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            投票を締め切りますか？
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {room.allDone
                              ? "全員の投票が完了しています。結果を確定します。"
                              : "未投票の人・店舗があります。未投票はそのまま残し、現在の票で結果を確定します。"}
                            締め切り後は投票できません。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>まだ待つ</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => void act({ action: "close" })}
                          >
                            締め切って結果を見る
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  {room.status === "closed" && (
                    <a className="secondary" href="/">
                      新しいルームをつくる
                    </a>
                  )}
                  {room.me.isHost && <AlertDialog>
                    <AlertDialogTrigger asChild><button className="secondary" disabled={busy}>ルームと投票を削除</button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>ルームを削除しますか？</AlertDialogTitle><AlertDialogDescription>全員の名前・投票・店舗候補を削除します。共有リンクは使えなくなり、元に戻せません。</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>キャンセル</AlertDialogCancel><AlertDialogAction onClick={() => {
                        if (mutation.current) return;
                        mutation.current = true; setBusy(true);
                        void api(`/api/rooms/${roomId}`, {action: "delete"}).then(() => { location.assign("/"); }).catch(e => setError(e.message)).finally(() => { mutation.current = false; setBusy(false); });
                      }}>削除する</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>}
                  <p className="fine">ルームの有効期限：{new Date(room.expiresAt).toLocaleString("ja-JP")}</p>
                  <div className="room-tip">
                    <Heart size={19} />
                    <p>
                      食べたい気持ちを、素直に。
                      <br />
                      全員の「いいね」が重なるお店を探そう。
                    </p>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}
        <footer>
          <span>MoguMatch</span>
          <p>
            {showingLive ? <>圏内表示はホストが検索した地点を中心とする半径です。移動距離ではありません。掲載予算はディナーの目安です。営業時間・料金・空席は店舗ページで確認してください。<br />Powered by <a href="http://webservice.recruit.co.jp/">ホットペッパーグルメ Webサービス</a></> : "店舗・距離・価格は架空のサンプルです。実店舗の検索・予約はできません。"}
          </p>
          <span>Inspired by Mogufinder · Learning project</span>
        </footer>
      </main>
    </div>
  );
}
