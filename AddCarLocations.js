import mqtt from "mqtt";
import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const mqttUrl =
  process.env.MQTT_URL ??
  "mqtts://ec9b13175461426b948434e7e60198a7.s1.eu.hivemq.cloud";
const legacyUsername = process.env.MQTT_USERNAME;
const legacyPassword = process.env.MQTT_PASSWORD;

const topicPrefix = process.env.MQTT_TOPIC_PREFIX ?? "cars";
const carIds = (process.env.CAR_IDS ?? "")
  .split(",")
  .map((carId) => carId.trim())
  .filter(Boolean);

if (carIds.length === 0) {
  console.error("Missing CAR_IDS. Add comma-separated car IDs to .env.local.");
  process.exit(1);
}

const getCarCredentials = (carId) => {
  const carNumber = carIds.indexOf(carId) + 1;
  const username =
    process.env[`CAR_${carNumber}_MQTT_USERNAME`] ?? legacyUsername;
  const password =
    process.env[`CAR_${carNumber}_MQTT_PASSWORD`] ?? legacyPassword;

  if (!username || !password) {
    console.error(
      `Missing credentials for ${carId}. Add CAR_${carNumber}_MQTT_USERNAME and CAR_${carNumber}_MQTT_PASSWORD to .env.local.`,
    );
    process.exit(1);
  }

  return { username, password };
};

const defaultRouteFileName =
  process.env.ROUTE_FILE ??
  (existsSync(new URL("./route.geojson", import.meta.url))
    ? "route.geojson"
    : "route2.geojson");
const routeFileByCarId = new Map();
const routeAssignments = (process.env.CAR_ROUTES ?? "")
  .split(",")
  .map((assignment) => assignment.trim())
  .filter(Boolean);

for (const assignment of routeAssignments) {
  const separatorIndex = assignment.indexOf("=");
  if (separatorIndex <= 0 || separatorIndex === assignment.length - 1) {
    console.error(
      "CAR_ROUTES ต้องอยู่ในรูปแบบ car-id=route.geojson,car-id-2=route2.geojson",
    );
    process.exit(1);
  }

  const carId = assignment.slice(0, separatorIndex).trim();
  const routeFileName = assignment.slice(separatorIndex + 1).trim();

  if (!carIds.includes(carId)) {
    console.error(`CAR_ROUTES มี car ID ที่ไม่ได้อยู่ใน CAR_IDS: ${carId}`);
    process.exit(1);
  }

  if (routeFileByCarId.has(carId)) {
    console.error(`กำหนดเส้นทางซ้ำสำหรับ car ID: ${carId}`);
    process.exit(1);
  }

  routeFileByCarId.set(carId, routeFileName);
}

if (carIds.some((carId) => /[\\/\s]/.test(carId))) {
  console.error("CAR_IDS ต้องไม่มีช่องว่างหรือเครื่องหมาย / และ \\ ");
  process.exit(1);
}

const readline = createInterface({ input, output });

const chooseCarIds = async () => {
  console.log("รถที่กำหนดไว้:");
  carIds.forEach((carId, index) => {
    console.log(`${index + 1}. ${carId}`);
  });

  while (true) {
    const answer = (await readline.question(
      "เลือกหมายเลขรถ, พิมพ์ car ID โดยตรง หรือพิมพ์ all เพื่อส่งทุกคัน: ",
    ))
      .trim()
      .toLowerCase();

    if (answer === "all") {
      return carIds;
    }

    const selectedIndex = Number(answer);
    if (
      Number.isInteger(selectedIndex) &&
      selectedIndex >= 1 &&
      selectedIndex <= carIds.length
    ) {
      return [carIds[selectedIndex - 1]];
    }

    const selectedCarId = carIds.find(
      (carId) => carId.toLowerCase() === answer,
    );
    if (selectedCarId) {
      return [selectedCarId];
    }

    console.log("เลือกไม่ถูกต้อง กรุณาเลือกหมายเลขรถ หรือพิมพ์ all");
  }
};

const selectedCarIds = await chooseCarIds();
readline.close();

const isValidCoordinate = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;

const COORDINATE_EPSILON = 0.00001;
const isSameCoordinate = (first, second) =>
  Math.abs(first.lat - second.lat) < COORDINATE_EPSILON &&
  Math.abs(first.lng - second.lng) < COORDINATE_EPSILON;

