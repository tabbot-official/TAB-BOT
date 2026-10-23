# Image enhancement build, October3

v1.6.3 command code deployed; local Sharp baseline works. Host Clipdrop execution is enabled with the owner's99-attempt cap; local Sharp remains the default and external disclosure requires an explicit per-photo yes. No separate deployment for this documentation.

- /remini and /enhance alias default to Sharp upscaling. /upscale, /sharpen, /denoise work locally; local output is not AI face restoration. /restore requires configured PixelBin or Replicate.
- Explicit provider syntax: /remini clipdrop 2 yes, /restore pixelbin 1 yes. External trials owner-only. No silent cross-provider fallback or paid topup. Per-photo disclosure confirmation required.
- Input static JPEG/PNG/WebP10MiB/16MP; output20MiB/max4096side. Bounded WhatsApp stream, Sharp validate/rotate/strip metadata, multipart axios+form-data, fixed HTTPS endpoints, no redirects, approved output hosts, limited polling and120second overall timer. Shared download queue;3per minute; isolated temp job cleaned after send/failure.
- Clipdrop synchronous upscale only,100development/debug credits,1credit/call; outputsJPEG/WebP. Retention not verified. Free-credit claim requires name/phone/SMS/reCAPTCHA, not just email. The original email-created account showed0credits; the owner supplied a separate key. That key returned99remainingcredits after one synthetic trial. Its email binding is not independently verified.
- PixelBin direct multipart sr/upscale prediction supportsface enhancement and quality; input and output URLs exist remotely, outputs~30days. No promise of private retention/deletion. Disabled until owner clears those disclosures/credits.
- Replicate RealESRGAN/GFPGAN explicit pinned schema version; trial dataURL input limited256KiB. Paid approval required, budget0default. Replicate prepaid balance/payment method required. CodeFormer was not selected; its noncommercial license does not describe all Replicate models.
- Budgets count attempted calls conservatively and persist atomically in data/image-credit-budget.json before provider POST. Unreadable/failed budget persistence blocks requests. Single-process queue serializes reservations; not a multiple-server wallet. External operations should stay disabled unless owner approves scoped credit test. Provider may charge timeout/failure; no automatic POST retries.
- Mock tests do not prove current provider credentials/API outcome. One real bounded synthetic Clipdrop trial returnedHTTP200,image/jpeg,512x384,14572bytes,header99remainingcredits. Original synthetic input256x192; both images visually checked. One attempted call persisted before POST; no retry/fallback. This is an upscaling smoke test, not face restoration or a personal-photo quality benchmark. No personal photos uploaded during development.

Sources:
https://clipdrop.co/apis/docs/image-upscaling
https://clipdrop.co/apis/account
https://replicate.com/docs/reference/http
https://replicate.com/docs/topics/billing/prepaid-credit
https://replicate.com/nightmareai/real-esrgan/api/schema
https://www.pixelbin.io/pricing
https://github.com/pixelbin-io/pixelbin-js-admin
https://api.pixelbin.io/service/public/transformation/v1.0/predictions/schema/sr_upscale

## Free adapters deployed October 3

Current state: both adapters enabled after approved tests. SnapEdit remaining local budget92credits, vendor8/100 used. CodeFormer has no local attempt cap in free-only mode; provider quota/queue errors stop each photo. No paid fallback, repeat prediction, quota workaround or automatic retry. Explicit provider and per-photo `yes` remain required. Gradio client pinned2.7.1. The diagnostic history below describes earlier failures, not current readiness.

- Explicit owner-only `/remini codeformer 2 yes` or `/restore codeformer 2 yes` uses the public `sczhou/CodeFormer` Hugging Face Space. Anonymous works without a key; optional `HF_TOKEN` selects an owner's account. Current ZeroGPU allowance is 2 GPU minutes/day anonymous or 5 for a free account, not a guaranteed number of requests. Queues and errors are surfaced without automatic retries, duplication, account rotation, paid fallback or quota bypass.
- The CodeFormer source schedules output removal after 30 seconds. The adapter downloads as soon as a data event arrives. Upload/Gradio cache retention is not verified. This is a public demo, not a privacy guarantee. Fidelity is fixed at 0.7; reconstructed faces may change identity details.
- `/remini snapedit 2 yes` or `/restore snapedit 2 yes` uses SnapEdit's standard Enhance endpoint, not its more expensive Pro endpoint. Per attempt, 2x reserves 4 credits and 4x reserves 7 before the POST. Failed attempts remain locally reserved conservatively. Vendor trial credits and costs must be verified before enabling; no paid topup.
- `REMINI_CODEFORMER_BUDGET` is a local lifetime attempt cap, not measured GPU minutes. SnapEdit's budget is credits, not requests. Both adapters default disabled with a zero cap. Existing Clipdrop/PixelBin/Replicate settings remain separate.
- Bounds: same 10 MiB input/20 MiB output and 4096px output limits. SnapEdit input <=1500px per side. CodeFormer 4x input <=1000px per side; 2x <=1500px longest and <=1100px shortest side. Inputs are rejected instead of silently resized. Output dimensions must match the requested scale. Timeout attempts are canceled best effort; provider computation/quota may already have been used.
- One approved synthetic 256x192 test per provider on October 3: SnapEdit HTTP200 charged 4 credits, balance 96, but output URL rejected for unapproved host; no image delivered. HF prediction downloaded an image but output size differed from expected 512x384 and was rejected. Earlier HF pre-submit connect-method binding failure used no GPU quota and was fixed. Anonymous GPU minutes remaining are not exposed. No retries after either actual prediction. At that diagnostic checkpoint both adapters remained disabled; later approved retests below fixed the failures. No personal photos were used.

Sources: https://huggingface.co/spaces/sczhou/CodeFormer/blob/main/app.py , https://huggingface.co/docs/hub/spaces-zerogpu , https://developer.snapedit.app/en/docs/enhance-pro , https://developer.snapedit.app/privacy

- Approved diagnostic retest: SnapEdit second HTTP200/4 credits, balance92/100, total8credits. Captured real output host `api-outputs.snapedit.app`, added exact host alongside documented host. Recovered same second result without extra POST:512x384PNG8992bytes, JPEG visually inspected, synthetic-only upscale smoke test passed. Key cap8/8 spent; future enablement needs owner usage cap and key quota change. HF second prediction returned queue/quota/model error; no result or further retry, remains disabled. Its first downloaded result dimension mismatch remains unresolved. Anonymous GPU minutes remaining unknown.

- HF account login now verified as Bobby1212333, primary verified sharmabobby910@gmail.com. Minimal fine-grained Read-Only token vaulted. Live billing showed non-PRO, credits$0, ZeroGPU0/5minutes, inference$0/$0.10 before/just after synthetic test (UI can lag). Signed-in prediction returned1366x1024 rather than requested512x384. Root cause traced to FaceRestoreHelper.read_image enlarging short side to512 before requested upscale. Fix validates exact internal expanded dimensions, checks4096/pixel bounds before upload, then normalizes down to user's requested size. Wrong-size results still rejected. At this checkpoint the final fixed test was still pending; its later approved result is below. Source https://github.com/sczhou/CodeFormer/blob/master/facelib/utils/face_restoration_helper.py .

- Approved final signed-in size-fix retest PASS:256x192synthetic to512x384JPEG23058bytes. Actual pixels inspected, shape/text integrity and aspect ratio intact. This is an upscale smoke test, not face-quality proof. Four real HF predictions total (2anonymous/2signed-in); no automatic retry/fallback. CodeFormer adapter passed this test and is now deployed.
