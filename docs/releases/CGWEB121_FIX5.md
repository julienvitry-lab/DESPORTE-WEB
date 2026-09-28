# CGWEB121 FIX5

## LEAFLET_ROUTE_RED_FORCE001

Le tracé d'activité est désormais forcé en rouge vif au niveau
des objets Leaflet eux-mêmes, et non plus seulement par CSS.

## POLYLINE_STYLE_OVERRIDE001

Le correctif surcharge :

- L.Path.prototype.setStyle
- L.Polyline.prototype.onAdd
- L.GeoJSON.prototype.addData

afin d'imposer la couleur rouge vif aux polylignes ouvertes
du tracé d'activité.

## KM_DEFAULT_OFF_KEEP001

Le comportement de FIX4 est conservé :

- bornes kilométriques masquées par défaut ;
- bouton Km toujours disponible à la demande.

## Déploiement

Correctif front-end uniquement :
Hosting seulement.

Base :

849ba6cc71496135b9f5e282d97bae1fb46e4bcd
