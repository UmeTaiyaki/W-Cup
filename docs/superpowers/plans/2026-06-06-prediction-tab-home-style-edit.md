# 予想タブ「ホーム見た目＋編集ボタン」実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予想タブ（`tab === 'input'`）をホームタブと同じ見た目のカードレイアウトに刷新し、各カード右上の編集ボタンから既存のシート／フル編集画面を開けるようにする。

**Architecture:** ホームタブの表示部品（`PodiumHero` / `MiniPick`）を `SummaryScreen` 内のクロージャから `screens-core.jsx` の独立コンポーネントへ切り出し、`onEdit?` を渡せるようにする。`OptionViewScreen`（embedded）に `editable` / `onEdit(id)` を足してオプション予想に編集ボタンを付ける。`InputScreen` の body をこれらの共通部品で組み直す。既存の `setPick` / `goOption` / `TeamPicker` / `ScorerPicker` / 削除 UI はそのまま流用する。

**Tech Stack:** React 18（UMD）＋ ブラウザ内 Babel standalone。フロントエンドに自動テスト基盤は無く、検証は `npm run dev`（wrangler pages dev）でブラウザ手動確認。インライン style オブジェクト方式（既存踏襲）。

---

## ファイル構成

| ファイル | 役割 | 変更種別 |
|---|---|---|
| `public/screens-core.jsx` | `PodiumHero` / `MiniPick` を独立コンポーネント化、`SummaryScreen` がそれを使用、`InputScreen` body を刷新 | Modify |
| `public/screens-optview.jsx` | `OptionViewScreen` embedded に `editable` / `onEdit` 追加 | Modify |
| `public/index.html` | 予想タブ描画で `InputScreen` に `goOption` 等を渡す（既存）、`?v=` バンプ | Modify |

## 重要な前提（実装者向け）

- **テスト**: `npm test`（`node --test 'functions/**/*.test.js'`）はバックエンド専用。フロントの `.jsx` には自動テストが無い。本計画の検証は **すべてブラウザ手動確認**（`npm run dev` → 表示されるローカル URL）。
- **イミュータブル**: state は必ず新オブジェクトで更新（`persist`/`setPick` が既にそうしている。直接触らない）。
- **編集ボタンの見た目**: 既存の `Icon name="edit"`（`ui.jsx` で定義済み、`app-shell.jsx:169` に使用例）を使う。角丸の小さなゴーストボタン（背景 `T.card` 上なので `T.panel2` 系の淡い下地＋`T.accent` のアイコン）。
- **キャッシュ**: `.jsx` を編集したら `public/index.html` の対応する `?v=N` を必ず1つ上げる（編集が反映されないため）。`screens-core.jsx?v=5` → `?v=6`、`screens-optview.jsx?v=5` → `?v=6`。
- **回帰防止の肝**: `onEdit` 未指定時の `PodiumHero` / `MiniPick`、および `editable` 未指定時の `OptionViewScreen` は **従来と完全に同一表示**であること（ホームタブと部屋の既存利用を壊さない）。

---

### Task 1: `PodiumHero` を独立コンポーネントへ切り出す

**Files:**
- Modify: `public/screens-core.jsx`（現状 14-38 行のクロージャ `PodiumHero` を関数コンポーネント化）

- [ ] **Step 1: ファイル先頭（`SummaryScreen` の外、1-6 行のコメント直後）に独立コンポーネントを追加**

`screens-core.jsx` の `function SummaryScreen(...)` の **前** に以下を挿入する。中身は既存 `PodiumHero` の JSX をそのまま移植し、`T` / `champ` を props 化、末尾に `onEdit` 対応の編集ボタンを追加する。

```jsx
// ===== 共通カード（ホーム／予想タブで共有） =====================
function PodiumHero({ T, champ, onEdit }) {
  return (
    <div style={{
      borderRadius: 26, padding: '22px 20px 24px', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(170deg, ${T.gold}1F 0%, ${T.card} 42%)`,
      boxShadow: `inset 0 0 0 1px ${T.line}`,
    }}>
      <div style={{ position: 'absolute', top: -30, right: -20, opacity: 0.10 }}>
        <Icon name="trophy" size={150} color={T.gold} fill="none" sw={1} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <Eyebrow color={T.gold} T={T}>CHAMPION · 優勝</Eyebrow>
        {onEdit && <EditBtn T={T} onClick={onEdit} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        <div style={{
          width: 62, height: 62, borderRadius: 18, display: 'grid', placeItems: 'center',
          fontSize: 40, background: 'rgba(255,255,255,0.06)',
          boxShadow: `0 0 0 2px ${T.gold}66`,
        }}>{champ ? champ.flag : '🏳️'}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: T.text, lineHeight: 1.05,
            letterSpacing: -0.5 }}>{champ ? champ.ja : '未選択'}</div>
          <div style={{ fontFamily: 'Archivo, system-ui', fontWeight: 700, fontSize: 13,
            letterSpacing: 2, color: T.faint, marginTop: 3 }}>{champ ? champ.code : '—'}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 共通の編集ボタン `EditBtn` を `PodiumHero` の直前に追加**

