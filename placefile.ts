export class Vec2 {
    public point: [number, number];
    public get x(): number {
        return this.point[0];
    }
    public set x(v: number) {
        this.point[0] = v;
    }
    public get y(): number {
        return this.point[1];
    }
    public set y(v: number) {
        this.point[1] = v;
    }
    constructor();
    constructor(x: number, y: number);
    constructor(x = 0, y = 0) {
        this.point = [x, y];
    }
    public toString(): string {
        return `${this.x},${this.y}`;
    }
    public add(b: Vec2): this {
        this.x += b.x;
        this.y += b.y;
        return this;
    }
    public sub(b: Vec2): this {
        this.x -= b.x;
        this.y -= b.y;
        return this;
    }
    public length(): number {
        return Math.abs(Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2)));
    }
}

export const COLOR_TABLE: {[key: string]: [number, number, number]} = {
    "Tornado Warning": [255, 0, 0],
    "Severe Thunderstorm Warning": [255, 255, 0],
    "Flood Warning": [0, 255, 0],
    "Special Weather Statement": [255, 255, 204],
};

export type IPlacefileOptions = {
    title: string;
    threshold: number;
    refreshMs: number;
    defaultColor?: [number, number, number];
    geometry: Array<Line | Polygon>;
}

export function exportPlacefile(opts: IPlacefileOptions): string {
    const lines: string[] = [];
    const refresh_total_sec = opts.refreshMs / 1000;
    const refresh_mins = Math.floor(refresh_total_sec / 60);
    const refresh_secs = ((refresh_total_sec / 60) % refresh_mins) * 60;

    lines.push(`Title: ${opts.title}`);
    if (refresh_mins > 0) lines.push(`Refresh: ${refresh_mins}`);
    if (refresh_secs > 0) lines.push(`RefreshSeconds: ${refresh_secs}`);
    if (opts.threshold > 0) lines.push(`Threshold: ${opts.threshold}`);
    if (opts.defaultColor != undefined) lines.push(`Color: ${opts.defaultColor.join(" ")}`);

    for (const geo of opts.geometry) {
        if (geo.type == "Line") {
            if (geo.color != undefined) lines.push(`Color: ${geo.color.join(" ")}`);
            else if (opts.defaultColor != undefined) lines.push(`Color: ${opts.defaultColor.join(" ")}`);
            lines.push(`Line: ${geo.width}, 0${geo.hoverText != undefined ? `, "${geo.hoverText.replace(/\n/g, "\\n")}"` : ""}`);
            lines.push(...geo.points.map(p => p.toString()));
            lines.push("End:");
        } else if (geo.type == "Polygon") {
            lines.push(`Polygon: ${geo.points[0].toString()}, ${geo.color.map(v => `${v}`).join(', ')}`);
            lines.push(...geo.points.map(p => p.toString()));
            lines.push("End:");
        }
    }
    return lines.join('\n');
}

export type IPlaceGeometryBase = {
    type: "Line" | "Object" | "Polygon" | "Triangle";
}

export type IPlaceLine = {
    type: "Line";
    color?: [number, number, number];
    width: number;
    hoverText?: string;
    points: Vec2[];
}

export type IPlacePolygon = {
    type: "Polygon";
    color: [number, number, number, number];
    points: Vec2[];
}

export function rgbToRGBA(rgb: [number, number, number], alpha: number): [number, number, number, number] {
    return [...rgb, alpha];
}

export type Line = IPlaceLine & IPlaceGeometryBase;
export type Polygon = IPlacePolygon & IPlaceGeometryBase;
