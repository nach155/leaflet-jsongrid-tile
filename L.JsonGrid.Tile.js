L.JsonGridTile = L.GridLayer.extend({
    options:{
        interactive: false,
        geojsonLayerStyles:{},
        getFeatureId: undefined,
        fetchOptions:{},
        subdomains: 'abc',
    },
    initialize: function(url,options){
        L.setOptions(this,options);
        L.GridLayer.prototype.initialize.apply(this,arguments);
        this._url = url;
        if(this.options.getFeatureId){
            this._geojsonTiles = {};
            this._overriddenStyles = {};
            this.on('tileunload',function(e){
                let key = this._tileCoordsToKey(e.coords);
                let tile = this;_geojsonTiles[key];
                if(tile && this._map){
                    tile.removeFrom(this._map);
                }
            });
        }
        this._dataLayerNames = {};
    },

    setUrl: function(url, noRedraw){
        this._url = url;
        if(!noRedraw){
            this.redraw();
        }
        return this;
    },

    _getSubdomain: L.TileLayer.prototype._getSubdomain,

	_isCurrentTile : function(coords, tileBounds=undefined) {

		if (!this._map) {
			return true;
		}

		let zoom = this._map._animatingZoom ? this._map._animateToZoom : this._map._zoom;
		let currentZoom = zoom === coords.z;

		tileBounds = this._tileCoordsToBounds(coords);
		let currentBounds = this._map.getBounds().overlaps(tileBounds); 

		return currentZoom && currentBounds;

	},

	_getGeojsonTilePromise: function(coords, tileBounds) {
		let data = {
			s: this._getSubdomain(coords),
			x: coords.x,
			y: coords.y,
			z: coords.z
			// z: this._getZoomForUrl()	/// TODO: Maybe replicate TileLayer's maxNativeZoom
		};
		if (this._map && !this._map.options.crs.infinite) {
			let invertedY = this._globalTileRange.max.y - coords.y;
			if (this.options.tms) { // Should this option be available in Leaflet.VectorGrid?
				data['y'] = invertedY;
			}
			data['-y'] = invertedY;
		}

		if (!this._isCurrentTile(coords, tileBounds)) {
			return Promise.resolve({layers:[]});
		}

		let tileUrl = L.Util.template(this._url, L.extend(data, this.options));

		return fetch(tileUrl, this.options.fetchOptions).then(function(response){
			if (!response.ok || ! this._isCurrentTile(coords)) {
				return {layers:[]};
			} 

			return response.json().then( function (json) {
				// Normalize feature getters into actual instanced features
                for (let layerName in json.layers) {
                    let feats = [];

                    for (let i=0; i<json.layers[layerName].length; i++) {
                        let feat = json.layers[layerName].feature(i);
                        feat.geometry = feat.loadGeometry();
                        feats.push(feat);
                    }
                    json.layers[layerName].features = feats;
                }
                return json;
            });

		}.bind(this));
	},

    createTile: function(coords, done){
        let storeFeatures = this.options.getFeatureId;
        let tileSize = this.getTileSize();
        let renderer = L.svg.tile(coords,tileSize,this.options);

        let tileBounds = this._tileCoordsToBounds(coords);
        let geojsonTilePromise = this._getGeojsonTilePromise(coords, tileBounds);

        if(storeFeatures){
            this._geojsonTiles[this._tileCoordsToKey(coords)] = renderer;
            renderer._features = {};
        }

        geojsonTilePromise.then(function renderTile(geojsonTile){
            if(geojsonTile.layers && geojsonTile.layers.length !== 0){
                for(let layerName in geojsonTile.layers){
                    this._dataLayerNames[layerName] = true;

                    let pxPerExtent = this.getTileSize().divideBy(layer.extent);
                    let layerStyle = this.options.geojsonLayerStyles[layerName] || L.Path.prototype.options;
                    
                    for(let i = 0; i < layer.features.length; i++){
                        let feat = layer.features[i];
                        let id;
                        if(this.options.filter instanceof Function && !this.options.filter(feat.properitles, coords.z)){
                            continue;
                        }
                        let styleOptions = layerStyle;
                        if(storeFeatures){
                            id = this.options.getFeatureId(feat);
                            let styleOverride = this._overriddenStyles[id];
                            if(styleOverride){
                                if(styleOverride[layerName]){
                                    styleOptions = styleOverride[layerName];
                                }else{
                                    styleOptions = styleOverride;
                                }
                            }
                        }

                        if(styleOptions instanceof Function){
                            styleOptions = styleOptions(feat.properitles, coords.z);
                        }

                        if(!(styleOptions instanceof Array)){
                            styleOptions = [styleOptions];
                        }

                        if(!styleOptions.length){
                            continue;
                        }

                        let featureLayer = this._createLayer(feat,pxPerExtent);

                        for(let j=0;j<styleOptions.length;j++){
                            let style = L.extend({},L.Path.prototype.options,styleOptions[j]);
                            featureLayer.renderer(renderer,style);
                            renderer._addPath(featureLayer);
                        }

                        if(this.options.interactive){
                            featureLayer.makeInteractive();
                        }

                        if(storeFeatures){
                            if(!renderer_features[id]){
                                renderer._features[id] = [];
                            }
                            renderer._features[id].push({
                                layerName: layerName,
                                feature: featureLayer,
                            });
                        }
                    }
                }
            }
            if(this._map != null){
                renderer.addTo(this._map);
            }

            L.Util.requestAnimFrame(done.bind(coords,null,null));
        }.bind(this));
    }
});