```jsx
function EditBtn({ T, onClick, label = '編集' }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      borderRadius: 999, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5,
      background: T.panel2, color: T.accent, fontWeight: 800, fontSize: 12.5,
      boxShadow: `inset 0 0 0 1px ${T.line}` }}>
      <Icon name="edit" size={14} color={T.accent} sw={2} />{label}
    </button>
  );
}
```

- [ ] **Step 3: `SummaryScreen` 内の旧 `PodiumHero` クロージャ（14-38 行）を削除**

`SummaryScreen` の本体から `const PodiumHero = () => ( ... );` を丸ごと削除する。`SummaryScreen` 内の `<PodiumHero />` 呼び出し箇所（dashboard / wide / mobile の3箇所）を `<PodiumHero T={T} champ={champ} />` に置き換える（`champ` は `SummaryScreen` 冒頭で既に定義済み）。

- [ ] **Step 4: `?v=` をバンプ**

`public/index.html` の `screens-core.jsx?v=5` を `?v=6` に変更。

- [ ] **Step 5: ブラウザで回帰確認**

Run: `npm run dev`
確認: ホームタブの優勝カードが従来通り表示される（編集ボタンは出ない）。レイアウト崩れなし。

- [ ] **Step 6: Commit**

```bash
git add public/screens-core.jsx public/index.html
git commit -m "refactor: PodiumHero を共通コンポーネント化し編集ボタン対応"
```

---

### Task 2: `MiniPick` を独立コンポーネントへ切り出す

**Files:**
- Modify: `public/screens-core.jsx`（現状 40-62 行のクロージャ `MiniPick`）

- [ ] **Step 1: `PodiumHero` の直後に独立コンポーネントを追加**

既存 `MiniPick` の JSX を移植し props 化、ラベル行の右端に `onEdit` 対応の編集ボタンを追加する。

```jsx
function MiniPick({ T, label, sub, code, scorer, color, icon, onEdit }) {
  return (
    <div style={{
      flex: 1, background: T.card, borderRadius: 20, padding: '15px 14px',
      boxShadow: `inset 0 0 0 1px ${T.line}`, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <Icon name={icon} size={17} color={color} />
          <span style={{ fontFamily: 'Archivo, system-ui', fontWeight: 800, fontSize: 10.5,
            letterSpacing: 1.6, color: color }}>{label}</span>
        </div>
        {onEdit && (
          <button onClick={onEdit} style={{ flexShrink: 0, border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', borderRadius: 999, padding: 5, display: 'grid', placeItems: 'center',
            background: T.panel2, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
            <Icon name="edit" size={13} color={T.accent} sw={2} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
        {code
          ? <div style={{ fontSize: 30 }}>{window.WC.TEAM[code]?.flag}</div>
          : <div style={{ width: 38, height: 38, borderRadius: 10, display: 'grid',
              placeItems: 'center', background: T.panel2, fontSize: 20 }}>⚽️</div>}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginTop: 8,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {code ? window.WC.TEAM[code]?.ja : (scorer || '未選択')}
      </div>
      <div style={{ fontSize: 11.5, color: T.faint, marginTop: 1 }}>{sub}</div>
    </div>
  );
}
```

- [ ] **Step 2: `SummaryScreen` 内の旧 `MiniPick` クロージャ（40-62 行）を削除**

`SummaryScreen` の `Picks` クロージャ内の呼び出しを props 渡しに更新する（旧コードは `<MiniPick label=... />`、`T` を補う）:

```jsx
  const Picks = () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <MiniPick T={T} label="準優勝" sub="RUNNER-UP" code={pred.runnerUp} color={T.silver} icon="medal" />
      <MiniPick T={T} label="得点王" sub="TOP SCORER" scorer={pred.topScorer} color={T.boot} icon="boot" />
    </div>
  );
```

