class NoteViewerStorage {
    constructor(prefix) {
        this.prefix = prefix;
    }
    getItem(k) {
        return localStorage.getItem(this.prefix + k);
    }
    setItem(k, v) {
        localStorage.setItem(this.prefix + k, v);
    }
    removeItem(k) {
        localStorage.removeItem(this.prefix + k);
    }
    getKeys() {
        const result = [];
        for (const k in localStorage) {
            if (!localStorage.hasOwnProperty(k))
                continue;
            if (!k.startsWith(this.prefix))
                continue;
            result.push(k.substring(this.prefix.length));
        }
        return result;
    }
    computeSize() {
        let size = 0;
        for (const k of this.getKeys()) {
            const value = this.getItem(k);
            if (value == null)
                continue;
            size += (value.length + this.prefix.length + k.length) * 2;
        }
        return size;
    }
    clear() {
        for (const k of this.getKeys()) {
            this.removeItem(k);
        }
    }
}

class NoteViewerDB {
    constructor(idb) {
        this.idb = idb;
        this.closed = false;
        idb.onversionchange = () => {
            idb.close();
            this.closed = true;
        };
    }
    view() {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches'], 'readonly');
            const request = tx.objectStore('fetches').index('access').getAll();
            request.onsuccess = () => resolve(request.result);
            tx.onerror = () => reject(new Error(`Database view error: ${tx.error}`));
        });
    }
    delete(fetch) {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches', 'notes', 'users'], 'readwrite');
            const range = makeTimestampRange(fetch.timestamp);
            tx.objectStore('notes').delete(range);
            tx.objectStore('users').delete(range);
            tx.objectStore('fetches').delete(fetch.timestamp);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(new Error(`Database delete error: ${tx.error}`));
        });
    }
    clear(queryString) {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        const timestamp = Date.now(); // TODO receive all .now() from outside, probably as first arg
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches', 'notes', 'users'], 'readwrite');
            cleanupOutdatedFetches(timestamp, tx);
            const fetchStore = tx.objectStore('fetches');
            const fetchRequest = fetchStore.index('query').getKey(queryString);
            fetchRequest.onsuccess = () => {
                if (typeof fetchRequest.result == 'number') {
                    const existingFetchTimestamp = fetchRequest.result;
                    const range = makeTimestampRange(existingFetchTimestamp);
                    tx.objectStore('notes').delete(range);
                    tx.objectStore('users').delete(range);
                    fetchStore.delete(existingFetchTimestamp);
                }
                const fetch = {
                    queryString,
                    timestamp,
                    writeTimestamp: timestamp,
                    accessTimestamp: timestamp
                };
                fetchStore.put(fetch).onsuccess = () => resolve(fetch);
            };
            tx.onerror = () => reject(new Error(`Database clear error: ${tx.error}`));
        });
    }
    load(queryString) {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        const timestamp = Date.now();
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches', 'notes', 'users'], 'readwrite');
            cleanupOutdatedFetches(timestamp, tx);
            const fetchStore = tx.objectStore('fetches');
            const fetchRequest = fetchStore.index('query').get(queryString);
            fetchRequest.onsuccess = () => {
                if (fetchRequest.result == null) {
                    const fetch = {
                        queryString,
                        timestamp,
                        writeTimestamp: timestamp,
                        accessTimestamp: timestamp
                    };
                    fetchStore.put(fetch).onsuccess = () => resolve([fetch, [], {}]);
                }
                else {
                    const fetch = fetchRequest.result;
                    fetch.accessTimestamp = timestamp;
                    fetchStore.put(fetch);
                    const range = makeTimestampRange(fetch.timestamp);
                    const noteRequest = tx.objectStore('notes').index('sequence').getAll(range);
                    noteRequest.onsuccess = () => {
                        const notes = noteRequest.result.map(noteEntry => noteEntry.note);
                        const userRequest = tx.objectStore('users').getAll(range);
                        userRequest.onsuccess = () => {
                            const users = {};
                            for (const userEntry of userRequest.result) {
                                users[userEntry.user.id] = userEntry.user.name;
                            }
                            resolve([fetch, notes, users]);
                        };
                    };
                }
            };
            tx.onerror = () => reject(new Error(`Database read error: ${tx.error}`));
        });
    }
    save(fetch, allNotes, newNotes, allUsers, newUsers) {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        const timestamp = Date.now();
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches', 'notes', 'users'], 'readwrite');
            const fetchStore = tx.objectStore('fetches');
            const noteStore = tx.objectStore('notes');
            const userStore = tx.objectStore('users');
            const fetchRequest = fetchStore.get(fetch.timestamp);
            fetchRequest.onsuccess = () => {
                fetch.writeTimestamp = fetch.accessTimestamp = timestamp;
                if (fetchRequest.result == null) {
                    fetchStore.put(fetch);
                    writeNotesAndUsers(0, allNotes, allUsers);
                }
                else {
                    fetchRequest.result;
                    // if (storedFetch.writeTimestamp>fetch.writeTimestamp) {
                    // TODO write conflict if doesn't match
                    //	report that newNotes shouldn't be merged
                    //	then should receive oldNotes instead of newNotes and merge them here
                    // }
                    fetchStore.put(fetch);
                    const range = makeTimestampRange(fetch.timestamp);
                    const noteCursorRequest = noteStore.index('sequence').openCursor(range, 'prev');
                    noteCursorRequest.onsuccess = () => {
                        let sequenceNumber = 0;
                        const cursor = noteCursorRequest.result;
                        if (cursor)
                            sequenceNumber = cursor.value.sequenceNumber;
                        writeNotesAndUsers(sequenceNumber, newNotes, newUsers);
                    };
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(new Error(`Database save error: ${tx.error}`));
            function writeNotesAndUsers(sequenceNumber, notes, users) {
                for (const note of notes) {
                    sequenceNumber++;
                    const noteEntry = {
                        fetchTimestamp: fetch.timestamp,
                        note,
                        sequenceNumber
                    };
                    noteStore.put(noteEntry);
                }
                for (const userId in users) {
                    const name = users[userId];
                    if (name == null)
                        continue;
                    const userEntry = {
                        fetchTimestamp: fetch.timestamp,
                        user: {
                            id: Number(userId),
                            name
                        }
                    };
                    userStore.put(userEntry);
                }
            }
        });
    }
    /*
    beforeFetch(fetchId, endDate) {
        // read fetch record
        // compare endDate
        // if same return 'ok to fetch'
        // fetch...
        // update access
        // return [new endDate, new notes, new users]
    }
    */
    static open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('OsmNoteViewer');
            request.onsuccess = () => {
                resolve(new NoteViewerDB(request.result));
            };
            request.onupgradeneeded = () => {
                const idb = request.result;
                const fetchStore = idb.createObjectStore('fetches', { keyPath: 'timestamp' });
                fetchStore.createIndex('query', 'queryString', { unique: true });
                fetchStore.createIndex('access', 'accessTimestamp');
                const noteStore = idb.createObjectStore('notes', { keyPath: ['fetchTimestamp', 'note.id'] });
                noteStore.createIndex('sequence', ['fetchTimestamp', 'sequenceNumber']);
                idb.createObjectStore('users', { keyPath: ['fetchTimestamp', 'user.id'] });
            };
            request.onerror = () => {
                reject(new Error(`failed to open the database`));
            };
            request.onblocked = () => {
                reject(new Error(`failed to open the database because of blocked version change`)); // shouldn't happen
            };
        });
    }
}
function cleanupOutdatedFetches(timestamp, tx) {
    const maxFetchAge = 24 * 60 * 60 * 1000;
    const range1 = IDBKeyRange.upperBound(timestamp - maxFetchAge);
    const range2 = IDBKeyRange.upperBound([timestamp - maxFetchAge, +Infinity]);
    tx.objectStore('notes').delete(range2);
    tx.objectStore('users').delete(range2);
    tx.objectStore('fetches').delete(range1);
}
function makeTimestampRange(timestamp) {
    return IDBKeyRange.bound([timestamp, -Infinity], [timestamp, +Infinity]);
}

class NoteMarker extends L.Marker {
    constructor(note) {
        const width = 25;
        const height = 40;
        const nInnerCircles = 4;
        const r = width / 2;
        const rp = height - r;
        const y = r ** 2 / rp;
        const x = Math.sqrt(r ** 2 - y ** 2);
        const xf = x.toFixed(2);
        const yf = y.toFixed(2);
        const dcr = (r - .5) / nInnerCircles;
        let html = ``;
        html += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-r} ${-r} ${width} ${height}">`;
        html += `<path d="M0,${rp} L-${xf},${yf} A${r},${r} 0 1 1 ${xf},${yf} Z" fill="${note.status == 'open' ? 'red' : 'green'}" />`;
        const states = [...noteCommentsToStates(note.comments)];
        const statesToDraw = states.slice(-nInnerCircles, -1);
        for (let i = 2; i >= 0; i--) {
            if (i >= statesToDraw.length)
                continue;
            const cr = dcr * (i + 1);
            html += `<circle r="${cr}" fill="${color()}" stroke="white" />`;
            function color() {
                if (i == 0 && states.length <= nInnerCircles)
                    return 'white';
                if (statesToDraw[i])
                    return 'red';
                return 'green';
            }
        }
        html += `</svg>`;
        const icon = L.divIcon({
            html,
            className: '',
            iconSize: [width, height],
            iconAnchor: [(width - 1) / 2, height],
        });
        super([note.lat, note.lon], {
            icon,
            alt: `note`,
            opacity: 0.5
        });
        this.noteId = note.id;
    }
}
class NoteMap {
    constructor($container) {
        this.needToFitNotes = false;
        this.leafletMap = L.map($container, {
            worldCopyJump: true
        });
        this.leafletMap.addLayer(L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>",
            maxZoom: 19
        })).fitWorld();
        this.elementLayer = L.featureGroup().addTo(this.leafletMap);
        this.noteLayer = L.featureGroup().addTo(this.leafletMap);
        this.filteredNoteLayer = L.featureGroup();
        this.trackLayer = L.featureGroup().addTo(this.leafletMap);
        const crosshairLayer = new CrosshairLayer().addTo(this.leafletMap);
        const layersControl = L.control.layers();
        layersControl.addOverlay(this.elementLayer, `OSM elements`);
        layersControl.addOverlay(this.noteLayer, `Notes`);
        layersControl.addOverlay(this.filteredNoteLayer, `Filtered notes`);
        layersControl.addOverlay(this.trackLayer, `Track between notes`);
        layersControl.addOverlay(crosshairLayer, `Crosshair`);
        layersControl.addTo(this.leafletMap);
    }
    invalidateSize() {
        this.leafletMap.invalidateSize();
    }
    clearNotes() {
        this.elementLayer.clearLayers();
        this.noteLayer.clearLayers();
        this.filteredNoteLayer.clearLayers();
        this.trackLayer.clearLayers();
        this.needToFitNotes = true;
    }
    fitNotes() {
        const bounds = this.noteLayer.getBounds();
        if (!bounds.isValid())
            return;
        this.leafletMap.fitBounds(bounds);
        this.needToFitNotes = false;
    }
    fitNotesIfNeeded() {
        if (!this.needToFitNotes)
            return;
        this.fitNotes();
    }
    showNoteTrack(layerIds) {
        const polylineOptions = {
            interactive: false,
            color: '#004',
            weight: 1,
            className: 'note-track', // sets non-scaling stroke defined in css
        };
        const nodeOptions = {
            ...polylineOptions,
            radius: 3,
            fill: false,
        };
        this.trackLayer.clearLayers();
        const polylineCoords = [];
        for (const layerId of layerIds) {
            const marker = this.noteLayer.getLayer(layerId);
            if (!(marker instanceof L.Marker))
                continue;
            const coords = marker.getLatLng();
            polylineCoords.push(coords);
            L.circleMarker(coords, nodeOptions).addTo(this.trackLayer);
        }
        L.polyline(polylineCoords, polylineOptions).addTo(this.trackLayer);
    }
    fitNoteTrack() {
        const bounds = this.trackLayer.getBounds(); // invalid if track is empty; track is empty when no notes are in table view
        if (bounds.isValid())
            this.leafletMap.fitBounds(bounds);
    }
    addOsmElement(geometry) {
        this.elementLayer.clearLayers();
        this.elementLayer.addLayer(geometry);
        if (geometry instanceof L.CircleMarker) {
            this.leafletMap.panTo(geometry.getLatLng());
        }
        else {
            const bounds = this.elementLayer.getBounds();
            if (bounds.isValid())
                this.leafletMap.fitBounds(bounds);
        }
    }
    fitBounds(bounds) {
        this.leafletMap.fitBounds(bounds);
    }
    panTo(latlng) {
        this.leafletMap.panTo(latlng);
    }
    panAndZoomTo(latlng, zoom) {
        this.leafletMap.flyTo(latlng, zoom, { duration: .5 }); // default duration is too long despite docs saying it's 0.25
    }
    isCloseEnoughToCenter(latlng) {
        const inputPt = this.leafletMap.latLngToContainerPoint(latlng);
        const centerPt = this.leafletMap.latLngToContainerPoint(this.leafletMap.getCenter()); // instead could have gotten container width/2, height/2
        return (inputPt.x - centerPt.x) ** 2 + (inputPt.y - centerPt.y) ** 2 < 100;
    }
    get zoom() {
        return this.leafletMap.getZoom();
    }
    get maxZoom() {
        return this.leafletMap.getMaxZoom();
    }
    get lat() {
        return this.leafletMap.getCenter().lat;
    }
    get lon() {
        return this.leafletMap.getCenter().lng;
    }
    get bounds() {
        return this.leafletMap.getBounds();
    }
    onMoveEnd(fn) {
        this.leafletMap.on('moveend', fn);
    }
}
class CrosshairLayer extends L.Layer {
    onAdd(map) {
        // https://stackoverflow.com/questions/49184531/leafletjs-how-to-make-layer-not-movable
        this.$overlay?.remove();
        this.$overlay = document.createElement('div');
        this.$overlay.classList.add('crosshair-overlay');
        const $crosshair = document.createElement('div');
        $crosshair.classList.add('crosshair');
        this.$overlay.append($crosshair);
        map.getContainer().append(this.$overlay);
        return this;
    }
    onRemove(map) {
        this.$overlay?.remove();
        this.$overlay = undefined;
        return this;
    }
}
function* noteCommentsToStates(comments) {
    let currentState = true;
    for (const comment of comments) {
        if (comment.action == 'opened' || comment.action == 'reopened') {
            currentState = true;
        }
        else if (comment.action == 'closed' || comment.action == 'hidden') {
            currentState = false;
        }
        yield currentState;
    }
}

function makeUserLink(uid, username, text) {
    if (username)
        return makeUserNameLink(username, text);
    return makeUserIdLink(uid, text);
}
function makeUserNameLink(username, text) {
    const fromName = (name) => `https://www.openstreetmap.org/user/${encodeURIComponent(name)}`;
    return makeLink(text ?? username, fromName(username));
}
function makeUserIdLink(uid, text) {
    const fromId = (id) => `https://api.openstreetmap.org/api/0.6/user/${encodeURIComponent(id)}`;
    return makeLink(text ?? '#' + uid, fromId(uid));
}
function makeLink(text, href, title) {
    const $link = document.createElement('a');
    $link.href = href;
    $link.textContent = text;
    if (title != null)
        $link.title = title;
    return $link;
}
function makeElement(tag) {
    return (...classes) => (...items) => {
        const $element = document.createElement(tag);
        $element.classList.add(...classes);
        $element.append(...items);
        return $element;
    };
}
const makeDiv = makeElement('div');
const makeLabel = makeElement('label');
function escapeRegex(text) {
    return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}
function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/\t/g, '&#x9;')
        .replace(/\n/g, '&#xA;')
        .replace(/\r/g, '&#xD;');
}
function makeEscapeTag(escapeFn) {
    return function (strings, ...values) {
        let result = strings[0];
        for (let i = 0; i < values.length; i++) {
            result += escapeFn(String(values[i])) + strings[i + 1];
        }
        return result;
    };
}
function resetFadeAnimation($element, animationName) {
    const animation = getFadeAnimation($element, animationName);
    if (!animation)
        return;
    animation.currentTime = 0;
}
function getFadeAnimation($element, animationName) {
    if (typeof CSSAnimation == 'undefined')
        return; // experimental technology, implemented in latest browser versions
    for (const animation of $element.getAnimations()) {
        if (!(animation instanceof CSSAnimation))
            continue;
        if (animation.animationName == animationName)
            return animation;
    }
}

