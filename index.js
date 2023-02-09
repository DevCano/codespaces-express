//  Mercator
const SphericalMercator = require('@mapbox/sphericalmercator');
const mercator = new SphericalMercator({size: 256});
// Cors
const cors = require('cors');
// http server
const express = require('express');
// ENV
require('dotenv').config();

const app = express();
// middleware cors
app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,POST,DELETE',
  allowedHeaders:
    'Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With',
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));
const token = process.env.API_KEY_VT;

// middleware Cach
app.use((req,res, next) => {
  const cacheTime = 60*60*24; // 60 segundos * 60 minutos * 24 horas = 1 día
  res.set({
    'Cache-Control': `max-age=${cacheTime}`
  });
  next();
});

// database library
const { Pool } = require('pg')
const db = new Pool({
  host: process.env.HOSTDEV,
  port: 5432,
  user: 'postgres',
  password: process.env.PASSDEV,
  database: process.env.DBNAMEDEV,
});
db.connect((err) => {
  if (err) throw err;
  console.log("Connected!");
});

//<---------HOME------------>
app.get('/', async (req,res) => {
  res.status(200);
  res.json({
    path: req.originalUrl,
    date: new Date(),
    message: 'OK', 
  });
});

//<----------------------VECTOR-TILES----------------------->
app.get(`/tiles/polygons/:z/:x/:y.pbf/:token/:cropTypeId`, async (req, res) => {
  const layerName = 'Polygons';
  const cropTypeId = req.params.cropTypeId;
  if(!cropTypeId) {
    const status = 400;
    return res.status(status).json({
      path: req.originalUrl,
      date: new Date(),
      error: 'The id of the crop type is invalid',
    });
  }
  const bbox = mercator.bbox(req.params.x, req.params.y, req.params.z, false);
  const query = `
      SELECT ST_AsMVT(q, '${layerName}', 4096, 'geom') FROM (
        SELECT 
        P.id,
        P.name,
        ( st_area ( poligon :: geography ) / 10000 ) AS area,
        species_dictionary."id" as specie_id,
        species_dictionary."name" as specie_name,
            ST_AsMVTGeom(
            poligon,
            ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326),
            4096,
            256,
            true
          ) geom FROM plot P
          INNER JOIN crop ON P."id" = crop."plotId"
          INNER JOIN variety_types_dictionary ON crop."varietyTypeId" = variety_types_dictionary."id"
          INNER JOIN species_dictionary ON variety_types_dictionary."specieId" = species_dictionary."id"
          ${cropTypeId != '-' ? `WHERE species_dictionary."id" = ${cropTypeId}`: ''}
        ) q
    `;
  try {
    const tiles = await db.query(query);
    const tile = tiles.rows[0];
    res.setHeader('Content-Type', 'application/x-protobuf');
    if (tile.st_asmvt.length === 0) {
      res.status(204);
    }
    res.status(200);
    res.send(tile.st_asmvt);
  } catch (err) {
    console.log(err);
    const status = err.status || 500;
    res.status(status).json({
      path: req.originalUrl,
      date: new Date(),
      error: err.message,
    });
  }
});

// <----------------VECTOR-TYLES-STATES--------------------->
app.get(`/tiles/states/:z/:x/:y.pbf:token=${token}`, async (req, res) => {
  const layerName = 'States';
  const bbox = mercator.bbox(req.params.x, req.params.y, req.params.z, false);
  const query = `
      SELECT ST_AsMVT(q, '${layerName}', 4096, 'geom') FROM (
        SELECT 
        R.region_id,
        R.description_native,
            ST_AsMVTGeom(
            geom,
            ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326),
            4096,
            256,
            true
          ) geom FROM regions R WHERE R.region_id LIKE '%AGMXST%'
	    ) q
    `;
  try {
    const tiles = await db.query(query);
    const tile = tiles.rows[0];
    res.setHeader('Content-Type', 'application/x-protobuf');
    if (tile.st_asmvt.length === 0) {
      res.status(204);
    }
    res.status(200);
    res.send(tile.st_asmvt);
  } catch (err) {
    console.log(err);
    const status = err.status || 500;
    res.status(status).json({
      path: req.originalUrl,
      date: new Date(),
      error: err.message,
    });
  }
});