- [ ] **Step 3: `?v=` をバンプ**

`public/index.html` の `screens-core.jsx?v=6` を `?v=7` に変更。

- [ ] **Step 4: ブラウザで回帰確認**

Run: `npm run dev`
確認: ホームタブの準優勝・得点王カードが従来通り（編集ボタン無し）。崩れなし。

- [ ] **Step 5: Commit**

```bash
git add public/screens-core.jsx public/index.html
git commit -m "refactor: MiniPick を共通コンポーネント化し編集ボタン対応"
```

---

### Task 3: `OptionViewScreen` embedded に編集モードを追加

**Files:**
- Modify: `public/screens-optview.jsx`

- [ ] **Step 1: props に `editable` / `onEdit` を追加**

`function OptionViewScreen({ T, state, viewId, setViewId, goBack, wide = false, availWidth = 0, backLabel = 'ホームに戻る', embedded = false })` を以下に変更:

```jsx
function OptionViewScreen({ T, state, viewId, setViewId, goBack, wide = false, availWidth = 0, backLabel = 'ホームに戻る', embedded = false, editable = false, onEdit }) {
```

- [ ] **Step 2: `SubHead` に編集ボタンを差し込めるよう拡張**

既存 `SubHead`（115-122 行付近）の `note` の右に、`editId` が渡されたとき編集ボタンを出す。`SubHead` を以下に置き換える:

```jsx
  const SubHead = ({ emoji, text, note, editId }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 10px' }}>
      <span style={{ fontSize: 14 }}>{emoji}</span>
      <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 11.5, letterSpacing: 1,
        color: T.sub }}>{text}</span>
      {note && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: T.faint }}>{note}</span>}
      {editable && onEdit && editId && (
        <button onClick={() => onEdit(editId)} style={{
          marginLeft: note ? 8 : 'auto', flexShrink: 0, border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', borderRadius: 999, padding: '5px 11px', display: 'flex',
          alignItems: 'center', gap: 5, background: T.panel2, color: T.accent, fontWeight: 800,
          fontSize: 12, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
          <Icon name="edit" size={13} color={T.accent} sw={2} />編集
        </button>
      )}
    </div>
  );
```

- [ ] **Step 3: グループステージ内の各セクションに `editId` を付与**

`Body` 内（245-261 行付近）のグループ順位 `SubHead` に `editId="grouprank"` を追加し、3位ワイルドカードにも見出しを与える。`section === 'group'` ブロックを以下に置き換える:

```jsx
        {section === 'group' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <SubHead emoji="📊" text="グループ順位" note={`${grDone}/12組`} editId="grouprank" />
              {GK.some((k) => (gr[k] || []).filter(Boolean).length > 0) ? (
                <div style={{ display: 'grid',
                  gridTemplateColumns: wide ? '1fr 1fr' : '1fr', gap: 8, alignItems: 'start' }}>
                  {GK.map((k) => <GroupAccordion key={k} k={k} />)}
                </div>
              ) : <MiniEmpty text="グループ順位予想はまだありません" />}
            </div>
            <div>
              <SubHead emoji="🥉" text="3位ワイルドカード" note={`${taDone}組`} editId="thirdwild" />
              {taDone > 0
                ? <WildcardAccordion />
                : <MiniEmpty text="3位ワイルドカードはまだ割り当てられていません" />}
            </div>
          </div>
        )}
```

- [ ] **Step 4: ノックアウトセクションに編集導線を追加**

`section === 'ko'` ブロック（264-269 行付近）を以下に置き換え、編集モード時のみ見出し＋編集ボタンを出す:

```jsx
        {section === 'ko' && (
          <div>
            {editable && onEdit && (
              <SubHead emoji="🏟" text="ノックアウト" editId="knockout" />
            )}
            {koAny ? (
              <KnockoutView T={T} der={der} champ={champ} ROUNDS={ROUNDS} LABELS={LABELS} />
            ) : <EmptyHint text="ノックアウト予想はまだありません" />}
          </div>
        )}
```

- [ ] **Step 5: `?v=` をバンプ**

`public/index.html` の `screens-optview.jsx?v=5` を `?v=6` に変更。

- [ ] **Step 6: ブラウザで回帰確認**

Run: `npm run dev`
確認: ホームタブ／部屋のオプション予想インライン表示が従来通り（`editable` を渡していないので編集ボタンは出ず、3位WCに新しい見出しが出る点のみ変化）。崩れなし。

- [ ] **Step 7: Commit**

