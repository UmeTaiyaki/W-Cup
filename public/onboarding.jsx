/* ============================================================
   オンボーディング・ウィザード（名前→コア→オプション→完了）＋別端末同期
   window.Onboarding に export。props: { T, onDone(user) }
   ============================================================ */

// 8桁コードを XXXX-XXXX 表示に整形
const fmtCode = (c) => (c || '').replace(/(.{4})(?=.)/g, '$1-');

// オンボーディング内の小さなコア予想 行（優勝/準優勝/得点王）
function CoreRow({ T, label, sub, color, icon, code, scorer, onClick }) {
  const filled = code || scorer;
  const sm = scorer ? (/^(.*)\s+\(([A-Za-z]{2,3})\)$/.exec(scorer) || []) : [];
  const scFlag = sm[2] ? (window.WC.TEAM[sm[2]] || {}).flag : '';
  const scName = sm[1] || scorer;
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
      background: T.card, borderRadius: 18, padding: 15,
      boxShadow: `inset 0 0 0 1px ${filled ? color + '55' : T.line}`,
      display: 'flex', alignItems: 'center', gap: 13, fontFamily: 'inherit' }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center',
        background: `${color}1F`, flexShrink: 0 }}>
        <Icon name={icon} size={23} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>{label}</span>
          <span style={{ fontFamily: 'Archivo', fontWeight: 700, fontSize: 10,
            letterSpacing: 1.4, color: T.faint }}>{sub}</span>
        </div>
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {(code ? window.WC.TEAM[code]?.flag : scFlag) &&
            <span style={{ fontSize: 22, flexShrink: 0 }}>{code ? window.WC.TEAM[code]?.flag : scFlag}</span>}
          <span style={{ fontSize: 17, fontWeight: 800, color: filled ? T.text : T.faint,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {code ? window.WC.TEAM[code]?.ja : (scorer ? scName : 'タップして選ぶ')}</span>
        </div>
      </div>
      <Icon name="chevron" size={19} color={T.faint} />
    </button>
  );
}

// オプション予想メニューの 1 行
function OptMenuRow({ T, icon, title, sub, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
      border: 'none', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
      background: T.card, borderRadius: 14, padding: '13px 14px', opacity: disabled ? 0.55 : 1,
      boxShadow: `inset 0 0 0 1px ${T.line}` }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        display: 'grid', placeItems: 'center', background: `${T.accent}1A` }}>
        <Icon name={icon} size={18} color={T.accent} sw={2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{title}</div>
        <div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{sub}</div>
      </div>
      <Icon name="chevron" size={18} color={T.faint} />
    </button>
  );
}

