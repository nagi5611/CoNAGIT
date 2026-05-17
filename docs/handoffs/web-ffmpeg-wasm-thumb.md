# ffmpeg.wasm によるサムネフォールバック（`web/`）

## 依存

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/util
```

## Vite（共有 ArrayBuffer / WASM）

公式 README（導入・COOP/COEP）: [ffmpeg.wasm / ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)

## 実装

`web/src/media-upload-poc.js` の `tryFfmpegWasmThumbJpeg` が Mediabunny 失敗後に呼ばれる。パッケージ未導入時は `dynamic import` が失敗し **`null`** を返す。

## 制約（計画書と整合）

- 入力サイズ上限（PoC 既定 **80MB**）を超えたら処理しない。  
- UI では待ち時間・メモリ増を明示する。  
- MVP では **MP4 + H.264** のみに限定する選択肢を推奨。
