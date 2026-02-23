/**
 * Geographic utility functions for FruFresco Logistics.
 * Includes Ray-casting algorithm for polygon inclusion.
 */

export interface Point {
    lat: number;
    lng: number;
}

/**
 * Checks if a point (lat, lng) is inside a polygon defined by an array of points.
 * Uses the Ray-casting algorithm.
 * 
 * @param point The point to check {lat, lng}
 * @param polygon Array of points defining the polygon vertices
 * @param graceMarginMeters Optional buffer in meters (approximate)
 */
export function isInsidePolygon(point: Point, polygon: Point[], graceMarginMeters: number = 300): boolean {
    if (polygon.length < 3) return false;

    // 1. Ray Casting Algorithm
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lng;
        const xj = polygon[j].lat, yj = polygon[j].lng;

        const intersect = ((yi > point.lng) !== (yj > point.lng))
            && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
            
        if (intersect) inside = !inside;
    }

    if (inside) return true;

    // 2. Optional: 300m Grace Margin
    // We check if the point is within ~300m of the NEAREST segment of the polygon.
    // 0.001 degrees lat/lng is roughly 111m. 300m is ~0.0027 degrees.
    if (graceMarginMeters > 0) {
        const threshold = graceMarginMeters / 111111; // Very rough approximation for Bogota
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const distance = distanceToSegment(point, polygon[i], polygon[j]);
            if (distance < threshold) return true;
        }
    }

    return false;
}

/**
 * Calculates the shortest distance between a point and a line segment.
 */
function distanceToSegment(p: Point, a: Point, b: Point): number {
    const x = p.lat, y = p.lng, x1 = a.lat, y1 = a.lng, x2 = b.lat, y2 = b.lng;
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
    let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((x - (x1 + t * (x2 - x1))) ** 2 + (y - (y1 + t * (y2 - y1))) ** 2);
}
