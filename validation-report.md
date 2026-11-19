# Validation Report — gta6-trophy-rarity-forecast-01

**Versi v1 — laporan diisi penuh oleh build session, 20 Nov 2026 ~00:05 WIB.**
Kompetisi program — TIDAK ADA screenshot; laporan ini menggantikan shot list.
Satu angka tanpa konteks skema = tidak berarti.

---

## 0. Metadata run

| Item | Nilai |
|---|---|
| Versi | v1 (commit SHA lengkap ada di handoff build ke main chat) |
| Tanggal/waktu validasi | 20 Nov 2026 ~00:05 WIB (19 Nov ~17:05 UTC) |
| Kit level | lv27 (`node cli/makefun.mjs --version` → `0.1.0 (kit level 27, build dfb636ab0e1e)`, cocok dengan level situs per 19 Nov malam) |
| Bahasa entry | main.ts (Node 22, stdlib only) — `node main.ts`, Node v24.22.1 di VM ini |
| Runtime per case (p00 / p01) | ~0,19 dtk / ~0,21 dtk wall per single-case run (rentang 0,17–0,26 dtk termasuk startup Node + type-stripping; batas 8.000 ms, target internal ≤ 2 dtk) |
| Deterministik (2 run sha256 sama) | YA — p00 `fc6a13f6b37662223e7da2e2ebdb3e59e28d88e3c2ede80cb9b5d88f9dbeda8b`, p01 `dc1d881064e21067e8eca4b2e7992f7ddd4371558690b6eefe207f3d13423886` |
| Output valid (55 trofi, q non-decreasing, ≤ 65.536 B) | YA — p00 2.774 byte, p01 2.771 byte; 55/55 trofi, tiap id sekali, urutan input, tanpa key lain |
| Dry-run bundle (Gate c) | Lolos (exit 0, "dry run: nothing written") — 3 session ditemukan, system prompt uploaded, instruction files collected, MCP none. Catatan: 0 usage rows ter-attach (expected mid-run; row subagent ditulis saat run selesai — parent melampirkan `--muse-usage` saat bundle final). Run-record prompt di dry-run ter-resolve ke prompt main-chat yang tidak terkait ("setya dan pxio drop aja") — bundle final WAJIB memastikan prompt pembuka build (kata-kata user verbatim) yang terekam. Repo tercatat `dirty` saat dry-run (pekerjaan v1 belum commit — commit dilakukan setelah laporan ini). |

### Apa yang dibangun v1 (ringkas)

Kerangka end-to-end per build-spec §3 + §6: segmentasi epoch (Langkah 1),
inversi integer earners + validasi ΣE (Langkah 2), model pool log-waktu +
level-shift refresh (Langkah 3), model earners log-waktu per trofi dengan
shrinkage tier × semantik (Langkah 4), special-case trofi jenuh R-2 (Langkah
2b), kuantil logit simetris σ² = (0,5√H)² + σ_count² (Langkah 6), guardrails +
determinisme. **Dengan K=1 (seluruh history kit), β adalah 100% prior**
(group prior: bronze-story 1,0; bronze-grind 0,5; bronze-other 0,7; silver
0,5; gold 0,3; platinum 0,3), γ = prior 0,5 (tidak ada refresh teramati),
pool slope b = prior 0,7, cap pool ×20 tidak mengikat (P̂/P_last ≈ 1,37 di
practice, ≈ 14,0 di horizon final 4,52 hari).

### Bug yang ditemukan & diperbaiki selama build v1 (dicatat jujur)

1. **Pool anchor K=1 salah:** intercept `a = log(P_0)` memperlakukan P=638
   sebagai nilai di t=0, padahal epoch berada di t≈2,5 jam — P̂ practice
   membengkak ke ~2.146 (seharusnya ~875). Diperbaiki: `a = log(P_last) −
   b·log(1+t_last)`. Median trofi #3 membaik 0,61 → 1,47% (last rate 1,25%).
2. **Trofi jenuh mengkontaminasi estimasi γ:** γ diestimasi dari Δlog
   trophies_earned; trofi #2 (638→3.868 saat refresh) menarik γ̂ ke ~0,88
   padahal γ dunia 0,5 — loss skenario H5 memburuk 2,19 → 2,48.
   Diperbaiki: trofi yang jenuh di semua epoch dikeluarkan dari agregat γ;
   H5 membaik ke 2,18.
