# Đi đây

*Đi đây* is Vietnamese for "I'm off". I sit at my computer all day hunting bounties and hackathons. The only
time I go outside is a 200-metre walk to buy lunch, and I hurry back because every minute away feels like a
missed listing.

So the laptop works while I'm out. When I get up, I press **Đi đây**. Gemma 4, running on this computer,
reads the new listings and checks the fine print the way my
[Bounty Triage benchmark](https://www.kaggle.com/benchmarks/shenjun93/bounty-triage) does: hidden gates (a live
interview, a card, in-person attendance), whether Vietnam is eligible, and the real deadline in Vietnam time.
On my 2018 laptop that takes about a minute per listing, so the slowness is the walk.

The results stay locked until I come back with one photo and ten seconds of sound from outside. Gemma listens
to the recording and looks at the photo, and only then opens the list.

## How it works

| piece | where it runs | what it does |
|---|---|---|
| `server.mjs` | this computer (Node, no dependencies) | the dashboard, the trip, the queue, the lock |
| `sources/` | this computer | fetches open listings from Superteam Earn and Devpost |
| `brain.mjs` | this computer | asks Gemma 4 E4B (llama.cpp) to triage each listing and to check the photo and sound |
| `public/out.html` | the phone, on home wifi | one photo, ten seconds of sound, "I'm back" |

Things I learned the hard way, and kept in the code:

- **Time zones are converted in code, not by the model.** My benchmark showed small models getting
  "11:59 PM PDT" wrong in Vietnam time. Gemma copies the deadline and zone as written; `deadlineInVietnam` does the maths.
- **It listens before it looks.** With the photo and the sound in one prompt, Gemma described traffic in a
  recording of a speech: it was reading the photo. Now the sound goes in alone first.
- **Speech is described, never transcribed.** The recordings have my neighbours in them.
- **A pre-recorded video is not a "live interview".** The first version marked every "submit a demo video"
  bounty as a live interview. The prompt now carries the benchmark's definitions.

The dashboard only answers to this computer. The phone page answers on the local network at a random URL
that exists for one trip. Nothing goes to a cloud API.

## Run it

```bash
# 1. the brain: Gemma 4 E4B with image and audio input, via llama.cpp
docker run -d --name lac-brain -p 127.0.0.1:8090:8080 -v lac-models:/root/.cache/llama.cpp \
  ghcr.io/ggml-org/llama.cpp:server \
  -hf ggml-org/gemma-4-E4B-it-GGUF:Q4_0 --host 0.0.0.0 --port 8080 -c 8192 --jinja --no-webui
#    with an NVIDIA GPU (mine has 4 GB): use the :server-cuda image, add --gpus all and -ngl 8

# 2. the app
node server.mjs
```

Open <http://localhost:8787>. The first start downloads about 5 GB of model weights.
Edit `PROFILE` in `brain.mjs` (or set the `PROFILE` environment variable) to describe who the listings are for,
and add a source in `sources/index.mjs` to read something other than bounties.

## Before this

This repository started as *Lạc*, a walking-game with AI-written rules and a printable zine (its last version is commit
[`400a23a`](https://github.com/ShenJun93/di-day/tree/400a23a)). It looked like something a machine would make, so I threw it away and built the thing I
actually needed.

## Credits

- [Gemma 4](https://ai.google.dev/gemma) by Google DeepMind (Apache 2.0)
- [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT)
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT), vendored in `vendor/`

## License

MIT