class PhotoDialog {
    constructor($dialog) {
        this.$dialog = $dialog;
        this.fallbackMode = (window.HTMLDialogElement == null);
    }
    close() {
        if (this.fallbackMode) {
            return;
        }
        const $dialog = this.$dialog;
        $dialog.close();
        this.url = undefined;
    }
    toggle(url) {
        if (this.fallbackMode) {
            open(url, 'photo');
            return;
        }
        const $dialog = this.$dialog;
        this.$dialog.innerHTML = '';
        if (url == this.url) {
            this.close();
            return;
        }
        const $figure = document.createElement('figure');
        $figure.tabIndex = 0;
        const $backdrop = document.createElement('div');
        $backdrop.classList.add('backdrop');
        $backdrop.style.backgroundImage = `url(${url})`;
        const $img = document.createElement('img');
        $img.src = url;
        $img.alt = 'attached photo';
        $figure.append($backdrop, $img);
        const $closeButton = document.createElement('button');
        $closeButton.title = `Close photo`;
        $dialog.append($figure, $closeButton);
        $figure.addEventListener('keydown', (ev) => {
            if (ev.key == 'Enter' || ev.key == ' ') {
                ev.stopPropagation();
                $figure.classList.toggle('zoomed');
            }
        });
        $figure.addEventListener('click', (ev) => {
            if ($figure.classList.contains('zoomed')) {
                $figure.classList.remove('zoomed');
            }
            else {
                const clamp = (num) => Math.min(Math.max(num, 0), 1);
                let xScrollFraction = (ev.offsetX >= $figure.offsetWidth / 2 ? 1 : 0);
                let yScrollFraction = (ev.offsetY >= $figure.offsetHeight / 2 ? 1 : 0);
                if (ev.target == $img) {
                    xScrollFraction = clamp(ev.offsetX / $img.offsetWidth);
                    yScrollFraction = clamp(ev.offsetY / $img.offsetHeight);
                }
                $figure.classList.add('zoomed');
                const xMaxScrollDistance = $figure.scrollWidth - $figure.clientWidth;
                const yMaxScrollDistance = $figure.scrollHeight - $figure.clientHeight;
                if (xMaxScrollDistance > 0)
                    $figure.scrollLeft = Math.round(xScrollFraction * xMaxScrollDistance);
                if (yMaxScrollDistance > 0)
                    $figure.scrollTop = Math.round(yScrollFraction * yMaxScrollDistance);
            }
        });
        $figure.addEventListener('mousemove', (ev) => {
            $closeButton.classList.toggle('right-position', ev.offsetX >= $figure.offsetWidth / 2);
            $closeButton.classList.toggle('bottom-position', ev.offsetY >= $figure.offsetHeight / 2);
            if ($closeButton.classList.contains('fading')) {
                resetFadeAnimation($closeButton, 'photo-button-fade');
            }
            else {
                $closeButton.classList.add('fading');
            }
        });
        $closeButton.addEventListener('click', () => {
            this.close();
        });
        $closeButton.addEventListener('animationend', () => {
            $closeButton.classList.remove('fading');
        });
        $dialog.addEventListener('keydown', (ev) => {
            if (ev.key == 'Escape') {
                ev.stopPropagation();
                this.close();
            }
        });
        $dialog.show();
        $figure.focus();
        this.url = url;
    }
}

function getCommentItems(commentText) {
    const matchRegExp = new RegExp(`(?<before>.*?)(?<text>` +
        `(?<date>\\d\\d\\d\\d-\\d\\d-\\d\\d[T ]\\d\\d:\\d\\d:\\d\\dZ)` +
        `|` +
        `(?<link>https?://(?:` +
        `(?<image>westnordost\.de/p/[0-9]+\.jpg)` +
        '|' +
        `(?<osm>(?:www\\.)?(?:osm|openstreetmap)\\.org/` +
        `(?<path>(?<osmType>node|way|relation|note)/(?<id>[0-9]+))?` +
        `(?<hash>#[-0-9a-zA-Z/.=&]+)?` + // only need hash at root or at recognized path
        `)` +
        `))` +
        `)`, 'sy');
    const items = [];
    let idx = 0;
    while (true) {
        idx = matchRegExp.lastIndex;
        const match = matchRegExp.exec(commentText);
        if (!match || !match.groups)
            break;
        pushTextItem(match.groups.before);
        items.push(getMatchItem(match.groups));
    }
    pushTextItem(commentText.slice(idx));
    return collapseTextItems(items);
    function pushTextItem(text) {
        if (text == '')
            return;
        items.push({
            type: 'text',
            text
        });
    }
    function collapseTextItems(inputItems) {
        const outputItems = [];
        let tailTextItem;
        for (const item of inputItems) {
            if (item.type == 'text') {
                if (tailTextItem) {
                    tailTextItem.text += item.text;
                }
                else {
                    outputItems.push(item);
                    tailTextItem = item;
                }
            }
            else {
                outputItems.push(item);
                tailTextItem = undefined;
            }
        }
        return outputItems;
    }
}
function getMatchItem(groups) {
    const baseItem = {
        text: groups.text
    };
    if (groups.date) {
        return {
            ...baseItem,
            type: 'date',
        };
    }
    else if (groups.link) {
        const linkItem = {
            ...baseItem,
            type: 'link',
            href: groups.link
        };
        if (groups.image) {
            return {
                ...linkItem,
                link: 'image'
            };
        }
        else if (groups.osm) {
            const osmItem = {
                ...linkItem,
                link: 'osm',
                href: rewriteOsmHref(groups.path, groups.hash),
                map: getMap(groups.hash)
            };
            if (groups.osmType && groups.id) {
                if (groups.osmType == 'note') {
                    return {
                        ...osmItem,
                        osm: 'note',
                        id: Number(groups.id)
                    };
                }
                else if (groups.osmType == 'node' || groups.osmType == 'way' || groups.osmType == 'relation') {
                    return {
                        ...osmItem,
                        osm: 'element',
                        element: groups.osmType,
                        id: Number(groups.id)
                    };
                }
            }
            else if (osmItem.map) { // only make root links if they have map hash, otherwise they may not even be a root links
                return {
                    ...osmItem,
                    osm: 'root'
                };
            }
        }
    }
    return {
        ...baseItem,
        type: 'text'
    };
}
function rewriteOsmHref(path, hash) {
    let href = `https://www.openstreetmap.org/`; // changes osm.org and other redirected paths to canonical
    if (path)
        href += path;
    if (hash)
        href += hash;
    return href;
}
function getMap(hash) {
    if (!hash)
        return;
    const params = new URLSearchParams(hash.slice(1));
    const map = params.get('map');
    if (!map)
        return;
    const match = map.match(new RegExp('([0-9.]+)/(-?[0-9.]+)/(-?[0-9.]+)'));
    if (!match)
        return;
    const [, zoom, lat, lon] = match;
    return [zoom, lat, lon];
}

function isOsmElementBase(e) {
    if (!e)
        return false;
    if (e.type != 'node' && e.type != 'way' && e.type != 'relation')
        return false;
    if (!Number.isInteger(e.id))
        return false;
    if (typeof e.timestamp != 'string')
        return false;
    if (!Number.isInteger(e.version))
        return false;
    if (!Number.isInteger(e.changeset))
        return false;
    if (e.user != null && (typeof e.user != 'string'))
        return false;
    if (!Number.isInteger(e.uid))
        return false;
    return true;
}
function isOsmNodeElement(e) {
    if (!isOsmElementBase(e))
        return false;
    if (e.type != 'node')
        return false;
    if (typeof e.lat != 'number')
        return false;
    if (typeof e.lon != 'number')
        return false;
    return true;
}
function isOsmWayElement(e) {
    if (!isOsmElementBase(e))
        return false;
    if (e.type != 'way')
        return false;
    const nodes = e.nodes;
    if (!Array.isArray(nodes))
        return false;
    if (!nodes.every(v => Number.isInteger(v)))
        return false;
    return true;
}
function isOsmRelationElement(e) {
    if (!isOsmElementBase(e))
        return false;
    if (e.type != 'relation')
        return false;
    const members = e.members;
    if (!Array.isArray(members))
        return false;
    if (!members.every(m => (m &&
        (m.type == 'node' || m.type == 'way' || m.type == 'relation') &&
        Number.isInteger(m.ref) &&
        (typeof m.role == 'string'))))
        return false;
    return true;
}
const e = makeEscapeTag(encodeURIComponent);
async function downloadAndShowElement($a, map, makeDate, elementType, elementId) {
    $a.classList.add('loading');
    try {
        // TODO cancel already running response
        const fullBit = (elementType == 'node' ? '' : '/full');
        const url = e `https://api.openstreetmap.org/api/0.6/${elementType}/${elementId}` + `${fullBit}.json`;
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status == 404) {
                throw new TypeError(`element doesn't exist`);
            }
            else if (response.status == 410) {
                throw new TypeError(`element was deleted`);
            }
            else {
                throw new TypeError(`OSM API error: unsuccessful response`);
            }
        }
        const data = await response.json();
        const elements = getElementsFromOsmApiResponse(data);
        const element = elements[elementType][elementId];
        if (!element)
            throw new TypeError(`OSM API error: requested element not found in response data`);
        if (isOsmNodeElement(element)) {
            addElementGeometryToMap(map, makeDate, element, makeNodeGeometry(element));
        }
        else if (isOsmWayElement(element)) {
            addElementGeometryToMap(map, makeDate, element, makeWayGeometry(element));
        }
        else if (isOsmRelationElement(element)) {
            addElementGeometryToMap(map, makeDate, element, makeRelationGeometry(element));
        }
        else {
            throw new TypeError(`OSM API error: requested element has unknown type`); // shouldn't happen
        }
        $a.classList.remove('absent');
        $a.title = '';
        function makeNodeGeometry(node) {
            return L.circleMarker([node.lat, node.lon]);
        }
        function makeWayGeometry(way) {
            const coords = [];
            for (const id of way.nodes) {
                const node = elements.node[id];
                if (!node)
                    throw new TypeError(`OSM API error: referenced element not found in response data`);
                coords.push([node.lat, node.lon]);
            }
            return L.polyline(coords);
        }
        function makeRelationGeometry(relation) {
            const geometry = L.featureGroup();
            for (const member of relation.members) {
                if (member.type == 'node') {
                    const node = elements.node[member.ref];
                    if (!node)
                        throw new TypeError(`OSM API error: referenced element not found in response data`);
                    geometry.addLayer(makeNodeGeometry(node));
                }
                else if (member.type == 'way') {
                    const way = elements.way[member.ref];
                    if (!way)
                        throw new TypeError(`OSM API error: referenced element not found in response data`);
                    geometry.addLayer(makeWayGeometry(way));
                }
                // TODO indicate that there might be relations, their data may be incomplete
            }
            return geometry;
        }
    }
    catch (ex) {
        map.elementLayer.clearLayers();
        $a.classList.add('absent');
        if (ex instanceof TypeError) {
            $a.title = ex.message;
        }
        else {
            $a.title = `unknown error ${ex}`;
        }
    }
    finally {
        $a.classList.remove('loading');
    }
}
function getElementsFromOsmApiResponse(data) {
    const node = {};
    const way = {};
    const relation = {};
    if (!data)
        throw new TypeError(`OSM API error: invalid response data`);
    const elementArray = data.elements;
    if (!Array.isArray(elementArray))
        throw new TypeError(`OSM API error: invalid response data`);
    for (const element of elementArray) {
        if (isOsmNodeElement(element)) {
            node[element.id] = element;
        }
        else if (isOsmWayElement(element)) {
            way[element.id] = element;
        }
        else if (isOsmRelationElement(element)) {
            relation[element.id] = element;
        }
        else {
            throw new TypeError(`OSM API error: invalid element in response data`);
        }
    }
    return { node, way, relation };
}
function addElementGeometryToMap(map, makeDate, element, elementGeometry) {
    elementGeometry.bindPopup(() => {
        const p = (...s) => makeElement('p')()(...s);
        const h = (...s) => p(makeElement('strong')()(...s));
        const elementHref = e `https://www.openstreetmap.org/${element.type}/${element.id}`;
        const $popup = makeDiv('osm-element-popup-contents')(h(capitalize(element.type) + `: `, makeLink(getElementName(element), elementHref)), h(`Version #${element.version} · `, makeLink(`View History`, elementHref + '/history')), p(`Edited on `, getElementDate(element, makeDate), ` by `, getElementUser(element), ` · Changeset #`, makeLink(String(element.changeset), e `https://www.openstreetmap.org/changeset/${element.changeset}`)));
        if (element.tags)
            $popup.append(getElementTags(element.tags));
        return $popup;
    });
    map.addOsmElement(elementGeometry);
}
function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}
function getElementName(element) {
    if (element.tags?.name) {
        return `${element.tags.name} (${element.id})`;
    }
    else {
        return String(element.id);
    }
}
function getElementDate(element, makeDate) {
    const readableDate = element.timestamp.replace('T', ' ').replace('Z', '');
    return makeDate(readableDate);
}
function getElementUser(element) {
    return makeUserLink(element.uid, element.user);
}
function getElementTags(tags) {
    const tagBatchSize = 10;
    const tagList = Object.entries(tags);
    let i = 0;
    let $button;
    const $figure = document.createElement('figure');
    const $figcaption = document.createElement('figcaption');
    $figcaption.textContent = `Tags`;
    const $table = document.createElement('table');
    $figure.append($figcaption, $table);
    writeTagBatch();
    return $figure;
    function writeTagBatch() {
        for (let j = 0; i < tagList.length && j < tagBatchSize; i++, j++) {
            const [k, v] = tagList[i];
            const $row = $table.insertRow();
            $row.insertCell().textContent = k;
            $row.insertCell().textContent = v; // TODO what if tag value too long?
        }
        if (i < tagList.length) {
            if (!$button) {
                $button = document.createElement('button');
                $figure.append($button);
                $button.onclick = writeTagBatch;
            }
            const nTagsLeft = tagList.length - i;
            const nTagsToShowNext = Math.min(nTagsLeft, tagBatchSize);
            $button.textContent = `Show ${nTagsToShowNext} / ${nTagsLeft} more tags`;
        }
        else {
            $button?.remove();
        }
    }
}

class NoteTableCommentWriter {
    constructor($table, map, photoDialog, pingNoteSection) {
        this.$table = $table;
        this.wrappedOsmLinkClickListener = function (ev) {
            const $a = this;
            ev.preventDefault();
            ev.stopPropagation();
            if (handleNote($a.dataset.noteId))
                return;
            if (handleElement($a.dataset.elementType, $a.dataset.elementId))
                return;
            handleMap($a.dataset.zoom, $a.dataset.lat, $a.dataset.lon);
            function handleNote(noteId) {
                if (!noteId)
                    return false;
                const $noteSection = document.getElementById(`note-` + noteId);
                if (!($noteSection instanceof HTMLTableSectionElement))
                    return false;
                if ($noteSection.classList.contains('hidden'))
                    return false;
                photoDialog.close();
                pingNoteSection($noteSection);
                return true;
            }
            function handleElement(elementType, elementId) {
                if (!elementId)
                    return false;
                if (elementType != 'node' && elementType != 'way' && elementType != 'relation')
                    return false;
                photoDialog.close();
                downloadAndShowElement($a, map, makeDate, elementType, elementId);
                return true;
            }
            function handleMap(zoom, lat, lon) {
                if (!(zoom && lat && lon))
                    return false;
                photoDialog.close();
                map.panAndZoomTo([Number(lat), Number(lon)], Number(zoom));
                return true;
            }
        };
        this.wrappedImageLinkClickListener = function (ev) {
            const $a = this;
            ev.preventDefault();
            ev.stopPropagation();
            photoDialog.toggle($a.href);
        };
    }
    writeCommentText($cell, commentText, showImages) {
        const result = [];
        const images = [];
        let iImage = 0;
        for (const item of getCommentItems(commentText)) {
            if (item.type == 'link' && item.link == 'image') {
                const $inlineLink = makeLink(item.href, item.href);
                $inlineLink.classList.add('image', 'inline');
                $inlineLink.addEventListener('click', this.wrappedImageLinkClickListener);
                result.push($inlineLink);
                const $img = document.createElement('img');
                $img.loading = 'lazy'; // this + display:none is not enough to surely stop the browser from accessing the image link
                if (showImages)
                    $img.src = item.href; // therefore only set the link if user agreed to loading
                $img.alt = `attached photo`;
                $img.addEventListener('error', imageErrorHandler);
                const $floatLink = document.createElement('a');
                $floatLink.classList.add('image', 'float');
                $floatLink.href = item.href;
                $floatLink.append($img);
                $floatLink.addEventListener('click', this.wrappedImageLinkClickListener);
                images.push($floatLink);
                if (!iImage) {
                    $cell.addEventListener('mouseover', imageCommentHoverListener);
                    $cell.addEventListener('mouseout', imageCommentHoverListener);
                }
                iImage++;
            }
            else if (item.type == 'link' && item.link == 'osm') {
                const $a = makeLink(item.text, item.href);
                $a.classList.add('osm');
                if (item.map)
                    [$a.dataset.zoom, $a.dataset.lat, $a.dataset.lon] = item.map;
                if (item.osm == 'note') {
                    $a.classList.add('other-note');
                    $a.dataset.noteId = String(item.id);
                    // updateNoteLink($a) // handleNotesUpdate() is going to be run anyway
                }
                if (item.osm == 'element') {
                    $a.dataset.elementType = item.element;
                    $a.dataset.elementId = String(item.id);
                }
                $a.addEventListener('click', this.wrappedOsmLinkClickListener);
                result.push($a);
            }
            else {
                result.push(item.text);
            }
        }
        $cell.append(...images, ...result);
    }
    handleShowImagesUpdate(showImages) {
        for (const $a of this.$table.querySelectorAll('td.note-comment a.image.float')) {
            if (!($a instanceof HTMLAnchorElement))
                continue;
            const $img = $a.firstChild;
            if (!($img instanceof HTMLImageElement))
                continue;
            if (showImages && !$img.src)
                $img.src = $a.href; // don't remove src when showImages is disabled, otherwise will reload all images when src is set back
        }
    }
    handleNotesUpdate() {
        for (const $a of this.$table.querySelectorAll('td.note-comment a.other-note')) {
            if (!($a instanceof HTMLAnchorElement))
                continue;
            updateNoteLink($a);
        }
    }
}
function makeDate(readableDate) {
    const [readableDateWithoutTime] = readableDate.split(' ', 1);
    if (readableDate && readableDateWithoutTime) {
        const $time = document.createElement('time');
        $time.textContent = readableDateWithoutTime;
        $time.dateTime = `${readableDate}Z`;
        $time.title = `${readableDate} UTC`;
        return $time;
        // TODO handler to update overpass timestamp
    }
    else {
        const $unknownDateTime = document.createElement('span');
        $unknownDateTime.textContent = `?`;
        return $unknownDateTime;
    }
}
function updateNoteLink($a) {
    const $noteSection = document.getElementById(`note-` + $a.dataset.noteId);
    if (!($noteSection instanceof HTMLTableSectionElement)) {
        $a.classList.add('absent');
        $a.title = `The note is not downloaded`;
    }
    else if ($noteSection.classList.contains('hidden')) {
        $a.classList.add('absent');
        $a.title = `The note is filtered out`;
    }
    else {
        $a.classList.remove('absent');
        $a.title = '';
    }
}
function imageCommentHoverListener(ev) {
    const $targetLink = getTargetLink();
    if (!$targetLink)
        return;
    const $floats = this.querySelectorAll('a.image.float');
    const $inlines = this.querySelectorAll('a.image.inline');
    for (let i = 0; i < $floats.length && i < $inlines.length; i++) {
        if ($floats[i] == $targetLink) {
            modifyTwinLink($inlines[i]);
            return;
        }
        if ($inlines[i] == $targetLink) {
            modifyTwinLink($floats[i]);
            return;
        }
    }
    function getTargetLink() {
        if (ev.target instanceof HTMLAnchorElement)
            return ev.target;
        if (!(ev.target instanceof HTMLElement))
            return null;
        return ev.target.closest('a');
    }
    function modifyTwinLink($a) {
        $a.classList.toggle('active', ev.type == 'mouseover');
    }
}
function imageErrorHandler() {
    this.removeAttribute('alt'); // render broken image icon
}