L.jsonGridTile = function(url, options){
    return new L.JsonGridTile(url,options);
}

L.SVG.Tile = L.SVG.extend({

	initialize: function (tileCoord, tileSize, options) {
		L.SVG.prototype.initialize.call(this, options);
		this._tileCoord = tileCoord;
		this._size = tileSize;

		this._initContainer();
		this._container.setAttribute('width', this._size.x);
		this._container.setAttribute('height', this._size.y);
		this._container.setAttribute('viewBox', [0, 0, this._size.x, this._size.y].join(' '));

		this._layers = {};
	},

	getCoord: function() {
		return this._tileCoord;
	},

	getContainer: function() {
		return this._container;
	},

	onAdd: L.Util.falseFn,

	addTo: function(map) {
		this._map = map;
		if (this.options.interactive) {
			for (var i in this._layers) {
				var layer = this._layers[i];
				// By default, Leaflet tiles do not have pointer events.
				layer._path.style.pointerEvents = 'auto';
				this._map._targets[L.stamp(layer._path)] = layer;
			}
		}
	},

	removeFrom: function (map) {
		if (this.options.interactive) {
			for (var i in this._layers) {
				var layer = this._layers[i];
				delete this._map._targets[L.stamp(layer._path)];
			}
		}
		delete this._map;
	},

	_initContainer: function() {
		L.SVG.prototype._initContainer.call(this);
		var rect =  L.SVG.create('rect');
	},

	/// TODO: Modify _initPath to include an extra parameter, a group name
	/// to order symbolizers by z-index

	_addPath: function (layer) {
		this._rootGroup.appendChild(layer._path);
		this._layers[L.stamp(layer)] = layer;
	},

	_updateIcon: function (layer) {
		var path = layer._path = L.SVG.create('image'),
		    icon = layer.options.icon,
		    options = icon.options,
		    size = L.point(options.iconSize),
		    anchor = options.iconAnchor ||
		        	 size && size.divideBy(2, true),
		    p = layer._point.subtract(anchor);
		path.setAttribute('x', p.x);
		path.setAttribute('y', p.y);
		path.setAttribute('width', size.x + 'px');
		path.setAttribute('height', size.y + 'px');
		path.setAttribute('href', options.iconUrl);
	}
});


L.svg.tile = function(tileCoord, tileSize, opts){
	return new L.SVG.Tile(tileCoord, tileSize, opts);
};