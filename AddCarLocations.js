import mqtt from "mqtt";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

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

// ค่าเริ่มต้นสามารถกำหนดไว้ใน .env.local ด้วย CAR_LATITUDE และ CAR_LONGITUDE
const defaultLat = Number(process.env.CAR_LATITUDE || 14.02432);
const defaultLng = Number(process.env.CAR_LONGITUDE || 99.9744);

const isValidCoordinate = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;

const askCoordinate = async (readline, label, defaultValue, min, max) => {
  const defaultText = Number.isFinite(defaultValue) ? ` [${defaultValue}]` : "";

  while (true) {
    const answer = (await readline.question(`${label}${defaultText}: `)).trim();
    const value = answer === "" ? defaultValue : Number(answer);

    if (isValidCoordinate(value, min, max)) {
      return value;
    }

    console.log(
      `Invalid ${label}. Enter a number between ${min} and ${max}.`,
    );
  }
};

const readline = createInterface({ input, output });
let currentLat;
let currentLng;

currentLat = await askCoordinate(
  readline,
  "Latitude (-90 ถึง 90)",
  defaultLat,
  -90,
  90,
);
currentLng = await askCoordinate(
  readline,
  "Longitude (-180 ถึง 180)",
  defaultLng,
  -180,
  180,
);

const topic = "cars/be71b19e-1460-485a-b61d-a30ec5cb352d";

// เชื่อมต่อกับ MQTT Broker
const client = mqtt.connect(mqttUrl, {
  username: username,
  password: password,
  port: 8883, // mqtts ปกติใช้พอร์ต 8883
});

let publishInterval;

client.on("connect", () => {
  console.log("✅ Connected to HiveMQ Cloud");

  // ส่งพิกัดเดิมทุกๆ 5 วินาที
  publishInterval = setInterval(() => {
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

const listenForCoordinateUpdates = async () => {
  console.log(
    "พิมพ์พิกัดใหม่ในรูปแบบ latitude,longitude เช่น 13.7563,100.5018 หรือพิมพ์ q เพื่อออก",
  );

  while (true) {
    const answer = (await readline.question("New coordinates: ")).trim();

    if (["q", "exit"].includes(answer.toLowerCase())) {
      clearInterval(publishInterval);
      readline.close();
      client.end();
      return;
    }

    const [latText, lngText] = answer.split(",").map((value) => value.trim());
    const newLat = Number(latText);
    const newLng = Number(lngText);

    if (
      !isValidCoordinate(newLat, -90, 90) ||
      !isValidCoordinate(newLng, -180, 180)
    ) {
      console.log(
        "รูปแบบไม่ถูกต้อง กรุณากรอกเป็น latitude,longitude เช่น 13.7563,100.5018",
      );
      continue;
    }

    currentLat = newLat;
    currentLng = newLng;
    console.log(`Updated coordinates: ${currentLat},${currentLng}`);
  }
};

listenForCoordinateUpdates().catch((error) => {
  console.error("Coordinate input error:", error);
  clearInterval(publishInterval);
  readline.close();
  client.end();
});
