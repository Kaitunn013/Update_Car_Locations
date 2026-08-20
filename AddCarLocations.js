import mqtt from "mqtt";

const mqttUrl =
  process.env.MQTT_URL ??
  "mqtts://ec9b13175461426b948434e7e60198a7.s1.eu.hivemq.cloud";
const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD;

if (!username || !password) {
  console.error(
    "Missing MQTT_USERNAME or MQTT_PASSWORD. Add them to .env.local.",
  );
  process.exit(1);
}

const isValidCoordinate = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;

// แก้พิกัดทั้ง 10 จุดได้ที่ array นี้ โดยเรียงลำดับจุดที่ต้องการให้รถเดินทาง
const locations = [
  { lat: 14.021746, lng: 99.988671 },
  { lat: 14.022115, lng: 99.977652 },
  { lat: 14.023593, lng: 99.976011},
  { lat: 14.021670, lng: 99.975989 },
  { lat: 14.021014, lng: 99.975764 },
  { lat: 14.021024, lng: 99.975270 },
  { lat: 14.021082, lng: 99.973419 },
  { lat: 14.024101, lng: 99.972153 }, 
  { lat: 14.023805, lng: 99.975987 },
  { lat: 14.022025, lng: 99.988539 }
];

if (locations.length !== 10) {
  console.error("ต้องกำหนดพิกัดใน locations ให้ครบ 10 จุด");
  process.exit(1);
}

for (const [index, location] of locations.entries()) {
  if (
    !isValidCoordinate(location.lat, -90, 90) ||
    !isValidCoordinate(location.lng, -180, 180)
  ) {
    console.error(`พิกัดจุดที่ ${index + 1} ไม่ถูกต้อง`);
    process.exit(1);
  }
}

const topic = "cars/be71b19e-1460-485a-b61d-a30ec5cb352d";

// เชื่อมต่อกับ MQTT Broker
const client = mqtt.connect(mqttUrl, {
  username: username,
  password: password,
  port: 8883, // mqtts ปกติใช้พอร์ต 8883
});

let publishInterval;
let locationIndex = 0;

const publishNextLocation = () => {
  const location = locations[locationIndex];
  const payload = {
    lat: Number(location.lat.toFixed(5)),
    lng: Number(location.lng.toFixed(5)),
    status: "active",
  };

  locationIndex = (locationIndex + 1) % locations.length;

  // แปลง Object เป็น JSON string ก่อนส่ง
  client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) {
      console.error("❌ Publish error:", err);
    } else {
      console.log(`📤 Published to ${topic}:`, payload);
    }
  });
};

client.on("connect", () => {
  console.log("✅ Connected to HiveMQ Cloud");

  // ส่งจุดแรกทันที แล้วเปลี่ยนเป็นจุดถัดไปทุกๆ 5 วินาที
  if (!publishInterval) {
    publishNextLocation();
    publishInterval = setInterval(publishNextLocation, 5000);
  }
});

// ดักจับ Error กรณีเชื่อมต่อไม่สำเร็จหรือมีปัญหาเครือข่าย
client.on("error", (error) => {
  console.error("⚠️ MQTT Connection Error:", error);
});
