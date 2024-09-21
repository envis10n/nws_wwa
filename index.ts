import axios, { Axios } from "axios";
import Koa from "koa";
import fs from "fs/promises";
import {
    exportPlacefile,
    type Line,
    type Polygon,
    type IPlacefileOptions,
    Vec2,
    COLOR_TABLE,
} from "./placefile";

interface IFeature {
    type: "Feature";
    geometry: {
        type: string;
        coordinates: Array<Array<[number, number]>>;
    };
    properties: {
        status: "Draft" | "Test" | "System" | "Exercise" | "Actual";
        areaDesc: string;
        messageType: "Alert" | "Update" | "Cancel";
        sent: string;
        effective: string;
        onset: string;
        expires: string;
        ends: string;
        category: string;
        severity: "Unknown" | "Minor" | "Moderate" | "Severe" | "Extreme";
        certainty: "Unknown" | "Unlikely" | "Possible" | "Likely" | "Observed";
        urgency: "Unknown" | "Past" | "Future" | "Expected" | "Immediate";
        event:
            | "Tornado Warning"
            | "Severe Thunderstorm Warning"
            | "Tornado Watch"
            | "Severe Thunderstorm Watch"
            | "Special Weather Statement";
        instruction: string;
        NWSheadline: string[];
        eventEndingTime: string[];
        description: string;
        headline: string;
    };
    [key: string]: any;
}

const request = axios.create({
    baseURL: "https://api.weather.gov",
    headers: {
        Accept: "application/geo+json",
        "User-Agent": "(wx.envis10n.dev, envis10n+wx@envis10n.dev)",
    },
});

let last_cache = 0;
let last_write = 0;
let is_locked = false;

let alerts = (await fs.exists("alerts.json"))
    ? JSON.parse(await fs.readFile("alerts.json", { encoding: "utf-8" }))
    : {};

function buildPlacefile(opt: Partial<IPlacefileOptions> = {}): string {
    const defaultOpts: IPlacefileOptions = {
        title: `NWS Active Warnings ${new Date().toISOString()}`,
        refreshMs: 3 * 60000,
        threshold: 999,
        geometry: [],
    };

    const opts = Object.assign(defaultOpts, opt);

    if (Object.keys(alerts).length == 0) return "";
    const features: IFeature[] = alerts.features;

    for (const feature of features.filter((f) => f.geometry != null)) {
        // build polygons
        const avg = new Vec2();
        const coords = feature.geometry.coordinates
            .flat(1)
            .map(([lon, lat]) => {
                const v = new Vec2(lat, lon);
                avg.add(v);
                return v;
            });
        const centroid = `${avg.x / coords.length},${avg.y / coords.length}`;
        let color = COLOR_TABLE[feature.properties.event];
        let width = 4;
        if (
            feature.properties.event.startsWith("Tornado") &&
            feature.properties.certainty == "Observed" &&
            feature.properties.description.includes("confirmed tornado")
        )
            width = 8;
        if (
            /particularly dangerous situation|large and extremely dangerous/i.test(
                feature.properties.description
            )
        )
            color = [255, 0, 100];
        else if (feature.properties.description.includes("TORNADO EMERGENCY"))
            color = [255, 0 , 255];
        if (color == undefined) color = [255, 255, 255];
        const line: Line = {
            type: "Line",
            hoverText: `${feature.properties.headline}\n\n${feature.properties.description}`,
            width,
            color,
            points: coords,
        };
        opts.geometry.push(line);
    }
    return exportPlacefile(opts);
}

let placefile = buildPlacefile();

async function loop(opts?: Partial<IPlacefileOptions>) {
    try {
        const res = await request.get(
            "/alerts/active?event=Severe%20Thunderstorm%20Warning,Tornado%20Warning,Flood%20Warning,Special%20Weather%20Statement",
            { responseType: "json" }
        );
        const json = res.data;
        alerts = JSON.parse(JSON.stringify(json));
        await fs.writeFile("alerts.json", JSON.stringify(alerts));
        placefile = buildPlacefile(opts);
    } catch (e) {
        console.error("ERROR GETTING ALERTS:", e);
        process.exit(1);
    }
}

if (process.env["NODE_ENV"] == "development") {
    setInterval(() => {
        if (is_locked) return;
        if (Date.now() < last_cache) return;
        is_locked = true;
        (async () => {
            await loop({
                refreshMs: 60000,
            });
            await fs.writeFile("placefile.pl", placefile);
            console.log("Updated placefile.");
        })().then(() => {
            last_write = Date.now();
            last_cache = last_write + 60000;
            is_locked = false;
        });
    }, 0);
    console.log("Getting latest NWS data...");
    console.log("Updating placefile.pl every 1 minute.");
} else {
    const app = new Koa();

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

    app.use(async (ctx) => {
        const ts = Date.now();
        if (placefile == "") ctx.status = 300;
        else {
            ctx.body = placefile;
            ctx.status = 200;
        }
    });

    app.listen(3525);

    console.log("Listening...");
}
