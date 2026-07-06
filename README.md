# สมุดบัญชี: สินทรัพย์ · หนี้สิน · ความมั่งคั่งสุทธิ

เว็บแอปบันทึกสินทรัพย์/หนี้สินรายไตรมาส พร้อมเป้าหมายและ DCA ต่อสินทรัพย์
ผู้ดูแลต่อรายการ และโมดูลประกันชีวิต/สุขภาพ/อุบัติเหตุ/บ้าน/รถ

โปรเจกต์นี้เป็น React + Vite ธรรมดา รันเป็นเว็บสถิต (static site) ได้ทุกที่
และรองรับการใช้ **Google Sheets เป็นฐานข้อมูล** ผ่าน Google Apps Script
(ไม่ต้องเช่าเซิร์ฟเวอร์เอง)

---

## 1. รันในเครื่องตัวเอง

ต้องมี [Node.js](https://nodejs.org) ติดตั้งไว้ก่อน (แนะนำ v18 ขึ้นไป)

```bash
npm install
npm run dev
```

เปิด http://localhost:5173 จะเห็นแอปทันที ตอนนี้ข้อมูลจะถูกเก็บใน
localStorage ของเบราว์เซอร์เท่านั้น (ยังไม่เชื่อม Google Sheets) —
ไปทำขั้นตอนที่ 2 ต่อเพื่อให้ข้อมูลจริงจังและดูได้จากหลายเครื่อง

---

## 2. ตั้งค่า Google Sheets เป็นฐานข้อมูล

### 2.1 สร้างชีตเปล่า
1. เปิด [Google Sheets](https://sheets.google.com) แล้วสร้างสเปรดชีตใหม่ 1 ไฟล์
   ตั้งชื่อว่าอะไรก็ได้ เช่น "Networth Ledger DB"
2. ไม่ต้องสร้างชีตย่อย (tab) เอง — สคริปต์จะสร้าง "Assets", "Liabilities",
   "Insurance", "Tax" ให้อัตโนมัติตอนใช้งานครั้งแรก

### 2.2 ใส่ Apps Script
1. ในสเปรดชีต ไปที่เมนู **Extensions > Apps Script**
2. ลบโค้ดเดิมในไฟล์ `Code.gs` ทั้งหมด แล้ววางโค้ดจากไฟล์
   `google-apps-script/Code.gs` ในโปรเจกต์นี้แทน
3. กด **Save** (รูปแผ่นดิสก์)

### 2.3 Deploy เป็น Web App
1. มุมขวาบนกด **Deploy > New deployment**
2. ที่ "Select type" กดรูปเฟือง แล้วเลือก **Web app**
3. ตั้งค่า:
   - **Execute as:** Me (อีเมลของคุณ)
   - **Who has access:** Anyone
   > ข้อควรระวัง: การตั้งเป็น "Anyone" หมายความว่าใครก็ตามที่มี URL นี้
   > สามารถอ่าน/เขียนข้อมูลในชีตนี้ได้ อย่าแชร์ URL นี้ให้คนอื่น และควรใช้
   > สเปรดชีตนี้เก็บเฉพาะข้อมูลของแอปนี้เท่านั้น
4. กด **Deploy** ครั้งแรกจะมีหน้าต่างขอสิทธิ์ (Authorize access) —
   กดยืนยันด้วยบัญชี Google ของคุณเอง
5. จะได้ **Web app URL** หน้าตาประมาณ
   `https://script.google.com/macros/s/XXXXXXXX/exec`
   คัดลอก URL นี้ไว้

> ทุกครั้งที่แก้โค้ดใน Code.gs ต้องกด **Deploy > Manage deployments >
> แก้ไข (ไอคอนดินสอ) > Version: New version > Deploy** ใหม่ URL เดิมจะยังใช้ได้

### 2.4 ผูก URL เข้ากับแอป
1. คัดลอกไฟล์ `.env.example` เป็นไฟล์ชื่อ `.env`
2. ใส่ URL ที่ได้ลงไป:
   ```
   VITE_SHEETS_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
   ```
3. รัน `npm run dev` ใหม่ — ตอนนี้แอปจะอ่าน/เขียนข้อมูลจาก Google Sheets จริง
   (มุมขวาบนของแอปจะขึ้นป้าย "Google Sheets" แทน "ในเครื่องนี้เท่านั้น")

**หมายเหตุการทำงาน:** ทุกครั้งที่กดบันทึกในแอป ระบบจะเขียนข้อมูลทั้งหมด
ทับลงในชีตใหม่ทั้งหมด (full sync) เพื่อความง่ายและเชื่อถือได้ ไม่แนะนำให้
แก้ไขค่าในชีตด้วยมือพร้อมกับใช้แอป เพราะข้อมูลที่แก้จะถูกทับตอนแอปบันทึกครั้งถัดไป
ถ้าจะแก้ในชีตเอง ให้ปิดแอปไว้ก่อน แล้วรีเฟรชแอปหลังแก้เสร็จเพื่อดึงข้อมูลใหม่

---

## 3. อัปโหลดขึ้น GitHub

```bash
git init
git add .
git commit -m "Initial commit: networth ledger app"
```

ไปสร้าง repository เปล่าบน https://github.com/new (อย่าติ๊กเพิ่ม README/.gitignore
เพราะเรามีอยู่แล้ว) แล้วรัน:

```bash
git remote add origin https://github.com/<username>/<repo-name>.git
git branch -M main
git push -u origin main
```

**ข้อควรระวัง:** ไฟล์ `.env` ที่ใส่ URL ของ Google Sheets ไว้จะไม่ถูกอัปโหลด
(อยู่ใน `.gitignore` แล้ว) ถ้าจะ deploy ขึ้นเว็บจริง ต้องตั้งค่า environment
variable `VITE_SHEETS_API_URL` แยกต่างหากบนแพลตฟอร์มที่ deploy (ดูข้อ 4)

---

## 4. Deploy ให้เข้าเว็บได้จริง

แนะนำ **Vercel** หรือ **Netlify** เพราะตั้งค่า environment variable และ
build อัตโนมัติจาก GitHub ได้ง่ายที่สุด:

1. ไปที่ https://vercel.com (หรือ netlify.com) แล้ว "Import" repo ที่เพิ่ง push
2. ตั้งค่า Environment Variable: `VITE_SHEETS_API_URL` = URL จากข้อ 2.3
3. กด Deploy — เสร็จแล้วจะได้ลิงก์เว็บที่เข้าได้จากมือถือ/คอมทุกเครื่อง

ถ้าอยากใช้ **GitHub Pages** แทน:
```bash
npm run build
```
จะได้โฟลเดอร์ `dist/` — อัปโหลดเนื้อหาในนั้นขึ้น branch `gh-pages` ของ repo
(หรือใช้ GitHub Actions workflow สำหรับ Vite ก็ได้) จากนั้นตั้งค่า
`VITE_SHEETS_API_URL` ตอน build (`VITE_SHEETS_API_URL=... npm run build`)
เพราะ GitHub Pages ไม่มีระบบ environment variable ให้ตั้งตอนรันเหมือน Vercel

---

## โครงสร้างไฟล์

```
networth-ledger/
├── src/
│   ├── App.jsx              ← ตัวแอปทั้งหมด (UI + logic)
│   ├── main.jsx              ← จุดเริ่มต้น React
│   ├── index.css             ← Tailwind
│   └── lib/
│       └── storage.js        ← เชื่อมกับ Google Sheets + fallback localStorage
├── google-apps-script/
│   └── Code.gs                ← โค้ดที่ต้องวางใน Apps Script (ข้อ 2.2)
├── .env.example
├── package.json
└── ...
```

## ข้อจำกัดที่ควรรู้
- Google Apps Script Web App มี quota การเรียกใช้งานฟรีต่อวัน (ปกติเพียงพอ
  สำหรับใช้คนเดียว) และอาจหน่วงเล็กน้อย (1-2 วินาที) ต่อการบันทึก
- เหมาะกับผู้ใช้คนเดียวหรือกลุ่มเล็กที่ไว้ใจกัน เพราะ URL แบบ "Anyone"
  ไม่มีระบบล็อกอินแยกผู้ใช้
- ถ้าต้องการฐานข้อมูลที่รองรับผู้ใช้หลายคนพร้อมระบบสิทธิ์ที่รัดกุมกว่านี้
  จะต้องใช้บริการฐานข้อมูลจริง เช่น Firebase, Supabase แทน
