# Lạc · get lost on purpose

*Lạc* is Vietnamese for "lost". Lạc gives you a deck of walking rules and sends you out without a map.
At each stop you take one photo and record ten seconds of sound. Back home, an open-weight model on your
own computer looks at every photo and listens to every recording, then turns the walk into a printable
eight-page zine and a one-minute soundwalk.

Built for the DEV Hacktoberfest Open-Source AI Challenge, week 1: *Touch Grass*.

## Two halves, no server

| | runs on | needs a network? | what it does |
|---|---|---|---|
| **Pocket** (`index.html`) | any phone browser | no (installable PWA, works in airplane mode) | deals rule cards, reads them aloud, records one photo + 10 s of sound per stop, keeps a GPS trace |
| **Base** (`base.html`) | your computer | no (after the one-time model download) | Gemma 4 E4B writes the rules before the walk, and reads the photos and sounds after it |

Scores travel from base to pocket inside a QR code (the rules are compressed into the URL fragment, which is
never sent to any server). Walks travel back as a single `.lac` file through the phone's share sheet.

## Why open weights

The photos are of my street, and the recordings have my neighbours in them. With an open model running on
my own machine, none of that leaves the house. It also costs nothing per walk, works with no signal, and
anyone can change the rules the model writes by editing one prompt.

## Run the base

The base uses [llama.cpp](https://github.com/ggml-org/llama.cpp)'s `llama-server`, which runs Gemma 4 with
image and audio input on a plain CPU:

```bash
# CPU only
docker run -d --name lac-brain -p 127.0.0.1:8090:8080 -v lac-models:/root/.cache/llama.cpp   ghcr.io/ggml-org/llama.cpp:server   -hf ggml-org/gemma-4-E4B-it-GGUF:Q4_0 --host 0.0.0.0 --port 8080 -c 8192 --jinja --no-webui

# with an NVIDIA GPU (even a 4 GB one): the image and audio encoders and a few layers move to the GPU
docker run -d --name lac-brain --gpus all -p 127.0.0.1:8090:8080 -v lac-models:/root/.cache/llama.cpp   ghcr.io/ggml-org/llama.cpp:server-cuda   -hf ggml-org/gemma-4-E4B-it-GGUF:Q4_0 --host 0.0.0.0 --port 8080 -c 8192 -ngl 8 --jinja --no-webui

node serve.mjs . 8787
```

Then open <http://localhost:8787/base.html>. The first start downloads about 5 GB of weights.
`node tools/smoke-brain.mjs` checks the brain end to end with public sample media.

## Credits

- [Gemma 4](https://ai.google.dev/gemma) by Google DeepMind (Apache 2.0)
- [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT)
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT), vendored in `vendor/`
- The idea of the *dérive* comes from Guy Debord and the Situationists; the rule cards owe a lot to Fluxus event scores.

## License

MIT
