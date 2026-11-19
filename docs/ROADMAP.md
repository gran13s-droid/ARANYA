# ARANYA – Development Roadmap (prompt ทีละ step)

> ย้ายมาจาก CLAUDE.md เดิมแบบคำต่อคำ ถ้า step ไหนขัดกับ GDD.md หรือ ART_BIBLE.md ให้ยึดเอกสารทั้งสองเป็นหลัก (ดูตารางความขัดแย้งใน CLAUDE.md)

📘 เฟส 0: Pre-production
Step 0.1: GDD ฉบับย่อ
เขียน Game Design Document ฉบับย่อ (10–15 หน้า) สำหรับเกมนี้ ประกอบด้วย:
1. Elevator pitch 3 บรรทัด
2. เนื้อเรื่องหลัก: ป่าหิมพานต์ถูกพลังมืดสีม่วงกัดกิน ผู้เล่นเป็น "ผู้พิทักษ์วิญญาณ" มีวิญญาณหยกคู่กาย
3. Core loop (นาที / ชั่วโมง / สัปดาห์)
4. อาชีพ 4 อาชีพ: นักดาบ, หมอผี, พรานธนู, นักพลอง (ฮีล) แต่ละอาชีพมีสกิล 6 อย่าง
5. ระบบธาตุ: ไฟ / ควัน / หยก / มืด พร้อมตารางแพ้ทาง
6. ระบบเครื่องราง (สวมใส่, อัปเกรด, หลอมรวม)
7. โซนแรก "ป่าไทรศักดิ์สิทธิ์" และบอสนาคต้นไทร
8. ระบบสังคม: ปาร์ตี้, กิลด์, ตลาด
9. Monetization แบบไม่ pay-to-win
ส่งออกเป็น Markdown พร้อมตาราง
Step 0.2: Art Bible
สร้าง Art Bible สำหรับเกมพิกเซล 2.5D ธีมไทย:
- ล็อกพาเลตต์ 15 สี (ให้ hex code) และกฎการใช้สีแต่ละกลุ่ม (ฉาก/ตัวละคร/เอฟเฟกต์/UI)
- ขนาดสไปรต์: ผู้เล่น, มอนสเตอร์เล็ก, มอนสเตอร์ใหญ่, บอส
- รายการแอนิเมชันและจำนวนเฟรมต่อท่า
- กฎ outline, การลงแสงเงา (แสงจากซ้ายบน), dithering
- ลวดลายไทยที่ใช้ใน UI (กนก, ประจำยาม, ดอกบัว) และวิธีลดทอนให้เป็นพิกเซล
- Checklist ตรวจงานอาร์ตก่อนเข้าเกม
Step 0.3: Tech Spike (ผู้เล่น 2 คนในฉากเดียวกัน)
สร้าง monorepo เริ่มต้นด้วย pnpm workspaces:
/client (Babylon.js + Vite), /server (Colyseus), /shared (types)