function toReadableDate(date) {
    if (date == null)
        return '';
    const pad = (n) => ('0' + n).slice(-2);
    const dateObject = new Date(date * 1000);
    const dateString = dateObject.getUTCFullYear() +
        '-' +
        pad(dateObject.getUTCMonth() + 1) +
        '-' +
        pad(dateObject.getUTCDate()) +
        ' ' +
        pad(dateObject.getUTCHours()) +
        ':' +
        pad(dateObject.getUTCMinutes()) +
        ':' +
        pad(dateObject.getUTCSeconds());
    return dateString;
}
function toUrlDate(date) {
    const pad = (n) => ('0' + n).slice(-2);
    const dateObject = new Date(date * 1000);
    const dateString = dateObject.getUTCFullYear() +
        pad(dateObject.getUTCMonth() + 1) +
        pad(dateObject.getUTCDate()) +
        'T' +
        pad(dateObject.getUTCHours()) +
        pad(dateObject.getUTCMinutes()) +
        pad(dateObject.getUTCSeconds()) +
        'Z';
    return dateString;
}
function toDateQuery(readableDate) {
    let s = readableDate.trim();
    let m = '';
    let r = '';
    {
        if (s == '')
            return empty();
        const match = s.match(/^((\d\d\d\d)-?)(.*)/);
        if (!match)
            return invalid();
        next(match);
    }
    {
        if (s == '')
            return complete();
        const match = s.match(/^((\d\d)-?)(.*)/);
        if (!match)
            return invalid();
        r += '-';
        next(match);
    }
    {
        if (s == '')
            return complete();
        const match = s.match(/^((\d\d)[T ]?)(.*)/);
        if (!match)
            return invalid();
        r += '-';
        next(match);
    }
    {
        if (s == '')
            return complete();
        const match = s.match(/^((\d\d):?)(.*)/);
        if (!match)
            return invalid();
        r += ' ';
        next(match);
    }
    {
        if (s == '')
            return complete();
        const match = s.match(/^((\d\d):?)(.*)/);
        if (!match)
            return invalid();
        r += ':';
        next(match);
    }
    {
        if (s == '')
            return complete();
        const match = s.match(/^((\d\d)Z?)$/);
        if (!match)
            return invalid();
        r += ':';
        next(match);
    }
    return complete();
    function next(match) {
        m += match[1];
        r += match[2];
        s = match[3];
    }
    function empty() {
        return {
            dateType: 'empty'
        };
    }
    function invalid() {
        let message = `invalid date string`;
        if (m != '')
            message += ` after ${m}`;
        return {
            dateType: 'invalid',
            message
        };
    }
    function complete() {
        const completionTemplate = '2000-01-01 00:00:00Z';
        const completedReadableDate = r + completionTemplate.slice(r.length);
        return {
            dateType: 'valid',
            date: Date.parse(completedReadableDate) / 1000
        };
    }
}

class NoteTable {
    constructor($container, commandPanel, map, filter, photoDialog, showImages) {
        this.commandPanel = commandPanel;
        this.map = map;
        this.filter = filter;
        this.showImages = showImages;
        this.$table = document.createElement('table');
        this.$selectAllCheckbox = document.createElement('input');
        this.noteSectionLayerIdVisibility = new Map();
        this.notesById = new Map(); // in the future these might be windowed to limit the amount of stuff on one page
        this.usersById = new Map();
        this.commentWriter = new NoteTableCommentWriter(this.$table, this.map, photoDialog, $noteSection => this.focusOnNote($noteSection));
        const that = this;
        let $clickReadyNoteSection;
        this.wrappedNoteSectionListeners = [
            ['mouseenter', function () {
                    if (this.classList.contains('active-click'))
                        return;
                    that.activateNote('hover', this);
                }],
            ['mouseleave', function () {
                    that.deactivateNote('hover', this);
                }],
            ['mousemove', function () {
                    $clickReadyNoteSection = undefined; // ideally should be reset by 'selectstart' event, however Chrome fires it even if no mouse drag has happened
                    if (!this.classList.contains('active-click'))
                        return;
                    resetFadeAnimation(this, 'active-click-fade');
                }],
            ['animationend', function () {
                    that.deactivateNote('click', this);
                }],
            ['mousedown', function () {
                    $clickReadyNoteSection = this;
                }],
            // ['selectstart',function(){
            // 	$clickReadyNoteSection=undefined // Chrome is too eager to fire this event, have to cancel click from 'mousemove' instead
            // }],
            ['click', function () {
                    if ($clickReadyNoteSection == this) {
                        photoDialog.close();
                        that.focusOnNote(this, true);
                    }
                    $clickReadyNoteSection = undefined;
                }]
        ];
        this.wrappedNoteCheckboxClickListener = function (ev) {
            that.noteCheckboxClickListener(this, ev);
        };
        this.wrappedAllNotesCheckboxClickListener = function (ev) {
            that.allNotesCheckboxClickListener(this, ev);
        };
        this.wrappedCommentRadioClickListener = function (ev) {
            that.commentRadioClickListener(this, ev);
        };
        this.wrappedNoteMarkerClickListener = function () {
            that.noteMarkerClickListener(this);
        };
        this.noteSectionVisibilityObserver = new NoteSectionVisibilityObserver(commandPanel, map, this.noteSectionLayerIdVisibility);
        this.$table.classList.toggle('with-images', showImages);
        $container.append(this.$table);
        {
            const $header = this.$table.createTHead();
            const $row = $header.insertRow();
            const $checkboxCell = makeHeaderCell('');
            this.$selectAllCheckbox.type = 'checkbox';
            this.$selectAllCheckbox.title = `check/uncheck all`;
            this.$selectAllCheckbox.addEventListener('click', this.wrappedAllNotesCheckboxClickListener);
            $checkboxCell.append(this.$selectAllCheckbox);
            $row.append($checkboxCell, makeHeaderCell('id'), makeHeaderCell('date'), makeHeaderCell('user'), makeHeaderCell('?', `Action performed along with adding the comment. Also a radio button. Click to select comment for Overpass turbo commands.`), makeHeaderCell('comment'));
        }
        function makeHeaderCell(text, title) {
            const $cell = document.createElement('th');
            $cell.textContent = text;
            if (title)
                $cell.title = title;
            return $cell;
        }
        this.updateCheckboxDependents();
    }
    updateFilter(filter) {
        let nFetched = 0;
        let nVisible = 0;
        this.filter = filter;
        const getUsername = (uid) => this.usersById.get(uid);
        for (const $noteSection of this.$table.querySelectorAll('tbody')) {
            const noteId = Number($noteSection.dataset.noteId);
            const note = this.notesById.get(noteId);
            const layerId = Number($noteSection.dataset.layerId);
            if (note == null)
                continue;
            nFetched++;
            if (this.filter.matchNote(note, getUsername)) {
                nVisible++;
                const marker = this.map.filteredNoteLayer.getLayer(layerId);
                if (marker) {
                    this.map.filteredNoteLayer.removeLayer(marker);
                    this.map.noteLayer.addLayer(marker);
                }
                $noteSection.classList.remove('hidden');
            }
            else {
                this.deactivateNote('click', $noteSection);
                this.deactivateNote('hover', $noteSection);
                const marker = this.map.noteLayer.getLayer(layerId);
                if (marker) {
                    this.map.noteLayer.removeLayer(marker);
                    this.map.filteredNoteLayer.addLayer(marker);
                }
                $noteSection.classList.add('hidden');
                const $checkbox = $noteSection.querySelector('.note-checkbox input');
                if ($checkbox instanceof HTMLInputElement)
                    $checkbox.checked = false;
            }
        }
        this.commandPanel.receiveNoteCounts(nFetched, nVisible);
        this.updateCheckboxDependents();
        this.commentWriter.handleNotesUpdate();
    }
    /**
     * @returns number of added notes that passed through the filter
     */
    addNotes(notes, users) {
        // remember notes and users
        for (const note of notes) {
            this.notesById.set(note.id, note);
        }
        for (const [uid, username] of Object.entries(users)) {
            this.usersById.set(Number(uid), username);
        }
        // output table
        let nUnfilteredNotes = 0;
        const getUsername = (uid) => users[uid];
        for (const note of notes) {
            const isVisible = this.filter.matchNote(note, getUsername);
            if (isVisible)
                nUnfilteredNotes++;
            const $noteSection = this.writeNote(note, isVisible);
            let $row = $noteSection.insertRow();
            const nComments = note.comments.length;
            {
                const $cell = $row.insertCell();
                $cell.classList.add('note-checkbox');
                if (nComments > 1)
                    $cell.rowSpan = nComments;
                const $checkbox = document.createElement('input');
                $checkbox.type = 'checkbox';
                $checkbox.title = `shift+click to check/uncheck a range`;
                $checkbox.addEventListener('click', this.wrappedNoteCheckboxClickListener);
                $cell.append($checkbox);
            }
            {
                const $cell = $row.insertCell();
                if (nComments > 1)
                    $cell.rowSpan = nComments;
                const $a = document.createElement('a');
                $a.href = `https://www.openstreetmap.org/note/` + encodeURIComponent(note.id);
                $a.textContent = `${note.id}`;
                $cell.append($a);
            }
            let iComment = 0;
            for (const comment of note.comments) {
                {
                    if (iComment > 0) {
                        $row = $noteSection.insertRow();
                    }
                }
                {
                    const $cell = $row.insertCell();
                    $cell.classList.add('note-date');
                    $cell.append(makeDate(toReadableDate(comment.date)));
                }
                {
                    const $cell = $row.insertCell();
                    $cell.classList.add('note-user');
                    if (comment.uid != null) {
                        const username = users[comment.uid];
                        if (username != null) {
                            $cell.append(makeUserNameLink(username));
                        }
                        else {
                            $cell.append(`#${comment.uid}`);
                        }
                    }
                }
                {
                    const $cell = $row.insertCell();
                    $cell.classList.add('note-action');
                    const $span = document.createElement('span');
                    $span.classList.add('icon', getActionClass(comment.action));
                    $span.title = comment.action;
                    const $radio = document.createElement('input');
                    $radio.type = 'radio';
                    $radio.name = 'comment';
                    $radio.value = `${note.id}-${iComment}`;
                    $radio.addEventListener('click', this.wrappedCommentRadioClickListener);
                    $span.append($radio);
                    $cell.append($span);
                }
                {
                    const $cell = $row.insertCell();
                    $cell.classList.add('note-comment');
                    this.commentWriter.writeCommentText($cell, comment.text, this.showImages);
                }
                iComment++;
            }
        }
        if (this.commandPanel.fitMode == 'allNotes') {
            this.map.fitNotes();
        }
        else {
            this.map.fitNotesIfNeeded();
        }
        let nFetched = 0;
        let nVisible = 0;
        for (const $noteSection of this.$table.querySelectorAll('tbody')) {
            if (!$noteSection.dataset.noteId)
                continue;
            nFetched++;
            if (!$noteSection.classList.contains('hidden'))
                nVisible++;
        }
        this.commandPanel.receiveNoteCounts(nFetched, nVisible);
        this.commentWriter.handleNotesUpdate();
        return nUnfilteredNotes;
    }
    setShowImages(showImages) {
        this.showImages = showImages;
        this.$table.classList.toggle('with-images', showImages);
        this.commentWriter.handleShowImagesUpdate(showImages);
    }
    writeNote(note, isVisible) {
        const marker = new NoteMarker(note);
        const parentLayer = (isVisible ? this.map.noteLayer : this.map.filteredNoteLayer);
        marker.addTo(parentLayer);
        marker.on('click', this.wrappedNoteMarkerClickListener);
        const layerId = this.map.noteLayer.getLayerId(marker);
        const $noteSection = this.$table.createTBody();
        if (!isVisible)
            $noteSection.classList.add('hidden');
        $noteSection.id = `note-${note.id}`;
        $noteSection.classList.add(getStatusClass(note.status));
        $noteSection.dataset.layerId = String(layerId);
        $noteSection.dataset.noteId = String(note.id);
        for (const [event, listener] of this.wrappedNoteSectionListeners) {
            $noteSection.addEventListener(event, listener);
        }
        this.noteSectionLayerIdVisibility.set(layerId, false);
        this.noteSectionVisibilityObserver.observe($noteSection);
        if (isVisible) {
            if (this.$selectAllCheckbox.checked) {
                this.$selectAllCheckbox.checked = false;
                this.$selectAllCheckbox.indeterminate = true;
            }
        }
        return $noteSection;
    }
    noteMarkerClickListener(marker) {
        const $noteSection = document.getElementById(`note-` + marker.noteId);
        if (!($noteSection instanceof HTMLTableSectionElement))
            return;
        this.focusOnNote($noteSection);
    }
    noteCheckboxClickListener($checkbox, ev) {
        ev.stopPropagation();
        const $clickedNoteSection = $checkbox.closest('tbody');
        if ($clickedNoteSection) {
            if (ev.shiftKey && this.$lastClickedNoteSection) {
                for (const $section of this.listVisibleNoteSectionsInRange(this.$lastClickedNoteSection, $clickedNoteSection)) {
                    const $checkboxInRange = $section.querySelector('.note-checkbox input');
                    if ($checkboxInRange instanceof HTMLInputElement)
                        $checkboxInRange.checked = $checkbox.checked;
                }
            }
            this.$lastClickedNoteSection = $clickedNoteSection;
        }
        this.updateCheckboxDependents();
    }
    allNotesCheckboxClickListener($allCheckbox, ev) {
        for (const $noteSection of this.listVisibleNoteSections()) {
            const $checkbox = $noteSection.querySelector('.note-checkbox input');
            if (!($checkbox instanceof HTMLInputElement))
                continue;
            $checkbox.checked = $allCheckbox.checked;
        }
        this.updateCheckboxDependents();
    }
    commentRadioClickListener($radio, ev) {
        ev.stopPropagation();
        const $clickedRow = $radio.closest('tr');
        if (!$clickedRow)
            return;
        const $time = $clickedRow.querySelector('time');
        if (!$time)
            return;
        const $text = $clickedRow.querySelector('td.note-comment');
        this.commandPanel.receiveCheckedComment($time.dateTime, $text?.textContent ?? undefined);
    }
    focusOnNote($noteSection, isSectionClicked = false) {
        this.activateNote('click', $noteSection);
        this.noteSectionVisibilityObserver.haltMapFitting(); // otherwise scrollIntoView() may ruin note pan/zoom - it may cause observer to fire after exiting this function
        if (!isSectionClicked)
            $noteSection.scrollIntoView({ block: 'nearest' });
        const layerId = Number($noteSection.dataset.layerId);
        const marker = this.map.noteLayer.getLayer(layerId);
        if (!(marker instanceof L.Marker))
            return;
        const z1 = this.map.zoom;
        const z2 = this.map.maxZoom;
        if (this.map.isCloseEnoughToCenter(marker.getLatLng()) && z1 < z2) {
            const nextZoom = Math.min(z2, z1 + Math.ceil((z2 - z1) / 2));
            this.map.panAndZoomTo(marker.getLatLng(), nextZoom);
        }
        else {
            this.map.panTo(marker.getLatLng());
        }
    }
    deactivateNote(type, $noteSection) {
        $noteSection.classList.remove('active-' + type);
        if ($noteSection.classList.contains('active-hover') || $noteSection.classList.contains('active-click'))
            return;
        const layerId = Number($noteSection.dataset.layerId);
        const marker = this.map.noteLayer.getLayer(layerId);
        if (!(marker instanceof L.Marker))
            return;
        marker.setZIndexOffset(0);
        marker.setOpacity(0.5);
    }
    activateNote(type, $noteSection) {
        let alreadyActive = false;
        for (const $otherNoteSection of this.$table.querySelectorAll('tbody.active-' + type)) {
            if (!($otherNoteSection instanceof HTMLTableSectionElement))
                continue;
            if ($otherNoteSection == $noteSection) {
                alreadyActive = true;
                if (type == 'click')
                    resetFadeAnimation($noteSection, 'active-click-fade');
            }
            else {
                this.deactivateNote(type, $otherNoteSection);
            }
        }
        if (alreadyActive)
            return;
        const layerId = Number($noteSection.dataset.layerId);
        const marker = this.map.noteLayer.getLayer(layerId);
        if (!(marker instanceof L.Marker))
            return;
        marker.setOpacity(1);
        marker.setZIndexOffset(1000);
        $noteSection.classList.add('active-' + type);
    }
    updateCheckboxDependents() {
        const checkedNotes = [];
        const checkedNoteUsers = new Map();
        let hasUnchecked = false;
        for (const $noteSection of this.listVisibleNoteSections()) {
            const $checkbox = $noteSection.querySelector('.note-checkbox input');
            if (!($checkbox instanceof HTMLInputElement))
                continue;
            if (!$checkbox.checked) {
                hasUnchecked = true;
                continue;
            }
            const noteId = Number($noteSection.dataset.noteId);
            const note = this.notesById.get(noteId);
            if (!note)
                continue;
            checkedNotes.push(note);
            for (const comment of note.comments) {
                if (comment.uid == null)
                    continue;
                const username = this.usersById.get(comment.uid);
                if (username == null)
                    continue;
                checkedNoteUsers.set(comment.uid, username);
            }
        }
        let hasChecked = checkedNotes.length > 0;
        this.$selectAllCheckbox.indeterminate = hasChecked && hasUnchecked;
        this.$selectAllCheckbox.checked = hasChecked && !hasUnchecked;
        this.commandPanel.receiveCheckedNotes(checkedNotes, checkedNoteUsers);
    }
    listVisibleNoteSections() {
        return this.$table.querySelectorAll('tbody:not(.hidden)');
    }
    /**
     * range including $fromSection but excluding $toSection
     * excludes $toSection if equals to $fromSection
     */
    *listVisibleNoteSectionsInRange($fromSection, $toSection) {
        const $sections = this.listVisibleNoteSections();
        let i = 0;
        let $guardSection;
        for (; i < $sections.length; i++) {
            const $section = $sections[i];
            if ($section == $fromSection) {
                $guardSection = $toSection;
                break;
            }
            if ($section == $toSection) {
                $guardSection = $fromSection;
                break;
            }
        }
        if (!$guardSection)
            return;
        for (; i < $sections.length; i++) {
            const $section = $sections[i];
            if ($section != $toSection) {
                yield $section;
            }
            if ($section == $guardSection) {
                return;
            }
        }
    }
}
class NoteSectionVisibilityObserver {
    constructor(commandPanel, map, noteSectionLayerIdVisibility) {
        this.isMapFittingHalted = false;
        const noteSectionVisibilityHandler = () => {
            const visibleLayerIds = [];
            for (const [layerId, visibility] of noteSectionLayerIdVisibility) {
                if (visibility)
                    visibleLayerIds.push(layerId);
            }
            map.showNoteTrack(visibleLayerIds);
            if (!this.isMapFittingHalted && commandPanel.fitMode == 'inViewNotes')
                map.fitNoteTrack();
        };
        this.intersectionObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!(entry.target instanceof HTMLElement))
                    continue;
                const layerId = entry.target.dataset.layerId;
                if (layerId == null)
                    continue;
                noteSectionLayerIdVisibility.set(Number(layerId), entry.isIntersecting);
            }
            clearTimeout(this.visibilityTimeoutId);
            this.visibilityTimeoutId = setTimeout(noteSectionVisibilityHandler);
        });
    }
    observe($noteSection) {
        this.intersectionObserver.observe($noteSection);
    }
    haltMapFitting() {
        clearTimeout(this.visibilityTimeoutId);
        clearTimeout(this.haltingTimeoutId);
        this.isMapFittingHalted = true;
        this.haltingTimeoutId = setTimeout(() => {
            this.isMapFittingHalted = false;
        }, 100);
    }
}
function getStatusClass(status) {
    if (status == 'open') {
        return 'open';
    }
    else if (status == 'closed' || status == 'hidden') {
        return 'closed';
    }
    else {
        return 'other';
    }
}
function getActionClass(action) {
    if (action == 'opened' || action == 'reopened') {
        return 'open';
    }
    else if (action == 'closed' || action == 'hidden') {
        return 'closed';
    }
    else {
        return 'other';
    }
}