3. **Generator sintetis:** trofi #2 tidak dipertahankan jenuh saat refresh;
   skenario jump ditempatkan SEBELUM deadline sehingga sudah termasuk di
   P_deadline (pool multiple salah arti) — dipindah ke jendela forecast
   (deadline→target); earners di-clamp E ≤ P.

## 1. Loss per versi (pinball logit — lower better)

### 1.1 Skema A — Holdout refresh pertama: TIDAK DAPAT DIJALANKAN (R-1)

**Skema A TIDAK DAPAT DIJALANKAN — jawaban refresh 04:30Z tidak ada di kit mana pun**
(RULES:11 hanya prosa, tanpa angka; NOTICE.txt: read lampau tak bisa diambil ulang).
Practice grade via server adalah Skema D, bukan holdout independen.
**Keputusan submit TIDAK BOLEH memakai angka Skema A.**

| Versi | Status Skema A |
|---|---|
| v1 | TIDAK DAPAT DIJALANKAN — jawaban practice tidak dipublikasikan |

### 1.2 Skema B — Walk-forward antar-epoch

| Versi | Mean loss | Dispersi (std antar-fold) | Fold terburuk | # fold |
|---|---|---|---|---|
| v1 | TIDAK DAPAT DIJALANKAN — hanya 1 epoch di data kit (semua read berpayload identik) | — | — | 0 |

### 1.3 Skema C — Stress refresh / horizon-panjang (simulasi skenario, GENERATOR INDEPENDEN)

**Generator independen (R-7):** saturasi logistik + refresh Poisson/jitter +
lag snapshot + pool dua-regime; parameter dari RULES dan angka terverifikasi
(refresh 04:30Z: P 638→3.868, jump log 1,80; horizon 6.510 menit), BUKAN dari
parameter model. History sintetis: 2 past refresh [0,6; 0,6] (3 epoch, γ
dapat diestimasi), jendela forecast 4,52 hari. Skema C adalah smoke test
robustness + harness regresi, **BUKAN kriteria submit** — ia hanya bisa
menggagalkan, tidak pernah sendirian membenarkan submit.

| Skenario | Loss | Coverage 90% | Pool multiple terealisasi |
|---|---|---|---|
| pool~1.1/ref0/gamma0 | 1,796533 | 0,073 | 1,11 |
| pool~1.1/ref0/gamma0.5 | 0,895770 | 0,655 | 1,10 |
| pool~1.1/ref0/gamma1 | 0,310122 | 1,000 | 1,11 |
| poolx2/ref1/gamma0 | 1,205762 | 0,364 | 2,01 |
| poolx2/ref1/gamma0.5 | 0,480748 | 1,000 | 2,01 |
| poolx2/ref1/gamma1 | 0,564577 | 1,000 | 2,02 |
| poolx6/ref1/gamma0 | 0,878006 | 0,800 | 6,05 |
| poolx6/ref1/gamma0.5 | 0,561280 | 1,000 | 6,08 |
| poolx6/ref1/gamma1 | 0,445691 | 1,000 | 6,08 |
| poolx6/ref3/gamma0 | 0,649148 | 1,000 | 6,10 |
| poolx6/ref3/gamma0.5 (sentral) | 0,649603 | 0,982 | 6,10 |
| poolx6/ref3/gamma1 | 0,352725 | 0,927 | 6,10 |
| poolx20/ref1/gamma0 | 0,328760 | 1,000 | 20,29 |
| poolx20/ref1/gamma0.5 | 0,379669 | 1,000 | 20,28 |
| poolx20/ref1/gamma1 | 0,397770 | 1,000 | 20,33 |
| poolx20/ref3/gamma0 | 0,347608 | 1,000 | 20,20 |
| poolx20/ref3/gamma0.5 | 0,275473 | 1,000 | 20,23 |
| poolx20/ref3/gamma1 | 0,418127 | 1,000 | 20,28 |
| poolx6/ref3/gamma0.5/lag12h | 0,712171 | 0,909 | 6,08 |
| poolx6/ref3/gamma0.5/lag24h | 0,426382 | 1,000 | 3,38 |
| poolx6/ref3/gamma0.5/lag48h | 0,556937 | 1,000 | 3,35 |
| poolx6/ref3/gamma0.5/satOff | 2,893006 | 0,345 | 6,09 |
| refresh-akhir poolx6@-1h | 0,264038 | 1,000 | 37,10 |

