# osm-note-viewer

View [OpenStreetMap](https://www.openstreetmap.org/) [notes](https://wiki.openstreetmap.org/wiki/Notes) on a map and in a table with all their comments. Originally an alternative to OpenStreetMap user's notes page: `https://www.openstreetmap.org/user/`**`username`**`/notes`. Now more generally a web UI for [OSM notes API](https://wiki.openstreetmap.org/wiki/API_v0.6#Map_Notes_API) [search][api-search] and [bounding box][api-bbox] calls. The fetched notes can be filtered further by an expression matching a sequence of actions performed on a note, such as being opened by user A and later commented by user B. Can run as a static files served from any web server or from a local filesystem.

Try it out [here][github-host].

## Features

### Search notes for user / text / date range

Get notes with [`/api/0.6/notes/search`][api-search] call. Allows searching for notes containing a given text, modified by a given user, created/updated inside a given date range. Enable *Advanced mode* to see how parameters of this call correspond to *note-viewer*'s form fields.

Alternative tools:

- [NotesReview](https://ent8r.github.io/NotesReview/): doesn't use the osm api directly, which allows to do some queries that are impossible with the osm api. These include fetching only closed notes or notes only by anonymous users. Its possible to achieve that in note-viewer with a filter, but the filter is applied after downloading, and notes that don't pass through the filter also need to be downloaded.

### View user's notes

This is the original feature. Now it is available as part of search. To see a set of notes similar to one on user's note page, you need to enter a username in the search form, leaving text and date range fields blank. Below these fields select fetch *both open and closed* matching notes sorted by *last update* date, *newest* first. Note that sorting defaults to *creation* date because it's more stable: no note update between fetches can alter the note sequence, so maybe you want to keep this order.

Other alternatives for viewing user's notes:

- [My OpenStreetMap Notes](https://my-notes.osm-hr.org/): shows only unresolved notes
- [NotesReview](https://ent8r.github.io/NotesReview/), click *Filter*, enter username in *User*, select *Status* = *All*, set *Limit* to as high as possible: unfortunately the max limit is just 100

### Get notes inside rectangular area (Bbox)

Get notes with [`/api/0.6/notes`][api-bbox] call, which is what happens if you enable the notes layer on the osm website. Enable *Advanced mode* to see parameter details. There's a limit on the area size. The request will work with city-sized areas, but may fail on country-sized ones. The search functionality described above provides the opposite extreme by querying the entire planet.

Alternative tools:

- [ResultMaps/osm-notes](https://resultmaps.neis-one.org/osm-notes): has note webpages and feeds for countries. Notes are presented in a table without a map.

### Get notes from a list of note ids

Ids can be provided either directly as comma/space-separated list of numbers or in a HTML/XML file with a CSS selector specified to find them. There's a shortcut for extracting ids from [ResultMaps/osm-notes](https://resultmaps.neis-one.org/osm-notes) feeds.

## Integration with other apps and services

### Editors with remote control

It's possible to load the selected notes and the currently visible map area using [remote control](https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl) feature of OpenStreetMap editors. [JOSM](https://wiki.openstreetmap.org/wiki/JOSM) is the most widely used of those. Remote control in JOSM has to be enabled in preferences. Go to [*Edit > Preferences > Remote Control*](https://josm.openstreetmap.de/wiki/Help/Preferences/RemoteControl) and check *Enable remote control*.

The remote control tools are available in *RC* section of the tools panel below the notes table. If you press any button there and its outline turns red, hover over it to read the error message. The buttons require the following *Permitted actions* to be enabled in the preferences:

- *Load selected notes* button requires *Import data from URL*.
- *Load map area* button requires *Load data from API*. This operation may fail silently if the permission is not granted.

### OSM Smart Menu

note-viewer can be added to [OSM Smart Menu](https://wiki.openstreetmap.org/wiki/OSM_Smart_Menu) browser plugin using a [URL template](https://wiki.openstreetmap.org/wiki/OSM_Smart_Menu#Advanced_method_to_add_new_links). The following template enables switching to note-viewer from any webpage recognized by OSM Smart Menu that contains an osm username:

    https://antonkhorev.github.io/osm-note-viewer/#mode=search&display_name={osm_user_name}

You can also add a template for opening a map location:

    https://antonkhorev.github.io/osm-note-viewer/#map={zoom}/{latitude}/{longitude}

## Installation

If you don't want to run note-viewer from github, you can run if off any server that can serve static files, including a local filesystem (`file:///`). The files that are [served by github][github-host] are in the [`gh-pages` branch of the repository](https://github.com/AntonKhorev/osm-note-viewer/tree/gh-pages). You can download all of them [here](https://github.com/AntonKhorev/osm-note-viewer/archive/refs/heads/gh-pages.zip).

Note-viewer won't run entirely locally because the whole point of it is to access [OSM API](https://wiki.openstreetmap.org/wiki/API_v0.6). Some optional functions access [Nominatim](https://wiki.openstreetmap.org/wiki/Nominatim), [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) and other services. To render the map, [Leaflet](https://leafletjs.com/) is served from its default CDN. The map requires access to [OSM tile server](https://wiki.openstreetmap.org/wiki/Tile_servers).

To build from source you need [Node.js](https://nodejs.org/). v14 is enough, may also work on earlier versions because Node.js is used only for building and testing. Run `npm install` and `npm run build` to get the build in `dist` directory.

[github-host]: https://antonkhorev.github.io/osm-note-viewer/
[api-search]: https://wiki.openstreetmap.org/wiki/API_v0.6#Search_for_notes:_GET_.2Fapi.2F0.6.2Fnotes.2Fsearch
[api-bbox]: https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_.2Fapi.2F0.6.2Fnotes
