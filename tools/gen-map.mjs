import { geoNaturalEarth1, geoPath } from "d3-geo";
import { merge, mesh } from "topojson-client";
import { presimplify, simplify } from "topojson-simplify";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const worldRaw = require("world-atlas/countries-110m.json");

const W = 1600, H = 885, LAND_BOTTOM = 742;

const world = simplify(presimplify(worldRaw), 0.06);
const geometries = world.objects.countries.geometries.filter(g => g.id !== "010");
const landGeo = merge(world, geometries);

const projection = geoNaturalEarth1().fitExtent([[20, 24], [W - 20, LAND_BOTTOM]], landGeo);
const path = geoPath(projection);
const round = s => s.replace(/\d+\.\d+/g, m => (+m).toFixed(1));

const land    = round(path(landGeo));
const borders = round(path(mesh(world, { type: "GeometryCollection", geometries }, (a, b) => a !== b)));

console.log('land    :', land.length.toLocaleString(), 'chars');
console.log('borders :', borders.length.toLocaleString(), 'chars');
console.log('total   :', (land.length + borders.length).toLocaleString(), 'chars');
const PL = { US:[-98.5,39.8], GB:[-2.0,54.0], CA:[-106.0,56.0], IN:[78.9,21.0], AU:[134.0,-25.3] };
for (const [k,v] of Object.entries(PL)) {
  const p = projection(v);
  console.log('  %s -> x=%s y=%s   (%s%%, %s%%)', k, p[0].toFixed(1), p[1].toFixed(1),
    (p[0]/W*100).toFixed(2), (p[1]/H*100).toFixed(2));
}
