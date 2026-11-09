# A Small Silver Address

## Description

When I was just a small niño, I used to see the small metal badges on the streets. My papa told me it would lead me to treasure if I ever found out the meaning. Now that I've met you :) Can you tell me where to go? I'm looking for the ubicación on the lower right badge.



## Files

[tags.jpg](../player/assets/tags.jpg)

Submit `RCC{latitude,longitude}` 

## Hint(s)



## Walkthrough

1. Read the oval badge: **PGE Co / C73-14D / 329**. The [Portland General Electric explanation](https://portlandgeneral.com/outages-safety/report-a-streetlight-problem) identifies these as the map number and pole number.

   ![The utility's explanation of the map and pole numbers on its tags](screenshots/01-utility-explanation.png)

2. Open the [PGE Streetlight Viewer](https://pge.maps.arcgis.com/apps/instant/minimalist/index.html?appid=e23e48b933f64818b7fbbfac52b1c137). Its facility identifier joins the compacted map number and pole number: **C7314D-329**.

3. Look up that identifier in the viewer or its [public Distribution Pole record](https://services6.arcgis.com/eqsXlDArbs19VWhn/arcgis/rest/services/Public_Data/FeatureServer/13/query?where=FACILITYID%20%3D%20%27C7314D-329%27&outFields=FACILITYID&outSR=4326&f=pjson). The query returns one feature. With `outSR=4326`, its geometry is longitude **-123.01800680024955** (`x`) and latitude **44.958079200453454** (`y`).

   ![The public query returns C7314D-329 and its WGS84 geometry](screenshots/02-pole-record.png)

4. Put latitude before longitude: **44.958079, -123.018007**, in Salem, Oregon. Submit the coordinates within the stated 8-metre tolerance.

## Flag

`RCC{44.958079,-123.018007}`
