# Add Car Locations

โปรเจกต์นี้ส่งตำแหน่งรถจำลองไปยัง HiveMQ ผ่าน MQTT

## ตั้งค่าและรัน

1. ติดตั้ง dependency:

   ```powershell
   npm install
   ```

2. สร้างไฟล์ local จาก template:

   ```powershell
   Copy-Item .env.example .env
   ```

3. แก้ค่า `MQTT_USERNAME` และ `MQTT_PASSWORD` ในไฟล์ `.env`

4. เริ่มโปรแกรม:

   ```powershell
   npm start
   ```

ไฟล์ `.env` ถูกละเว้นโดย Git และห้าม push ขึ้น repository ส่วน `.env.example` ไม่มี credential จริงและสามารถ commit ได้
