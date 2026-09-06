# Add Car Locations

โปรเจกต์นี้ส่งตำแหน่งรถจำลองจากเส้นทางใน GeoJSON ไปยัง HiveMQ ผ่าน MQTT

## ตั้งค่าและรัน

1. ติดตั้ง dependency:

   ```powershell
   npm install
   ```

2. สร้างไฟล์ credential เฉพาะเครื่องจาก template:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. แก้ค่าใน `.env.local`:

   - `CAR_IDS` คือ car ID คั่นด้วย comma เช่น `car-id-1,car-id-2`
   - `CAR_1_MQTT_USERNAME` และ `CAR_1_MQTT_PASSWORD` คือ credential ของรถลำดับที่ 1 ใน `CAR_IDS`
   - `CAR_2_MQTT_USERNAME` และ `CAR_2_MQTT_PASSWORD` คือ credential ของรถลำดับที่ 2 ใน `CAR_IDS`
   - `ROUTE_FILE` คือเส้นทางเริ่มต้น เช่น `route.geojson`
   - `CAR_ROUTES` ใช้กำหนดเส้นทางแยกตามรถ เช่น `car-id-1=route.geojson,car-id-2=route2.geojson`
   - `MQTT_TOPIC_PREFIX=cars` จะส่งไปที่ `cars/<car-id>`

4. เริ่มโปรแกรม:

   ```powershell
   npm run start
   ```

5. เมื่อโปรแกรมถาม ให้เลือกหมายเลขรถ, พิมพ์ car ID โดยตรง หรือพิมพ์ `all` เพื่อส่งรถทุกคันพร้อมกัน โดยแต่ละคันจะใช้ไฟล์ตาม `CAR_ROUTES`

โปรแกรมจะเชื่อมต่อ MQTT แยกหนึ่ง connection ต่อรถหนึ่งคัน เพื่อใช้ username/password ของรถคันนั้นโดยตรง โดยเลข `CAR_1`, `CAR_2` ต้องตรงกับลำดับใน `CAR_IDS` หากยังใช้ `MQTT_USERNAME` และ `MQTT_PASSWORD` แบบเดิม โปรแกรมจะใช้เป็นค่า fallback ร่วมกันทุกคัน

ไฟล์ `.env.local` ถูกละเว้นโดย Git และห้าม push ขึ้น repository ส่วน `.env.example` ไม่มี credential จริงและสามารถ commit ได้