const p = (...ss) => makeElement('p')()(...ss);
const em = (s) => makeElement('em')()(s);
const dfn = (s) => makeElement('dfn')()(s);
class CommandPanel {
    constructor($container, map, storage) {
        this.$container = $container;
        // { TODO register callbacks from command groups instead
        this.$fitModeSelect = document.createElement('select');
        this.$commentTimeSelect = document.createElement('select');
        this.$commentTimeInput = document.createElement('input');
        this.$fetchedNoteCount = document.createElement('output');
        this.$visibleNoteCount = document.createElement('output');
        this.$checkedNoteCount = document.createElement('output');
        // }
        this.$buttonsRequiringSelectedNotes = [];
        this.checkedNotes = [];
        this.checkedNoteUsers = new Map();
        for (const [id, name, title, getTool, getInfo] of CommandPanel.commandGroups) {
            const storageKey = 'commands-' + id;
            const $toolDetails = document.createElement('details');
            $toolDetails.classList.add('tool');
            $toolDetails.open = !!storage.getItem(storageKey);
            const $toolSummary = document.createElement('summary');
            $toolSummary.textContent = name;
            if (title)
                $toolSummary.title = title;
            $toolDetails.addEventListener('toggle', () => {
                if ($toolDetails.open) {
                    storage.setItem(storageKey, '1');
                }
                else {
                    storage.removeItem(storageKey);
                }
            });
            $toolDetails.append($toolSummary, ...getTool(this, map));
            if (getInfo) {
                const $infoDetails = document.createElement('details');
                $infoDetails.classList.add('info');
                const $infoSummary = document.createElement('summary');
                $infoSummary.textContent = `${name} info`;
                $infoDetails.append($infoSummary, ...getInfo());
                const $infoButton = document.createElement('button');
                $infoButton.classList.add('info');
                $infoButton.title = `tool info`;
                const updateInfoButton = () => {
                    if ($infoDetails.open) {
                        $infoButton.classList.add('open');
                    }
                    else {
                        $infoButton.classList.remove('open');
                    }
                };
                updateInfoButton();
                $infoButton.addEventListener('click', () => {
                    $infoDetails.open = !$infoDetails.open;
                });
                $infoDetails.addEventListener('toggle', () => {
                    updateInfoButton();
                });
                $toolDetails.addEventListener('toggle', () => {
                    if ($toolDetails.open)
                        return;
                    $infoDetails.open = false;
                });
                $toolDetails.append(` `, $infoButton);
                $container.append($toolDetails, $infoDetails);
            }
            else {
                $container.append($toolDetails);
            }
        }
    }
    receiveNoteCounts(nFetched, nVisible) {
        this.$fetchedNoteCount.textContent = String(nFetched);
        this.$visibleNoteCount.textContent = String(nVisible);
    }
    receiveCheckedNotes(checkedNotes, checkedNoteUsers) {
        this.$checkedNoteCount.textContent = String(checkedNotes.length);
        this.checkedNotes = checkedNotes;
        this.checkedNoteUsers = checkedNoteUsers;
        for (const $button of this.$buttonsRequiringSelectedNotes) {
            $button.disabled = checkedNotes.length <= 0;
        }
    }
    receiveCheckedComment(checkedCommentTime, checkedCommentText) {
        this.checkedCommentTime = checkedCommentTime;
        this.checkedCommentText = checkedCommentText;
        this.pickCommentTime();
    }
    get fitMode() {
        const mode = this.$fitModeSelect.value;
        if (mode == 'allNotes' || mode == 'inViewNotes')
            return mode;
    }
    disableFitting() {
        this.$fitModeSelect.value = 'none';
    }
    pickCommentTime() {
        const setTime = (time) => {
            this.$commentTimeInput.value = time;
        };
        if (this.$commentTimeSelect.value == 'text' && this.checkedCommentText != null) {
            const match = this.checkedCommentText.match(/\d\d\d\d-\d\d-\d\d[T ]\d\d:\d\d:\d\dZ/);
            if (match) {
                const [time] = match;
                return setTime(time);
            }
        }
        setTime(this.checkedCommentTime ?? '');
    }
    getOverpassQueryPreamble(map) {
        const time = this.$commentTimeInput.value;
        const bounds = map.bounds;
        let query = '';
        if (time)
            query += `[date:"${time}"]\n`;
        query += `[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}]\n`;
        // query+=`[bbox:${bounds.toBBoxString()}];\n` // nope, different format
        query += `;\n`;
        return query;
    }
    makeRequiringSelectedNotesButton() {
        const $button = document.createElement('button');
        $button.disabled = true;
        this.$buttonsRequiringSelectedNotes.push($button);
        return $button;
    }
}
CommandPanel.commandGroups = [[
        'autozoom',
        `Automatic zoom`,
        `Pan and zoom the map to visible notes`,
        (cp, map) => {
            cp.$fitModeSelect.append(new Option('is disabled', 'none'), new Option('to notes in table view', 'inViewNotes'), new Option('to all notes', 'allNotes'));
            cp.$fitModeSelect.addEventListener('change', () => {
                if (cp.fitMode == 'allNotes') {
                    map.fitNotes();
                }
                else if (cp.fitMode == 'inViewNotes') {
                    map.fitNoteTrack();
                }
            });
            return [cp.$fitModeSelect];
        }, () => [p(`Pan and zoom the map to notes in the table. `, `Can be used as `, em(`zoom to data`), ` for notes layer if `, dfn(`to all notes`), ` is selected. `), p(dfn(`To notes in table view`), ` allows to track notes in the table that are currently visible on screen, panning the map as you scroll through the table. `, `This option is convenient to use when `, em(`Track between notes`), ` map layer is enabled (and it is enabled by default). This way you can see the current sequence of notes from the table on the map, connected by a line in an order in which they appear in the table.`)]
    ], [
        'timestamp',
        `Timestamp for historic queries`, ,
        (cp, map) => {
            const $commentTimeSelectLabel = document.createElement('label');
            cp.$commentTimeSelect.append(new Option('from comment text', 'text'), new Option('of comment', 'comment'));
            $commentTimeSelectLabel.append(`pick time `, cp.$commentTimeSelect);
            $commentTimeSelectLabel.title = `"from comment text" looks for time inside the comment text. Useful for MAPS.ME-generated comments. Falls back to the comment time if no time detected in the text.`;
            cp.$commentTimeSelect = cp.$commentTimeSelect;
            const $commentTimeInputLabel = document.createElement('label');
            // cp.$commentTimeInput.type='datetime-local'
            // cp.$commentTimeInput.step='1'
            cp.$commentTimeInput.type = 'text';
            cp.$commentTimeInput.size = 20;
            // cp.$commentTimeInput.readOnly=true
            $commentTimeInputLabel.append(`picked `, cp.$commentTimeInput);
            $commentTimeInputLabel.title = `In whatever format Overpass understands. No standard datetime input for now because they're being difficult with UTC and 24-hour format.`;
            cp.$commentTimeSelect.addEventListener('input', () => cp.pickCommentTime());
            const $clearButton = document.createElement('button');
            $clearButton.textContent = 'Clear';
            $clearButton.addEventListener('click', () => {
                cp.$commentTimeInput.value = '';
            });
            return [$commentTimeSelectLabel, ` — `, $commentTimeInputLabel, ` `, $clearButton];
        }, () => [p(`Allows to select a timestamp for use with `, em(`Overpass`), ` and `, em(`Overpass turbo`), ` commands. `, `You can either enter the timestamp in ISO format manually or pick it from the comment. `, `If present, a `, makeLink(`date setting`, `https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#date`), ` is added to Overpass queries. `, `The idea is to allow for examining the OSM data at the moment some note was opened/commented/closed to evaluate if this action was correct.`), p(`Entering the timestamp manually is likely not what you want. `, `Picking from a comment is done by clicking a note status icon in `, em(`?`), ` table column. `, `When `, dfn(`from comment text`), ` is selected, the comment text is examined for timestamps first. This is to handle comments generated by `, makeLink(`MAPS.ME`, `https://wiki.openstreetmap.org/wiki/MAPS.ME`), ` that include OSM data timestamp. `, `If that fails or when `, dfn(`of comment`), ` is selected, the comment timestamp is used instead. `, `This is a part of older UI that forced users to select a comment before being able to perform Overpass queries. It's likely to change soon by being replaced with clickable dates.`)]
    ], [
        'overpass-turbo',
        `Overpass turbo`, ,
        (cp, map) => {
            const $overpassButtons = [];
            const buttonClickListener = (withRelations, onlyAround) => {
                let query = cp.getOverpassQueryPreamble(map);
                if (withRelations) {
                    query += `nwr`;
                }
                else {
                    query += `nw`;
                }
                if (onlyAround) {
                    const radius = 10;
                    query += `(around:${radius},${map.lat},${map.lon})`;
                }
                query += `;\n`;
                query += `out meta geom;`;
                const location = `${map.lat};${map.lon};${map.zoom}`;
                const url = `https://overpass-turbo.eu/?C=${encodeURIComponent(location)}&Q=${encodeURIComponent(query)}`;
                open(url, 'overpass-turbo');
            };
            {
                const $button = document.createElement('button');
                $button.append(`Load `, makeMapIcon('area'), ` without relations`);
                $button.addEventListener('click', () => buttonClickListener(false, false));
                $overpassButtons.push($button);
            }
            {
                const $button = document.createElement('button');
                $button.append(`Load `, makeMapIcon('area'), ` with relations`);
                $button.title = `May fetch large unwanted relations like routes.`;
                $button.addEventListener('click', () => buttonClickListener(true, false));
                $overpassButtons.push($button);
            }
            {
                const $button = document.createElement('button');
                $button.append(`Load around `, makeMapIcon('center'));
                $button.addEventListener('click', () => buttonClickListener(false, true));
                $overpassButtons.push($button);
            }
            const result = [];
            for (const $button of $overpassButtons) {
                result.push(` `, $button);
            }
            return result;
        }, () => [p(`Some Overpass queries to run from `, makeLink(`Overpass turbo`, 'https://wiki.openstreetmap.org/wiki/Overpass_turbo'), `, web UI for Overpass API. `, `Useful to inspect historic data at the time a particular note comment was made.`)]
    ], [
        'overpass',
        `Overpass`, ,
        (cp, map) => {
            const $button = document.createElement('button');
            $button.append(`Find closest node to `, makeMapIcon('center'));
            const $a = document.createElement('a');
            $a.innerText = `link`;
            $button.addEventListener('click', async () => {
                $button.disabled = true;
                $a.removeAttribute('href');
                try {
                    const radius = 10;
                    let query = cp.getOverpassQueryPreamble(map);
                    query += `node(around:${radius},${map.lat},${map.lon});\n`;
                    query += `out skel;`;
                    const doc = await makeOverpassQuery($button, query);
                    if (!doc)
                        return;
                    const closestNodeId = getClosestNodeId(doc, map.lat, map.lon);
                    if (!closestNodeId) {
                        $button.classList.add('error');
                        $button.title = `Could not find nodes nearby`;
                        return;
                    }
                    const url = `https://www.openstreetmap.org/node/` + encodeURIComponent(closestNodeId);
                    $a.href = url;
                    downloadAndShowElement($a, map, makeDate, 'node', closestNodeId);
                }
                finally {
                    $button.disabled = false;
                }
            });
            return [$button, ` `, $a];
        }, () => [p(`Query `, makeLink(`Overpass API`, 'https://wiki.openstreetmap.org/wiki/Overpass_API'), ` without going through Overpass turbo. `, `Shows results on the map. Also gives link to the element page on the OSM website.`)]
    ], [
        'rc',
        `RC`,
        `JOSM (or another editor) Remote Control`,
        (cp, map) => {
            const e = makeEscapeTag(encodeURIComponent);
            const $loadNotesButton = cp.makeRequiringSelectedNotesButton();
            $loadNotesButton.append(`Load `, makeNotesIcon('selected'));
            $loadNotesButton.addEventListener('click', async () => {
                for (const { id } of cp.checkedNotes) {
                    const noteUrl = e `https://www.openstreetmap.org/note/${id}`;
                    const rcUrl = e `http://127.0.0.1:8111/import?url=${noteUrl}`;
                    const success = await openRcUrl($loadNotesButton, rcUrl);
                    if (!success)
                        break;
                }
            });
            const $loadMapButton = document.createElement('button');
            $loadMapButton.append(`Load `, makeMapIcon('area'));
            $loadMapButton.addEventListener('click', () => {
                const bounds = map.bounds;
                const rcUrl = e `http://127.0.0.1:8111/load_and_zoom` +
                    `?left=${bounds.getWest()}&right=${bounds.getEast()}` +
                    `&top=${bounds.getNorth()}&bottom=${bounds.getSouth()}`;
                openRcUrl($loadMapButton, rcUrl);
            });
            return [$loadNotesButton, ` `, $loadMapButton];
        }, () => [p(`Load note/map data to an editor with `, makeLink(`remote control`, 'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl'), `.`)]
    ], [
        'id',
        `iD`, ,
        (cp, map) => {
            // limited to what hashchange() lets you do here https://github.com/openstreetmap/iD/blob/develop/modules/behavior/hash.js
            // which is zooming/panning
            const $zoomButton = document.createElement('button');
            $zoomButton.append(`Open `, makeMapIcon('center'));
            $zoomButton.addEventListener('click', () => {
                const e = makeEscapeTag(encodeURIComponent);
                const url = e `https://www.openstreetmap.org/id#map=${map.zoom}/${map.lat}/${map.lon}`;
                open(url, 'id');
            });
            return [$zoomButton];
        }, () => [p(`Follow your notes by zooming from one place to another in one `, makeLink(`iD editor`, 'https://wiki.openstreetmap.org/wiki/ID'), ` window. `, `It could be faster to do first here in note-viewer than in iD directly because note-viewer won't try to download more data during panning. `, `After zooming in note-viewer, click the `, em(`Open`), ` button to open this location in iD. `, `When you go back to note-viewer, zoom to another place and click the `, em(`Open`), ` button for the second time, the already opened iD instance zooms to that place. `, `Your edits are not lost between such zooms.`), p(`Technical details: this is an attempt to make something like `, em(`remote control`), ` in iD editor. `, `Convincing iD to load notes has proven to be tricky. `, `Your best chance of seeing the selected notes is importing them as a `, em(`gpx`), ` file. `, `See `, makeLink(`this diary post`, `https://www.openstreetmap.org/user/Anton%20Khorev/diary/398991`), ` for further explanations.`), p(`Zooming/panning is easier to do, and that's what is currently implemented. `, `It's not without quirks however. You'll notice that the iD window opened from here doesn't have the OSM website header. `, `This is because the editor is opened at `, makeLink(`/id`, `https://www.openstreetmap.org/id`), ` url instead of `, makeLink(`/edit`, `https://www.openstreetmap.org/edit`), `. `, `It has to be done because otherwise iD won't listen to `, em(`#map`), ` changes in the webpage location.`)]
    ], [
        'gpx',
        `GPX`, ,
        (cp, map) => {
            const $connectSelect = document.createElement('select');
            $connectSelect.append(new Option(`without connections`, 'no'), new Option(`connected by route`, 'rte'), new Option(`connected by track`, 'trk'));
            const $commentsSelect = document.createElement('select');
            $commentsSelect.append(new Option(`first comment`, 'first'), new Option(`all comments`, 'all'));
            const $dataTypeSelect = document.createElement('select');
            $dataTypeSelect.append(new Option('text/xml'), new Option('application/gpx+xml'), new Option('text/plain'));
            const $exportNotesButton = cp.makeRequiringSelectedNotesButton();
            $exportNotesButton.append(`Export `, makeNotesIcon('selected'));
            const e = makeEscapeTag(escapeXml);
            const getPoints = (pointTag, getDetails = () => '') => {
                let gpx = '';
                for (const note of cp.checkedNotes) {
                    const firstComment = note.comments[0];
                    gpx += e `<${pointTag} lat="${note.lat}" lon="${note.lon}">\n`;
                    if (firstComment)
                        gpx += e `<time>${toUrlDate(firstComment.date)}</time>\n`;
                    gpx += getDetails(note);
                    gpx += e `</${pointTag}>\n`;
                }
                return gpx;
            };
            const getGpx = () => {
                let gpx = e `<?xml version="1.0" encoding="UTF-8" ?>\n`;
                gpx += e `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">\n`;
                // TODO <name>selected notes of user A</name>
                gpx += getPoints('wpt', note => {
                    let gpx = '';
                    gpx += e `<name>${note.id}</name>\n`;
                    if (note.comments.length > 0) {
                        gpx += `<desc>`;
                        let first = true;
                        for (const comment of note.comments) {
                            if (first) {
                                first = false;
                            }
                            else {
                                gpx += `&#xA;\n`; // JOSM wants this kind of double newline, otherwise no space between comments is rendered
                            }
                            if (comment.uid) {
                                const username = cp.checkedNoteUsers.get(comment.uid);
                                if (username != null) {
                                    gpx += e `${username}`;
                                }
                                else {
                                    gpx += e `user #${comment.uid}`;
                                }
                            }
                            else {
                                gpx += `anonymous user`;
                            }
                            if ($commentsSelect.value == 'all')
                                gpx += e ` ${comment.action}`;
                            gpx += ` at ${toReadableDate(comment.date)}`;
                            if (comment.text)
                                gpx += e `: ${comment.text}`;
                            if ($commentsSelect.value != 'all')
                                break;
                        }
                        gpx += `</desc>\n`;
                    }
                    const noteUrl = `https://www.openstreetmap.org/note/` + encodeURIComponent(note.id);
                    gpx += e `<link href="${noteUrl}">\n`;
                    gpx += e `<text>note #${note.id} on osm</text>\n`;
                    gpx += e `</link>\n`;
                    gpx += e `<type>${note.status}</type>\n`;
                    return gpx;
                });
                if ($connectSelect.value == 'rte') {
                    gpx += `<rte>\n`;
                    gpx += getPoints('rtept');
                    gpx += `</rte>\n`;
                }
                if ($connectSelect.value == 'trk') {
                    gpx += `<trk><trkseg>\n`;
                    gpx += getPoints('trkpt');
                    gpx += `</trkseg></trk>\n`;
                }
                gpx += `</gpx>\n`;
                return gpx;
            };
            $exportNotesButton.addEventListener('click', () => {
                const gpx = getGpx();
                const file = new File([gpx], 'notes.gpx');
                const $a = document.createElement('a');
                $a.href = URL.createObjectURL(file);
                $a.download = 'notes.gpx';
                $a.click();
                URL.revokeObjectURL($a.href);
            });
            $exportNotesButton.draggable = true;
            $exportNotesButton.addEventListener('dragstart', ev => {
                const gpx = getGpx();
                if (!ev.dataTransfer)
                    return;
                ev.dataTransfer.setData($dataTypeSelect.value, gpx);
            });
            return [
                $exportNotesButton, ` `,
                makeLabel('inline')(` as waypoints `, $connectSelect), ` `,
                makeLabel('inline')(` with `, $commentsSelect, ` in descriptions`), `, `,
                makeLabel('inline')(`set `, $dataTypeSelect, ` type in drag and drop events`)
            ];
        }, () => [p(`Export selected notes in `, makeLink(`GPX`, 'https://wiki.openstreetmap.org/wiki/GPX'), ` (GPS exchange) format. `, `During the export, each selected note is treated as a waypoint with its name set to note id, description set to comments and link pointing to note's page on the OSM website. `, `This allows OSM notes to be used in applications that can't show them directly. `, `Also it allows a particular selection of notes to be shown if an application can't filter them. `, `One example of such app is `, makeLink(`iD editor`, 'https://wiki.openstreetmap.org/wiki/ID'), `. `, `Unfortunately iD doesn't fully understand the gpx format and can't show links associated with waypoints. `, `You'll have to enable the notes layer in iD and compare its note marker with waypoint markers from the gpx file.`), p(`By default only the `, dfn(`first comment`), ` is added to waypoint descriptions. `, `This is because some apps such as iD and especially `, makeLink(`JOSM`, `https://wiki.openstreetmap.org/wiki/JOSM`), ` try to render the entire description in one line next to the waypoint marker, cluttering the map.`), p(`It's possible to pretend that note waypoints are connected by a `, makeLink(`route`, `https://www.topografix.com/GPX/1/1/#type_rteType`), ` by using the `, dfn(`connected by route`), ` option. `, `This may help to go from a note to the next one in an app by visually following the route line. `, `There's also the `, dfn(`connected by track`), ` option in case the app makes it easier to work with `, makeLink(`tracks`, `https://www.topografix.com/GPX/1/1/#type_trkType`), ` than with the routes.`), p(`Instead of clicking the `, em(`Export`), ` button, you can drag it and drop into a place that accepts data sent by `, makeLink(`Drag and Drop API`, `https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API`), `. `, `Not many places actually do, and those who do often can handle only plaintext. `, `That's why there's a type selector, with which plaintext format can be forced on transmitted data.`)]
    ], [
        'yandex-panoramas',
        `Y.Panoramas`,
        `Yandex.Panoramas (Яндекс.Панорамы)`,
        (cp, map) => {
            const $viewButton = document.createElement('button');
            $viewButton.append(`Open `, makeMapIcon('center'));
            $viewButton.addEventListener('click', () => {
                const e = makeEscapeTag(encodeURIComponent);
                const coords = map.lon + ',' + map.lat;
                const url = e `https://yandex.ru/maps/?ll=${coords}&panorama%5Bpoint%5D=${coords}&z=${map.zoom}`; // 'll' is required if 'z' argument is present
                open(url, 'yandex');
            });
            return [$viewButton];
        }, () => [p(`Open a map location in `, makeLink(`Yandex.Panoramas`, 'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B'), ` street view. `, `Could be useful to find out if an object mentioned in a note existed at a certain point of time. `, `Yandex.Panoramas have a year selector in the upper right corner. Use it to get a photo made close to the date of interest.`)]
    ], [
        'mapillary',
        `Mapillary`, ,
        (cp, map) => {
            const $viewButton = document.createElement('button');
            $viewButton.append(`Open `, makeMapIcon('center'));
            $viewButton.addEventListener('click', () => {
                const e = makeEscapeTag(encodeURIComponent);
                const url = e `https://www.mapillary.com/app/?lat=${map.lat}&lng=${map.lon}&z=${map.zoom}&focus=photo`;
                open(url, 'mapillary');
            });
            return [$viewButton];
        }, () => [p(`Open a map location in `, makeLink(`Mapillary`, 'https://wiki.openstreetmap.org/wiki/Mapillary'), `. `, `Not yet fully implemented. The idea is to jump straight to the best available photo, but in order to do that, Mapillary API has to be queried for available photos. That's impossible to do without an API key.`)]
    ], [
        'counts',
        `Note counts`, ,
        (cp, map) => {
            cp.$fetchedNoteCount.textContent = '0';
            cp.$visibleNoteCount.textContent = '0';
            cp.$checkedNoteCount.textContent = '0';
            return [
                cp.$fetchedNoteCount, ` fetched, `,
                cp.$visibleNoteCount, ` visible, `,
                cp.$checkedNoteCount, ` selected`
            ];
        }
    ], [
        'legend',
        `Legend`,
        `What do icons in command panel mean`,
        (cp, map) => [
            makeMapIcon('center'), ` = map center, `, makeMapIcon('area'), ` = map area, `, makeNotesIcon('selected'), ` = selected notes`
        ]
    ], [
        'settings',
        `⚙️`,
        `Settings`,
        (cp, map) => {
            const $openAllButton = document.createElement('button');
            $openAllButton.textContent = `+ open all tools`;
            $openAllButton.addEventListener('click', () => foldTools(true));
            const $closeAllButton = document.createElement('button');
            $closeAllButton.textContent = `− close all tools`;
            $closeAllButton.addEventListener('click', () => foldTools(false));
            return [$openAllButton, ` `, $closeAllButton];
            function foldTools(open) {
                for (const $tool of cp.$container.querySelectorAll('details.tool')) {
                    if (!($tool instanceof HTMLDetailsElement))
                        continue;
                    $tool.open = open;
                }
            }
        }
    ]];
