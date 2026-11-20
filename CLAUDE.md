# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## โปรเจกต์

**ARANYA อรัญญา – ดินแดนแห่งพงไพร** (ชื่อชั่วคราว) เป็นเกม 2.5D MMORPG บนเว็บเบราว์เซอร์ ธีมป่าหิมพานต์และ folklore ไทย-อุษาคเนย์ ภาพเป็นแบบ HD-2D คือสไปรต์พิกเซลบนโลก 3D low-poly บทบาทของ Claude ในโปรเจกต์นี้คือ Lead Game Developer ที่เชี่ยวชาญ web game และ MMORPG

**Tech stack**

| ส่วน | เทคโนโลยี |
|---|---|
| Client | Babylon.js + TypeScript + Vite (PWA) |
| Server | Colyseus (Node.js/TS), server-authoritative |
| Data | PostgreSQL + Redis |
| Deploy | Docker, region สิงคโปร์, Cloudflare CDN |

## สถานะปัจจุบัน

- เสร็จแล้ว:
  - Step 0.1 (GDD) และ Step 0.2 (Art Bible, tracker, ไฟล์พาเลตต์)
  - **Step 0.3 Tech Spike**: monorepo pnpm, ผู้เล่นหลายคนเดินในฉากเดียวกันแบบ server-authoritative + prediction/reconciliation + interpolation ที่ 20Hz, กล้อง pixel scale จำนวนเต็ม, พื้นหลายชั้น (ทางลาด, แท่นสูง 3 เมตร, สะพานข้ามทางเดิน) ทดสอบใน Edge จริงแล้ว ตัวละครยังเป็นสไปรต์ placeholder
  - ตรวจ concept ฉากของโซน 1 ครบทั้ง 7 พื้นที่ (Art Bible 10.6–10.13)
  - ตรวจ concept มอนตัวแรก ลูกมอมหลงทาง (Art Bible 7.7) และซิงก์พฤติกรรมลง GDD 8.3 แล้ว มอนตัวนี้คือมอนของ vertical slice (M0) ซึ่งต้องใช้พื้นเตือนแบบเส้น (`V-12`) กับลูกไฟหยก (`V-17`)
  - **Step 1.1 Sprite Pipeline**: `/tools` ตรวจและรวม atlas, ตัวละคร 4 ทิศ (3 ทิศ + mirror) พร้อม state machine, วาด 200 ตัวได้ใน 11 draw call (รวมทั้งฉาก) ภาพตัวละครยังเป็น placeholder ที่สร้างจากสคริปต์
  - **Step 1.2 ระบบต่อสู้**: ชุดสกิลนักดาบครบตาม GDD 5.2 บนแถบลัด 7 ช่อง, ดาเมจและการโดนตัดสินที่ server (มี lag compensation), หุ่นฝึก 4 ธาตุและหุ่นซ้อมที่ฟันกลับ, เลขดาเมจ, hit stop และกล้องสั่น ตัวเลขที่ GDD ยังไม่มีเป็นค่าชั่วคราวใน GDD 4.4
  - **Step 1.3 AI มอนสเตอร์**: ผู้ใช้เลือกมอนจาก GDD 8.3 (ลูกมอมหลงทาง, ไก่ป่าเพลิง, ผีโขมด) พร้อม soft lock เป้า ยั่วด้วยยืนม้าหยก และกระสุนที่ตรวจชนแบบ swept ภาพมอนยังเป็นโมเดล low-poly ชั่วคราว
  - ปรับตามผู้ใช้: แถบลัดปุ่ม 1–7 (ยา HP + ยามานา), คลิกซ้ายล็อกเป้า / กดค้างโจมตี, แถบทรัพยากรแสดงเป็น "มานา"
  - **UI placeholder แบบพิกเซล** ตามภาพที่ 2 (`ref_02_ui_effect.png`): HUD ผู้เล่น, แถบสกิลข้าวหลามตัด, แผงเป้าหมาย และแถบ HP เหนือหัวมอน วาดจากโค้ด รอศิลปินทำ U-03 / U-05 / U-06 (ขนาดไอคอน 24 หรือ 32 ยังไม่ได้ตัดสิน ดู tracker U-06)
  - **คลิกเดิน / คลิกมอนเพื่อเดินเข้าไปตี** (GDD 4.3 v0.8) ยังไม่มีการหาเส้นทาง รอ navmesh F-08
  - **ของในหมู่บ้านและพืชเป็นภาพแบน billboard** ที่ตัดจากภาพ concept 22–29 ด้วย `import-props` (ต้นแบบ) ส่วนพื้น แท่น ลาน และทางเดินยังเป็น 3D
  - **ลูกมอมหลงทางเป็นสไปรต์ 48 px** แปลงจาก sheet AI ของผู้ใช้ด้วย `import-monster` (ต้นแบบเท่านั้น) ส่วนไก่ป่าเพลิงกับผีโขมดยังเป็นโมเดล low-poly
  - ตรวจ concept UI kit + VFX หยก (ภาพที่ 21, Art Bible 9.6) แล้ว ยังรอตัดสินเรื่องบ่อวงกลมในช่องสกิล ขนาดไอคอน (U-06) และช่องยาทรงวงกลม
  - **Step 2.1 ฉากโซน 1 (greybox)**: ครบ 6 พื้นที่ต่อกันเป็นผืนเดียว ข้อมูลอยู่ใน level JSON, โหลด prop ทีละ chunk, หมอก แสง และ particle ตามพื้นที่, ป้ายชื่อพื้นที่, เขตปลอดภัย (หมู่บ้านและในรั้วศาล) และ editor `?editor` ส่วนชิ้นงาน 3D ยังเป็นรูปทรงจากโค้ด และพื้นที่ดงรากไทรกับหุบราคียังไม่มีมอน (สปีชีส์ยังไม่ได้ทำ)
- ถัดไป: **Step 2.2 บอสนาค** (มีข้อ ❓ ในตารางท้ายไฟล์ ต้องถามผู้ใช้ก่อน)
- **ผู้ใช้สั่งข้าม Step 1.4 (ทดสอบ 20 คน) ไปก่อน** ยังต้องกลับมาทำ: bot แบบ headless 20–50 ตัว วัด CPU/RAM, bandwidth ต่อคน และ tick time (`?bots=200` เป็นแค่ตัวละครจำลองฝั่ง client ไว้ทดสอบการวาด ใช้แทนไม่ได้)
- ค่าชั่วคราว (ความเร็ววิ่ง, ค่าพลัง, ตัวคูณคอมโบ ฯลฯ) อยู่ใน GDD 4.4 ถ้าแก้ตัวเลขใน `/shared` ต้องแก้ตาราง GDD 4.4 ให้ตรงกันด้วย
- **ข้อเสนอที่ยังไม่อนุมัติ** อยู่ใน Art Bible หัวข้อ 13 (แถวที่สถานะเป็น "เสนอ") ยังไม่ใช่ canon ห้ามนำไปเขียนโค้ดหรือแก้ GDD จนกว่าผู้ใช้จะอนุมัติ ข้อที่ขวางงานอยู่คือข้อ 5 (pipeline 3D → พิกเซล) ซึ่งต้องตัดสินก่อนเริ่ม `C-02`

