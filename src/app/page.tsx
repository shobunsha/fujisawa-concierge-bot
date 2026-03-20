export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", lineHeight: 1.8 }}>
      <h1>藤沢コンシェルジュ「AIお悩み発明家」</h1>
      <p>このアプリは LINE webhook を受けて動作します。</p>
      <p>
        LINE Developers の Webhook URL に
        <code> /api/webhook </code>
        を設定してください。
      </p>
    </main>
  );
}