| Versi | Loss rata-rata skenario | Loss skenario TERBURUK | Skenario terburuk (yang mana) | # skenario di bawah 0,05 (K3) |
|---|---|---|---|---|
| v1 | 0,686518 | 2,893006 | poolx6/ref3/gamma0.5/satOff (trofi story → ~100%, v1 tanpa ceiling) | 0 / 23 |

> K3: Skema C terburuk < 0,05 — **GAGAL** (2,893006); < 0,30 di skenario
> refresh-akhir — **LOLOS** (0,264038). C4: Skema C terburuk > 0,5 →
> JANGAN submit versi itu — **TERPICU (2,893006)**. Terburuk di luar
> satOff: 1,796533 (pool~1.1/ref0/gamma0, coverage 0,073 — dunia tanpa
> refresh mendatang + earners tidak mengikuti pool adalah rezim yang
> paling memukul v1: median over-forecast sistematis dan fan terlalu
> sempit). Refresh-akhir lolos karena fan lebar σ_trend di horizon 4,52
> hari sudah mencakup satu jump besar.

### 1.4 Skema D — Practice cut (sanity check SAJA — bukan kriteria)

| Versi | Loss p00 | Loss p01 | Catatan |
|---|---|---|---|
| v1 | TIDAK DAPAT DIHITUNG | TIDAK DAPAT DIHITUNG | Jawaban refresh 04:30Z tidak dipublikasikan (hanya prosa RULES:11). Output p00/p01 valid; median contoh p00: #1 0,5316% (last 0,63%), #2 99,99%, #3 1,4686% (last 1,25%), #55 0,7304% (last 0,78%). |

> Practice loss dicatat untuk transparansi. Keputusan submit TIDAK BOLEH bersandar
> pada angka ini (horizon 90 menit ≠ final 4,6 hari; regime berbeda).

## 2. Perbandingan vs acuan (SEMUA angka leaderboard berstempel waktu — re-probe ≤10 menit sebelum dipakai)

| Acuan | Loss (practice) | Keterangan |
|---|---|---|
| Rank-1 | 0,0203 (probe 22:11 WIB) / 0,00598 (probe 22:21 WIB, eager-pika-22) | Practice — **orde besaran saja, bukan target** (R-6) |
| Pay line rank-20 | 0,0752 (probe 22:11 WIB) / 0,0658 (probe 22:21 WIB) | Practice — syarat peringkat saja, **BUKAN kriteria submit** |
| Median leaderboard | 0,438 | Practice, n=3.858 (probe 22:11 WIB) |
| House baseline persistence | ~1,51 | Practice — **BUKAN kriteria submit** (R-6) |
| House curve baseline | ~1,51 | Practice — sama |
| House model forecast | **TIDAK DIKETAHUI** | Bar hadiah sebenarnya — tidak dipublikasikan |
| **Model ini (Skema C terburuk)** | **2,893006** | **Skema A tidak dapat dijalankan — tidak ada angka Skema A** |

## 3. Divergensi backtest-vs-holdout (skill backtest-vs-live-performance-divergence-tracking)

| Pasangan | Rasio / selisih | Klasifikasi |
|---|---|---|
| Practice (D) vs Stress C terburuk | TIDAK DAPAT DIHITUNG — loss practice tidak tersedia (jawaban tidak dipublikasikan) | TIDAK DAPAT DINILAI |
| Coverage 90% C vs nominal 0,90 | rata-rata 0,872 (rentang 0,073–1,000) | Di bawah target 0,90–0,98 (K4) — fan terlalu sempit di rezim tanpa-refresh |

> Aturan (K5): divergensi stress terburuk ≤ 2× practice loss = ACCEPTABLE;
> > 2× = WARNING; **> 4× = CRITICAL = JANGAN submit.** K5 tidak dapat
> dihitung di v1 karena practice loss tidak ada — ini bukan nilai lolos,
> ini lubang pengukuran yang dicatat apa adanya.