## เอกสารหลัก (source of truth)

| ไฟล์ | ใช้เมื่อ |
|---|---|
| [docs/GDD.md](docs/GDD.md) | กติกาเกมและตัวเลขทั้งหมด: ธาตุ, สกิล, เครื่องราง, บอส, สังคม, เศรษฐกิจ, monetization |
| [docs/ART_BIBLE.md](docs/ART_BIBLE.md) | ทุกอย่างเกี่ยวกับภาพ: พาเลตต์, PPU, เฟรม, กล้อง, VFX, UI, ฉาก 3D, การ export |
| [docs/ART_TRACKER.md](docs/ART_TRACKER.md) | สถานะชิ้นงานอาร์ต อ้างอิงด้วย ID เช่น `C-02`, `F-05` |
| [docs/ROADMAP.md](docs/ROADMAP.md) | prompt ทีละ step ของเฟส 0–5 ที่ผู้ใช้จะสั่งงานตามลำดับ |
| [art/palette/aranya-15.gpl](art/palette/aranya-15.gpl) | พาเลตต์ 15 สี **ห้ามเปลี่ยนลำดับ index** เพราะ LUT สำหรับสลับสีอ้างอิงตาม index |
| [art/reference/concept/INDEX.md](art/reference/concept/INDEX.md) | ภาพ concept ที่ได้รับ (เลขล่าสุดดูใน INDEX) + คำอธิบายต้นฉบับ + ลิงก์ไปหัวข้อที่ตรวจใน Art Bible เป็นภาพ AI ใช้อ้างอิงเท่านั้น |

- ถ้า step ใน ROADMAP ขัดกับ GDD หรือ Art Bible **ให้ยึด GDD และ Art Bible เป็นหลัก แล้วแจ้งผู้ใช้ว่าขัดตรงไหน** (ดูตารางท้ายไฟล์)
- เมื่อเปลี่ยน design ให้แก้ GDD กับ Art Bible ให้ตรงกัน และปรับเลขเวอร์ชันในตารางหัวเอกสาร
- เอกสารเขียนเป็นภาษาไทย ใช้ตาราง Markdown และมีส่วน "หมายเหตุเทคนิค" แทรกอยู่ในแต่ละระบบ

**เมื่อผู้ใช้ส่งภาพ concept มา** (เกิดบ่อย) ให้ทำตามลำดับนี้:
0. บันทึกภาพเป็น `art/reference/concept/ref_<NN>_<subject>.png` ใช้เลขถัดไปจาก INDEX.md (เลขนี้คือ "ภาพที่ N" ในเอกสาร) เก็บคำอธิบายที่แนบมาไว้ใน `briefs/` ตามที่ได้รับ แล้วเพิ่มแถวใน INDEX.md ภาพที่ผู้ใช้แนบมาอยู่ในโฟลเดอร์ `images/` ของ temp ของเซสชัน
1. ตรวจภาพกับตาราง "ห้าม → ใช้แทน" ใน Art Bible 2.1, พาเลตต์และสีสงวน, กล้องใน Art Bible 10.1 และข้อมูลใน GDD เช่น เลเวล ธาตุ จุดเกิด และดรอป (concept มักใส่ค่าที่ขัดกับ GDD มา)
2. บันทึกผลเป็นหัวข้อย่อยใน Art Bible ฉากอยู่ในหัวข้อ 10 ส่วนตัวละครและมอนอยู่ในหัวข้อ 7 ใช้ตาราง ✔ / ⚠ / ❌ แล้วตามด้วยเกมเพลย์ ประสิทธิภาพ และการย่อเป็นพิกเซล
3. อัปเดตสถานะและหมายเหตุใน tracker
4. สิ่งที่กระทบ GDD ให้ใส่เป็นข้อเสนอใน Art Bible หัวข้อ 13 ห้ามแก้ GDD เองโดยไม่ถาม
5. เมื่อผู้ใช้สั่งให้แก้หรืออนุมัติข้อเสนอแล้ว ให้ย้ายตัวเลขไปไว้ใน GDD (ซึ่งเป็นที่เก็บตัวเลข) แล้วให้ Art Bible อ้างอิงกลับ เปลี่ยนสถานะในหัวข้อ 13 เป็น "✔ ซิงก์แล้ว" และปรับเลขเวอร์ชันของทั้งสองไฟล์ ส่วนสิ่งที่ต้องแก้ในภาพให้เขียนเป็นตาราง brief "จาก → เป็น" สำหรับทีมอาร์ต

## กฎที่ห้ามละเมิด

- **Server-authoritative**: ดาเมจ, ดรอป, เทรด, ปลุกเสกหรือหลอมรวม, cooldown และการตัดสินว่าโดนหรือไม่ คำนวณที่ server เท่านั้น ส่วน client ส่งแค่ intent เช่น "ใช้สกิล X กับเป้า Y"
- **ธุรกรรมไอเทมและเงิน**: ทำใน DB transaction เดียวกัน + `SELECT ... FOR UPDATE` + idempotency key
- **งบประสิทธิภาพ**:
  - โหลดแรกไม่เกิน 25MB
  - asset ต่อโซนไม่เกิน 8MB และโหลดทีหลัง (lazy)
  - 60fps บน PC / 30fps บนมือถือ
- **TypeScript strict**: types และข้อมูลที่ใช้ร่วมกันทั้งสองฝั่งอยู่ใน `/shared` เช่น ตารางธาตุ, สูตรดาเมจ (GDD 6.5), ข้อมูลสกิล และข้อมูลมอน (`/shared/data/monsters.ts` ตาม GDD 8.3)
- **ภาษา**:
  - อธิบายและตอบผู้ใช้เป็นภาษาไทย
  - identifier และคอมเมนต์ในโค้ดเป็นภาษาอังกฤษ
  - ข้อความที่แสดงในเกมอยู่ในไฟล์ i18n ห้ามฮาร์ดโค้ดในโค้ดและห้ามอบลงในรูป

## คำสั่ง

ต้องมี Node 22.12 ขึ้นไป (แนะนำ 24 LTS; Node 25 ใช้ได้แต่ Vitest แจ้งเตือน engine) และ pnpm 10 (`npm i -g pnpm`) รันทุกคำสั่งจาก root

