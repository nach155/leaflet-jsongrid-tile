from vt2geojson.tools import vt_bytes_to_geojson
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import gzip, io
app = FastAPI()
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
mbtiles = sqlite3.connect("prefectures.mbtiles",check_same_thread=False)

@app.get("/")
async def index():
    return {"hello":"world"}

@app.get("/tile/{z}/{x}/{y}.json")
async def tile(z:int,x:int,y:int):
    tms_y = (2**z) -y -1
    result = mbtiles.execute("SELECT * FROM tiles WHERE zoom_level=? and tile_column=? and tile_row=?",(z,x,tms_y)).fetchone()
    if result is not None:
        zipped_blob = result[3]
        zipped_io = io.BytesIO(zipped_blob)
        with gzip.open(zipped_io,"rb") as zipped_pbf:
            pbf = zipped_pbf.read()
        geojson = vt_bytes_to_geojson(pbf,x,y,z)
        print("found")
        return JSONResponse(content=geojson,)
    else:
        return Response()
############################# 
if __name__ == "__main__":
    z = 9
    x = 450
    y = 198
    tms_y = (2**z)-y-1
    result = mbtiles.execute("SELECT * FROM tiles WHERE zoom_level=? and tile_column=? and tile_row=?",(z,x,tms_y)).fetchone()
    zipped_blob = result[3]
    zipped_io = io.BytesIO(zipped_blob)
    with gzip.open(zipped_io,"rb") as zipped_pbf:
        pbf = zipped_pbf.read()
    geojson = vt_bytes_to_geojson(pbf,x,y,z)
    print(geojson)