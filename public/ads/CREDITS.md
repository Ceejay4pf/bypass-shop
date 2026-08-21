# Where the pictures in the shop window came from

These are the posters listed in `PROMOS` in `src/lib/storefront.js`. Every one
is a public-domain (CC0) photograph, so the shop owes nobody anything for using
them — but they are credited here because that is the decent thing to do, and
because the next person to touch this folder should know what they are allowed
to do with what is in it.

They are photographs of *similar* parts, not of this shop's own stock. The real
fix is a photograph of the part on the shelf: add one in Edit Parts and it
appears on the customer's page by itself, on the part and on its section.

## Japanese cars, where one could be found

This shop sells parts off Japanese cars, so a poster showing a German car's
badge is an advert for the wrong shop. Three of the six are now parts off
Japanese cars, named below — a Nissan, and two Toyotas. The other three were
searched for and not found: free-to-use, commercial-use, no-attribution
photographs of a Japanese car's door, plain mirror or indicator mirror do not
appear to exist on Wikimedia Commons, Openverse, rawpixel or stocksnap. The
three kept are close-ups with no make on them, so they contradict nothing — but
if a phone photograph of a real door on the shelf is taken and added in Edit
Parts, it beats every one of these and it is the shop's own.

- **taillights.jpg** (TLL) — “Nissan Note Aura (FE13), 2021, tail-light”, CC0 1.0, Kazyakuruma · Wikimedia Commons · https://commons.wikimedia.org/wiki/File:Nissan_Note_Aura_(FE13),_2021,_tail-light.jpg
- **headlights.jpg** (HDL) — “Toyota 86 GT — Headlamp”, CC0 1.0, Cllackr · Wikimedia Commons · https://commons.wikimedia.org/wiki/File:Toyota_86_GT_-_Headlamp.jpg
- **grilles.jpg** (GRL) — “Moscow, Toyota Alphard (AH30) grille, Sept 2025 01”, CC0 1.0, Retired electrician · Wikimedia Commons · https://commons.wikimedia.org/wiki/File:Moscow,_Toyota_Alphard_(AH30)_grille,_Sept_2025_01.jpg
- **doors.jpg** (DOR) — “White car door handle”, cc0 1.0 · rawpixel · https://www.rawpixel.com/image/6040342/photo-image-public-domain-door-white
- **mirrors-plain.jpg** (SMN) — “White moth on a wet car side mirror, reflecting a blurred outdoor scene with trees and a road.”, cc0 1.0, mujuonly · wordpress · https://wordpress.org/photos/photo/7756a60509/
- **mirrors-indicator.jpg** (SMI) — “Close orange car wing mirror”, cc0 1.0, Markus Spiske · rawpixel · https://www.rawpixel.com/image/593189/orange-classic-car

## The slide show — other makes

These five are not posters on the customer's page. They are the slide show that
turns over behind the staff login board before anybody signs in and full size on
the way in afterwards — the list is `SLIDES` in `src/lib/slides.js`, drawn by
`src/PartsShow.jsx`.

Five makes, because the shop deals in more than Toyota and a login screen showing
one headlamp says the wrong thing. Every one is a **CC0 1.0** photograph from
Wikimedia Commons, cropped to 800×480 — the same 5:3 as the posters above — down
onto the grille, headlamp and bumper, then brightened, given more colour and
sharpened. CC0 allows a derivative and owes nobody anything; the crops are still
credited because that is the decent thing to do.

- **prado-front.jpg** — “Toyota LAND CRUISER PRADO TX "Argento Cross" 4WD (TRJ150W) front”, CC0 1.0, Tokumeigakarinoaoshima · https://commons.wikimedia.org/wiki/File:Toyota_LAND_CRUISER_PRADO_TX_%22Argento_Cross%22_4WD_(TRJ150W)_front.JPG
- **lc300-front.jpg** — “2021 Toyota Land Cruieser 300 ZX”, CC0 1.0, TTTNIS · https://commons.wikimedia.org/wiki/File:2021_Toyota_Land_Cruieser_300_ZX.jpg
- **subaru-impreza-front.jpg** — “Subaru IMPREZA SPORT 2.0i EyeSight (DBA-GP7) front”, CC0 1.0, Tokumeigakarinoaoshima · https://commons.wikimedia.org/wiki/File:Subaru_IMPREZA_SPORT_2.0i_EyeSight_(DBA-GP7)_front.JPG
- **subaru-forester-front.jpg** — “Subaru FORESTER X-BREAK (DBA-SJ5) front”, CC0 1.0, Tokumeigakarinoaoshima · https://commons.wikimedia.org/wiki/File:Subaru_FORESTER_X-BREAK_(DBA-SJ5)_front.JPG
- **mazda-cx5-front.jpg** — “Mazda CX-5 XD L Package (KE) front”, CC0 1.0, Tokumeigakarinoaoshima · https://commons.wikimedia.org/wiki/File:Mazda_CX-5_XD_L_Package_(KE)_front.JPG

The six posters above are slides six to eleven of the same show, which is why the
way-in screen costs a phone nothing it has not already downloaded for the parts
list. `login-hero.jpg` — a crop of the Toyota 86 headlamp that used to be the one
still picture on the login board — was deleted when the show replaced it; the
same headlamp is still there as `headlights.jpg`.

**A slide is only downloaded when the show reaches it.** Eleven photographs at
roughly 90 kB each would be a megabyte on the login screen, so `isMounted` in
`src/lib/slides.js` keeps the unreached ones out of the page. If a picture is
added to `SLIDES`, put it after the five brand shots: whatever is at the top of
that list is what a phone on mobile data actually pays for.

The three replaced photographs — a Mercedes-Benz B200 tail light, a honeycomb
grille mesh and a loose headlamp unit — are in this repository's history if
anybody wants them back.