## 4. Diagnosa per trofi (v1 — angka dari harness sintetis Skema C)

Skenario sentral (poolx6/ref3/gamma0.5, loss 0,649603):

| Kelompok | Loss rata-rata | Keterangan |
|---|---|---|
| Trofi 100% (#2 Just Like Paradise) | 0,008448 | Jenuh — special-case R-2 (Ê≡P̂, median 99,99) |
| Trofi near-saturated (E/P ≥ 0,99) | — (tidak ada di kit selain #2) | Tidak ada trofi near-saturated lain di data kit |
| Platinum (#1) | 0,333097 | E=4 di kit — counts sangat kecil |
| Gold (2 trofi) | 0,283560 | |
| Silver (6 trofi) | 0,357172 | |
| Bronze story | 0,908412 | Kelompok terburuk di skenario sentral |
| Bronze grind | 0,480351 | |
| Bronze other | 0,747319 | |
| 33 trofi dengan 1–5 earners | (tercakup di bronze story/grind/other di atas) | Shrinkage grup aktif; dengan K=1 β 100% prior |

Skenario terburuk (satOff, loss 2,893006): bronze story **10,639282**,
bronze other 1,874397, silver 0,866576, bronze grind 0,724107, gold
0,360732, platinum 0,306721, #2 0,008448. Trofi story yang menuju ~100%
adalah sumber kehancuran v1 — persis alasan ceiling saturasi (R-4) menjadi
inti v2.

### 4b. Uji khusus trofi jenuh (R-2 — angka dari harness sintetis, bukan intuisi)

| Uji | Hasil | Ambang |
|---|---|---|
| Trofi E=P di semua epoch → Ê≡P̂, median 99,99 | YA (9/9 case harness; median #2 = 99,99 di semua case) | WAJIB |
| Kontribusi loss trofi #2 di Skema C terburuk | 0,008448 | < 0,01 — LOLOS |
| Trofi near-saturated (E/P ≥ 0,99) melacak P̂ (selisih median vs 99,99) | Tidak ada trofi near-saturated di data kit/harness (selain #2 yang jenuh penuh) | < 0,1 logit — TIDAK DAPAT DIUJI |

## 5. Sensitivitas parameter (v1 — loss Skema C per nilai; yang belum diuji dicatat, bukan dikarang)

| Parameter | Nilai yang diuji | Loss Skema C tiap nilai | Pilihan final |
|---|---|---|---|
| γ dunia (generator) — K7 | 0 / 0,5 / 1 | per pool, lihat tabel K7 di §6 | K7: selisih γ=0 vs γ=1 < 50% — **GAGAL (maks 82,7%)** |
| γ model (prior/estimasi runtime) | 0,5 (prior saat K=1); diestimasi runtime saat refresh teramati | — | γ model bukan knob tetap di v1; sensitivitas diukur lewat γ dunia |
| κ (shrinkage) | 3 (default spec) | Belum di-sweep di v1 | v2 |
| s_trend (σ trend) | 0,5 (default spec) | Belum di-sweep di v1 | v2 |
| Fan asimetris a | 0 (simetris, v1) | — | v2/v3 bila A/B mendukung |
| Cap pool (× P_last) | 20 | Tidak mengikat di practice (rasio 1,37) maupun final (rasio ~14,0) | 20 |
| Ambang deteksi refresh ΔlogP | 0,2 | Belum di-sweep di v1 | v2 |
| Laju refresh (per 4,6 hari) | future {0, 1, 3} refresh | loss 0,896 (ref0/γ0.5) / 0,561 (ref1) / 0,650 (ref3) | — |
| Lag snapshot | 0 / 12 / 24 / 48 jam (skenario sentral) | **0,649603 / 0,712171 / 0,426382 / 0,556937** | **Loss sensitif terhadap lag (rentang 0,43–0,71) → lag HARUS dimodelkan di v2 (R-3).** Catatan jujur: lag24 lebih baik dari lag0 karena truth lag24 mengecualikan jump future terakhir — artefak desain skenario, bukan bukti lag24 optimal. |
| Pool dua-regime vs satu regime | satu (v1) | — | Dua-regime = inti v2 |
| Aggregate-constraint (A/B v2) | tanpa (v1: cek pasca + koreksi residu) | ΣE = 943 = T persis di kit; 0 epoch ter-flag | v2 |
| Probit di fan (A/B v3) | logit (v1) | — | v3 bila pinball Skema C membaik ≥5% |
| Cohort dua-kelompok (A/B v3) | tanpa (v1) | — | v3 bila ≥2 refresh di data build |

## 6. Keputusan submit — K1–K7 + rencana submit (R-6, R-10)

- [x] **K1 — Gate format:** output valid + deterministik + runtime OK (gate §0) — **LOLOS**
- [x] **K2 — Robustness sintetis:** semua case harness sintetis multi-epoch + edge case lolos — **LOLOS 9/9** (`node tools/harness.mjs`: H1 multi-epoch, H2 null, H3 rate 0%, H4 P=100.000, H5 1 refresh ×6, H6 tanpa refresh, H7 10 trofi, H8 γ=0, H9 γ=1; semua valid + deterministik + runtime ≤ ~0,3 dtk; loss harness 0,69–2,48)
- [ ] **K3 — Skema C terburuk < 0,05** (nilai: **2,893006**) dan **< 0,30 di skenario refresh-akhir** (nilai: **0,264038 — LOLOS**) — **GAGAL keseluruhan**
- [ ] **K4 — Coverage 90% Skema C di 0,90–0,98** (nilai: **0,872 rata-rata**) — **GAGAL (tipis)**
- [ ] **K5 — Divergensi stress terburuk ≤ 2× practice loss** (nilai: **tidak dapat dihitung** — practice loss tidak tersedia) — **TIDAK DAPAT DINILAI**
- [ ] **K6 — Practice loss pasca-submit v1** (nilai: belum submit) — **BELUM ADA**
- [ ] **K7 — Sensitivitas γ:** selisih loss Skema C γ=0 vs γ=1 < 50% (nilai: **maks 82,7%** — pool~1.1/ref0: 1,796533 vs 0,310122; poolx2/ref1: 53,2%; poolx6/ref1: 49,2%; poolx6/ref3: 45,7%; poolx20/ref1: 21,0%; poolx20/ref3: 20,3%) — **GAGAL**
- [ ] Diferensiator R-2/R-3/R-4 terimplementasi: trofi jenuh **YA** · lag snapshot **TIDAK (v2)** · ceiling saturasi **TIDAK (v2)**
- [x] Memo risiko tertulis: "tidak ada angka lokal yang menjamin hadiah; bar house tidak diketahui" — lihat di bawah
- [ ] **Keputusan: TIDAK SUBMIT v1 atas dasar merit — v1 adalah asuransi gate + probe pengukuran (R-10), bukan kandidat menang.** Keputusan submit ada di main chat; bila v1 disubmit pagi 20 Nov, itu sebagai probe (satu pengukuran practice), bukan karena K1–K7 lolos.
- [ ] Bila TIDAK SUBMIT atas dasar merit: yang harus berubah sebelum deadline — v2 WAJIB: σ_refresh + lag snapshot (R-3) + ceiling saturasi (R-4) + pool dua-regime (R-5) + sweep κ/s_trend; target v2: Skema C terburuk membaik ≥20% vs v1 (≤ 2,31) DAN K7 < 50%.

### Memo risiko (wajib sebelum submit)

Tidak ada angka lokal yang menjamin hadiah; bar house tidak diketahui.
Skema C terburuk v1 (2,893) jauh di atas pay line practice (0,0658) dan di
atas loss house baseline practice (~1,51) — di rezim tanpa-refresh/γ=0 dan
di rezim saturasi story, v1 kalah dari persistence. Satu-satunya hal yang
v1 buktikan adalah: program berjalan, output valid, deterministik, cepat,
dan jalur multi-epoch (yang baru hidup di f00) sudah dieksekusi di harness
sintetis. Kriteria K3/K4/K7 gagal; K5 tidak dapat dinilai. Submit v1 hanya
dibenarkan sebagai probe pengukuran (R-10), bukan sebagai klaim menang.

### 6b. Rencana submit (R-10)

- **v1: pagi 20 Nov** — sebagai asuransi gate + probe pengukuran (segera setelah v1 lolos gate lokal + kit check).
- **v2: hanya bila Skema C terburuk membaik ≥20% vs v1.**
- **v3: kandidat final 20 Nov malam / 21 Nov pagi.**
- Sisakan **≥1 slot cadangan 21 Nov**. Anggaran slot: 1 submit utama + maks 1 perbaikan sebagai rencana dasar (submit v1/v2 dihitung sebagai pengukuran, bukan pengunci — Force_Last: submit terakhir = final).
- **Bekukan submit rutin 21 Nov 12:00 WIB** kecuali darurat.
- **Cut line keras 21 Nov 16:30 WIB:** bila v-final belum submit, submit versi terbaik yang lolos kit check SAAT ITU JUGA.
- Prefer submit final **20 Nov** (sebelum peer check `thinking_own_work` 21 Nov 00:00Z aktif).
- Cek kuota sesaat sebelum build DAN sesaat sebelum setiap submit (gate reputasi bisa menutup lagi tanpa pemberitahuan).
- Verifikasi isi check `thinking_own_work` SEBELUM build dimulai (lihat `record-checklist.md` §0 — berlaku dari 20 Nov 00:00Z; Tier 1: ≥20 baris DAN ≥10% dari baris entry lain, atau ≥50% satu file ≥20 baris, atau satu file biner utuh; Tier 2: ≥100 baris kode publik DAN ≥40% baris kode/markup deliverable).

### 6c. Cut lines (salinan dari red-team-report §5 — yang melanggar = STOP)

- C1 gate `can_submit: false` → STOP. C2 kit check gagal 2× pada check yang sama → STOP iterasi fitur. C3 satu pun case sintetis gagal → STOP, jangan bundle. **(C3: harness v1 HIJAU 9/9 — tidak terpicu.)**
- C4 Skema C terburuk > 0,5 → JANGAN submit versi itu. **(TERPICU: 2,893006 — v1 tidak boleh disubmit atas dasar merit.)** C5 divergensi > 4× practice → CRITICAL, JANGAN submit. (Tidak dapat dihitung — practice loss tidak tersedia.) C6 practice loss v1 > 0,15 → STOP arah yang sama. (Belum ada practice loss — menunggu probe submit.) C7 practice loss 0,0752–0,15 → waspada, v2/v3 hanya bila Skema C membaik ≥20%. C8 selisih loss C γ=0 vs γ=1 > 2× → STOP, lebarkan σ_refresh. (Maks 82,7% < 2× — tidak terpicu, tapi K7 <50% tetap gagal.) C9 P̂(target)/P_last > 50 → paksa cap ×20. (Tidak terpicu: rasio ~14,0.) C10 21 Nov 16:30 WIB tercapai dan v-final belum submit → submit versi terbaik yang lolos kit check SAAT ITU JUGA. C11 sisa slot 0 dan versi terbaik belum submit → STOP, tunggu reset 07:00 WIB. C12 level kit naik setelah bundle final → STOP, re-download, re-check penuh. C13 v3 gagal K1–K7 dan deadline < 4 jam → submit v2 (atau v1), JANGAN submit v3 yang gagal kriteria hanya karena "lebih baru".

## 7. Yang belum terverifikasi pada saat laporan ini ditulis

- [ ] Bar house model forecast (tidak dipublikasikan — tidak bisa diuji).
- [ ] Jumlah & ukuran refresh Exophase 21–26 Nov.
- [ ] Ukuran pool final 26 Nov.
- [ ] Apakah pay line practice mirip pay line final.
- [ ] Distribusi lag snapshot jawaban (v1 hanya uji sensitivitas lag {0, 12, 24, 48 jam}).
- [ ] Validasi walk-forward antar-epoch — data kit hanya memuat 1 epoch.
- [ ] Skema A — TIDAK DAPAT DIJALANKAN (jawaban practice tidak dipublikasikan).
- [ ] K5 divergensi — practice loss tidak tersedia sebelum probe submit.
- [ ] Sweep κ / s_trend / ambang ΔlogP / fan asimetris — belum dijalankan di v1 (v2/v3).

---

*Acuan: `concept-brief.md` §3.5/§5, `build-spec.md` §5–§7. Skill: `walk-forward-validation-setup`,
`backtest-vs-live-performance-divergence-tracking`, `makefun_bounty_submission`.*
