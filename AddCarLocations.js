import mqtt from "mqtt";
import { readFileSync } from "node:fs";

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

const routeFileUrl = new URL("./route.geojson", import.meta.url);
let geoJson;

try {
  geoJson = JSON.parse(readFileSync(routeFileUrl, "utf8"));
} catch (error) {
  console.error("ไม่สามารถอ่าน route.geojson ได้:", error.message);
  process.exit(1);
}

const geometry =
  geoJson.type === "FeatureCollection"
    ? geoJson.features?.find((feature) => feature.geometry)?.geometry
    : geoJson.geometry;

if (!geometry || geometry.type !== "LineString") {
  console.error("route.geojson ต้องมี geometry.type เป็น LineString");
  process.exit(1);
}

const rawLocations = geometry.coordinates.map((coordinate, index) => {
  const [lng, lat] = coordinate;

  if (!isValidCoordinate(Number(lat), -90, 90) || !isValidCoordinate(Number(lng), -180, 180)) {
    console.error(`พิกัดใน route.geojson จุดที่ ${index + 1} ไม่ถูกต้อง`);
    process.exit(1);
  }

  return { lat: Number(lat), lng: Number(lng) };
});

const COORDINATE_EPSILON = 0.00001;
const isSameCoordinate = (first, second) =>
  Math.abs(first.lat - second.lat) < COORDINATE_EPSILON &&
  Math.abs(first.lng - second.lng) < COORDINATE_EPSILON;

// ถ้าไฟล์ปิดเส้นทางด้วยการใส่จุดเริ่มต้นซ้ำ ให้ตัดจุดซ้ำออกก่อนสร้างรอบกลับ
const locations =
  rawLocations.length > 1 &&
  isSameCoordinate(rawLocations[0], rawLocations[rawLocations.length - 1])
    ? rawLocations.slice(0, -1)
    : rawLocations;

if (locations.length < 2) {
  console.error("route.geojson ต้องมีพิกัดอย่างน้อย 2 จุด");
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

const UPDATE_INTERVAL_MS = 4000;
const SIMULATED_SPEED_KMH = 40;
const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const distanceInMeters = (from, to) => {
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) ** 2;

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
};

const buildRoutePoints = () => {
  const routePoints = [];
  const speedMetersPerSecond = (SIMULATED_SPEED_KMH * 1000) / 3600;
  const metersPerUpdate =
    speedMetersPerSecond * (UPDATE_INTERVAL_MS / 1000);

  for (let index = 0; index < locations.length; index += 1) {
    const start = locations[index];
    const end = locations[(index + 1) % locations.length];
    const distance = distanceInMeters(start, end);
    const steps = Math.max(1, Math.ceil(distance / metersPerUpdate));

    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps;
      routePoints.push({
        lat: start.lat + (end.lat - start.lat) * progress,
        lng: start.lng + (end.lng - start.lng) * progress,
      });
    }
  }

  return routePoints;
};

if (SIMULATED_SPEED_KMH <= 0) {
  console.error("SIMULATED_SPEED_KMH ต้องมากกว่า 0");
  process.exit(1);
}

const routePoints = buildRoutePoints();

const topic = "cars/be71b19e-1460-485a-b61d-a30ec5cb352d";

// เชื่อมต่อกับ MQTT Broker
const client = mqtt.connect(mqttUrl, {
  username: username,
  password: password,
  port: 8883, // mqtts ปกติใช้พอร์ต 8883
});

let publishInterval;
let routePointIndex = 0;

const publishNextRoutePoint = () => {
  const routePoint = routePoints[routePointIndex];
  const payload = {
    lat: Number(routePoint.lat.toFixed(5)),
    lng: Number(routePoint.lng.toFixed(5)),
    status: "active",
  };

  routePointIndex = (routePointIndex + 1) % routePoints.length;

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
    publishNextRoutePoint();
    publishInterval = setInterval(
      publishNextRoutePoint,
      UPDATE_INTERVAL_MS,
    );
  }
});

// ดักจับ Error กรณีเชื่อมต่อไม่สำเร็จหรือมีปัญหาเครือข่าย
client.on("error", (error) => {
  console.error("⚠️ MQTT Connection Error:", error);
});