function makeMapIcon(type) {
    const $img = document.createElement('img');
    $img.classList.add('icon');
    $img.src = `map-${type}.svg`;
    $img.width = 19;
    $img.height = 13;
    $img.alt = `map ${type}`;
    return $img;
}
function makeNotesIcon(type) {
    const $img = document.createElement('img');
    $img.classList.add('icon');
    $img.src = `notes-${type}.svg`;
    $img.width = 9;
    $img.height = 13;
    $img.alt = `${type} notes`;
    return $img;
}
async function openRcUrl($button, rcUrl) {
    try {
        const response = await fetch(rcUrl);
        if (response.ok) {
            clearError();
            return true;
        }
    }
    catch { }
    setError();
    return false;
    function setError() {
        $button.classList.add('error');
        $button.title = 'Remote control command failed. Make sure you have an editor open and remote control enabled.';
    }
    function clearError() {
        $button.classList.remove('error');
        $button.title = '';
    }
}
async function makeOverpassQuery($button, query) {
    try {
        const response = await fetch(`https://www.overpass-api.de/api/interpreter`, {
            method: 'POST',
            body: new URLSearchParams({ data: query })
        });
        const text = await response.text();
        if (!response.ok) {
            setError(`receiving the following message: ${text}`);
            return;
        }
        clearError();
        return new DOMParser().parseFromString(text, 'text/xml');
    }
    catch (ex) {
        if (ex instanceof TypeError) {
            setError(`with the following error before receiving a response: ${ex.message}`);
        }
        else {
            setError(`for unknown reason`);
        }
    }
    function setError(reason) {
        $button.classList.add('error');
        $button.title = `Overpass query failed ${reason}`;
    }
    function clearError() {
        $button.classList.remove('error');
        $button.title = '';
    }
}
function getClosestNodeId(doc, centerLat, centerLon) {
    let closestNodeId;
    let closestNodeDistanceSquared = Infinity;
    for (const node of doc.querySelectorAll('node')) {
        const lat = Number(node.getAttribute('lat'));
        const lon = Number(node.getAttribute('lon'));
        const id = node.getAttribute('id');
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !id)
            continue;
        const distanceSquared = (lat - centerLat) ** 2 + (lon - centerLon) ** 2;
        if (distanceSquared < closestNodeDistanceSquared) {
            closestNodeDistanceSquared = distanceSquared;
            closestNodeId = id;
        }
    }
    return closestNodeId;
}