// <---------VECTOR-TYLES-REGIONS-BY-STATE------------------>
app.get(`/tiles/regions/:z/:x/:y.pbf:token=${token}`, async (req, res) => {
  const layerName = 'Regions';
  const bbox = mercator.bbox(req.params.x, req.params.y, req.params.z, false);
  const query = `
      SELECT ST_AsMVT(q, '${layerName}', 4096, 'geom') FROM (
        SELECT 
        R.region_id,
        R.description_native,
            ST_AsMVTGeom(
            geom,
            ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326),
            4096,
            256,
            true
          ) geom FROM regions R WHERE R.region_id LIKE '%MX16%'
	    ) q
    `;
  try {
    const tiles = await db.query(query);
    const tile = tiles.rows[0];
    res.setHeader('Content-Type', 'application/x-protobuf');
    if (tile.st_asmvt.length === 0) {
      res.status(204);
    }
    res.status(200);
    res.send(tile.st_asmvt);
  } catch (err) {
    console.log(err);
    const status = err.status || 500;
    res.status(status).json({
      path: req.originalUrl,
      date: new Date(),
      error: err.message,
    });
  }
});

// <----------------GET-VECTOR-TYLES-CROPS------------------>
app.get(`/tiles/crops/:z/:x/:y.pbf/:token/:stateId/:cropType`, async (req, res) => {
  const layerName = 'Crops';
  const cropTypeId = req.params.cropType;
  if(!cropTypeId) {
    const status = 400;
    return res.status(status).json({
      path: req.originalUrl,
      date: new Date(),
      error: 'The id of the crop type is invalid',
    });
  }
  const stateId = req.params.stateId;
  if(!stateId) {
    const status = 400;
    return res.status(status).json({
      path: req.originalUrl,
      date: new Date(),
      error: 'The id of the state is invalid',
    });
  }
  const bbox = mercator.bbox(req.params.x, req.params.y, req.params.z, false);
  const query = `
    SELECT ST_AsMVT(q, '${layerName}', 4096, 'geom') FROM (
      SELECT 
      P.id,
      P.name,
      ( st_area ( poligon :: geography ) / 10000 ) AS area,
      species_dictionary."id" as specie_id,
      species_dictionary."name" as specie_name,
          ST_AsMVTGeom(
          poligon,
          ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326),
          4096,
          256,
          true
        ) geom FROM plot P
        INNER JOIN crop ON P."id" = crop."plotId"
        INNER JOIN variety_types_dictionary ON crop."varietyTypeId" = variety_types_dictionary."id"
        INNER JOIN species_dictionary ON variety_types_dictionary."specieId" = species_dictionary."id"
        WHERE ST_Intersects(poligon, (SELECT r.geom FROM regions r WHERE r.region_id = '${stateId}'))
        ${cropTypeId != '-' ? `AND species_dictionary."id" = ${cropTypeId}`: ''}
      ) q 
    `;
  try {
    const tiles = await db.query(query);
    const tile = tiles.rows[0];
    res.setHeader('Content-Type', 'application/x-protobuf');
    if (tile.st_asmvt.length === 0) {
      res.status(204);
    }
    res.status(200);
    res.send(tile.st_asmvt);
  } catch (err) {
    console.log(err);
    const status = err.status || 500;
    res.status(status).json({
      path: req.originalUrl,
      date: new Date(),
      error: err.message,
    });
  }
});



//<------------NOT-FOUND-URL------------>
app.get('*', (req,res) => {
  res.status(404)
  res.json({
    path: req.originalUrl,
    date: new Date(),
    error: `Cannot ${req.originalUrl}`
  });
});
app.listen(process.env.PORT || 5000);