```bash
git add public/screens-optview.jsx public/index.html
git commit -m "feat: OptionViewScreen embedded に編集モードを追加"
```

---

### Task 4: `InputScreen` の body をホーム見た目＋編集ボタンに刷新

**Files:**
- Modify: `public/screens-core.jsx`（`InputScreen` 226-350 行）

- [ ] **Step 1: `InputScreen` の本体を組み直す**

既存 `InputScreen`（`function InputScreen(...) { ... }` 全体、226-350 行）を以下に置き換える。`Row` クロージャは廃止し、共通カードを使う。シート（`TeamPicker`/`ScorerPicker`）・削除 UI・solo 分岐・props は維持する。`state` を受け取り embedded `OptionViewScreen` に渡す。

```jsx
function InputScreen({ T, state, member, pred, setPick, onRemove, canRemove, goOption, wide = false, solo = false }) {
  const champ = pred.champion ? window.WC.TEAM[pred.champion] : null;
  const [sheet, setSheet] = React.useState(null); // 'champ' | 'runner' | 'scorer'
  const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => { setConfirm(false); }, [member.id]);

  // OptionViewScreen は state.members/preds を参照するため単一メンバーのシムを渡す
  const viewState = state || { current: member.id, members: [member], preds: { [member.id]: pred } };

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px',
      display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Eyebrow T={T}>EDIT · {member.name}</Eyebrow>
        <div style={{ fontSize: wide ? 27 : 23, fontWeight: 800, color: T.text, marginTop: 3 }}>
          予想を編集</div>
      </div>

      <PodiumHero T={T} champ={champ} onEdit={() => setSheet('champ')} />

      <div style={{ display: 'flex', gap: 12 }}>
        <MiniPick T={T} label="準優勝" sub="RUNNER-UP" code={pred.runnerUp} color={T.silver}
          icon="medal" onEdit={() => setSheet('runner')} />
        <MiniPick T={T} label="得点王" sub="TOP SCORER" scorer={pred.topScorer} color={T.boot}
          icon="boot" onEdit={() => setSheet('scorer')} />
      </div>

      {/* オプション予想（インライン表示＋各見出しの編集ボタン） */}
      <OptionViewScreen embedded editable T={T} state={viewState} viewId={member.id}
        setViewId={() => {}} wide={wide} onEdit={goOption} />

      {/* 参加者の削除 */}
      {!solo && (
      <div style={{ marginTop: 14, paddingTop: 18, borderTop: `1px solid ${T.line}` }}>
        {!confirm ? (
          <button onClick={() => setConfirm(true)} disabled={!canRemove} style={{
            width: '100%', border: 'none', borderRadius: 14, padding: '13px',
            fontFamily: 'inherit', fontWeight: 800, fontSize: 14.5,
            cursor: canRemove ? 'pointer' : 'default',
            background: 'transparent', color: canRemove ? '#FF6B6B' : T.faint,
            boxShadow: `inset 0 0 0 1.5px ${canRemove ? '#FF6B6B44' : T.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="trash" size={17} color={canRemove ? '#FF6B6B' : T.faint} />
            {member.name}を削除
          </button>
        ) : (
          <div style={{ background: T.card, borderRadius: 16, padding: '14px 16px',
            boxShadow: `inset 0 0 0 1px #FF6B6B44` }}>
            <div style={{ fontWeight: 800, color: T.text, fontSize: 14.5, marginBottom: 3 }}>
              「{member.name}」を削除しますか？</div>
            <p style={{ color: T.sub, fontSize: 12.5, lineHeight: 1.5, margin: '0 0 12px' }}>
              この参加者の予想データも消えます。元に戻せません。</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirm(false)} style={{
                flex: 1, border: 'none', borderRadius: 12, padding: '11px',
                fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                background: T.panel2, color: T.sub }}>キャンセル</button>
              <button onClick={() => onRemove(member.id)} style={{
                flex: 1, border: 'none', borderRadius: 12, padding: '11px',
                fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                background: '#FF6B6B', color: '#fff' }}>削除する</button>
            </div>
          </div>
        )}
        {!canRemove && (
          <p style={{ color: T.faint, fontSize: 11.5, textAlign: 'center', margin: '8px 0 0' }}>
            参加者が1人のときは削除できません。</p>
        )}
      </div>
      )}

      <TeamPicker open={sheet === 'champ'} onClose={() => setSheet(null)} T={T} centered={wide}
        title="優勝を選ぶ" onPick={c => setPick('champion', c)} />
      <TeamPicker open={sheet === 'runner'} onClose={() => setSheet(null)} T={T} centered={wide}
        title="準優勝を選ぶ" onPick={c => setPick('runnerUp', c)} exclude={[pred.champion]} />
      <ScorerPicker open={sheet === 'scorer'} onClose={() => setSheet(null)} T={T} centered={wide}
        title="得点王を選ぶ" onPick={v => setPick('topScorer', v)} />
    </div>
  );
}
```

- [ ] **Step 2: 旧 `OptionCard` コンポーネントを削除**

`screens-core.jsx` の `function OptionCard({ ... }) { ... }`（352-367 行）を削除する（新 `InputScreen` では未使用。他で使われていないことを確認: `grep -n "OptionCard" public/*.jsx` が `screens-core.jsx` 以外で何も返さないこと）。

- [ ] **Step 3: `index.html` で `InputScreen` に `state` を渡す**

`public/index.html` の `tab === 'input'` の `return <InputScreen .../>`（468-469 行付近）を以下に変更（`state={soloState}` を追加。`soloState` は同スコープで定義済み 446 行）:

```jsx
          return <InputScreen solo T={T} state={soloState} member={member} pred={pred} setPick={setPick}
            goOption={setOptScreen} wide={wide} />;
```

- [ ] **Step 4: `?v=` をバンプ**

`public/index.html` の `screens-core.jsx?v=7` を `?v=8` に変更。

- [ ] **Step 5: ブラウザで動作確認**

Run: `npm run dev`
確認（予想タブを開く）:
1. ホームと同じカードレイアウトで「予想を編集」が表示される
2. 優勝カード右上「編集」→ 優勝の TeamPicker が開く。選ぶとカードに反映される
3. 準優勝・得点王カード右上の編集アイコン → それぞれの Picker が開く。反映される
4. オプション予想インラインの「グループ順位」編集 → グループ順位予想画面へ遷移、戻ると予想タブに戻る
5. 「3位ワイルドカード」編集 → 3位WC画面へ遷移
6. ノックアウトタブ → 「ノックアウト」編集 → ノックアウト画面へ遷移
7. 共有ボタン・みんなの優勝予想が予想タブに出ていないこと
8. モバイル幅・デスクトップ幅（wide）双方で崩れないこと

- [ ] **Step 6: Commit**

```bash
git add public/screens-core.jsx public/index.html
git commit -m "feat: 予想タブをホーム見た目＋編集ボタンに刷新"
```

---

### Task 5: 全体回帰確認

**Files:** （変更なし・確認のみ）

- [ ] **Step 1: ホームタブ回帰**

Run: `npm run dev`
確認: ホームタブの優勝カード・準優勝・得点王・オプション予想インライン・みんなの優勝予想・共有が従来通り。編集ボタンが一切出ないこと。

- [ ] **Step 2: 部屋（rooms）回帰**

確認: 部屋の比較画面で `OptionViewScreen` を使っている箇所が読み取り専用のまま（編集ボタン無し）で崩れないこと。`grep -n "OptionViewScreen" public/*.jsx` で embedded 利用箇所を洗い出し、`editable` を渡していないことを確認。

- [ ] **Step 3: バックエンドテスト**

Run: `npm test`
Expected: 既存テストが全て PASS（フロント変更のみのため影響なし）。

- [ ] **Step 4: 最終コミット（必要なら）**

確認のみで変更が無ければスキップ。

---

## Self-Review メモ

- **Spec coverage**: 基本予想の編集ボタン→シート（Task 1,2,4）、オプション編集ボタン→フル画面（Task 3,4）、共有/みんなの予想を予想タブから除外（Task 4）、削除UI維持（Task 4）、ホーム不変（Task 1,2 の回帰確認 + Task 5）、embedded読み取り互換（Task 3,5）、未選択カードも編集可（編集ボタン常時表示・Task 4）。全てカバー。
- **型整合**: `PodiumHero({T, champ, onEdit})` / `MiniPick({T, label, sub, code, scorer, color, icon, onEdit})` / `EditBtn({T, onClick, label})` / `OptionViewScreen(... editable, onEdit)` / `SubHead({emoji, text, note, editId})` の呼び出しが全タスクで一致。
- **未選択カードのタップ**: spec では「編集ボタンとカード本体タップどちらでも」とあるが、実装は編集ボタン常時表示で担保。カード本体タップは見送り（YAGNI。編集ボタンが常に見えるため導線は確保される）。