function Onboarding({ T, onDone, siteKey }) {
  const { useState } = React;
  const [step, setStep] = useState('name');         // name | sync | core | option | done
  const [me, setMe] = useState(null);
  const [pred, setPred] = useState(() => window.WC.emptyPred());
  const [optScreen, setOptScreen] = useState(null); // grouprank | thirdwild | knockout | null
  const [sheet, setSheet] = useState(null);         // champ | runner | scorer
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState(null);         // Turnstile トークン（siteKey なしなら不要）
  const [tsKey, setTsKey] = useState(0);            // 失敗時にウィジェットを再マウントするためのキー

  const member = me
    ? { id: me.id, name: me.name, c: T.accent, initial: Array.from(me.name)[0] || '?' }
    : { id: 'me', name: 'あなた', c: T.accent, initial: '?' };

  function persistPred(next) { setPred(next); window.WC.Me.saveDraft(next); }
  function setPick(f, v) { persistPred({ ...pred, [f]: v }); }
  function setGroupRank(k, arr) {
    persistPred({ ...pred, groupRank: { ...(pred.groupRank || {}), [k]: arr } });
  }
  function setThirdGroups(arr) { persistPred({ ...pred, thirdGroups: arr }); }
  function setKnockout(w) { persistPred({ ...pred, knockout: w }); }

  async function commitName() {
    const nm = name.trim();
    if (!nm || busy) return;
    if (siteKey && !token) { setErr('「私はロボットではありません」の確認を完了してください'); return; }
    setBusy(true); setErr('');
    try {
      const out = await window.WC.Me.create(nm, token);
      setMe(out.user);
      setPred(out.user.pred || window.WC.emptyPred());
      setStep('core');
    } catch (e) {
      setErr(e.message || '作成に失敗しました');
      // Turnstile トークンは使い切りのため、失敗時はウィジェットを作り直す。
      if (siteKey) { setToken(null); setTsKey((k) => k + 1); }
    }
    finally { setBusy(false); }
  }
  async function commitSync() {
    const c = codeInput.trim();
    if (!c || busy) return;
    setBusy(true); setErr('');
    try {
      const out = await window.WC.Me.sync(c);
      onDone(out.user);
    } catch (e) {
      setErr(e.status === 404 ? 'コードに該当するユーザーがいません' : (e.message || '復元に失敗しました'));
    } finally { setBusy(false); }
  }
  // 完了時に下書きをKVへ1回だけ保存（commit）。失敗してもメイン画面で
  // 未保存表示＋再試行できるので、ここでは止めずに進める。
  async function finish(tab) {
    try { await window.WC.Me.commit(); } catch (e) { /* メイン側の SaveStatus が再試行を担う */ }
    onDone({ ...me, pred }, tab);
  }

  function copyCode() {
    try {
      navigator.clipboard.writeText(me.code);
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch (e) {}
  }

  // ---- 共通の枠（中央寄せ・テーマ背景）----
  const frame = (children, max = 560) => (
    <div style={{ height: '100%', overflow: 'auto', background: T.bg, position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, background: T.grad, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', maxWidth: max, margin: '0 auto',
        padding: 'calc(env(safe-area-inset-top, 0px) + 26px) 18px calc(env(safe-area-inset-bottom, 0px) + 28px)',
        animation: 'wcFade .4s ease both' }}>
        {children}
      </div>
    </div>
  );

  const Wordmark = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
      <img src="/icons/icon-192.png?v=2" alt="" width={34} height={34}
        style={{ borderRadius: 10, display: 'block', flexShrink: 0 }} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontFamily: "'Anton', 'Archivo', sans-serif", fontWeight: 400, fontSize: 17, color: T.text,
          letterSpacing: 0.7 }}>WORLD CUP 2026</div>
      </div>
    </div>
  );

  const Steps = ({ n }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
      {['名前', '予想', '完了'].map((lbl, i) => {
        const active = i + 1 === n, done = i + 1 < n;
        return (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px 4px 5px', borderRadius: 999,
              background: active ? `${T.accent}1A` : 'transparent' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontFamily: 'Archivo', fontWeight: 800, fontSize: 11,
                background: done ? T.accent : active ? T.accent : T.card,
                color: (done || active) ? T.accentInk : T.faint }}>{done ? '✓' : i + 1}</div>
              <span style={{ fontSize: 12, fontWeight: 800,
                color: active ? T.accent : T.faint }}>{lbl}</span>
            </div>
            {i < 2 && <div style={{ width: 14, height: 2, borderRadius: 2, background: T.line }} />}
          </div>
        );
      })}
    </div>
  );

  const primaryBtn = (label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', border: 'none', borderRadius: 16, padding: '15px',
      fontFamily: 'inherit', fontWeight: 800, fontSize: 16,
      cursor: disabled ? 'default' : 'pointer',
      background: disabled ? T.card : T.accent, color: disabled ? T.faint : T.accentInk,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{label}</button>
  );

  const errLine = err
    ? <p style={{ color: T.danger, fontSize: 13, fontWeight: 700, margin: '12px 2px 0' }}>{err}</p>
    : null;

  // ============ name ============
  if (step === 'name') {
    return frame(
      <div>
        <Wordmark />
        <Steps n={1} />
        <div style={{ fontSize: 26, fontWeight: 900, color: T.text, letterSpacing: -0.5 }}>
          ようこそ ⚽️</div>
        <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.7, margin: '8px 0 22px' }}>
          <DotBreak>ニックネームを決めて、あなたの予想を始めましょう。ログインは不要です。</DotBreak></p>
        <input autoFocus value={name} maxLength={10}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) commitName(); }}
          placeholder="ニックネーム（10文字まで）"
          style={{ width: '100%', border: 'none', outline: 'none', boxSizing: 'border-box',
            background: T.panel2, color: T.text, fontSize: 17, fontFamily: 'inherit',
            fontWeight: 700, padding: '15px 16px', borderRadius: 14,
            boxShadow: `inset 0 0 0 1px ${T.line}` }} />
        <TurnstileWidget key={tsKey} siteKey={siteKey} onToken={setToken} theme={T.isDark === false ? 'light' : 'dark'} />
        {errLine}
        <div style={{ marginTop: 16 }}>
          {primaryBtn(busy ? '…' : 'はじめる', commitName, !name.trim() || busy || (siteKey && !token))}
        </div>
        <button onClick={() => { setErr(''); setStep('sync'); }} style={{
          marginTop: 18, width: '100%', border: 'none', background: 'transparent',
          color: T.sub, fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
          cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          別の端末から続ける（同期コードを入力）</button>
      </div>
    );
  }

  // ============ sync ============
  if (step === 'sync') {
    return frame(
      <div>
        <Wordmark />
        <div style={{ fontSize: 24, fontWeight: 900, color: T.text }}>別の端末から続ける</div>
        <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.7, margin: '8px 0 22px' }}>
          前の端末で表示された同期コードを入力すると、あなたの予想を復元できます。</p>
        <input autoFocus value={codeInput} maxLength={12}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && codeInput.trim()) commitSync(); }}
          placeholder="XXXX-XXXX"
          style={{ width: '100%', border: 'none', outline: 'none', boxSizing: 'border-box',
            background: T.panel2, color: T.text, fontSize: 19, fontFamily: 'Archivo, monospace',
            fontWeight: 800, letterSpacing: 3, textAlign: 'center', padding: '15px 16px', borderRadius: 14,
            boxShadow: `inset 0 0 0 1px ${T.line}` }} />
        {errLine}
        <div style={{ marginTop: 16 }}>
          {primaryBtn(busy ? '…' : '復元する', commitSync, !codeInput.trim() || busy)}
        </div>
        <button onClick={() => { setErr(''); setStep('name'); }} style={{
          marginTop: 18, width: '100%', border: 'none', background: 'transparent',
          color: T.sub, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          ← 戻る</button>
      </div>
    );
  }

  // ============ core ============
  if (step === 'core') {
    return frame(
      <div>
        <Steps n={2} />
        <Eyebrow T={T}>STEP 2 · コア予想</Eyebrow>
        <div style={{ fontSize: 23, fontWeight: 800, color: T.text, marginTop: 3, marginBottom: 4 }}>
          まず3つを予想</div>
        <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
          優勝・準優勝・得点王を選びましょう（あとで変更できます）。</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CoreRow T={T} label="優勝" sub="CHAMPION" color={T.gold} icon="trophy"
            code={pred.champion} onClick={() => setSheet('champ')} />
          <CoreRow T={T} label="準優勝" sub="RUNNER-UP" color={T.silver} icon="medal"
            code={pred.runnerUp} onClick={() => setSheet('runner')} />
          <CoreRow T={T} label="得点王" sub="TOP SCORER" color={T.boot} icon="boot"
            scorer={pred.topScorer} onClick={() => setSheet('scorer')} />
        </div>
        <div style={{ marginTop: 22 }}>
          {primaryBtn('次へ（オプション予想）', () => setStep('option'))}
        </div>
        <button onClick={() => setStep('done')} style={{
          marginTop: 12, width: '100%', border: 'none', background: 'transparent',
          color: T.sub, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          スキップして完了 →</button>

        <TeamPicker open={sheet === 'champ'} onClose={() => setSheet(null)} T={T} centered
          title="優勝を選ぶ" onPick={(c) => setPick('champion', c)} />
        <TeamPicker open={sheet === 'runner'} onClose={() => setSheet(null)} T={T} centered
          title="準優勝を選ぶ" onPick={(c) => setPick('runnerUp', c)} exclude={[pred.champion]} />
        <ScorerPicker open={sheet === 'scorer'} onClose={() => setSheet(null)} T={T} centered
          title="得点王を選ぶ" onPick={(v) => setPick('topScorer', v)} />
      </div>
    );
  }

  // ============ option ============
  if (step === 'option') {
    if (optScreen === 'grouprank') {
      return frame(<GroupRankScreen T={T} member={member} pred={pred}
        setGroupRank={setGroupRank} goBack={() => setOptScreen(null)} />);
    }
    if (optScreen === 'thirdwild') {
      return frame(<ThirdWildScreen T={T} member={member} pred={pred}
        setThirdGroups={setThirdGroups} goBack={() => setOptScreen(null)} />);
    }
    if (optScreen === 'knockout') {
      return frame(<KnockoutScreen T={T} member={member} pred={pred}
        setKnockout={setKnockout} goBack={() => setOptScreen(null)} availWidth={520} />);
    }
    const gr = pred.groupRank || {};
    const grDone = ['A','B','C','D','E','F','G','H','I','J','K','L'].filter((k) => (gr[k] || []).length >= 3).length;
    const wcCount = 8; // 3位通過する8組
    const taDone = (pred.thirdGroups || []).length;
    const koReady = grDone === 12 && taDone === wcCount;
    return frame(
      <div>
        <Steps n={2} />
        <Eyebrow T={T}>STEP 2 · オプション予想</Eyebrow>
        <div style={{ fontSize: 23, fontWeight: 800, color: T.text, marginTop: 3, marginBottom: 4 }}>
          もっと予想する（任意）</div>
        <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
          <DotBreak>やりたい人だけでOK。スキップしてすぐ完了できます。</DotBreak></p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OptMenuRow T={T} icon="chart" title="グループ順位予想" sub={`12組の1〜3位 · ${grDone}/12組`}
            onClick={() => setOptScreen('grouprank')} />
          <OptMenuRow T={T} icon="target" title="3位ワイルドカード" sub={`通過する8組を選択 · ${taDone}/${wcCount}組`}
            onClick={() => setOptScreen('thirdwild')} />
          <OptMenuRow T={T} icon="stadium" title="ノックアウト予想" sub={koReady ? 'ベスト32→決勝' : '先にグループ順位予想を'}
            onClick={() => koReady && setOptScreen('knockout')} disabled={!koReady} />
        </div>
        <div style={{ marginTop: 22 }}>
          {primaryBtn('完了する', () => setStep('done'))}
        </div>
        <button onClick={() => setStep('core')} style={{
          marginTop: 12, width: '100%', border: 'none', background: 'transparent',
          color: T.sub, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          ← コア予想に戻る</button>
      </div>
    );
  }

  // ============ done ============
  return frame(
    <div>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: T.accent,
          display: 'grid', placeItems: 'center', boxShadow: `0 10px 30px ${T.accent}40`,
          animation: 'wcPop .5s cubic-bezier(.22,1.2,.36,1) both' }}>
          <Icon name="check" size={36} color={T.accentInk} sw={2.6} />
        </div>
      </div>
      <div style={{ fontSize: 25, fontWeight: 900, color: T.text, textAlign: 'center' }}>
        予想を登録しました</div>
      <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.7, margin: '10px 0 22px', textAlign: 'center' }}>
        {me ? `${me.name} さん、ようこそ！` : 'ようこそ！'}<br />大会本番までいつでも変更できます。</p>

      {/* 同期コード */}
      <div style={{ background: T.card, borderRadius: 18, padding: 18,
        boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <Eyebrow T={T}>あなたの同期コード</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1, fontFamily: 'Archivo, monospace', fontWeight: 900, fontSize: 26,
            letterSpacing: 3, color: T.text }}>{fmtCode(me && me.code)}</div>
          <button onClick={copyCode} style={{
            border: 'none', borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
            background: copied ? T.card : `${T.accent}1A`, color: T.accent, fontFamily: 'inherit',
            fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: copied ? `inset 0 0 0 1.5px ${T.accent}` : 'none' }}>
            <Icon name={copied ? 'check' : 'copy'} size={16} color={T.accent} sw={2.4} />
            {copied ? 'コピー済' : 'コピー'}</button>
        </div>
        <p style={{ color: T.faint, fontSize: 12, lineHeight: 1.6, margin: '12px 0 0' }}>
          別の端末で予想を続けるときに使います。<br />
          <b style={{ color: T.sub }}>無くすと復元できません</b>ので、スクショなどで保管してください。</p>
      </div>

      <div style={{ marginTop: 20 }}>
        {primaryBtn('はじめる', () => finish('summary'))}
      </div>
      <button onClick={() => finish('rooms')} style={{
        marginTop: 12, width: '100%', border: 'none', background: 'transparent',
        color: T.accent, fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icon name="people" size={17} color={T.accent} />仲間と見比べる部屋を作る・参加する</button>
    </div>
  );
}

Object.assign(window, { Onboarding });
