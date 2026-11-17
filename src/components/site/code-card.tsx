// トップの「登録コードのカード」の見本。実際に学校・園で配るカード（A03 の PDF）と同じ並びにする。
// 学校・園の名前やお子さまの名前は出さない（公開ページの決まり：仕様書3章）

function FakeQr() {
  // QR コードに見えるだけの模様（読み取れない）
  const cells = [
    "1111111010111111",
    "1000001011100001",
    "1011101001101101",
    "1011101110101101",
    "1000001010100001",
    "1111111010111111",
    "0000000110000000",
    "1101011001101011",
    "0110100111010110",
    "1011011010011101",
    "0000000101101001",
    "1111111001011010",
    "1000001011100110",
    "1011101010011011",
    "1000001101101001",
    "1111111010110111",
  ];
  return (
    <svg viewBox="0 0 16 16" className="size-24 shrink-0" role="img" aria-label="QRコードの見本">
      <rect width="16" height="16" fill="#fff" />
      {cells.flatMap((row, y) =>
        [...row].map((c, x) => (c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#1d2a44" /> : null)),
      )}
    </svg>
  );
}

export function CodeCardSample() {
  return (
    <figure className="mx-auto w-full max-w-sm">
      <div className="relative rotate-[-1.5deg] rounded-2xl border-2 border-ink bg-white p-4 shadow-[6px_6px_0_0_var(--cap)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-bold text-muted-foreground">DVD・Blu-ray ネット注文</p>
            <p className="text-lg font-bold">登録コード</p>
            <p className="text-sm text-muted-foreground">○○園　年長　○○組</p>
            <p className="text-sm text-muted-foreground">2026年度</p>
          </div>
          <FakeQr />
        </div>
        <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-center font-mono text-xl font-bold tracking-[0.12em]">
          ABCD-EFGH-JKMN
        </p>
      </div>
      <figcaption className="mt-5 text-center text-sm text-muted-foreground">
        学校・園からお子さま1人に1枚お配りします
      </figcaption>
    </figure>
  );
}
