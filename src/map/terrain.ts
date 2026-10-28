// Published NRCan cartography: elevation and static hydrography, not a runoff model.
export const TERRAIN_WMS='https://maps.geogratis.gc.ca/wms/elevation_en';
export const TERRAIN_LAYER='cdem.color-shaded-relief';
export const TERRAIN_LEGEND=TERRAIN_WMS+'?service=WMS&version=1.3.0&request=GetLegendGraphic&sld_version=1.1.0&layer='+TERRAIN_LAYER+'&format=image/png&STYLE=default';
export const FLOW_WMS='https://maps.geogratis.gc.ca/wms/hydro_network_en';
export const FLOW_LAYERS='nhn:nhn:network:networklinearflow_1,nhn:nhn:network:flowdirection_1';
export const FLOW_MIN_ZOOM=12;
