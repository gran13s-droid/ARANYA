# คำอธิบายที่แนบมากับภาพที่ 1, 2, 3, 4, 5

ภาพ: ref_01_spirit_flame.png, ref_02_ui_effect.png, ref_03_naga_boss_v1.png, ref_04_frog_spirit.png, ref_05_hero.png
วันที่ได้รับ: 2026-11-19

> ข้อความต้นฉบับจากผู้ส่ง concept เก็บไว้ตามที่ได้รับ ผลตรวจและสิ่งที่แก้ให้ดูใน Art Bible ตาม [INDEX.md](../INDEX.md)

---

สร้าง Art Bible สำหรับเกมพิกเซล 2.5D ธีมไทย:
- ล็อกพาเลตต์ 15 สี (ให้ hex code) และกฎการใช้สีแต่ละกลุ่ม (ฉาก/ตัวละคร/เอฟเฟกต์/UI)
- ขนาดสไปรต์: ผู้เล่น, มอนสเตอร์เล็ก, มอนสเตอร์ใหญ่, บอส
- รายการแอนิเมชันและจำนวนเฟรมต่อท่า
- กฎ outline, การลงแสงเงา (แสงจากซ้ายบน), dithering
- ลวดลายไทยที่ใช้ใน UI (กนก, ประจำยาม, ดอกบัว) และวิธีลดทอนให้เป็นพิกเซล
- Checklist ตรวจงานอาร์ตก่อนเข้าเกม


ออกแบบ UI & EFFECT ในสไตล์ 2.5D Fantasy Action RPG ให้เข้ากับ Hero, Frog Spirit และ Spirit Flame แล้วครับ
แบ่งออกเป็น 6 ส่วนหลัก:

1. Player HUD – HP, MP, EXP, Level และรูป Hero
2. Spirit Companion UI – แสดงสถานะและพลังของ Frog Spirit
3. Skill Bar – Attack, Skill 1–3, Dash และ Potion
4. Spirit Flame UI – Idle, Happy, Surprise, Angry, Sleep
5. Combat VFX – Slash, Spirit Blast, Impact, Shield, Buff และ Aura
6. Combo / Ultimate – เอฟเฟกต์ท่าไม้ตายขนาดใหญ่

แนวทาง Art Direction

* สีหลัก: Emerald Green, Jade Cyan และ Antique Gold
* กรอบ UI: ลวดลายไทยประยุกต์
* Effect: เรืองแสงแบบ Magical Energy
* ฉากเกม: 2.5D Isometric / 3D Environment

ข้อแนะนำ: ควรยึด UI ชุดนี้เป็น Visual Guideline ของเกม และใช้รูปแบบไอคอน สี และกรอบเดียวกันตลอดทั้งเกม เพื่อให้ทุกระบบมีเอกลักษณ์เดียวกันครับ


ออกแบบ Spirit Flame – วิญญาณเปลวเพลิง ในสไตล์ 2.5D Stylized 3D ให้เข้ากับ Hero, Frog Spirit และ Naga Boss แล้วครับ
คอนเซปต์:

* เปลววิญญาณสีเขียวหยก Cyan / Emerald
* มีใบหน้าเล็ก ๆ ดูน่ารักและลึกลับ
* รูปร่างคล้ายเปลวไฟ มีหางควันวิญญาณ
* มีลวดลายก้นหอยแบบไทยประยุกต์
* ลอยเหนือพื้น ไม่สัมผัสพื้น
* มีอนุภาคแสงและประกายเวทมนตร์

Animation & VFX ที่ออกแบบ

1. Idle – ลอยและกระพริบแสง
2. Float – ลอยขึ้นลง
3. Move – เคลื่อนที่พร้อมทิ้ง Trail
4. Burst – ระเบิดพลัง
5. Disappear – สลายเป็นละอองแสง
6. Skill Effect – วงเวทและพลังโจมตี
7. Aura / Buff – สร้างโล่พลังวิญญาณ

สามารถใช้เป็นทั้ง Spirit Companion, ไอเทมเวทมนตร์ และเอฟเฟกต์สกิลในเกมได้ครับ

ออกแบบ Naga Boss – The Ancient Guardian ในสไตล์ 2.5D Stylized 3D ให้เข้ากับ Hero และ Frog Spirit แล้วครับ
คอนเซปต์:

* พญานาคเกล็ดสีเขียวหยก (Jade Scales)
* มงกุฎและเกราะทอง ลวดลายไทยโบราณ
* ดวงตาสีม่วงแดงเรืองแสง
* ลำตัวยาวขดเป็นวง มีเกล็ดท้องสีทองอ่อน
* ออร่าพลังคำสาปสีม่วง
* บุคลิกเป็นบอสโบราณที่ทรงพลังและน่าเกรงขาม

ชุดองค์ประกอบที่ออกแบบ

1. Turnaround – Front, 3/4, Side, Back
2. Idle Animation
3. Normal Attack
4. Special Attack – พลังคลื่นนาค
5. Summon Serpent – เรียกนาควิญญาณ
6. Ultimate – วงเวทอัญเชิญพญานาค
7. In-Game Boss Preview

ข้อเสนอด้าน Gameplay: ให้ Naga Boss มี 3 Phase โดย Phase 1 ใช้การโจมตีด้วยลำตัวและเขี้ยว, Phase 2 ใช้พลังคำสาปสีม่วง และ Phase 3 ปลดปล่อยร่างพญานาคเต็มพลังครับ

ออกแบบ Frog Spirit – Spirit Companion ในสไตล์ 2.5D Stylized 3D ให้เข้ากับ Hero แล้วครับ
คอนเซปต์หลัก:

* กบวิญญาณสีเขียวหยก (Jade / Emerald)
* ดวงตาสีทองขนาดใหญ่ ดูเป็นมิตร
* ลวดลายยันต์และลายมงคลบนตัว
* กระดิ่งทองบริเวณคอ
* เปลววิญญาณสีเขียวอมฟ้าลอยอยู่ด้านหลัง
* บุคลิกน่ารัก ขี้เล่น แต่มีพลังเวทโบราณ

มีแนวทางสำหรับ Front, 3/4, Side, Back, Idle, Jump, Walk/Run, Skill และ Emotion
ทิศทางที่แนะนำ: ให้ Frog Spirit เป็น Companion ประจำตัว Hero มีทั้ง Animation ติดตามผู้เล่น และช่วยโจมตีด้วยพลังวิญญาณครับ


ปรับเป็นแนว 2.5D Stylized 3D ให้แล้วครับ โดยโฟกัสเฉพาะ Hero ก่อน
แนวทางภาพที่ใช้:

* Character Model: 3D Chibi Stylized ผสม Anime
* มุมมอง: 3/4 Perspective เหมาะกับเกม Action RPG
* Character Turnaround: ด้านหน้า, เฉียง, ด้านข้าง และด้านหลัง
* Animation Concept: Idle, Walk, Run, Jump, Dual Blade Attack
* Skill: Spirit Slash พร้อมวิญญาณสีเขียวหยก
* Environment Preview: ทดลองวางตัวละครในฉากป่าโบราณ

ข้อเสนอสำหรับขั้นต่อไป: ควรล็อกหน้าตาและสัดส่วน Hero ให้เป็น Character Model หลักก่อน แล้วค่อยทำ Animation แยกเป็นชุด เพื่อให้ตัวละครไม่เปลี่ยนหน้าตาหรือชุดเกราะระหว่างท่าครับ
