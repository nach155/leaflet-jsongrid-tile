FROM python:3.8-slim-buster

RUN apt update && apt upgrade -y
RUN pip install -U pip && pip install setuptools vt2geojson fastapi "uvicorn[standard]"
COPY . /data
WORKDIR /data
ENTRYPOINT [ "uvicorn" , "tile_server:app"]