function toUserQuery(value) {
    const s = value.trim();
    if (s == '')
        return {
            userType: 'empty'
        };
    if (s[0] == '#') {
        let match;
        if (match = s.match(/^#\s*(\d+)$/)) {
            const [, uid] = match;
            return {
                userType: 'id',
                uid: Number(uid)
            };
        }
        else if (match = s.match(/^#\s*\d*(.)/)) {
            const [, c] = match;
            return {
                userType: 'invalid',
                message: `uid cannot contain non-digits, found ${c}`
            };
        }
        else {
            return {
                userType: 'invalid',
                message: `uid cannot be empty`
            };
        }
    }
    if (s.includes('/')) {
        try {
            const url = new URL(s);
            if (url.host == 'www.openstreetmap.org' ||
                url.host == 'openstreetmap.org' ||
                url.host == 'www.osm.org' ||
                url.host == 'osm.org') {
                const [, userPathDir, userPathEnd] = url.pathname.split('/');
                if (userPathDir == 'user' && userPathEnd) {
                    const username = decodeURIComponent(userPathEnd);
                    return {
                        userType: 'name',
                        username
                    };
                }
                return {
                    userType: 'invalid',
                    message: `OSM URL has to include username`
                };
            }
            else if (url.host == `api.openstreetmap.org`) {
                const [, apiDir, apiVersionDir, apiCall, apiValue] = url.pathname.split('/');
                if (apiDir == 'api' && apiVersionDir == '0.6' && apiCall == 'user') {
                    const [uidString] = apiValue.split('.');
                    const uid = Number(uidString);
                    if (Number.isInteger(uid))
                        return {
                            userType: 'id',
                            uid
                        };
                }
                return {
                    userType: 'invalid',
                    message: `OSM API URL has to be "api/0.6/user/..."`
                };
            }
            else {
                let domainString = `was given ${url.host}`;
                if (!url.host)
                    domainString = `no domain was given`;
                return {
                    userType: 'invalid',
                    message: `URL has to be of an OSM domain, ${domainString}`
                };
            }
        }
        catch {
            return {
                userType: 'invalid',
                message: `string containing / character has to be a valid URL`
            };
        }
    }
    return {
        userType: 'name',
        username: s
    };
}

const defaultLowerDate = Date.parse('2001-01-01 00:00:00Z') / 1000;
function makeUserQueryFromDisplayNameAndUser(display_name, user) {
    if (display_name != null) {
        return {
            userType: 'name',
            username: display_name
        };
    }
    else if (user != null && Number.isInteger(user)) {
        return {
            userType: 'id',
            uid: user
        };
    }
    else {
        return {
            userType: 'empty'
        };
    }
}
function makeUserQueryFromNoteSearchQuery(query) {
    return makeUserQueryFromDisplayNameAndUser(query.display_name, query.user);
}
function makeNoteSearchQueryFromUserQueryAndValues(userQuery, textValue, fromValue, toValue, closedValue, sortValue, orderValue) {
    const noteSearchQuery = {
        mode: 'search',
        closed: toClosed(closedValue),
        sort: toSort(sortValue),
        order: toOrder(orderValue)
    };
    {
        if (userQuery.userType == 'invalid')
            return undefined;
        if (userQuery.userType == 'name') {
            noteSearchQuery.display_name = userQuery.username;
        }
        else if (userQuery.userType == 'id') {
            noteSearchQuery.user = userQuery.uid;
        }
    }
    {
        const s = textValue.trim();
        if (s)
            noteSearchQuery.q = s;
    }
    {
        const dateTimeQuery = toDateQuery(fromValue);
        if (dateTimeQuery.dateType == 'invalid')
            return undefined;
        if (dateTimeQuery.dateType == 'valid')
            noteSearchQuery.from = dateTimeQuery.date;
    }
    {
        const dateTimeQuery = toDateQuery(toValue);
        if (dateTimeQuery.dateType == 'invalid')
            return undefined;
        if (dateTimeQuery.dateType == 'valid')
            noteSearchQuery.to = dateTimeQuery.date;
    }
    return noteSearchQuery;
    function toClosed(value) {
        const n = Number(value || undefined);
        if (Number.isInteger(n))
            return n;
        return -1;
    }
    function toSort(value) {
        if (value == 'updated_at')
            return value;
        return 'created_at';
    }
    function toOrder(value) {
        if (value == 'oldest')
            return value;
        return 'newest';
    }
}
function makeNoteSearchQueryFromValues(userValue, textValue, fromValue, toValue, closedValue, sortValue, orderValue) {
    return makeNoteSearchQueryFromUserQueryAndValues(toUserQuery(userValue), textValue, fromValue, toValue, closedValue, sortValue, orderValue);
}
function makeNoteBboxQueryFromValues(bboxValue, closedValue) {
    const noteBboxQuery = {
        mode: 'bbox',
        bbox: bboxValue.trim(),
        closed: toClosed(closedValue),
    };
    return noteBboxQuery;
    function toClosed(value) {
        const n = Number(value || undefined);
        if (Number.isInteger(n))
            return n;
        return -1;
    }
}
function makeNoteQueryFromHash(queryString) {
    const paramString = (queryString[0] == '#')
        ? queryString.slice(1)
        : queryString;
    const searchParams = new URLSearchParams(paramString);
    const mode = searchParams.get('mode');
    if (mode == 'search') {
        const userQuery = makeUserQueryFromDisplayNameAndUser(searchParams.get('display_name'), Number(searchParams.get('user') || undefined));
        return makeNoteSearchQueryFromUserQueryAndValues(userQuery, searchParams.get('q') || '', searchParams.get('from') || '', searchParams.get('to') || '', searchParams.get('closed') || '', searchParams.get('sort') || '', searchParams.get('order') || '');
    }
    else if (mode == 'bbox') {
        return makeNoteBboxQueryFromValues(searchParams.get('bbox') || '', searchParams.get('closed') || '');
    }
    else {
        return undefined;
    }
}
function makeNoteQueryString(query, withMode = true) {
    const parameters = [];
    if (withMode)
        parameters.push(['mode', query.mode]);
    if (query.mode == 'search') {
        if (query.display_name != null) {
            parameters.push(['display_name', query.display_name]);
        }
        else if (query.user != null) {
            parameters.push(['user', query.user]);
        }
        if (query.q != null) {
            parameters.push(['q', query.q]);
        }
        parameters.push(['sort', query.sort], ['order', query.order], ['closed', query.closed]);
        if (query.from != null)
            parameters.push(['from', toUrlDate(query.from)]);
        if (query.to != null)
            parameters.push(['to', toUrlDate(query.to)]);
    }
    else if (query.mode == 'bbox') {
        parameters.push(['bbox', query.bbox], ['closed', query.closed]);
    }
    return parameters.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}
/**
 * @returns fd.parameters - url parameters in this order:
                            user OR display_name;
                            q;
                            sort, order - these don't change within a query;
                            closed - this may change between phases;
                            from, to - this change for pagination purposes, from needs to be present with a dummy date if to is used
                            limit - this may change in rare circumstances, not part of query proper;
 */
function getNextFetchDetails(query, requestedLimit, lastNote, prevLastNote, lastLimit) {
    let lowerDate;
    let upperDate;
    let lastDate;
    let limit = requestedLimit;
    if (lastNote) {
        if (lastNote.comments.length <= 0)
            throw new Error(`note #${lastNote.id} has no comments`);
        lastDate = getTargetComment(lastNote).date;
        if (prevLastNote) {
            if (prevLastNote.comments.length <= 0)
                throw new Error(`note #${prevLastNote.id} has no comments`);
            if (lastLimit == null)
                throw new Error(`no last limit provided along with previous last note #${prevLastNote.id}`);
            const prevLastDate = getTargetComment(prevLastNote).date;
            if (lastDate == prevLastDate) {
                limit = lastLimit + requestedLimit;
            }
        }
    }
    if (lastDate != null) {
        if (query.order == 'oldest') {
            lowerDate = lastDate;
        }
        else {
            upperDate = lastDate + 1;
        }
    }
    if (query.to != null) {
        if (upperDate == null) {
            upperDate = query.to;
        }
        else {
            if (upperDate > query.to) {
                upperDate = query.to;
            }
        }
    }
    if (query.from != null) {
        if (lowerDate == null) {
            lowerDate = query.from;
        }
    }
    if (lowerDate == null && upperDate != null) {
        lowerDate = defaultLowerDate;
    }
    const updatedQuery = { ...query };
    if (lowerDate != null)
        updatedQuery.from = lowerDate;
    if (upperDate != null)
        updatedQuery.to = upperDate;
    return {
        parameters: makeNoteQueryString(updatedQuery, false) + '&limit=' + encodeURIComponent(limit),
        limit
    };
    function getTargetComment(note) {
        if (query.sort == 'created_at') {
            return note.comments[0];
        }
        else {
            return note.comments[note.comments.length - 1];
        }
    }
}

function isNoteFeatureCollection(data) {
    return data.type == "FeatureCollection";
}
function transformFeatureCollectionToNotesAndUsers(data) {
    const users = {};
    const notes = data.features.map(noteFeature => ({
        id: noteFeature.properties.id,
        lat: noteFeature.geometry.coordinates[1],
        lon: noteFeature.geometry.coordinates[0],
        status: noteFeature.properties.status,
        comments: noteFeature.properties.comments.map(cullCommentProps)
    }));
    return [notes, users];
    function cullCommentProps(a) {
        const b = {
            date: transformDate(a.date),
            action: a.action,
            text: a.text
        };
        if (a.uid != null) {
            b.uid = a.uid;
            if (a.user != null)
                users[a.uid] = a.user;
        }
        return b;
    }
    function transformDate(a) {
        const match = a.match(/^\d\d\d\d-\d\d-\d\d\s+\d\d:\d\d:\d\d/);
        if (!match)
            return 0; // shouldn't happen
        const [s] = match;
        return Date.parse(s + 'Z') / 1000;
    }
}

const maxSingleAutoLoadLimit = 200;
const maxTotalAutoLoadLimit = 1000;
const maxFullyFilteredFetches = 10;
async function startSearchFetcher(db, noteTable, $moreContainer, $limitSelect, $autoLoadCheckbox, $fetchButton, moreButtonIntersectionObservers, query, clearStore) {
    const [notes, users, mergeNotesAndUsers] = makeNotesAndUsersAndMerger();
    const queryString = makeNoteQueryString(query);
    const fetchEntry = await (async () => {
        if (clearStore) {
            return await db.clear(queryString);
        }
        else {
            const [fetchEntry, initialNotes, initialUsers] = await db.load(queryString); // TODO actually have a reasonable limit here - or have a link above the table with 'clear' arg: "If the stored data is too large, click this link to restart the query from scratch"
            mergeNotesAndUsers(initialNotes, initialUsers);
            return fetchEntry;
        }
    })();
    let lastNote;
    let prevLastNote;
    let lastLimit;
    let nFullyFilteredFetches = 0;
    let holdOffAutoLoad = false;
    if (!clearStore) {
        addNewNotes(notes);
        if (notes.length > 0) {
            lastNote = notes[notes.length - 1];
            rewriteLoadMoreButton();
        }
        else {
            holdOffAutoLoad = true; // db was empty; expected to show something => need to fetch; not expected to autoload
            await fetchCycle();
        }
    }
    else {
        await fetchCycle();
    }
    function addNewNotes(newNotes) {
        const nUnfilteredNotes = noteTable.addNotes(newNotes, users);
        if (nUnfilteredNotes == 0) {
            nFullyFilteredFetches++;
        }
        else {
            nFullyFilteredFetches = 0;
        }
    }
    async function fetchCycle() {
        rewriteLoadingButton();
        const limit = getLimit($limitSelect);
        const fetchDetails = getNextFetchDetails(query, limit, lastNote, prevLastNote, lastLimit);
        if (fetchDetails.limit > 10000) {
            rewriteMessage($moreContainer, `Fetching cannot continue because the required note limit exceeds max value allowed by API (this is very unlikely, if you see this message it's probably a bug)`);
            return;
        }
        const url = `https://api.openstreetmap.org/api/0.6/notes/search.json?` + fetchDetails.parameters;
        $fetchButton.disabled = true;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const responseText = await response.text();
                rewriteFetchErrorMessage($moreContainer, query, `received the following error response`, responseText);
                return;
            }
            const data = await response.json();
            if (!isNoteFeatureCollection(data)) {
                rewriteMessage($moreContainer, `Received invalid data`);
                return;
            }
            const [unseenNotes, unseenUsers] = mergeNotesAndUsers(...transformFeatureCollectionToNotesAndUsers(data));
            await db.save(fetchEntry, notes, unseenNotes, users, unseenUsers);
            if (!noteTable && notes.length <= 0) {
                rewriteMessage($moreContainer, `No matching notes found`);
                return;
            }
            addNewNotes(unseenNotes);
            if (data.features.length < fetchDetails.limit) {
                rewriteMessage($moreContainer, `Got all ${notes.length} notes`);
                return;
            }
            prevLastNote = lastNote;
            lastNote = notes[notes.length - 1];
            lastLimit = fetchDetails.limit;
            const $moreButton = rewriteLoadMoreButton();
            if (holdOffAutoLoad) {
                holdOffAutoLoad = false;
            }
            else if (notes.length > maxTotalAutoLoadLimit) {
                $moreButton.append(` (no auto download because displaying more than ${maxTotalAutoLoadLimit} notes)`);
            }
            else if (getNextFetchDetails(query, limit, lastNote, prevLastNote, lastLimit).limit > maxSingleAutoLoadLimit) {
                $moreButton.append(` (no auto download because required batch is larger than ${maxSingleAutoLoadLimit})`);
            }
            else if (nFullyFilteredFetches > maxFullyFilteredFetches) {
                $moreButton.append(` (no auto download because ${maxFullyFilteredFetches} consecutive fetches were fully filtered)`);
                nFullyFilteredFetches = 0;
            }
            else {
                const moreButtonIntersectionObserver = new IntersectionObserver((entries) => {
                    if (entries.length <= 0)
                        return;
                    if (!entries[0].isIntersecting)
                        return;
                    if (!$autoLoadCheckbox.checked)
                        return;
                    while (moreButtonIntersectionObservers.length > 0)
                        moreButtonIntersectionObservers.pop()?.disconnect();
                    $moreButton.click();
                });
                moreButtonIntersectionObservers.push(moreButtonIntersectionObserver);
                moreButtonIntersectionObserver.observe($moreButton);
            }
        }
        catch (ex) {
            if (ex instanceof TypeError) {
                rewriteFetchErrorMessage($moreContainer, query, `failed with the following error before receiving a response`, ex.message);
            }
            else {
                rewriteFetchErrorMessage($moreContainer, query, `failed for unknown reason`, `${ex}`);
            }
        }
        finally {
            $fetchButton.disabled = false;
        }
    }
    function rewriteLoadMoreButton() {
        $moreContainer.innerHTML = '';
        const $div = document.createElement('div');
        const $button = document.createElement('button');
        $button.textContent = `Load more notes`;
        $button.addEventListener('click', fetchCycle);
        $div.append($button);
        $moreContainer.append($div);
        return $button;
    }
    function rewriteLoadingButton() {
        $moreContainer.innerHTML = '';
        const $div = document.createElement('div');
        const $button = document.createElement('button');
        $button.textContent = `Loading notes...`;
        $button.disabled = true;
        $div.append($button);
        $moreContainer.append($div);
    }
}
async function startBboxFetcher(// TODO cleanup copypaste from above
db, noteTable, $moreContainer, $limitSelect, /*$autoLoadCheckbox: HTMLInputElement,*/ $fetchButton, moreButtonIntersectionObservers, query, clearStore) {
    const [notes, users, mergeNotesAndUsers] = makeNotesAndUsersAndMerger();
    const queryString = makeNoteQueryString(query);
    const fetchEntry = await (async () => {
        if (clearStore) {
            return await db.clear(queryString);
        }
        else {
            const [fetchEntry, initialNotes, initialUsers] = await db.load(queryString); // TODO actually have a reasonable limit here - or have a link above the table with 'clear' arg: "If the stored data is too large, click this link to restart the query from scratch"
            mergeNotesAndUsers(initialNotes, initialUsers);
            return fetchEntry;
        }
    })();
    if (!clearStore) {
        addNewNotes(notes);
        if (notes.length > 0) {
            // lastNote=notes[notes.length-1]
            rewriteLoadMoreButton();
        }
        else {
            await fetchCycle();
        }
    }
    else {
        await fetchCycle();
    }
    function addNewNotes(newNotes) {
        noteTable.addNotes(newNotes, users);
    }
    async function fetchCycle() {
        rewriteLoadingButton();
        const limit = getLimit($limitSelect);
        // { different
        const parameters = `bbox=` + encodeURIComponent(query.bbox) + '&closed=' + encodeURIComponent(query.closed) + '&limit=' + encodeURIComponent(limit);
        const url = `https://api.openstreetmap.org/api/0.6/notes.json?` + parameters;
        // } different
        $fetchButton.disabled = true;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const responseText = await response.text();
                rewriteFetchErrorMessage($moreContainer, query, `received the following error response`, responseText);
                return;
            }
            const data = await response.json();
            if (!isNoteFeatureCollection(data)) {
                rewriteMessage($moreContainer, `Received invalid data`);
                return;
            }
            const [unseenNotes, unseenUsers] = mergeNotesAndUsers(...transformFeatureCollectionToNotesAndUsers(data));
            await db.save(fetchEntry, notes, unseenNotes, users, unseenUsers);
            if (!noteTable && notes.length <= 0) {
                rewriteMessage($moreContainer, `No matching notes found`);
                return;
            }
            addNewNotes(unseenNotes);
            // { different
            if (notes.length < limit) {
                rewriteMessage($moreContainer, `Got all ${notes.length} notes in the area`);
            }
            else {
                rewriteMessage($moreContainer, `Got all ${notes.length} requested notes`);
            }
            return;
            // } different
        }
        catch (ex) {
            if (ex instanceof TypeError) {
                rewriteFetchErrorMessage($moreContainer, query, `failed with the following error before receiving a response`, ex.message);
            }
            else {
                rewriteFetchErrorMessage($moreContainer, query, `failed for unknown reason`, `${ex}`);
            }
        }
        finally {
            $fetchButton.disabled = false;
        }
    }
    function rewriteLoadMoreButton() {
        $moreContainer.innerHTML = '';
        const $div = document.createElement('div');
        const $button = document.createElement('button');
        $button.textContent = `Load more notes`;
        $button.addEventListener('click', fetchCycle);
        $div.append($button);
        $moreContainer.append($div);
        return $button;
    }
    function rewriteLoadingButton() {
        $moreContainer.innerHTML = '';
        const $div = document.createElement('div');
        const $button = document.createElement('button');
        $button.textContent = `Loading notes...`;
        $button.disabled = true;
        $div.append($button);
        $moreContainer.append($div);
    }
}
function makeNotesAndUsersAndMerger() {
    const seenNotes = {};
    const notes = [];
    const users = {};
    const merger = (newNotes, newUsers) => {
        const unseenNotes = [];
        const unseenUsers = {};
        for (const note of newNotes) {
            if (seenNotes[note.id])
                continue;
            seenNotes[note.id] = true;
            notes.push(note);
            unseenNotes.push(note);
        }
        for (const newUserIdString in newUsers) {
            const newUserId = Number(newUserIdString); // TODO rewrite this hack
            if (users[newUserId] != newUsers[newUserId])
                unseenUsers[newUserId] = newUsers[newUserId];
        }
        Object.assign(users, newUsers);
        return [unseenNotes, unseenUsers];
    };
    return [notes, users, merger];
}
function rewriteMessage($container, ...items) {
    $container.innerHTML = '';
    const $message = document.createElement('div');
    for (const item of items) {
        // if (Array.isArray(item)) { // TODO implement displaying query details
        // 	const [username]=item
        // 	$message.append(makeUserLink(username))
        // } else {
        $message.append(item);
        // }
    }
    $container.append($message);
    return $message;
}
function rewriteErrorMessage($container, ...items) {
    const $message = rewriteMessage($container, ...items);
    $message.classList.add('error');
    return $message;
}
function rewriteFetchErrorMessage($container, query, responseKindText, fetchErrorText) {
    // TODO display query details
    const $message = rewriteErrorMessage($container, `Loading notes ${responseKindText}:`);
    const $error = document.createElement('pre');
    $error.textContent = fetchErrorText;
    $message.append($error);
}
function getLimit($limitSelect) {
    const limit = Number($limitSelect.value);
    if (Number.isInteger(limit) && limit >= 1 && limit <= 10000)
        return limit;
    return 20;
}

