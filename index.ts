import axios, { Axios } from "axios";
import Koa from "koa";
import fs from "fs/promises";
import { exportPlacefile, type Line, type Polygon, type IPlacefileOptions, Vec2, COLOR_TABLE } from "./placefile";

const app = new Koa();

interface IFeature {
    type: "Feature";
    geometry: {
        type: string;
        coordinates: Array<Array<[number, number]>>;
    }
    properties: {
        status: "Draft" | "Test" | "System" | "Exercise" | "Actual";
        areaDesc: string;
        messageType: "Alert" | "Update" | "Cancel"
        sent: string;
        effective: string;
        onset: string;
        expires: string;
        ends: string;
        category: string;
        severity: "Unknown" | "Minor" | "Moderate" | "Severe" | "Extreme";
        certainty: "Unknown" | "Unlikely" | "Possible" | "Likely" | "Observed";
        urgency: "Unknown" | "Past" | "Future" | "Expected" | "Immediate";
        event: "Tornado Warning" | "Severe Thunderstorm Warning" | "Tornado Emergency" | "Tornado Watch" | "Severe Thunderstorm Watch" | "Special Weather Statement";
        instruction: string;
        NWSheadline: string[];
        eventEndingTime: string[];
        description: string;
        headline: string;
    }
    [key: string]: any;
}

const request = axios.create({
    baseURL: "https://api.weather.gov",
    headers: {
        "Accept": "application/geo+json",
        "User-Agent": "(wx.envis10n.dev, envis10n+wx@envis10n.dev)"
    }
});

let last_cache = 0;
let last_write = 0;
let is_locked = false;

let alerts = (await fs.exists("alerts.json") ? JSON.parse(await fs.readFile("alerts.json", {encoding: "utf-8"})) : {});

function buildPlacefile(): string {
    if (Object.keys(alerts).length == 0) return "";
    const features: IFeature[] = alerts.features;

    const opts: IPlacefileOptions = {
        title: `NWS Active Warnings ${(new Date()).toISOString()}`,
        refreshMs: 8 * 60 * 1000,
        threshold: 999,
        geometry: [],
    }

    for (const feature of features.filter((f) => f.geometry != null)) {
        // build polygons
        const avg = new Vec2();
        const coords = feature.geometry.coordinates.flat(1).map(([lon, lat]) => {
            const v = new Vec2(lat,lon);
            avg.add(v);
            return v;
        });
        const centroid = `${avg.x / coords.length},${avg.y / coords.length}`;
        let color = COLOR_TABLE[feature.properties.event];
        let width = 4;
        if (feature.properties.event.startsWith("Tornado") && feature.properties.certainty == "Observed") width = 8;
        if (color == undefined) color = [255, 255, 255];
        const line: Line = {
            type: "Line",
            hoverText: `${feature.properties.headline}\n\n${feature.properties.description}`,
            width,
            color,
            points: coords
        }
        opts.geometry.push(line);
    }
    return exportPlacefile(opts);
}

let placefile = buildPlacefile();

async function loop() {
    try {
        const res = await request.get("/alerts/active?event=Severe%20Thunderstorm%20Warning,Tornado%20Warning,Flood%20Warning,Special%20Weather%20Statement", {responseType: "json"});
        const json = res.data;
        alerts = JSON.parse(JSON.stringify(json));
        await fs.writeFile("alerts.json", JSON.stringify(alerts));
        placefile = buildPlacefile();
    } catch (e) {
        console.error("ERROR GETTING ALERTS:", e);
        process.exit(1);
    }
}

setInterval(() => {
    if (is_locked) return;
    if (Date.now() < last_cache) return;
    is_locked = true;
    loop().then(() => {
        last_write = Date.now();
        last_cache = last_write + 3 * 60 * 1000;
        is_locked = false;
    });
}, 0);

app.use(async ctx => {
    const ts = Date.now();
    if (placefile == "") ctx.status = 300;
    else {
        ctx.body = placefile;
        ctx.status = 200;
    }
});

app.listen(3525);

console.log("Listening...");