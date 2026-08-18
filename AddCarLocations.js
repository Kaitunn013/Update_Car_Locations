import mqtt from "mqtt";

const mqttUrl =
  process.env.MQTT_URL ??
  "mqtts://ec9b13175461426b948434e7e60198a7.s1.eu.hivemq.cloud";
const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD;

if (!username || !password) {
  console.error(
    "Missing MQTT_USERNAME or MQTT_PASSWORD. Copy .env.example to .env and fill in your HiveMQ credentials.",
  );
  process.exit(1);
}

// คุณไม่ได้ระบุ Topic มา ผมจึงกำหนดให้เป็น 'vehicle/location' ตามด้วย username
const topic = "cars/be71b19e-1460-485a-b61d-a30ec5cb352d";

let currentLat = 14.02432;
let currentLng = 99.9744;

// เชื่อมต่อกับ MQTT Broker
const client = mqtt.connect(mqttUrl, {
  username: username,
  password: password,
  port: 8883, // mqtts ปกติใช้พอร์ต 8883
});

client.on("connect", () => {
  console.log("✅ Connected to HiveMQ Cloud");

  // ตั้งเวลาส่งข้อมูลทุกๆ 5 วินาที
  setInterval(() => {
    // จำลองการขยับทีละน้อย (บวกหรือลบค่าระหว่าง -0.0005 ถึง 0.0005)
    currentLat += (Math.random() - 0.5) * 0.001;
    currentLng += (Math.random() - 0.5) * 0.001;

    const payload = {
          // ตัดทศนิยมให้เหลือ 5 ตำแหน่ง (แม่นยำระดับ ~1 เมตร ซึ่งเพียงพอสำหรับ GPS ทั่วไป)
      lat: parseFloat(currentLat.toFixed(5)),
      lng: parseFloat(currentLng.toFixed(5)),
      status: "active",
    };

    // แปลง Object เป็น JSON string ก่อนส่ง
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        console.error("❌ Publish error:", err);
      } else {
        console.log(`📤 Published to ${topic}:`, payload);
      }
    });
  }, 5000);
});

// ดักจับ Error กรณีเชื่อมต่อไม่สำเร็จหรือมีปัญหาเครือข่าย
client.on("error", (error) => {
  console.error("⚠️ MQTT Connection Error:", error);
});