function isNominatimBbox(bbox) {
    if (!Array.isArray(bbox))
        return false;
    if (bbox.length != 4)
        return false;
    for (const entry of bbox) {
        if (!(typeof entry == "string"))
            return false;
    }
    return true;
}
class NominatimBboxFetcher {
    constructor(fetchFromServer, fetchFromCache, storeToCache) {
        this.fetchFromServer = fetchFromServer;
        this.fetchFromCache = fetchFromCache;
        this.storeToCache = storeToCache;
    }
    async fetch(timestamp, q, west, south, east, north) {
        const e = makeEscapeTag(encodeURIComponent);
        let url = e `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
        if (east > west && north > south && east - west < 360) {
            const viewbox = `${west},${south},${east},${north}`;
            url += e `&viewbox=${viewbox}`;
        }
        const cacheBbox = await this.fetchFromCache(timestamp, url);
        if (isNominatimBbox(cacheBbox)) {
            await this.storeToCache(timestamp, url, cacheBbox);
            return cacheBbox;
        }
        const data = await this.fetchFromServer(url);
        if (!Array.isArray(data))
            throw new TypeError('Nominatim error: invalid data');
        if (data.length <= 0)
            throw new TypeError('Nominatim failed to find the place');
        const placeData = data[0];
        const bbox = placeData?.boundingbox;
        if (!isNominatimBbox(bbox))
            throw new TypeError('Nominatim error: invalid bbox data');
        await this.storeToCache(timestamp, url, bbox);
        return bbox;
    }
}

class NoteFetchPanel {
    constructor(storage, db, $container, $notesContainer, $moreContainer, $commandContainer, filterPanel, extrasPanel, map, photoDialog, restoreScrollPosition) {
        let noteTable;
        const moreButtonIntersectionObservers = [];
        const $showImagesCheckboxes = [];
        const searchDialog = new NoteSearchFetchDialog();
        searchDialog.write($container, $showImagesCheckboxes, query => {
            modifyHistory(query, true);
            runStartFetcher(query, true);
        });
        const bboxDialog = new NoteBboxFetchDialog(map);
        bboxDialog.write($container, $showImagesCheckboxes, query => {
            modifyHistory(query, true);
            runStartFetcher(query, true);
        });
        for (const $showImagesCheckbox of $showImagesCheckboxes) {
            $showImagesCheckbox.addEventListener('input', showImagesCheckboxInputListener);
        }
        window.addEventListener('hashchange', () => {
            const query = makeNoteQueryFromHash(location.hash);
            openQueryDialog(query, false);
            modifyHistory(query, false); // in case location was edited manually
            populateInputs(query);
            runStartFetcher(query, false);
            restoreScrollPosition();
        });
        const query = makeNoteQueryFromHash(location.hash);
        openQueryDialog(query, true);
        modifyHistory(query, false);
        populateInputs(query);
        runStartFetcher(query, false);
        function openQueryDialog(query, initial) {
            if (!query) {
                if (initial)
                    searchDialog.open();
            }
            else if (query.mode == 'search') {
                searchDialog.open();
            }
            else if (query.mode == 'bbox') {
                bboxDialog.open();
            }
        }
        function populateInputs(query) {
            if (!query || query.mode == 'search') {
                if (query?.display_name) {
                    searchDialog.$userInput.value = query.display_name;
                }
                else if (query?.user) {
                    searchDialog.$userInput.value = '#' + query.user;
                }
                else {
                    searchDialog.$userInput.value = '';
                }
                searchDialog.$textInput.value = query?.q ?? '';
                searchDialog.$fromInput.value = toReadableDate(query?.from);
                searchDialog.$toInput.value = toReadableDate(query?.to);
                searchDialog.$statusSelect.value = query ? String(query.closed) : '-1';
                searchDialog.$sortSelect.value = query?.sort ?? 'created_at';
                searchDialog.$orderSelect.value = query?.order ?? 'newest';
            }
            if (!query || query.mode == 'bbox') {
                bboxDialog.$bboxInput.value = query?.bbox ?? '';
                bboxDialog.$statusSelect.value = query ? String(query.closed) : '-1';
            }
        }
        function resetNoteDependents() {
            while (moreButtonIntersectionObservers.length > 0)
                moreButtonIntersectionObservers.pop()?.disconnect();
            map.clearNotes();
            $notesContainer.innerHTML = ``;
            $commandContainer.innerHTML = ``;
        }
        function runStartFetcher(query, clearStore) {
            photoDialog.close();
            resetNoteDependents();
            if (query?.mode == 'search') {
                extrasPanel.rewrite(query, Number(searchDialog.$limitSelect.value));
            }
            else {
                extrasPanel.rewrite();
            }
            if (query?.mode != 'search' && query?.mode != 'bbox')
                return;
            filterPanel.unsubscribe();
            const commandPanel = new CommandPanel($commandContainer, map, storage);
            noteTable = new NoteTable($notesContainer, commandPanel, map, filterPanel.noteFilter, photoDialog, $showImagesCheckboxes[0]?.checked);
            filterPanel.subscribe(noteFilter => noteTable?.updateFilter(noteFilter));
            if (query?.mode == 'search') {
                startSearchFetcher(db, noteTable, $moreContainer, searchDialog.$limitSelect, searchDialog.$autoLoadCheckbox, searchDialog.$fetchButton, moreButtonIntersectionObservers, query, clearStore);
            }
            else if (query?.mode == 'bbox') {
                if (bboxDialog.$trackMapCheckbox.checked)
                    map.needToFitNotes = false;
                startBboxFetcher(db, noteTable, $moreContainer, bboxDialog.$limitSelect, /*bboxDialog.$autoLoadCheckbox,*/ bboxDialog.$fetchButton, moreButtonIntersectionObservers, query, clearStore);
            }
        }
        function showImagesCheckboxInputListener() {
            const state = this.checked;
            for (const $showImagesCheckbox of $showImagesCheckboxes) {
                $showImagesCheckbox.checked = state;
            }
            noteTable?.setShowImages(state);
        }
    }
}
class NoteFetchDialog {
    constructor() {
        this.$details = document.createElement('details');
        this.$fetchButton = document.createElement('button');
    }
    write($container, $showImagesCheckboxes, submitQuery) {
        const $summary = document.createElement('summary');
        $summary.textContent = this.title;
        const $form = document.createElement('form');
        const $scopeFieldset = this.makeScopeAndOrderFieldset();
        const $downloadFieldset = this.makeDownloadModeFieldset();
        const $showImagesCheckbox = document.createElement('input');
        $showImagesCheckbox.type = 'checkbox';
        $showImagesCheckboxes.push($showImagesCheckbox);
        $downloadFieldset.append(makeDiv()(makeLabel()($showImagesCheckbox, ` Load and show images from StreetComplete`)));
        $form.append($scopeFieldset, $downloadFieldset, this.makeFetchButtonDiv());
        this.addEventListeners();
        $form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const query = this.constructQuery();
            if (!query)
                return;
            submitQuery(query);
        });
        this.$details.addEventListener('toggle', () => {
            if (!this.$details.open)
                return;
            for (const $otherDetails of $container.querySelectorAll('details')) {
                if ($otherDetails == this.$details)
                    continue;
                if (!$otherDetails.open)
                    continue;
                $otherDetails.open = false;
            }
        });
        this.$details.append($summary, $form);
        this.writeExtraForms();
        $container.append(this.$details);
    }
    open() {
        this.$details.open = true;
    }
    makeScopeAndOrderFieldset() {
        const $fieldset = document.createElement('fieldset');
        const $legend = document.createElement('legend');
        $legend.textContent = `Scope and order`;
        $fieldset.append($legend);
        this.writeScopeAndOrderFieldset($fieldset);
        return $fieldset;
    }
    makeDownloadModeFieldset() {
        const $fieldset = document.createElement('fieldset');
        // TODO (re)store input values
        const $legend = document.createElement('legend');
        $legend.textContent = `Download mode (can change anytime)`;
        $fieldset.append($legend);
        this.writeDownloadModeFieldset($fieldset);
        return $fieldset;
    }
    makeFetchButtonDiv() {
        this.$fetchButton.textContent = `Fetch notes`;
        this.$fetchButton.type = 'submit';
        return makeDiv('major-input')(this.$fetchButton);
    }
    writeExtraForms() { }
}
class NoteSearchFetchDialog extends NoteFetchDialog {
    constructor() {
        super(...arguments);
        this.title = `Search notes for user / text / date range`;
        this.$userInput = document.createElement('input');
        this.$textInput = document.createElement('input');
        this.$fromInput = document.createElement('input');
        this.$toInput = document.createElement('input');
        this.$statusSelect = document.createElement('select');
        this.$sortSelect = document.createElement('select');
        this.$orderSelect = document.createElement('select');
        this.$limitSelect = document.createElement('select');
        this.$autoLoadCheckbox = document.createElement('input');
    }
    writeScopeAndOrderFieldset($fieldset) {
        {
            this.$userInput.type = 'text';
            this.$userInput.name = 'user';
            $fieldset.append(makeDiv('major-input')(makeLabel()(`OSM username, URL or #id: `, this.$userInput)));
        }
        {
            this.$textInput.type = 'text';
            this.$textInput.name = 'text';
            $fieldset.append(makeDiv('major-input')(makeLabel()(`Comment text search query: `, this.$textInput)));
        }
        {
            this.$fromInput.type = 'text';
            this.$fromInput.size = 20;
            this.$fromInput.name = 'from';
            this.$toInput.type = 'text';
            this.$toInput.size = 20;
            this.$toInput.name = 'to';
            $fieldset.append(makeDiv()(`Date range: `, makeLabel()(`from `, this.$fromInput), ` `, makeLabel()(`to `, this.$toInput)));
        }
        {
            this.$statusSelect.append(new Option(`both open and closed`, '-1'), new Option(`open and recently closed`, '7'), new Option(`only open`, '0'));
            this.$sortSelect.append(new Option(`creation`, 'created_at'), new Option(`last update`, 'updated_at'));
            this.$orderSelect.append(new Option('newest'), new Option('oldest'));
            $fieldset.append(makeDiv()(`Fetch `, makeLabel('inline')(this.$statusSelect, ` matching notes`), ` `, makeLabel('inline')(`sorted by `, this.$sortSelect, ` date`), `, `, makeLabel('inline')(this.$orderSelect, ` first`)));
        }
    }
    writeDownloadModeFieldset($fieldset) {
        {
            this.$limitSelect.append(new Option('20'), new Option('100'), new Option('500'), new Option('2500'));
            $fieldset.append(makeDiv()(`Download these `, makeLabel()(`in batches of `, this.$limitSelect, ` notes`)));
        }
        {
            this.$autoLoadCheckbox.type = 'checkbox';
            this.$autoLoadCheckbox.checked = true;
            $fieldset.append(makeDiv()(makeLabel()(this.$autoLoadCheckbox, ` Automatically load more notes when scrolled to the end of the table`)));
        }
    }
    addEventListeners() {
        this.$userInput.addEventListener('input', () => {
            const userQuery = toUserQuery(this.$userInput.value);
            if (userQuery.userType == 'invalid') {
                this.$userInput.setCustomValidity(userQuery.message);
            }
            else {
                this.$userInput.setCustomValidity('');
            }
        });
        for (const $input of [this.$fromInput, this.$toInput])
            $input.addEventListener('input', () => {
                const query = toDateQuery($input.value);
                if (query.dateType == 'invalid') {
                    $input.setCustomValidity(query.message);
                }
                else {
                    $input.setCustomValidity('');
                }
            });
    }
    constructQuery() {
        return makeNoteSearchQueryFromValues(this.$userInput.value, this.$textInput.value, this.$fromInput.value, this.$toInput.value, this.$statusSelect.value, this.$sortSelect.value, this.$orderSelect.value);
    }
}
class NoteBboxFetchDialog extends NoteFetchDialog {
    constructor(map) {
        super();
        this.map = map;
        this.$nominatimForm = document.createElement('form');
        this.$nominatimInput = document.createElement('input');
        this.$nominatimButton = document.createElement('button');
        this.nominatimBboxFetcher = new NominatimBboxFetcher(async (url) => {
            const response = await fetch(url);
            if (!response.ok) {
                throw new TypeError('Nominatim error: unsuccessful response');
            }
            return response.json();
        }, ...makeDumbCache() // TODO real cache in db
        );
        this.title = `Get notes inside small rectangular area`;
        this.$bboxInput = document.createElement('input');
        this.$trackMapCheckbox = document.createElement('input');
        this.$statusSelect = document.createElement('select');
        this.$limitSelect = document.createElement('select');
    }
    writeExtraForms() {
        this.$details.append(this.$nominatimForm);
    }
    writeScopeAndOrderFieldset($fieldset) {
        {
            this.$bboxInput.type = 'text';
            this.$bboxInput.name = 'bbox';
            $fieldset.append(makeDiv('major-input')(makeLabel()(`Bounding box (`, tip(`left`, `western-most (min) longitude`), `, `, tip(`bottom`, `southern-most (min) latitude`), `, `, tip(`right`, `eastern-most (max) longitude`), `, `, tip(`top`, `northern-most (max) latitude`), `): `, this.$bboxInput)));
            function tip(text, title) {
                const $span = document.createElement('span');
                $span.textContent = text;
                $span.title = title;
                return $span;
            }
        }
        {
            this.$trackMapCheckbox.type = 'checkbox';
            this.$trackMapCheckbox.checked = true;
            $fieldset.append(makeDiv()(makeLabel()(this.$trackMapCheckbox, ` Update bounding box value with current map area`)));
        }
        {
            this.$nominatimForm.id = 'nominatim-form';
            this.$nominatimInput.type = 'text';
            this.$nominatimInput.required = true;
            this.$nominatimInput.classList.add('no-invalid-indication'); // because it's inside another form that doesn't require it, don't indicate that it's invalid
            this.$nominatimInput.name = 'place';
            this.$nominatimInput.setAttribute('form', 'nominatim-form');
            this.$nominatimButton.textContent = 'Get';
            this.$nominatimButton.setAttribute('form', 'nominatim-form');
            $fieldset.append(makeDiv('text-button-input')(makeLabel()(
            //`Or get bounding box by place name from `,makeLink(`Nominatim`,'https://wiki.openstreetmap.org/wiki/Nominatim'),`: `, // TODO inconvenient to have links inside form, better do info panels
            `Or get bounding box by place name from Nominatim: `, this.$nominatimInput), this.$nominatimButton));
        }
        {
            this.$statusSelect.append(new Option(`both open and closed`, '-1'), new Option(`open and recently closed`, '7'), new Option(`only open`, '0'));
            $fieldset.append(makeDiv()(`Fetch `, makeLabel('inline')(this.$statusSelect, ` matching notes`), ` `, `sorted by last update date `, `newest first`));
        }
    }
    writeDownloadModeFieldset($fieldset) {
        {
            this.$limitSelect.append(new Option('20'), new Option('100'), new Option('500'), new Option('2500'), new Option('10000'));
            $fieldset.append(makeDiv()(`Download `, makeLabel()(`at most `, this.$limitSelect, ` notes`)));
        }
    }
    addEventListeners() {
        const validateBounds = () => {
            const splitValue = this.$bboxInput.value.split(',');
            if (splitValue.length != 4) {
                this.$bboxInput.setCustomValidity(`must contain four comma-separated values`);
                return false;
            }
            this.$bboxInput.setCustomValidity('');
            return true;
        };
        const copyBounds = () => {
            if (!this.$trackMapCheckbox.checked)
                return;
            const bounds = this.map.bounds;
            // (left,bottom,right,top)
            this.$bboxInput.value = bounds.getWest() + ',' + bounds.getSouth() + ',' + bounds.getEast() + ',' + bounds.getNorth();
            validateBounds();
        };
        this.map.onMoveEnd(copyBounds);
        this.$trackMapCheckbox.addEventListener('input', copyBounds);
        this.$bboxInput.addEventListener('input', () => {
            if (!validateBounds())
                return;
            this.$trackMapCheckbox.checked = false;
        });
        this.$nominatimForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            this.$nominatimButton.disabled = true;
            this.$nominatimButton.classList.remove('error');
            try {
                const bounds = this.map.bounds;
                const bbox = await this.nominatimBboxFetcher.fetch(Date.now(), this.$nominatimInput.value, bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
                const [minLat, maxLat, minLon, maxLon] = bbox;
                this.$bboxInput.value = `${minLon},${minLat},${maxLon},${maxLat}`;
                this.$trackMapCheckbox.checked = false;
                this.map.fitBounds([[Number(minLat), Number(minLon)], [Number(maxLat), Number(maxLon)]]);
            }
            catch (ex) {
                this.$nominatimButton.classList.add('error');
                if (ex instanceof TypeError) {
                    this.$nominatimButton.title = ex.message;
                }
                else {
                    this.$nominatimButton.title = `unknown error ${ex}`;
                }
            }
            finally {
                this.$nominatimButton.disabled = false;
            }
        });
    }
    constructQuery() {
        return makeNoteBboxQueryFromValues(this.$bboxInput.value, this.$statusSelect.value);
    }
}
function makeDumbCache() {
    const cache = new Map();
    return [
        async (timestamp, url) => cache.get(url),
        async (timestamp, url, bbox) => cache.set(url, bbox)
    ];
}
function modifyHistory(query, push) {
    const canonicalQueryHash = query ? '#' + makeNoteQueryString(query) : '';
    if (canonicalQueryHash != location.hash) {
        const url = canonicalQueryHash || location.pathname + location.search;
        if (push) {
            history.pushState(null, '', url);
        }
        else {
            history.replaceState(null, '', url);
        }
    }
}

function isValidOperator(op) {
    return (op == '=' || op == '!=' || op == '~=');
}
class NoteFilter {
    constructor(query) {
        this.query = query;
        this.statements = [];
        let lineNumber = 0;
        lineLoop: for (const untrimmedLine of query.split('\n')) {
            lineNumber++;
            const line = untrimmedLine.trim();
            if (!line)
                continue;
            for (const c of ['^', '$', '*']) {
                if (line == c) {
                    this.statements.push({ type: c });
                    continue lineLoop;
                }
            }
            const conditions = [];
            for (const untrimmedTerm of line.split(',')) {
                const term = untrimmedTerm.trim();
                const makeRegExp = (symbol, rest) => new RegExp(`^${symbol}\\s*([!~]?=)\\s*${rest}$`);
                const matchTerm = (symbol, rest) => term.match(makeRegExp(symbol, rest));
                let match;
                if (match = matchTerm('user', '(.+)')) {
                    const [, operator, user] = match;
                    if (!isValidOperator(operator))
                        continue; // impossible
                    const userQuery = toUserQuery(user);
                    if (userQuery.userType == 'invalid' || userQuery.userType == 'empty') {
                        throwError(`Invalid user value "${user}"`);
                    }
                    conditions.push({ type: 'user', operator, ...userQuery });
                    continue;
                }
                else if (match = matchTerm('action', '(.+)')) {
                    const [, operator, action] = match;
                    if (!isValidOperator(operator))
                        continue; // impossible
                    if (action != 'opened' && action != 'closed' && action != 'reopened' && action != 'commented' && action != 'hidden') {
                        throwError(`Invalid action value "${action}"`);
                    }
                    conditions.push({ type: 'action', operator, action });
                    continue;
                }
                else if (match = matchTerm('text', '"([^"]*)"')) {
                    const [, operator, text] = match;
                    if (!isValidOperator(operator))
                        continue; // impossible
                    conditions.push({ type: 'text', operator, text });
                    continue;
                }
                throwError(`Syntax error`);
                function throwError(message) {
                    throw new RangeError(`${message} on line ${lineNumber}: ${line}`);
                }
            }
            if (conditions.length > 0)
                this.statements.push({ type: 'conditions', conditions });
        }
        if (this.statements.length > 0) {
            const st1 = this.statements[0].type;
            if (st1 != '^' && st1 != '*') {
                this.statements.unshift({ type: '*' });
            }
            const st2 = this.statements[this.statements.length - 1].type;
            if (st2 != '$' && st2 != '*') {
                this.statements.push({ type: '*' });
            }
        }
    }
    isSameQuery(query) {
        return this.query == query;
    }
    matchNote(note, getUsername) {
        // console.log('> match',this.statements,note.comments)
        const isCommentEqualToUserConditionValue = (condition, comment) => {
            if (condition.userType == 'id') {
                if (condition.uid == 0) {
                    if (comment.uid != null)
                        return false;
                }
                else {
                    if (comment.uid != condition.uid)
                        return false;
                }
            }
            else {
                if (condition.username == '0') {
                    if (comment.uid != null)
                        return false;
                }
                else {
                    if (comment.uid == null)
                        return false;
                    if (getUsername(comment.uid) != condition.username)
                        return false;
                }
            }
            return true;
        };
        const getConditionActualValue = (condition, comment) => {
            if (condition.type == 'user') {
                if (condition.userType == 'id') {
                    return comment.uid;
                }
                else {
                    if (comment.uid == null)
                        return undefined;
                    return getUsername(comment.uid);
                }
            }
            else if (condition.type == 'action') {
                return comment.action;
            }
            else if (condition.type == 'text') {
                return comment.text;
            }
        };
        const getConditionCompareValue = (condition) => {
            if (condition.type == 'user') {
                if (condition.userType == 'id') {
                    return condition.uid;
                }
                else {
                    return condition.username;
                }
            }
            else if (condition.type == 'action') {
                return condition.action;
            }
            else if (condition.type == 'text') {
                return condition.text;
            }
        };
        const isOperatorMatches = (operator, actualValue, compareValue) => {
            const str = (v) => String(v ?? '');
            if (operator == '=')
                return actualValue == compareValue;
            if (operator == '!=')
                return actualValue != compareValue;
            if (operator == '~=')
                return !!str(actualValue).match(new RegExp(escapeRegex(str(compareValue)), 'i'));
            return false; // shouldn't happen
        };
        const isConditionMatches = (condition, comment) => {
            if (condition.type == 'user' && (condition.operator == '=' || condition.operator == '!=')) {
                const isEqual = isCommentEqualToUserConditionValue(condition, comment);
                return condition.operator == '=' ? isEqual : !isEqual;
            }
            return isOperatorMatches(condition.operator, getConditionActualValue(condition, comment), getConditionCompareValue(condition));
        };
        // const rec=(iStatement: number, iComment: number): boolean => {
        // 	console.log('>> rec',iStatement,iComment)
        // 	const result=rec1(iStatement,iComment)
        // 	console.log('<< rec',iStatement,iComment,'got',result)
        // 	return result
        // }
        const rec = (iStatement, iComment) => {
            // const rec1=(iStatement: number, iComment: number): boolean => {
            if (iStatement >= this.statements.length)
                return true;
            const statement = this.statements[iStatement];
            if (statement.type == '^') {
                if (iComment != 0)
                    return false;
                return rec(iStatement + 1, iComment);
            }
            else if (statement.type == '$') {
                return iComment == note.comments.length;
            }
            else if (statement.type == '*') {
                if (iComment < note.comments.length && rec(iStatement, iComment + 1))
                    return true;
                return rec(iStatement + 1, iComment);
            }
            if (iComment >= note.comments.length)
                return false;
            const comment = note.comments[iComment];
            if (statement.type == 'conditions') {
                for (const condition of statement.conditions) {
                    if (!isConditionMatches(condition, comment))
                        return false;
                }
                return rec(iStatement + 1, iComment + 1);
            }
            return false; // shouldn't happen
        };
        return rec(0, 0);
        // return rec1(0,0)
    }
}