ให้ทำงานได้ดังนี้:
1. ฉาก 3D: พื้นหญ้า low-poly, ต้นไม้ 3 ต้น, หมอกสีเขียวเข้ม, กล้อง orthographic มุมเอียง 45°
2. ผู้เล่นเป็นสไปรต์ billboard (ใช้ placeholder สี่เหลี่ยมก่อน) เดินด้วย WASD
3. เปิด 2 แท็บแล้วเห็นอีกคนเดินแบบ real-time
4. Server-authoritative movement + client-side prediction + interpolation ของผู้เล่นอื่น
5. sync ที่ 20 tick/วินาที, ส่ง binary delta
ให้โค้ดครบทุกไฟล์ คำสั่งรัน และอธิบายสถาปัตยกรรมสั้น ๆ
⚔️ เฟส 1: Prototype
Step 1.1: Sprite Pipeline
สร้างระบบ sprite pipeline:
1. สคริปต์ Node ที่อ่านไฟล์ .aseprite (หรือ PNG + JSON ที่ export จาก Aseprite) แล้วรวมเป็น texture atlas
2. คลาส SpriteCharacter ใน Babylon.js รองรับ 4 ทิศ + mirror = 8 ทิศ, state machine (idle/walk/run/attack1-3/skill/hit/death)
3. ใช้ thin instances / SpriteManager ให้วาดตัวละคร 200 ตัวได้ใน draw call น้อยที่สุด
4. nearest filtering, pixel-perfect scaling, เงาวงรีใต้เท้า
Step 1.2: ระบบต่อสู้
สร้างระบบต่อสู้แบบ action (server-authoritative):
- คอมโบดาบ 3 จังหวะ, dodge roll มี i-frame, สกิล 4 ช่อง พร้อม cooldown
- hitbox ทำงานฝั่ง server พร้อม lag compensation (rewind ~100ms)
- ฝั่ง client แสดงแอนิเมชันทันที แล้วแก้ผลตามที่ server ยืนยัน
- ตัวเลขดาเมจลอย, hit stop, กล้องสั่น
- คำนวณดาเมจตามตารางธาตุ (ไฟ/ควัน/หยก/มืด)
แยกโค้ดเป็น shared/combat (สูตร), server/systems/combat, client/fx
Step 1.3: AI มอนสเตอร์ 3 ตัว
สร้าง AI มอนสเตอร์ฝั่ง server (state machine: idle → patrol → aggro → attack → return):
1. วิญญาณเพลิง: บินลอย พุ่งเข้าหาผู้เล่นแล้วระเบิด (AoE ไฟ) แล้วตาย
2. คางคกควัน: ช้า พ่นหมอกพิษเป็นวง ทำให้ผู้เล่นมองเห็นแคบลง + ดาเมจต่อเนื่อง
3. เม่นไฟ: แทงก์ ยิงหนามเป็นวง 8 ทิศ ม้วนตัวตอน HP ต่ำเพื่อลดดาเมจ
มีระบบ spawn point, respawn timer, aggro table, ตาราง loot drop
ทำ config เป็น JSON เพื่อให้ designer ปรับค่าได้โดยไม่ต้องแก้โค้ด
Step 1.4: ทดสอบ 20 คน
เขียน bot client แบบ headless (Node) จำลองผู้เล่น 20–50 คน เดินสุ่มและโจมตี
วัด: CPU/RAM ของ server, bandwidth ต่อผู้เล่น, tick time
ให้รายงานคอขวดและวิธีแก้
🌳 เฟส 2: Vertical Slice
Step 2.1: โซน "ป่าไทรศักดิ์สิทธิ์"
ออกแบบและสร้างโซนแรก:
- เลย์เอาต์: หมู่บ้านเรือนไทยริมน้ำ (hub) → ทางป่า → ศาลร้าง → ลานต้นไทร (บอส)
- ระบบโหลดโซนแบบ streaming แบ่งเป็น chunk
- ฉาก low-poly + baked lightmap, หมอกไล่ระดับ, ใบไม้ปลิว (particle), หิ่งห้อย
- จุดแสงไดนามิกไม่เกิน 4 จุดบนจอ
- ระบบ collision บนพื้นที่ต่างระดับ (สะพาน, รากไม้)
ให้ไฟล์ level data เป็น JSON และ editor แบบง่ายสำหรับวาง object
Step 2.2: บอสนาคต้นไทร
สร้างบอส "นาคต้นไทร" (instance แยก ปาร์ตี้ 4–8 คน):
เฟส 1 (100–70%): รากไทรทะลุพื้นตามตำแหน่งผู้เล่น (มีวงเตือน 1.5 วิ), กวาดหาง
เฟส 2 (70–35%): เปลวม่วงสาปแช่ง ทำให้ผู้เล่นติดคำสาปที่ต้องวิ่งไปล้างที่ศาลหิน 2 จุด, เรียกวิญญาณเพลิงออกมา
เฟส 3 (35–0%): นาคตื่นเต็มตัว เลื้อยรอบลาน, ลำแสงหยกต้องหลบหลังเสา, enrage ที่ 8 นาที
- สไปรต์แยกชิ้น (หัว / ลำตัวเป็นปล้อง / ราก) ขยับด้วยโค้ด
- ระบบ telegraph, threat/aggro, ตาราง loot (เครื่องรางหยกหายาก)
- เพลงเปลี่ยนตามเฟส
Step 2.3: UI/HUD
สร้าง UI ด้วย HTML/CSS overlay บน canvas (หรือ Babylon GUI) สไตล์พิกเซล + ลายไทย:
HUD (HP/MP, สกิลบาร์, มินิแมป), กระเป๋า, หน้าตัวละคร, หน้าต่างเควสต์, แชต
- ใช้ฟอนต์พิกเซลที่รองรับภาษาไทย
- รองรับทัชบนมือถือ (จอยเสมือน + ปุ่มสกิล)
- คีย์ลัด, ลากวางไอเทม, tooltip
Step 2.4: เควสต์และ NPC
สร้างระบบเควสต์แบบ data-driven (JSON):
ประเภท: ฆ่า, เก็บของ, ส่งของ, คุย, เข้าพื้นที่
ระบบบทสนทนาแบบมีตัวเลือก, ไอคอน ! และ ? เหนือหัว NPC
เขียนเควสต์ chain 8 เควสต์สำหรับโซนแรก ที่จบด้วยการปราบนาคต้นไทร
ให้บทพูดภาษาไทยที่มีกลิ่นอายนิทานพื้นบ้าน
🏘️ เฟส 3: Alpha
Step 3.1: บัญชีและ Backend
สร้าง backend:
- Auth: Guest → ผูกบัญชี Google / LINE / Facebook, JWT + refresh token
- Schema PostgreSQL: accounts, characters, inventory, items, equipment, quests, guilds, market_listings
- ใช้ Redis เก็บ session และ presence
- เซฟข้อมูลตัวละครแบบ write-behind ทุก 30 วิ และเมื่อออกจากเกม
- migration scripts และ seed data
Step 3.2: ไอเทมและเครื่องราง
สร้างระบบไอเทม:
- ระดับความหายาก 5 ระดับ, random stat, เครื่องรางมีธาตุ
- อัปเกรด +1 ถึง +10 (มีโอกาสล้มเหลวแต่ไม่ทำให้ไอเทมแตก), หลอมรวมเครื่องราง 3 ชิ้น → 1 ชิ้นระดับสูงขึ้น
- ทุกธุรกรรมใช้ DB transaction ป้องกันการ dupe ไอเทม
- เก็บ audit log ทุกการเปลี่ยนแปลงไอเทม
Step 3.3: ปาร์ตี้ กิลด์ แชต
สร้างระบบสังคม:
- ปาร์ตี้ 4 คน แบ่ง EXP/loot, matchmaking ดันเจี้ยน
- กิลด์: ยศ, สิทธิ์, คลังกิลด์, เลเวลกิลด์
- แชตช่อง zone/party/guild/whisper ผ่าน Colyseus + Redis pub/sub ข้าม server
- กรองคำหยาบภาษาไทย + rate limit + ระบบ report/mute
Step 3.4: ตลาด
สร้าง marketplace แบบ auction house:
ลงขาย, ค้นหา/กรอง, ซื้อทันที, ค่าธรรมเนียม 5% (gold sink)
ป้องกัน race condition (คนสองคนซื้อชิ้นเดียวกัน) ด้วย row lock
ทำ dashboard ติดตามราคาเฉลี่ยและปริมาณทองในระบบ
🧪 เฟส 4: Beta
Step 4.1: Load Test และ Scaling
วางแผนและเขียน load test สำหรับผู้เล่นพร้อมกัน 2,000 คน:
- bot จำลองพฤติกรรมจริง (เดิน, สู้, แชต, ตลาด)
- Colyseus หลาย process + presence ผ่าน Redis + load balancer
- Docker Compose (dev) และ Kubernetes manifests (prod) พร้อม autoscaling
- Monitoring: Prometheus + Grafana dashboard (CCU, tick time, latency, error rate)
Step 4.2: ตรวจความปลอดภัย
ทำ security audit ของโค้ดทั้งหมด ตรวจ:
speed hack, teleport, ส่งดาเมจปลอม, dupe ไอเทม, เทรดซ้อน, SQL injection,
token ถูกขโมย, DDoS ระดับ application, bot ฟาร์มของ
ให้รายการช่องโหว่เรียงตามความรุนแรง พร้อมโค้ดแก้ไข
Step 4.3: ปรับสมดุล
สร้าง spreadsheet model ปรับสมดุล:
EXP curve เลเวล 1–50, HP/ATK มอนสเตอร์ตามเลเวล, DPS ของแต่ละอาชีพ,
ทองที่ไหลเข้า/ออกระบบต่อชั่วโมง
ระบุจุดที่ผู้เล่นน่าจะเบื่อ (grind wall) และข้อเสนอแก้
🚀 เฟส 5: Launch และ LiveOps
Step 5.1: Deploy และ CI/CD
ตั้ง CI/CD ด้วย GitHub Actions:
lint → test → build client (แนบ hash ในชื่อ asset) → อัปขึ้น CDN → build Docker server → deploy แบบ rolling
- ระบบเช็กเวอร์ชัน client กับ server ถ้าไม่ตรงให้แจ้งรีเฟรช
- PWA manifest + Service Worker cache asset ตามโซน
- โหมดปิดปรับปรุง + ประกาศในเกม
Step 5.2: การชำระเงิน
เชื่อม payment gateway ที่รองรับ PromptPay, บัตรเครดิต, TrueMoney:
- ซื้อ "เหรียญหยก" (สกุลเงินพรีเมียม)
- ยืนยันผ่าน webhook ฝั่ง server เท่านั้น, ป้องกันการเติมซ้ำ (idempotency key)
- ร้านค้าชุด/สกินวิญญาณคู่หู, Battle Pass ตามซีซัน
- ประวัติการซื้อ และระบบคืนเงิน
Step 5.3: อีเวนต์ตามเทศกาล
ออกแบบระบบ LiveOps และอีเวนต์ 4 เทศกาลไทย:
สงกรานต์, ลอยกระทง, ออกพรรษา, ตรุษจีน
แต่ละอีเวนต์มี: บอสพิเศษ, เควสต์, ไอเทมจำกัดเวลา, การเปลี่ยนฉาก
ทำให้เปิด/ปิดอีเวนต์ผ่าน config บน server ได้ โดยไม่ต้อง deploy ใหม่
🎨 โบนัส: Prompt สำหรับสร้างภาพคอนเซปต์
Pixel art game sprite sheet, 2.5D HD-2D style, Thai Himmaphan forest folklore,
[ชื่อตัวละคร/มอนสเตอร์ + คำอธิบาย], 4-direction views (front, side, back, 3/4),
idle and attack poses, dark jungle green background, limited 15-color palette
(deep forest green, cream, temple gold, brown, fire red, dark purple, jade teal),
clean 1px outline, top-left lighting, Thai ornamental details, game asset sheet