บน Windows การหยุด `pnpm dev` อาจทิ้ง process `node` ลูกไว้ที่พอร์ต 5173 / 2567 ทำให้รอบถัดไป Vite ย้ายไปพอร์ต 5174 ให้ปิด process ที่ค้างตามพอร์ตก่อนรันใหม่

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm install` | ติดตั้ง dependency ทั้ง workspace |
| `pnpm assets` | สร้าง atlas จาก `art/source/characters/*` (64 px, `PLAYER_ANIMS`) และ `art/source/monsters/mon_*` (48 px, `MONSTER_ANIMS`) ไปที่ `client/public/assets/sprites/` (gitignore) พร้อม `index.json` ที่บอกว่ามี atlas อะไรบ้าง client จะโหลดเฉพาะ atlas ที่อยู่ในรายชื่อนี้ ถ้าสไปรต์ผิดกฎ Art Bible จะ error และ exit 1 ส่วน `dev`, `build` และ `test:e2e` รันคำสั่งนี้ให้ก่อนอัตโนมัติ |
| `pnpm --filter @aranya/tools import-hero` | สร้าง `art/source/characters/chr_placeholder.*` จาก sheet รายทิศของผู้ใช้ `art/source/characters/hero_ai/hero_{S,E,N}.png` (ผัง 6 คอลัมน์ × 9 แถว = ท่าตามลำดับ `PLAYER_ANIMS`; ถ้า sheet ข้ามหรือสลับแถว ให้ระบุลำดับใน `hero_<dir>.rows.json`) โดยตัดช่องที่ช่องว่างระหว่างตัวละคร แปลงเป็น 64×64 พาเลตต์ 15 สี และย่อแต่ละทิศให้ท่ายืนสูงเท่ากัน ท่าหรือทิศที่ไม่มีใช้ทิศ E แทน และจะเตือนถ้าตัดโดนตัวละคร **นี่คือแหล่งที่มาของตัวละครในเกมตอนนี้** |
| `pnpm --filter @aranya/tools import-props` | สร้าง `art/source/props/props_ref.{png,json}` (atlas ภาพแบนของ prop) จากภาพ concept ตามกรอบตัดใน `art/source/props/props.import.json` (`kind`, `source`, `rect`, `heightM`, `offsetZ`) โดยลบพื้นขาว ทั้งพื้นขาวที่ปิดล้อมอยู่ข้างในและเงาสีเทา เก็บไว้เฉพาะตัววัตถุ ย่อให้สูง `heightM` เมตรที่ 32 px/m แล้วแปลงเข้าพาเลตต์ prop kind ที่ไม่มีในไฟล์นี้ยังเป็นโมเดล 3D ใช้ได้ช่วงต้นแบบเท่านั้น (Art Bible 2) |
| `pnpm --filter @aranya/tools import-ui` | สร้าง `art/source/ui/ui_ref.{png,json}` (กรอบ UI) จาก UI kit ภาพที่ 21 ตามไฟล์ `art/source/ui/ui.import.json` (`heightPx` เป็นพิกเซล UI 640×360, `hole` = ช่องโปร่งกลางวง, `slice` = หัวและท้ายแถบที่ไม่ยืด, `inner` = พื้นที่เติมสี) ถ้าไม่มี atlas นี้ HUD จะใช้กรอบที่วาดจากโค้ด |
| `pnpm --filter @aranya/tools import-monster [species]` | สร้าง `art/source/monsters/mon_<species>.*` จาก `art/source/monsters/<species>_ai/<species>_{S,E,N}.png` (ผัง 5 คอลัมน์ × 5 แถว: idle, move, attack, hit, death) ลบพื้นขาวทึบออก วางทุกช่องบนกริดเดียวกัน แปลงเป็น 48×48 และใช้ทิศที่มีแทนทิศที่ขาด (มอนสมมาตรมีแค่ S ได้) ตั้งค่าใน `<species>.import.json`: `targetHeight`, `rows` ต่อทิศ (`null` = ข้ามแถว), `isolate` (เฟรมที่ตัดทุกอย่างนอกกรอบท่า idle ออก เช่นลูกไฟ) และ `dropColors` |
| `pnpm --filter @aranya/tools gen-placeholder` | สร้างสไปรต์ที่วาดจากโค้ดแบบเดิม **เขียนทับ** `chr_placeholder.*` ที่ได้จาก `import-hero` ใช้เฉพาะเมื่อต้องการกลับไปใช้แบบวาดจากโค้ด |
| `pnpm dev` | รัน server (`tsx watch ... --dev`, ws://localhost:2567) กับ client (Vite, http://localhost:5173) พร้อมกัน เปิด 2 แท็บเพื่อทดสอบหลายคน ค่าเริ่มต้นคือโซน 1 ส่วน `?level=spike` คือลานทดสอบเดิมที่มีหุ่นฝึก |
| `pnpm build` | build client (`client/dist`) และ bundle server (`server/dist/index.js`, รันด้วย `pnpm --filter @aranya/server start`) |
| `pnpm typecheck` | `tsc` ทุก package + `e2e/` (strict + `noUncheckedIndexedAccess`) |
| `pnpm lint` | ESLint (typescript-eslint strict) ทั้ง repo |
| `pnpm test` | unit test (Vitest) ทุกไฟล์ `*.test.ts` ใน shared, server และ client ใช้เวลาไม่ถึง 1 วิ |
| `pnpm test:e2e` | e2e (100–130 วิ): `e2e/setup.ts` เปิด game server จริง (พอร์ต 2577) + Vite (พอร์ต 5183) เอง แล้วรัน `multiplayer.e2e.ts` (client หลายตัวแบบไม่มีหน้าจอ: sync, input ผิดรูปแบบ, flood, ออกจากห้อง, ฟันหุ่นฝึก, cast ที่ถูกปฏิเสธ) และ `browser.e2e.ts` (2 แท็บ, วาด 200 ตัว, ต่อสู้ด้วยแถบลัด, คลิกเดินและคลิกหุ่นเพื่อเข้าไปตี, โซน 1 ครบทุกพื้นที่ผ่าน `?at=`, เขตปลอดภัย และ editor ใช้ `window.__aranyaProject()` แปลงจุดในโลกเป็นพิกัดบนจอ ใน Edge/Chrome ที่ติดตั้งในเครื่องผ่าน playwright-core ภาพหน้าจอเก็บใน `e2e/.artifacts/` และข้ามเองถ้าไม่พบเบราว์เซอร์ หรือกำหนดเองด้วย `E2E_BROWSER_PATH`) ปิด process เองทั้งหมดเมื่อจบ |
| `pnpm check` | lint + typecheck + unit test (ใช้ก่อน commit) ประมาณ 15–20 วิ ส่วนครั้งแรกหลัง install ราว 70 วิ ซึ่งส่วนใหญ่เป็นเวลาของ typecheck |
| `pnpm test:all` | `check` + `test:e2e` |
| `pnpm vitest run shared/src/movement.test.ts` | รัน unit test ไฟล์เดียว |
| `pnpm vitest run -t "climbs the ramp"` | รัน unit test ตามชื่อ |
| `pnpm test:e2e e2e/multiplayer.e2e.ts` | รัน e2e ไฟล์เดียว (ข้ามการทดสอบในเบราว์เซอร์) |

เครื่องมือเฉพาะตอน dev (ไม่อยู่ใน production build):
- `window.__aranyaDebug()`: ให้ browser e2e อ่านตำแหน่ง, ท่า, draw call, frame time, HP, มานา, HP และตำแหน่งของเป้า, เป้าที่ล็อก, คำสั่งคลิกเดิน, จำนวนเลขดาเมจ และ cast ack ล่าสุด ส่วน `window.__aranyaProject(x, y, z)` แปลงจุดในโลกเป็นพิกเซล CSS สำหรับคลิก
- `?bots=200`: เพิ่มตัวละครจำลองฝั่ง client เพื่อทดสอบการวาด
- `?at=<area>` (เช่น `?at=valley`): เริ่มที่ `entry` ของพื้นที่นั้น server ยอมให้ใช้เฉพาะเมื่อรันด้วย `--dev` (`pnpm dev` และ e2e) production ไม่สนค่านี้
- `?editor`: editor ของ level (`client/src/dev/editor.ts`) Shift+คลิกวาง, คลิกเลือก, Q/E หมุน, [ ] ขนาด, I J K L เลื่อน, Delete ลบ, Ctrl+S บันทึก การบันทึกตรวจด้วย `parseLevelFile` ในเบราว์เซอร์ก่อน แล้วเขียนไฟล์ผ่าน endpoint `/__aranya/level/<id>` ของ Vite (`client/vite.config.ts`, มีเฉพาะตอน dev) จากนั้น server ที่รัน tsx watch จะเริ่มใหม่ และหน้าจะโหลดใหม่

client ต่อ server ที่ `http://<hostname>:2567` ถ้าจะเปลี่ยนให้ตั้ง `VITE_SERVER_URL`

**เวอร์ชันที่ต้องระวัง**:
- Colyseus **0.18** + `@colyseus/schema` **5** (API ต่างจาก 0.15–0.16 ที่พบในตัวอย่างทั่วไป) ให้ดู type ใน `node_modules` ก่อนใช้ API ใหม่
- TypeScript ปักไว้ที่ **6.0** เพราะ typescript-eslint ยังไม่รองรับ 7
- Babylon.js **9** ตอนนี้ import จาก root `@babylonjs/core` ทำให้ bundle ใหญ่ราว 6.5MB (gzip 1.45MB) ต้องเปลี่ยนเป็น deep import ก่อนเริ่มนับงบโหลดแรก

## สถาปัตยกรรม

**โครงสร้าง repo** (`/infra` ยังไม่ได้สร้าง)

```
/client   Babylon.js + Vite (PWA ยังไม่ได้ตั้ง)
/e2e      Vitest + playwright-core (เปิด server และ Vite ของตัวเอง)
/server   Colyseus rooms + systems
/shared   types, ค่าคงที่, logic ที่ต้องรันเหมือนกันทั้งสองฝั่ง (import เป็น .ts ตรง ๆ ไม่มี build step)
          levels/*.json = ข้อมูลฉากของแต่ละ level (แหล่งเดียวที่ server ใช้ชนและ client ใช้วาด)
/tools    asset pipeline + สคริปต์ตรวจอาร์ตใน CI
/art      ไฟล์ต้นฉบับ .aseprite / .blend (มีแล้ว: palette/, reference/concept/ ซึ่งเก็บด้วย Git LFS)
/infra    docker-compose, Dockerfile
```

**การเคลื่อนที่ (ส่วนที่ต้องอ่านหลายไฟล์ถึงจะเข้าใจ)**

- `shared/src/movement.ts` `stepPlayer()` เป็นฟังก์ชัน pure ที่เดิน 1 tick ใช้ทั้งใน `server/src/rooms/ZoneRoom.ts` (ผลจริง) และ `client/src/net/prediction.ts` (ทำนายและ replay ตอน reconcile) **ถ้าแก้กติกาการเดิน ต้องแก้ที่ shared เท่านั้น** ไม่อย่างนั้นสองฝั่งจะคำนวณไม่ตรงกัน
- client ส่งแค่ intent `{ seq, mx, mz }` (ทิศเป็นจำนวนเต็ม: ปุ่มใช้ -1/0/1 ส่วนคลิกเดินใช้ได้ถึง ±64) ทุก tick ฝั่ง server ตรวจด้วย `parseInput()` และจำกัดอัตราด้วย `server/src/inputQueue.ts` (token bucket: เฉลี่ยไม่เกิน 1 input ต่อ tick จึงกัน speed hack ได้)
- state ที่ sync (`server/src/state.ts`) มีเฉพาะสิ่งที่ client ต้องวาดหรือ reconcile: ตำแหน่ง, `lastSeq`, ฟิลด์ของ `Motion`, HP / ทรัพยากร และ `TargetState` ของหุ่นและมอน ส่วนค่าความละเอียดเต็มเก็บใน `PlayerSim` ฝั่ง server
- ผู้เล่นคนอื่นใช้ `client/src/net/interpolation.ts` ซึ่งวาดย้อนหลัง 100ms และไม่ extrapolate
- พื้นหลายชั้นใช้ walk polygon ใน `shared/src/walkmesh.ts` (polygon นูนที่ซ้อนกันในแนวตั้งได้ + ธง `solid` + ไม่มีการตก) เป็นตัวแทน navmesh ชั่วคราวของ `F-08` ถ้าเปลี่ยนเป็น navmesh ที่ bake ให้คงสัญญาของ `resolveMove()` ไว้ ฉากที่ client วาดสร้างจากข้อมูล level เดียวกับที่ server ใช้ชน

**ฉากและ level (Step 2.1)**

- **ไฟล์ level** `shared/src/levels/<id>.json` (`zone1` = ป่าไทรศักดิ์สิทธิ์, `spike` = ลานทดสอบ) มีครบทุกอย่างของฉาก: areas (หมอก แสง particle ช่วงเลเวล และ entry), walk polygon พร้อม surface, น้ำ, props, จุดเกิดมอน, หุ่นฝึก, เขตปลอดภัย และจุดแสง
  - `parseLevelFile()` ตรวจทั้งรูปแบบและกติกา เช่น id ซ้ำ, polygon ต้องนูน, จุดเกิดต้องอยู่บนพื้น และห้ามอยู่ในเขตปลอดภัยหรือใต้สะพาน
  - `toLevel()` สร้างข้อมูลสำหรับชน (walk polygon + กระบอกชนจาก prop ที่ `PROP_KINDS[kind].blockRadius > 0` + เขตปลอดภัย) ที่ server กับ client prediction ใช้ร่วมกัน
  - `levelFile(id)` / `levelCollision(id)` โหลดและ cache และเลือกห้องด้วย `joinOrCreate(ZONE_ROOM, { level })` โดย `server.define(...).filterBy(['level'])` ทำให้แต่ละ level มี channel ของตัวเอง
  - ไฟล์เขียนเป็น 1 รายการต่อบรรทัดด้วย `formatLevelFile()` ทั้ง editor และคนแก้มือ เพื่อให้ diff อ่านง่าย
- **เขตปลอดภัย** (`inSafeZone`): server ปฏิเสธ cast ยกเว้นยา (`reason: 'safeZone'`), ผู้เล่นในเขตไม่โดนดาเมจ, มอนเลิกตามและเดินเข้าไม่ได้ ส่วน client เช็กก่อนเพื่อไม่ให้ท่าฟันเริ่มเล่น
- **client** (`client/src/world/`):
  - `surfaces.ts`: walk polygon เป็น prism แบบ low-poly รวม 1 mesh ต่อพื้นที่ต่อวัสดุ สีของแต่ละช่องมาจาก hash ของตำแหน่ง จึงเห็นเหมือนกันทุกเครื่อง
  - `props.ts`: prop แบบ greybox (`BUILDERS` ต่อ kind) วาดเป็น thin instance ต่อ chunk 32 เมตร เก็บไว้ 3×3 chunk รอบตัว + อีก 1 วงกันการสร้างใหม่ถี่ ๆ
  - `atmosphere.ts`: หมอก แสง และ particle ต่อพื้นที่ (blend 1.2 วิ) และเลือก point light ที่ใกล้ที่สุดไม่เกิน 4 ดวงบน PC / 1 ดวงบนมือถือ (Art Bible 10.4)
  - ถ้าเพิ่ม prop kind ใหม่ ต้องเพิ่มทั้ง `PROP_KINDS` ใน shared และ `BUILDERS` ใน `props.ts`
  - **billboard ต้นแบบ**: ถ้ามี atlas `props_ref` แล้ว `PropChunks.useBillboards()` จะวาด kind ที่มีภาพเป็น sprite หันหากล้อง ยืนบนพิกเซลล่างกลาง (SpriteManager ตัวเดียว = 1 draw call) แทนโมเดล 3D ส่วนการชนยังมาจากไฟล์ level เหมือนเดิม ภาพไม่หมุนตาม `rot` (prop ที่วางหลายมุม เช่น รั้ว จึงยังเป็น 3D) ส่วนต้นไม้และหินกลับซ้ายขวาตาม hash ของ id และภาพที่ยืนอยู่ระหว่างกล้องกับผู้เล่นจะจางเหลือ alpha 0.35 (`fadeOccluders`, Art Bible 10.4) ซึ่งได้ผลเพราะ SpriteManager ของ prop ถูกสร้างหลังของตัวละครและมอน (Babylon วาด sprite ตามลำดับที่สร้าง และเขียน depth ก่อนวาดสี) ถ้าย้ายลำดับการสร้าง ตัวละครหลังต้นไม้จะหายไปแทนที่จะมองทะลุได้
  - **ข้อควรระวังของ thin instance**: mesh ที่ clone มาใช้ Geometry ร่วมกัน และ Babylon เก็บ buffer ของ matrix ไว้ที่ Geometry ดังนั้นทุก chunk ต้องเรียก `makeGeometryUnique()` ก่อน `thinInstanceSetBuffer` ไม่อย่างนั้น chunk จะเขียนทับ matrix ของกันและกัน แล้ว GPU วาดสามเหลี่ยมยักษ์เต็มจอ
  - วัสดุที่ปิดแสง (`disableLighting`) ต้องตั้ง `emissiveColor` เป็นสีขาว (ฟังก์ชัน `unlit()`) ไม่อย่างนั้นสีจาก vertex color จะออกเป็นดำ
  - grid ของ chunk เลื่อนไปครึ่ง chunk เพื่อให้ลานกลางหมู่บ้าน (0, 0) อยู่ใน chunk เดียว
- `zone1.json` เริ่มจากสคริปต์สร้างครั้งเดียว ตอนนี้ไฟล์ JSON คือต้นฉบับ ให้แก้ผ่าน editor หรือแก้ไฟล์ตรง ๆ และ unit test (`shared/src/level/level.test.ts`) เช็กว่าเดินจากจุดเกิดไปถึงทุกพื้นที่และทุกจุดเกิดมอนได้โดยไม่กระโดด

**การต่อสู้ (Step 1.2)**

- **ข้อมูลกลาง** อยู่ใน shared:
  - `data/skills.ts`: สกิลนักดาบ, `HOTBAR`, ค่าพลัง
  - `data/elements.ts`: ตารางธาตุ GDD 6.3
  - `combat/damage.ts`: สูตร GDD 6.5
  - `combat/shapes.ts`: พื้นที่โดน (พัด / วงกลม / เส้น) ที่เช็ก `|Δy| ≤ 1.5` เมตรด้วย
  - `combat/rng.ts`: RNG แบบ seeded
- **การเคลื่อนที่ที่เป็นสกิล** (หลบ, ทะยานพยัคฆ์) ส่งเป็น `act` ใน input ทุก tick และจำลองด้วย `stepMotion()` (`shared/src/motion.ts`) ทั้งสองฝั่ง จึงทำนายระยะ, cooldown และช่วงไม่รับดาเมจได้ตรงกับ server
  - `Motion.speedMul` (เช่น ยืนม้าหยก ×0.8) server เป็นคนตั้ง แล้ว client ได้จากการ reconcile
- **สกิลอื่น** ส่งเป็น `Msg.Cast` (skill + ทิศเล็งเท่านั้น)
  - server ตัดสินใน `server/src/systems/combat.ts` (`CombatWorld` ไม่ผูกกับ Colyseus จึงทดสอบด้วยนาฬิกาจำลองได้) ซึ่งตรวจ busy, cooldown, ทรัพยากร และคอมโบ
  - ดาเมจเข้าที่เวลา `hitDelayMs(anim)` = เฟรมกระทบของแอนิเมชัน
  - เป้าถูกย้อนตำแหน่งด้วย `PositionHistory` ตาม `100ms + ping/2` สูงสุด 200ms
  - ping วัดฝั่ง server (`Msg.Ping` / `Msg.Pong`)
- **client** (`client/src/combat/localCombat.ts`) เล่นท่าทันทีที่กด แล้วรอ `CastAck`:
  - ถูกปฏิเสธ → ยกเลิกท่า
  - server เลือกจังหวะคอมโบต่างจากที่ทำนาย → เปลี่ยนท่าให้ตรง
  - คนอื่นได้ `CastStarted` ส่วนดาเมจมาทาง `Msg.Hits` และแต่ละคนเห็นเลขเฉพาะที่ตัวเองตีหรือโดน (Art Bible 7.6)
- **ZoneRoom** เดิน simulation แบบ fixed timestep ที่ไล่ tick ให้ทันเวลาจริงเมื่อ interval มาช้า เพราะถ้าไม่ไล่ ระบบจำกัด input (1 ต่อ tick) จะทิ้ง input ตอนเครื่องมีโหลด
- **ปุ่มบน PC**: WASD เดิน, 1 โจมตี, 2 ยืนม้าหยก, 3 ทะยานพยัคฆ์, 4 ปัดป้อง, 5 อัลติเมต, 6 ยา HP, 7 ยามานา, Space หลบ, Tab วนล็อกเป้า, คลิกพื้นเพื่อเดิน (กดค้างเพื่อเดินตามเคอร์เซอร์), คลิกมอนเพื่อล็อกเป้า เดินเข้าหา และฟัน 1 ครั้ง (กดค้างเพื่อตีต่อเนื่อง)
- **คลิกเดิน** (`client/src/input/clickMove.ts`): หาจุดบนพื้นด้วยการยิง ray ไปชน walk polygon ชุดเดียวกับ server (ไม่ใช้ mesh pick) แล้วแปลงเป็น `mx, mz` ทุก tick เป็นจำนวนเต็มไม่เกิน `MOVE_AXIS_MAX` (64) ซึ่ง movement นำไป normalize ดังนั้นค่าที่ใหญ่ขึ้นไม่ได้ทำให้เดินเร็วขึ้น ส่วนปุ่มยังส่ง -1/0/1 เหมือนเดิม

**มอนสเตอร์ (Step 1.3)**

- ข้อมูลมอนอยู่ใน `shared/src/data/monsters.ts` (`MONSTERS`) และสมองมอนอยู่ใน `server/src/systems/monsters.ts` เป็น state machine (idle → wander → chase → windup → flurry/ยิง/ระเบิด → return) ที่ทำงานผ่าน interface `MonsterHost` ซึ่ง `CombatWorld` เป็นผู้ implement
- ทุกการโจมตีของมอนต้องเริ่มด้วยพื้นเตือน (`telegraphMs` ≥ 1000) และล็อกทิศตั้งแต่ตอนนั้น
- กระสุนจำลองที่ server (`tickProjectiles`) และตรวจชนแบบ swept segment ส่วน client แค่วาดตาม `Msg.Projectile` / `Msg.ProjectileEnd`
- มอนตายส่ง HitEvent ชนิด `death` (ภาพเป็นการชำระ ไม่ใช่การทำลาย) ส่วนของดรอปยังไม่ให้จนกว่าจะมี inventory (Step 3.1)
- soft lock อยู่ใน `client/src/combat/softLock.ts` เป็นแค่ตัวช่วยเล็ง client ยังส่งแค่สกิลกับทิศ

**สไปรต์ (Step 1.1)**

- `shared/src/data/animations.ts` (`PLAYER_ANIMS`) เป็นแหล่งเดียวของจำนวนเฟรม ระยะเวลา และเฟรมกระทบตาม Art Bible 5.2 ใช้ร่วมกันทั้ง pipeline, animator และ server (ผ่าน `impactMs()`)
- **Pipeline** อยู่ใน `/tools`:
  - อ่าน PNG + JSON ที่ export จาก Aseprite (หรือสั่ง Aseprite CLI ให้ export ถ้ามี `ASEPRITE_PATH`)
  - `validate.ts` ตรวจข้อ 🤖 ใน Art Bible 12: พาเลตต์, alpha 0/255, ขนาดเฟรม, ชื่อ tag `<anim>_<S|E|N>`, จำนวนเฟรม, เวลาถึงเฟรมกระทบต้องตรงกับ `impactMs` และเท้าต้องอยู่บรรทัดเดียวกัน
  - `pack.ts` วาง atlas แบบกริด power-of-two พร้อม padding 2px + extrude 1px และเก็บเฟรมที่ซ้ำกันครั้งเดียว
  - **sheet แบบภาพวาด**: ถ้า JSON มี `meta.import` (ส่วนขยายของเรา) `importPainted.ts` จะย่อทุกเฟรมด้วยอัตราเดียวกัน แปลงสีเข้าพาเลตต์ ปรับ alpha เป็น 0/255 วางเท้าบนเส้นเดียวกัน และใส่ขอบ INK ก่อนตรวจ ใช้ได้เฉพาะช่วงต้นแบบ (Art Bible 2) ตัวอย่างคือ sheet ภาพวาดของผู้ใช้ที่ `art/reference/concept/ref_20_hero_spritesheet.*` (วิธีใช้อยู่ใน INDEX.md)
- **มอน**: `MONSTER_ANIMS` ใน `shared/src/data/animations.ts` ส่วน `MonsterSprites` วาดด้วย SpriteManager 1 ตัวต่อสปีชีส์ `TargetViews` ใช้สไปรต์ถ้ามี atlas (ถ้าไม่มีจะใช้โมเดล low-poly เดิม) และสร้างกระบอกที่มองไม่เห็นไว้ให้คลิกเลือกเป้า ส่วน `MonsterAnimator` ค้างเฟรม 1–2 ของท่าโจมตีตลอดช่วงพื้นเตือน (`Msg.Telegraph`) แล้วเล่นเฟรม 3 ตอนท่าลง และท่าชำระเล่นจนจบก่อนซ่อนตัว
- **Runtime** (`client/src/sprites/`):
  - `CharacterLayer` ใช้ SpriteManager 1 ตัวต่อ atlas และเงาใต้เท้าแบบ thin instance ที่เอียงตามพื้น (`floorAt`/`normalOf` ใน shared) ทำให้จำนวน draw call ไม่เพิ่มตามจำนวนตัวละคร
  - `CharacterAnimator` คุม state ของท่า ส่วน `facing.ts` แปลงทิศการเดินเป็น 4 ทิศ โดยทิศ W ใช้ภาพทิศ E กลับด้าน
  - sprite วางให้พิกเซล pivot (เท้า) ตรงจุดบนพื้น โดยเลื่อนตามแกน up ของกล้อง
- กล้อง: `client/src/camera/pixelCamera.ts` คำนวณระยะกล้องจาก pixel scale จำนวนเต็ม (`floor(ความสูงจอ / 360)`) และสีทั้งหมดอ่านจาก `art/palette/aranya-15.gpl` ผ่าน `client/src/palette.ts` ห้ามฮาร์ดโค้ด hex

**UI / HUD**

- DOM ทับบน canvas ของ Babylon ทุกขนาดเป็นหน่วยพิกเซล UI ที่ 640×360 ผ่านตัวแปร CSS `--u` (= CSS px ต่อ 1 พิกเซล UI จาก `uiPixelSize()` ซึ่งเป็น `floor(min(w/640, h/360))` หาร devicePixelRatio) และองค์ประกอบที่จัดกลางจอต้องคำนวณตำแหน่งให้ลงพิกเซลจริงพอดี ไม่อย่างนั้นภาพ NEAREST จะเบลอ
- `client/src/ui/pixelArt.ts` วาดภาพ UI ทั้งหมดจากโค้ดด้วยสีจากพาเลตต์ แล้ว cache เป็น data URL เมื่อศิลปินส่งภาพจริง ให้แทนที่เฉพาะฟังก์ชันในไฟล์นี้ โดยไม่ต้องแก้ DOM ใน `hud.ts`
- `hud.ts` เขียน DOM เฉพาะเมื่อค่าเปลี่ยน (`write()`, `BarView.set()`) เพราะ `update()` ถูกเรียกทุกเฟรม
- ตัวเลขทั้งใน HUD และเลขดาเมจใช้ฟอนต์ bitmap ชุดเดียวใน `ui/bitmapFont.ts` ส่วนข้อความอื่นเป็น vector font จาก i18n
- แถบ HP เหนือหัวมอน (`world/targets.ts`) ใช้ texture กรอบเดียวกันทุกตัว ขนาด 1 texel = 1/PPU เมตร
- ถ้ามี atlas `ui_ref` (`import-ui`) `Hud.useRefArt()` จะเปลี่ยนวงรูปหน้า, แถบ (3-slice), ช่องสกิล และวงของแผงเป้าหมาย เป็นกรอบจากภาพ concept ส่วนสีที่เติม ไอคอน และตัวเลขยังวาดจากโค้ด และช่องยาเป็นวงกลม (`ROUND_SLOTS`)
- e2e อ้างอิง class `.hud-target` ของแผงเป้าหมาย

**Rooms และ service**

- 1 Colyseus room = 1 channel ของโซน รับได้ประมาณ 80 คน เมื่อเต็มให้เปิด channel ใหม่
- ดันเจี้ยนและบอสใช้ room แยก (instance)
- ตลาดเป็น service แยก ไม่ผูกกับ zone room
- ย้ายโซนด้วย `matchMaker.reserveSeatFor`
- Redis ใช้เป็น presence และ pub/sub ข้าม process เช่น แชต และเกจชำระโซน (GDD 8.4)

**Network**

- tick 20Hz ส่งข้อมูลแบบ binary delta
- ตัวผู้เล่นเองใช้ prediction + reconciliation
- ผู้เล่นคนอื่นใช้ interpolation ดีเลย์ประมาณ 100ms

**จุดที่ภาพกับ server ต้องตรงกัน**

- `impactMs` ของสกิลใน `/shared/data/skills.ts` ต้องตรงกับเฟรมกระทบของแอนิเมชัน
- พื้นเตือนของศัตรูต้องขึ้นก่อนท่าอย่างน้อย 1.0 วิ
- กระสุนของมอนล็อกทิศตั้งแต่พื้นเตือนเริ่มขึ้น (ไม่ติดตามเป้า) และ server ตรวจการชนแบบ swept segment ทุก tick
- ธาตุของท่าศัตรูล็อกที่ server ตอนเริ่มพื้นเตือน และ client เลือก LUT ของ VFX จากค่าธาตุที่ server ส่งมา ไม่คำนวณเอง (GDD 8.6)
- ช่วงปัดป้องเผื่อเวลาตาม latency ได้สูงสุด 120ms
- พื้นที่หลายชั้น (ดงรากไทร, Art Bible 10.12): server ใช้ navmesh หลายชั้น ตัดสินการโดนโดยเช็กความต่างความสูงด้วย และพื้นเตือนต้องฉายลงเฉพาะชั้นเดียวกับผู้ร่าย
- ผู้เล่นกระโดดไม่ได้ (เป็นอีโมตอย่างเดียว) การขึ้นลงที่สูงใช้บันได จุดไต่ หรือวงวาร์ป
- พื้นที่อันตรายที่อยู่กับที่ เช่น หมอกราคี (Art Bible 10.13) ต้องใช้รัศมีค่าเดียวกันทั้งภาพและ server โดยเก็บใน `/shared`
- สถานะของโลกที่ทุกคนต้องเห็นเหมือนกัน เช่น สะพานรากที่ฟื้นได้ หรือหมอกที่หายไปหลังชำระ ให้เก็บใน room state ส่วนการปลดล็อกรายคน เช่น วงวาร์ปหรือ flag เควสต์ ให้เก็บใน DB และห้ามทำให้ภาพของโลกต่างกันระหว่างผู้เล่น

## ข้อตกลงด้านภาพที่กระทบโค้ด (รายละเอียดใน Art Bible)

| หัวข้อ | ข้อตกลง |
|---|---|
| สเกล | PPU 32 (32px = 1 เมตร), texel density ของฉาก 32 px ต่อเมตร |
| Sampling | `NEAREST` และขยายเป็นจำนวนเต็มเท่า (UI ออกแบบที่ 640×360) |
| ทิศของสไปรต์ | วาด S, E, N แล้วได้ W จากการ mirror E **รวมเป็น 4 ทิศ ไม่ใช่ 8** |
| เงา | blob shadow ให้ engine วาด ไม่วาดลงในสไปรต์ |
| กล้อง | perspective FOV 30°, ก้ม 35°, yaw ล็อกต่อโซน, ซูมเป็น pixel scale จำนวนเต็ม (สำรวจ ×3 ที่ 1080p) ส่วนลานบอสเป็น fixed camera ที่เลือก scale จาก safe bounds 28 × 28 เมตร (Art Bible 10.7) |
| แสง | directional light จากซ้ายบน (ทิศเดียวกับสไปรต์) |
| การบีบอัด | สไปรต์ห้ามใช้ lossy (ETC1S หรือ JPEG) ให้ใช้ PNG/WebP lossless หรือ KTX2 UASTC |
| สลับสี | VFX และบอสเก็บเป็น texture R8 แบบ indexed + LUT เพื่อสลับสีตามธาตุและเฟส |
| ตัวอักษร | vector font (Chonburi, Noto Sans Thai Looped) ไม่ใช่ฟอนต์พิกเซล ส่วนตัวเลขดาเมจเป็นฟอนต์ bitmap |
| สีสงวน | `CURSE` / `PURPLE_DEEP` ใช้กับศัตรูและราคีเท่านั้น (ยกเว้น VFX มืดของหมอผี), `SPIRIT` ใช้กับสิ่งที่เรืองแสงเท่านั้น และ `FIRE` หมายถึงอันตรายหรือดาเมจ (ยกเว้นในเขตปลอดภัย) |
| พื้นเตือน | ขอบ `CREAM` กะพริบ + พื้น `FIRE` alpha 35% วาดทับ VFX ทุกชนิด และต้องสว่างกว่าฉากเสมอ |

## ความขัดแย้งที่รู้แล้วระหว่าง ROADMAP กับเอกสาร

เมื่อถึง step เหล่านี้ ให้ทำตามคอลัมน์ขวา และถามผู้ใช้ก่อนในข้อที่มีเครื่องหมาย ❓

| Step | ROADMAP เขียนว่า | GDD / Art Bible ตัดสินแล้ว |
|---|---|---|
| 0.3 ✔ | กล้อง orthographic เอียง 45° | perspective FOV 30° ก้ม 35° (Art Bible 10.1) ทำแล้ว |
| 1.1 ✔ | 4 ทิศ + mirror = 8 ทิศ | 3 ทิศ + mirror = 4 ทิศ (Art Bible 4.1) ทำแล้ว |
| 1.2 ✔ | สกิล 4 ช่อง | แถบลัด 7 ช่อง: โจมตี, สกิล 2–4, อัลติเมต, หลบ, ยา (GDD 4.3) ทำแล้ว |
| 1.3 ✔ | วิญญาณเพลิง, คางคกควัน, เม่นไฟ | ผู้ใช้เลือกมอนจาก GDD 8.3: ลูกมอมหลงทาง, ไก่ป่าเพลิง, ผีโขมด ทำแล้ว |
| 1.3 (ค้าง) | aggro table, ตาราง loot drop, config เป็น JSON ให้ designer แก้ | มอนเลือกเป้าตามการยั่ว → เป้าเดิม → คนที่ใกล้ที่สุด (ยังไม่มีตาราง threat ซึ่งจำเป็นตอนบอสปาร์ตี้ใน 2.2), ของดรอปมีแค่ชื่อใน `MONSTERS.drop` รอ inventory (3.1) และข้อมูลมอนเป็น TypeScript ใน `/shared/data/monsters.ts` ตามกฎใน CLAUDE.md ไม่ใช่ JSON ❓ ถ้าต้องการให้ designer แก้ได้โดยไม่แตะโค้ด ต้องตกลงรูปแบบก่อน |
| 2.1 ✔ | หมู่บ้านริมน้ำ → ทางป่า → ศาลร้าง → ลานต้นไทร | 6 พื้นที่ + ห้องรากไทร (GDD 8.2, Art Bible 10.5) ทำแล้วแบบ greybox ส่วนห้องรากไทรเป็นดันเจี้ยนแยก (2.2) ในโซนมีแค่ประตูราก |
| 2.1 ✔ | จุดแสงไดนามิกไม่เกิน 4 จุดบนจอ | PC ไม่เกิน 4 ดวง และ**มือถือไม่เกิน 1 ดวง** โคมและหน้าต่างใช้ emissive + baked (Art Bible 10.4) |
| 2.1 ✔ | level data เป็น JSON + editor แบบง่าย | ผู้ใช้เลือก JSON + validator ใน `/shared` ทั้งสองฝั่งโหลดไฟล์เดียวกัน และ editor เป็น `?editor` ตอน dev ส่วน baked lightmap กับ chunk ที่โหลด asset จริงต้องรอโมเดล 3D (ตอนนี้ chunk สร้างและทิ้ง mesh ของ greybox) |
| 2.2 ❓ | ปาร์ตี้ 4–8 คน, enrage 8 นาที, ล้างคำสาปที่ศาลหิน, สไปรต์แยกชิ้นที่ขยับด้วยโค้ด | ปาร์ตี้ 4 คน, enrage 12 นาที, ธาตุสลับตามเฟส (GDD 8.6), สไปรต์ทั้งตัว 192px + palette swap (Art Bible 5.5, 7.4) |
| 2.2 ❓ | เรียกวิญญาณเพลิง, ลำแสงหยกต้องหลบหลังเสา | เรียก**นาควิญญาณราคี 3 ตัว (ธาตุมืดเสมอ)** และเฟส 3 คือ**ทะเลน้ำม่วงที่ต้องปีนแท่นรากไม้ 4 แท่น** ไม่มีเสาให้หลบ ส่วนลำแสงหยกคือ "ลำแสงเทพนาค" ที่เป็นพ่นพิษในธาตุหยก (GDD 8.6) และบอสจบด้วยการชำระ ไม่ใช่ฆ่า |
| 2.3 | ฟอนต์พิกเซลภาษาไทย | vector font (Art Bible 9.1) |
| 2.3 ❓ | HUD แสดง HP/MP | แต่ละอาชีพมีทรัพยากรของตัวเอง (GDD 5.1: นักดาบใช้ปราณดาบ) ตอนนี้ UI แสดงเป็น "มานา" ตามคำสั่งผู้ใช้ ต้องตัดสินว่าจะเปลี่ยนชื่อในระบบด้วยหรือไม่ ส่วนจอยเสมือนบนมือถือใช้ร่วมกับแตะเพื่อเดินหรือแตะมอน (GDD 4.3) ได้ |
| 3.1 | เซฟแบบ write-behind ทุก 30 วิ | ใช้ได้เฉพาะข้อมูลที่ไม่ใช่เศรษฐกิจ (ตำแหน่ง, EXP) ส่วนไอเทมและเงินต้องเขียน DB ทันทีใน transaction เดียว + `SELECT ... FOR UPDATE` + idempotency key (กฎที่ห้ามละเมิด) |
| 3.2 | อัปเกรด +1 ถึง +10 | สูงสุด +15 พร้อมแต้มบารมี (pity) (GDD 7.3) |
| 3.4 | ค่าธรรมเนียม 5% | ค่าวางขาย 2% + ภาษีเมื่อขายได้ 5% (GDD 9.3) |
| 5.2 | สกุลเงิน "เหรียญหยก" | "มุกจันทร์" ห้ามขายของที่มีค่าพลัง และไม่มีกาชา (GDD 10) |
| 5.3 | สงกรานต์, ลอยกระทง, ออกพรรษา, ตรุษจีน | สงกรานต์, ลอยกระทง, บุญบั้งไฟ, ไหลเรือไฟ (GDD 10.4) |
| โบนัส | prompt สร้างภาพ concept: 4 มุม (หน้า, ข้าง, หลัง, 3/4) บนพื้นเขียวเข้ม | ภาพที่ AI สร้างใช้เป็น reference เท่านั้น (Art Bible 2) วาด 3 ทิศ (S, E, N) แยกแผ่นละทิศ บนพื้นเรียบสีขาวหรือโปร่งใส เพื่อให้ `import-hero` / `import-monster` ตัดช่องได้ |