const syntaxDescription = `<summary>Filter syntax</summary>
<ul>
<li>Blank lines are ignored
<li>Leading/trailing spaces are ignored
<li>Each line is a note comment/action ${term('comment match statement')}
<li>Comments and actions are the same things, we'll call them <em>comments</em> because that's how they are referred to by API/DB: each action is accompanied by a possibly empty comment, commenting without closing/opening is also an action
<li>${term('comment match statement')}s form a sequence that has to match a subsequence of note comments, like a <a href='https://en.wikipedia.org/wiki/Regular_expression'>regular expression</a>
</ul>
<dl>
<dt>${term('comment match statement')}
<dd>One of:
	<ul>
	<li><dl><dt><kbd>^</kbd>
		<dd>beginning of comment sequence: next ${term('comment match statement')} is checked against the first note comment
	</dl>
	<li><dl><dt><kbd>$</kbd>
		<dd>end of comment sequence: previous ${term('comment match statement')} is checked against the last note comment
	</dl>
	<li><dl><dt><kbd>*</kbd>
		<dd>any sequence of comments, including an empty one
	</dl>
	<li><dl><dt>${term('comment condition')} [<kbd>,</kbd> ${term('comment condition')}]*
		<dd>one comment satisfying every condition in this comma-separated list
	</dl>
	</ul>
<dt>${term('comment condition')}
<dd>One of:
	<ul>
	<li><dl><dt><kbd>user </kbd>${term('comparison operator')}<kbd> </kbd>${term('user descriptor')}
		<dd>comment (not) by a specified user
	</dl>
	<li><dl><dt><kbd>action </kbd>${term('comparison operator')}<kbd> </kbd>${term('action descriptor')}
		<dd>comment (not) performing a specified action
	</dl>
	<li><dl><dt><kbd>text </kbd>${term('comparison operator')}<kbd> "</kbd>${term('search string')}<kbd>"</kbd>
		<dd>comment (not) equal to a specified text
	</dl>
	</ul>
<dt>${term('comparison operator')}
<dd>One of: <kbd>=</kbd> <kbd>!=</kbd> <kbd>~=</kbd> (case-insensitive substring match)
<dt>${term('user descriptor')}
<dd>OSM username, URL or #id, like in a fetch query input. Additionally you can specify username <kbd>0</kbd> or id <kbd>#0</kbd> to match anonymous users. No user with actual name "0" can exist because it's too short.
<dt>${term('action descriptor')}
<dd>One of: <kbd>opened</kbd> <kbd>closed</kbd> <kbd>reopened</kbd> <kbd>commented</kbd> <kbd>hidden</kbd>
</dl>`;
const syntaxExamples = [
    [`Notes commented by user A`, [`user = A`]],
    [`Notes commented by user A, later commented by user B`, [`user = A`, `*`, `user = B`]],
    [`Notes opened by user A`, [`^`, `user = A`]],
    [`Notes opened by an anonymous user`, [`^`, `user = 0`]],
    [`Notes closed by user A that were opened by somebody else`, [`^`, `user != A`, `*`, `user = A, action = closed`]],
    [`Notes closed without a comment as their last action`, [`action = closed, text = ""`, `$`]],
];
function term(t) {
    return `<em>&lt;${t}&gt;</em>`;
}
class NoteFilterPanel {
    constructor($container) {
        const $form = document.createElement('form');
        const $textarea = document.createElement('textarea');
        const $button = document.createElement('button');
        this.noteFilter = new NoteFilter(``);
        {
            const $details = document.createElement('details');
            $details.innerHTML = syntaxDescription;
            const $examplesTitle = document.createElement('p');
            $examplesTitle.innerHTML = '<strong>Examples</strong>:';
            const $examplesList = document.createElement('dl');
            $examplesList.classList.add('examples');
            for (const [title, codeLines] of syntaxExamples) {
                const $dt = document.createElement('dt');
                $dt.append(title);
                const $dd = document.createElement('dd');
                const $code = document.createElement('code');
                $code.textContent = codeLines.join('\n');
                $dd.append($code);
                $examplesList.append($dt, $dd);
            }
            $details.append($examplesTitle, $examplesList);
            $form.append($details);
        }
        {
            const $div = document.createElement('div');
            $div.classList.add('major-input');
            $textarea.rows = 5;
            const $label = document.createElement('label');
            $label.append(`Filter:`, $textarea);
            $div.append($label);
            $form.append($div);
        }
        {
            const $div = document.createElement('div');
            $div.classList.add('major-input');
            $button.textContent = `Apply filter`;
            $button.type = 'submit';
            $button.disabled = true;
            $div.append($button);
            $form.append($div);
        }
        $textarea.addEventListener('input', () => {
            $button.disabled = this.noteFilter.isSameQuery($textarea.value);
            try {
                new NoteFilter($textarea.value);
                $textarea.setCustomValidity('');
            }
            catch (ex) {
                let message = `Syntax error`;
                if (ex instanceof RangeError)
                    message = ex.message;
                $textarea.setCustomValidity(message);
            }
        });
        $form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            try {
                this.noteFilter = new NoteFilter($textarea.value);
            }
            catch (ex) {
                return;
            }
            if (this.callback)
                this.callback(this.noteFilter);
            $button.disabled = true;
        });
        $container.append($form);
    }
    subscribe(callback) {
        this.callback = callback;
    }
    unsubscribe() {
        this.callback = undefined;
    }
}

class ExtrasPanel {
    constructor(storage, db, $container) {
        this.storage = storage;
        this.db = db;
        this.$container = $container;
    }
    rewrite(query, limit) {
        this.$container.innerHTML = '';
        const $details = document.createElement('details');
        {
            const $summary = document.createElement('summary');
            $summary.textContent = `Extra information`;
            $details.append($summary);
        }
        const $updateFetchesButton = document.createElement('button');
        writeBlock(() => {
            $updateFetchesButton.textContent = `Update stored fetch list`;
            return [$updateFetchesButton];
        });
        const $fetchesContainer = writeBlock(() => {
            return [`Click Update button above to see stored fetches`];
        });
        $updateFetchesButton.addEventListener('click', async () => {
            $updateFetchesButton.disabled = true;
            let fetchEntries = [];
            try {
                fetchEntries = await this.db.view();
            }
            catch { }
            $updateFetchesButton.disabled = false;
            $fetchesContainer.innerHTML = '';
            const $table = document.createElement('table');
            {
                const $row = $table.insertRow();
                insertCell().append('fetch');
                insertCell().append('mode');
                insertCell().append('user');
                insertCell().append('last access');
                function insertCell() {
                    const $th = document.createElement('th');
                    $row.append($th);
                    return $th;
                }
            }
            let n = 0;
            for (const fetchEntry of fetchEntries) {
                const $row = $table.insertRow();
                $row.insertCell().append(makeLink(`[${++n}]`, '#' + fetchEntry.queryString));
                const searchParams = new URLSearchParams(fetchEntry.queryString);
                $row.insertCell().append(searchParams.get('mode') ?? '(outdated/invalid)');
                const $userCell = $row.insertCell();
                const username = searchParams.get('display_name');
                if (username)
                    $userCell.append(makeUserNameLink(username));
                $row.insertCell().append(String(new Date(fetchEntry.accessTimestamp)));
                const $deleteButton = document.createElement('button');
                $deleteButton.textContent = `Delete`;
                $deleteButton.addEventListener('click', async () => {
                    $deleteButton.disabled = true;
                    await this.db.delete(fetchEntry);
                    $updateFetchesButton.click();
                });
                $row.insertCell().append($deleteButton);
            }
            $fetchesContainer.append($table);
        });
        writeBlock(() => {
            const $clearButton = document.createElement('button');
            $clearButton.textContent = `Clear settings`;
            $clearButton.addEventListener('click', () => {
                this.storage.clear();
            });
            return [$clearButton];
        });
        if (query != null && limit != null) { // TODO don't limit to this user
            const userQuery = makeUserQueryFromNoteSearchQuery(query);
            const $userLink = makeUserLink();
            if ($userLink)
                writeBlock(() => [
                    `API links to queries on `,
                    $userLink,
                    `: `,
                    makeNoteSearchQueryLink(`with specified limit`, query, limit),
                    `, `,
                    makeNoteSearchQueryLink(`with max limit`, query, 10000),
                    ` (may be slow)`
                ]);
            function makeUserLink() {
                if (userQuery.userType == 'name')
                    return makeUserNameLink(userQuery.username, `this user`);
                if (userQuery.userType == 'id')
                    return makeUserIdLink(userQuery.uid, `this user`);
            }
        }
        writeBlock(() => [
            `User query have whitespace trimmed, then the remaining part starting with `, makeCode(`#`), ` is treated as a user id; containing `, makeCode(`/`), `is treated as a URL, anything else as a username. `,
            `This works because usernames can't contain any of these characters: `, makeCode(`/;.,?%#`), ` , can't have leading/trailing whitespace, have to be between 3 and 255 characters in length.`
        ]);
        writeBlock(() => [
            `Notes documentation: `,
            makeLink(`wiki`, `https://wiki.openstreetmap.org/wiki/Notes`),
            `, `,
            makeLink(`API`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Map_Notes_API`),
            ` (`,
            makeLink(`search`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Search_for_notes:_GET_.2Fapi.2F0.6.2Fnotes.2Fsearch`),
            `, `,
            makeLink(`bbox`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_.2Fapi.2F0.6.2Fnotes`),
            `), `,
            makeLink(`GeoJSON`, `https://wiki.openstreetmap.org/wiki/GeoJSON`),
            ` (output format used for notes/search.json api calls)`
        ]);
        writeBlock(() => [
            `Notes implementation code: `,
            makeLink(`notes api controller`, `https://github.com/openstreetmap/openstreetmap-website/blob/master/app/controllers/api/notes_controller.rb`),
            ` (db search query is build there), `,
            makeLink(`notes controller`, `https://github.com/openstreetmap/openstreetmap-website/blob/master/app/controllers/notes_controller.rb`),
            ` (paginated user notes query is build there), `,
            makeLink(`note model`, `https://github.com/openstreetmap/openstreetmap-website/blob/master/app/models/note.rb`),
            `, `,
            makeLink(`note comment model`, `https://github.com/openstreetmap/openstreetmap-website/blob/master/app/models/note_comment.rb`),
            ` in `,
            makeLink(`Rails Port`, `https://wiki.openstreetmap.org/wiki/The_Rails_Port`),
            ` (not implemented in `,
            makeLink(`CGIMap`, `https://wiki.openstreetmap.org/wiki/Cgimap`),
            `)`
        ]);
        writeBlock(() => [
            `Other documentation: `,
            makeLink(`Overpass queries`, `https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL`), `, `,
            makeLink(`GPX format`, `https://www.topografix.com/GPX/1/1/`), `, `,
            makeLink(`Nominatim search`, `https://nominatim.org/release-docs/develop/api/Search/`)
        ]);
        writeBlock(() => [
            makeLink(`Source code`, `https://github.com/AntonKhorev/osm-note-viewer`)
        ]);
        function writeBlock(makeBlockContents) {
            const $block = document.createElement('div');
            $block.append(...makeBlockContents());
            $details.append($block);
            return $block;
        }
        function makeCode(s) {
            const $code = document.createElement('code');
            $code.textContent = s;
            return $code;
        }
        function makeNoteSearchQueryLink(text, query, limit) {
            return makeLink(text, `https://api.openstreetmap.org/api/0.6/notes/search.json?` + getNextFetchDetails(query, limit).parameters);
        }
        this.$container.append($details);
    }
}

class ScrollRestorer {
    constructor($scrollingPart) {
        this.$scrollingPart = $scrollingPart;
        this.rememberScrollPosition = false;
        history.scrollRestoration = 'manual';
        $scrollingPart.addEventListener('scroll', () => {
            if (!this.rememberScrollPosition)
                return;
            const scrollPosition = $scrollingPart.scrollTop;
            history.replaceState({ scrollPosition }, '');
            // TODO save more panel open/closed state... actually all panels open/closed states - Firefox does that, Chrome doesn't
            // ... or save some other kind of position relative to notes table instead of scroll
        });
    }
    run($resizeObservationTarget) {
        // requestAnimationFrame and setTimeout(...,0) don't work very well: https://stackoverflow.com/a/38029067
        // ResizeObserver works better: https://stackoverflow.com/a/66172042
        this.rememberScrollPosition = false;
        let nRestoreScrollPositionAttempts = 0;
        const tryToRestoreScrollPosition = () => {
            if (++nRestoreScrollPositionAttempts > 10)
                return true;
            if (!history.state)
                return true;
            const needToScrollTo = history.state.scrollPosition;
            if (typeof needToScrollTo != 'number')
                return true;
            const canScrollTo = this.$scrollingPart.scrollHeight - this.$scrollingPart.clientHeight;
            if (needToScrollTo > canScrollTo)
                return false;
            this.$scrollingPart.scrollTop = needToScrollTo;
            return true;
        };
        if (tryToRestoreScrollPosition()) {
            this.rememberScrollPosition = true;
            return;
        }
        const resizeObserver = new ResizeObserver(() => {
            if (tryToRestoreScrollPosition()) {
                resizeObserver.disconnect();
                this.rememberScrollPosition = true;
            }
        });
        resizeObserver.observe($resizeObservationTarget); // observing $scrollingPart won't work because its size doesn't change
    }
}
main();
async function main() {
    const storage = new NoteViewerStorage('osm-note-viewer-');
    const db = await NoteViewerDB.open();
    const $fetchContainer = makeDiv('panel', 'fetch')();
    const $filterContainer = makeDiv('panel', 'fetch')();
    const $extrasContainer = makeDiv('panel')();
    const $notesContainer = makeDiv('notes')();
    const $moreContainer = makeDiv('more')();
    const $commandContainer = makeDiv('panel', 'command')();
    const $mapContainer = makeDiv('map')();
    const $photoDialog = document.createElement('dialog');
    $photoDialog.classList.add('photo');
    const $scrollingPart = makeDiv('scrolling')($fetchContainer, $filterContainer, $extrasContainer, $notesContainer, $moreContainer);
    const $stickyPart = makeDiv('sticky')($commandContainer);
    const $textSide = makeDiv('text-side')($scrollingPart, $stickyPart);
    const $graphicSide = makeDiv('graphic-side')($mapContainer, $photoDialog);
    const flipped = !!storage.getItem('flipped');
    if (flipped)
        document.body.classList.add('flipped');
    document.body.append($textSide, $graphicSide);
    const scrollRestorer = new ScrollRestorer($scrollingPart);
    const map = new NoteMap($mapContainer);
    const photoDialog = new PhotoDialog($photoDialog);
    writeFlipLayoutButton(storage, $fetchContainer, map);
    writeResetButton($fetchContainer);
    const extrasPanel = new ExtrasPanel(storage, db, $extrasContainer);
    const filterPanel = new NoteFilterPanel($filterContainer);
    new NoteFetchPanel(storage, db, $fetchContainer, $notesContainer, $moreContainer, $commandContainer, filterPanel, extrasPanel, map, photoDialog, () => scrollRestorer.run($notesContainer));
    scrollRestorer.run($notesContainer);
}
function writeFlipLayoutButton(storage, $container, map) {
    const $button = document.createElement('button');
    $button.classList.add('flip');
    $button.title = `Flip layout`;
    $button.addEventListener('click', () => {
        document.body.classList.toggle('flipped');
        if (document.body.classList.contains('flipped')) {
            storage.setItem('flipped', '1');
        }
        else {
            storage.removeItem('flipped');
        }
        map.invalidateSize();
    });
    $container.append($button);
}
function writeResetButton($container) {
    const $button = document.createElement('button');
    $button.classList.add('reset');
    $button.title = `Reset query`;
    $button.addEventListener('click', () => {
        location.href = location.pathname + location.search;
    });
    $container.append($button);
}
