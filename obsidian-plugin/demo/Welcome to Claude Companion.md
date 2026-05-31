---
created: 2026-05-31
source: claude-companion
type: artifact
---

# Welcome to Claude Companion

This note is a live demo. If the plugin is installed and enabled, the block
below renders as an **interactive artifact** in Reading view (toggle with
`Ctrl/Cmd+E`). No API key needed for this part — it proves the renderer works.

```claude-html height=560
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Claude Companion — Getting started</title>
<style>
  :root {
    --ivory:#FAF9F5; --slate:#141413; --clay:#D97757; --oat:#E3DACC;
    --olive:#788C5D; --gray-150:#F0EEE6; --gray-300:#D1CFC5;
    --gray-500:#87867F; --gray-700:#3D3D3A; --white:#FFFFFF;
    --serif:ui-serif,Georgia,'Times New Roman',serif;
    --sans:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    --mono:ui-monospace,'SF Mono',Menlo,Monaco,monospace;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:var(--sans);background:var(--ivory);color:var(--gray-700);
    line-height:1.55;-webkit-font-smoothing:antialiased;padding:40px 36px}
  .page{max-width:760px;margin:0 auto}
  .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.1em;
    text-transform:uppercase;color:var(--gray-500);margin-bottom:10px}
  h1{font-family:var(--serif);font-weight:500;font-size:32px;line-height:1.15;
    color:var(--slate);letter-spacing:-.01em;margin-bottom:14px}
  p.lead{font-size:15.5px;margin-bottom:28px;max-width:62ch}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
    gap:14px;margin-bottom:28px}
  .card{background:var(--white);border:1.5px solid var(--gray-300);
    border-radius:12px;padding:16px 18px}
  .card h3{font-family:var(--serif);font-weight:500;font-size:16px;
    color:var(--slate);margin-bottom:6px}
  .card p{font-size:13.5px;color:var(--gray-700)}
  .k{font-family:var(--mono);font-size:11px;color:var(--clay);
    text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;display:block}
  .steps{counter-reset:s;list-style:none;margin-bottom:26px}
  .steps li{counter-increment:s;position:relative;padding:10px 0 10px 38px;
    border-bottom:1px solid var(--gray-300);font-size:14.5px}
  .steps li:last-child{border-bottom:none}
  .steps li::before{content:counter(s);position:absolute;left:0;top:9px;
    width:24px;height:24px;border-radius:50%;background:var(--clay);color:#fff;
    font-family:var(--mono);font-size:12px;display:grid;place-items:center}
  .counter{display:flex;align-items:baseline;gap:10px;margin-bottom:22px}
  .counter b{font-family:var(--serif);font-size:30px;color:var(--clay)}
  button{font-family:var(--mono);font-size:12px;letter-spacing:.04em;
    background:var(--slate);color:#fff;border:none;border-radius:8px;
    padding:9px 16px;cursor:pointer}
  button:hover{background:var(--clay)}
  .tag{display:inline-block;font-family:var(--mono);font-size:10.5px;
    background:var(--gray-150);border:1px solid var(--gray-300);
    border-radius:999px;padding:2px 9px;color:var(--gray-700);margin-right:6px}
</style>
</head>
<body>
  <div class="page">
    <div class="eyebrow">Claude Companion</div>
    <h1>Claude, living inside your vault.</h1>
    <p class="lead">This is a fully interactive, self-contained artifact rendered
      in a sandboxed frame. Click the button — the script runs locally, but it
      can't touch your vault, cookies, or the network.</p>

    <div class="grid">
      <div class="card"><span class="k">Chat</span><h3>Side panel</h3>
        <p>Streaming replies with your notes as context.</p></div>
      <div class="card"><span class="k">Context</span><h3>Vault-aware</h3>
        <p>Active note, selection, links, or search.</p></div>
      <div class="card"><span class="k">Artifacts</span><h3>Inline + saved</h3>
        <p>Beautiful HTML that lives in your notes.</p></div>
    </div>

    <span class="k">Try it</span>
    <ol class="steps">
      <li>Open the chat panel from the ribbon (the sparkles icon).</li>
      <li>Paste your Anthropic API key in <em>Settings &rarr; Claude Companion</em>.</li>
      <li>Run <em>“Generate implementation plan from current note.”</em></li>
    </ol>

    <div class="counter">
      <button id="btn">Run interaction test</button>
      <div>clicks: <b id="n">0</b></div>
    </div>

    <div>
      <span class="tag">sandboxed</span>
      <span class="tag">no dependencies</span>
      <span class="tag">design-system matched</span>
    </div>
  </div>
  <script>
    let n = 0;
    document.getElementById('btn').addEventListener('click', () => {
      document.getElementById('n').textContent = ++n;
    });
  </script>
</body>
</html>
```

> If you see a styled card layout with a working **Run interaction test** button
> above, the plugin is installed correctly. If you only see raw code, enable
> **Claude Companion** in *Settings → Community plugins* and switch to Reading
> view.
