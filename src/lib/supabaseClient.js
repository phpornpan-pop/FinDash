import { createClient } from "@supabase/supabase-js";

// อ่านค่าจาก Environment Variables ของ Vite
// ต้องตั้งชื่อขึ้นต้นด้วย VITE_ เท่านั้น ถึงจะถูกอ่านเข้ามาได้
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// สร้าง client เฉพาะตอนที่มีค่าครบ ป้องกัน error ตอนไม่ได้ตั้งค่า
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// ใช้เช็คว่าระบบนี้เปิดใช้ Supabase อยู่หรือไม่ (แอปจะ fallback เป็นโหมด Offline ถ้าไม่มี)
export function hasSupabase() {
  return supabase !== null;
}