const loadLocations = (routeFileName) => {
  const routeFileUrl = new URL(`./${routeFileName}`, import.meta.url);
  let geoJson;

  try {
    geoJson = JSON.parse(readFileSync(routeFileUrl, "utf8"));
  } catch (error) {
    console.error(`ไม่สามารถอ่าน ${routeFileName} ได้:`, error.message);
    process.exit(1);
  }

  const geometry =
    geoJson.type === "FeatureCollection"
      ? geoJson.features?.find((feature) => feature.geometry)?.geometry
      : geoJson.geometry;

  if (!geometry || geometry.type !== "LineString") {
    console.error(`${routeFileName} ต้องมี geometry.type เป็น LineString`);
    process.exit(1);
  }

  const rawLocations = geometry.coordinates.map((coordinate, index) => {
    const [lng, lat] = coordinate;
    const numericLat = Number(lat);
    const numericLng = Number(lng);

    if (
      !isValidCoordinate(numericLat, -90, 90) ||
      !isValidCoordinate(numericLng, -180, 180)
    ) {
      console.error(`พิกัดใน ${routeFileName} จุดที่ ${index + 1} ไม่ถูกต้อง`);
      process.exit(1);
    }

    return { lat: numericLat, lng: numericLng };
  });

  // ถ้าไฟล์ปิดเส้นทางด้วยการใส่จุดเริ่มต้นซ้ำ ให้ตัดจุดซ้ำออกก่อนสร้างรอบกลับ
  const locations =
    rawLocations.length > 1 &&
    isSameCoordinate(rawLocations[0], rawLocations[rawLocations.length - 1])
      ? rawLocations.slice(0, -1)
      : rawLocations;

  if (locations.length < 2) {
    console.error(`${routeFileName} ต้องมีพิกัดอย่างน้อย 2 จุด`);
    process.exit(1);
  }

  return locations;
};

const UPDATE_INTERVAL_MS = 1000;
const SIMULATED_SPEED_KMH = 70;
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

const buildRoutePoints = (locations) => {
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

const selectedRouteFileByCarId = new Map(
  selectedCarIds.map((carId) => [
    carId,
    routeFileByCarId.get(carId) ?? defaultRouteFileName,
  ]),
);
const routePointsByCarId = new Map(
  selectedCarIds.map((carId) => {
    const routeFileName = selectedRouteFileByCarId.get(carId);
    return [carId, buildRoutePoints(loadLocations(routeFileName))];
  }),
);

let publishInterval;
const routePointIndexes = new Map(
  selectedCarIds.map((carId) => [carId, 0]),
);
const mqttClientsByCarId = new Map();
const connectedCarIds = new Set();

const publishNextRoutePoint = () => {
  for (const carId of selectedCarIds) {
    const client = mqttClientsByCarId.get(carId);
    if (!client?.connected) {
      continue;
    }

    const routePoints = routePointsByCarId.get(carId);
    const routePointIndex = routePointIndexes.get(carId);
    const routePoint = routePoints[routePointIndex];
    const payload = {
      lat: Number(routePoint.lat.toFixed(5)),
      lng: Number(routePoint.lng.toFixed(5)),
      status: "active",
    };

    routePointIndexes.set(
      carId,
      (routePointIndex + 1) % routePoints.length,
    );

    const topic = `${topicPrefix}/${carId}`;

    // แปลง Object เป็น JSON string ก่อนส่ง
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        console.error(`❌ Publish error for ${carId}:`, err);
      } else {
        console.log(`📤 Published to ${topic}:`, payload);
      }
    });
  }
};

const startPublishingWhenReady = () => {
  if (
    connectedCarIds.size === selectedCarIds.length &&
    !publishInterval
  ) {
    console.log(
      `✅ Connected to HiveMQ Cloud. Sending to: ${selectedCarIds
        .map((carId) => `${carId} (${selectedRouteFileByCarId.get(carId)})`)
        .join(", ")}`,
    );

    // ส่งจุดแรกทันที แล้วเปลี่ยนจุดตามช่วงเวลาที่กำหนด
    publishNextRoutePoint();
    publishInterval = setInterval(
      publishNextRoutePoint,
      UPDATE_INTERVAL_MS,
    );
  }
};

for (const carId of selectedCarIds) {
  const credentials = getCarCredentials(carId);
  const client = mqtt.connect(mqttUrl, {
    username: credentials.username,
    password: credentials.password,
    port: 8883, // mqtts ปกติใช้พอร์ต 8883
  });

  mqttClientsByCarId.set(carId, client);

  client.on("connect", () => {
    connectedCarIds.add(carId);
    console.log(`🔌 MQTT connected for ${carId}`);
    startPublishingWhenReady();
  });

  client.on("close", () => {
    connectedCarIds.delete(carId);
  });

  // ดักจับ Error แยกตามรถ เพื่อรู้ว่า credential ของคันใดมีปัญหา
  client.on("error", (error) => {
    console.error(`⚠️ MQTT Connection Error for ${carId}:`, error.message);
  });
}
