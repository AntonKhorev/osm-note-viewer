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
        this.onMoveEnd(() => {
            if (!this.queuedPopup)
                return;
            const [layerId, popupWriter] = this.queuedPopup;
            this.queuedPopup = undefined;
            const geometry = this.elementLayer.getLayer(layerId);
            if (geometry) {
                const popup = L.popup({ autoPan: false })
                    .setLatLng(this.leafletMap.getCenter()) // need to tell the popup this exact place after map stops moving, otherwise is sometimes gets opened off-screen
                    .setContent(popupWriter)
                    .openOn(this.leafletMap);
                geometry.bindPopup(popup);
            }
        });
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
    addOsmElement(geometry, popupWriter) {
        // TODO zoom on second click, like with notes
        this.elementLayer.clearLayers();
        this.elementLayer.addLayer(geometry);
        const layerId = this.elementLayer.getLayerId(geometry);
        // geometry.openPopup() // can't do it here because popup will open on a wrong spot if animation is not finished
        if (geometry instanceof L.CircleMarker) {
            this.queuedPopup = [layerId, popupWriter];
            const minZoomForNode = 10;
            if (this.zoom < minZoomForNode) {
                this.leafletMap.flyTo(geometry.getLatLng(), minZoomForNode, { duration: .5 });
            }
            else {
                this.leafletMap.panTo(geometry.getLatLng());
            }
        }
        else {
            const bounds = this.elementLayer.getBounds();
            if (bounds.isValid()) {
                this.queuedPopup = [layerId, popupWriter];
                this.leafletMap.fitBounds(bounds);
            }
            else {
                geometry.bindPopup(popupWriter).openPopup();
            }
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
        this.$overlay.innerHTML = `<svg class="crosshair"><use href="#map-crosshair" /></svg>`;
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
function startOrResetFadeAnimation($element, animationName, animationClass) {
    if ($element.classList.contains(animationClass)) {
        resetFadeAnimation($element, animationName);
    }
    else {
        $element.classList.add(animationClass);
    }
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

class FigureDialog {
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
        $closeButton.classList.add('global');
        $closeButton.innerHTML = `<svg><title>Close photo</title><use href="#reset" /></svg>`;
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
            startOrResetFadeAnimation($closeButton, 'photo-button-fade', 'fading');
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

class LooseParserListener {
    constructor(callback) {
        this.hadSelectionOnMouseDown = false;
        const that = this;
        this.mouseDownListener = function (ev) {
            that.x = ev.pageX;
            that.y = ev.pageY;
            that.hadSelectionOnMouseDown = !!getValidSelection()?.toString();
        };
        this.mouseUpListener = function (ev) {
            const samePlace = that.x == ev.pageX && that.y == ev.pageY;
            that.x = that.y = undefined;
            if (samePlace && that.hadSelectionOnMouseDown)
                return; // had something selected and made a single click
            const selectedText = getExtendedSelectionText(this, samePlace); // need to extend the selected text when the selection is a result of a double-click
            if (!selectedText)
                return;
            callback(ev.pageX, ev.pageY, selectedText);
        };
        function getValidSelection() {
            const selection = document.getSelection();
            if (!selection)
                return null;
            if (selection.rangeCount != 1)
                return null;
            return selection;
        }
        function getExtendedSelectionText(startNode, needToExtend) {
            const selection = getValidSelection();
            if (!selection)
                return '';
            const selectionText = selection.toString();
            if (!needToExtend || !selectionText)
                return selectionText;
            if (selection.anchorNode == null || selection.anchorOffset == null ||
                selection.focusNode == null || selection.focusOffset == null)
                return '';
            const t1 = getExtendedSelectionTextToNodeAndOffset(startNode, selection.anchorNode, selection.anchorOffset);
            const t2 = getExtendedSelectionTextToNodeAndOffset(startNode, selection.focusNode, selection.focusOffset);
            if (t1.length > t2.length) {
                return t1;
            }
            else {
                return t2;
            }
        }
        function getExtendedSelectionTextToNodeAndOffset(startNode, node, offset) {
            const range = document.createRange();
            range.setStart(startNode, 0);
            range.setEnd(node, offset);
            return range.toString();
        }
    }
    listen($target) {
        $target.addEventListener('mousedown', this.mouseDownListener);
        $target.addEventListener('mouseup', this.mouseUpListener);
    }
}

const e$1 = makeEscapeTag(encodeURIComponent);
const makeItem = makeElement('li')();
const makeITEM = makeElement('li')('main');
class LooseParserPopup {
    constructor($container, installClickListener) {
        this.installClickListener = installClickListener;
        this.$popup = document.createElement('ul');
        this.$popup.classList.add('loose-parser-popup');
        this.$popup.onmouseleave = () => {
            this.$popup.classList.remove('open');
            this.$popup.innerHTML = '';
        };
        $container.append(this.$popup);
    }
    open(x, y, id, type) {
        const itemHeight = 20;
        const itemWidth = 90;
        this.$popup.style.left = `${x - 0.75 * itemWidth}px`;
        this.$popup.style.top = `${y - 2 * itemHeight}px`;
        this.$popup.innerHTML = '';
        this.$popup.append(makeItem(makeElement('a')()(`#${id}`)));
        this.$popup.append(makeITEM(this.makeLink(id, type)));
        const types = ['note', 'changeset', 'node', 'way', 'relation'];
        for (const type of types) {
            this.$popup.append(makeItem(this.makeLink(id, type)));
        }
        this.$popup.classList.add('open');
    }
    makeLink(id, type) {
        if (type == null)
            return makeElement('a')()('?');
        const $a = makeElement('a')()(type);
        $a.href = e$1 `https://www.openstreetmap.org/${type}/${id}`;
        if (type == 'note') {
            $a.classList.add('other-note');
            $a.dataset.noteId = String(id);
        }
        else if (type == 'changeset') {
            $a.dataset.changesetId = String(id);
        }
        else {
            $a.dataset.elementType = type;
            $a.dataset.elementId = String(id);
        }
        this.installClickListener($a);
        return $a;
    }
}

function parseLoose(text) {
    const match = text.match(/^(.*?)([0-9]+)\s*$/s);
    if (!match)
        return null;
    const [, prefix, idString] = match;
    return [Number(idString), getType(prefix)];
}
function getType(text) {
    const types = ['note', 'changeset', 'node', 'way', 'relation'];
    let bestType = undefined;
    let bestIndex = -1;
    const lowercaseText = text.toLowerCase();
    for (const type of types) {
        const index = lowercaseText.lastIndexOf(type);
        if (index > bestIndex) {
            bestIndex = index;
            bestType = type;
        }
    }
    return bestType;
}

function getCommentItems(commentText) {
    const matchRegExp = new RegExp(`(?<before>.*?)(?<text>` +
        `(?<date>\\d\\d\\d\\d-\\d\\d-\\d\\d[T ]\\d\\d:\\d\\d:\\d\\dZ)` +
        `|` +
        `(?<link>https?://(?:` +
        `(?<image>westnordost\.de/p/[0-9]+\.jpg)` +
        '|' +
        `(?<osm>(?:www\\.)?(?:osm|openstreetmap)\\.org/` +
        `(?<path>(?<osmType>node|way|relation|changeset|note)/(?<id>[0-9]+))?` +
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
                if (groups.osmType == 'node' || groups.osmType == 'way' || groups.osmType == 'relation') {
                    return {
                        ...osmItem,
                        osm: 'element',
                        element: groups.osmType,
                        id: Number(groups.id)
                    };
                }
                else if (groups.osmType == 'changeset' || groups.osmType == 'note') {
                    return {
                        ...osmItem,
                        osm: groups.osmType,
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

function isOsmBase(d) {
    if (!d)
        return false;
    if (!Number.isInteger(d.id))
        return false;
    if (d.user != null && (typeof d.user != 'string'))
        return false;
    if (!Number.isInteger(d.uid))
        return false;
    if (d.tags != null && (typeof d.tags != 'object'))
        return false;
    return true;
}
function isOsmElementBase(e) {
    if (!isOsmBase(e))
        return false;
    if (e.type != 'node' && e.type != 'way' && e.type != 'relation')
        return false;
    if (typeof e.timestamp != 'string')
        return false;
    if (!Number.isInteger(e.version))
        return false;
    if (!Number.isInteger(e.changeset))
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
function isOsmChangeset(c) {
    if (!isOsmBase(c))
        return false;
    if (typeof c.created_at != 'string')
        return false;
    if (c.closed_at != null && (typeof c.closed_at != 'string'))
        return false;
    if (c.minlat == null && c.minlon == null &&
        c.maxlat == null && c.maxlon == null) {
        return true;
    }
    else if (Number.isFinite(c.minlat) && Number.isFinite(c.minlon) &&
        Number.isFinite(c.maxlat) && Number.isFinite(c.maxlon)) {
        return true;
    }
    else {
        return false;
    }
}
const e = makeEscapeTag(encodeURIComponent);
async function downloadAndShowChangeset($a, map, outputDate, changesetId) {
    downloadCommon($a, map, async () => {
        const url = e `https://api.openstreetmap.org/api/0.6/changeset/${changesetId}.json`;
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status == 404) {
                throw new TypeError(`changeset doesn't exist`);
            }
            else {
                throw new TypeError(`OSM API error: unsuccessful response`);
            }
        }
        const data = await response.json();
        const changeset = getChangesetFromOsmApiResponse(data);
        addGeometryToMap(map, makeChangesetGeometry(changeset), () => makeChangesetPopupContents(outputDate, changeset));
    });
    function makeChangesetGeometry(changeset) {
        if (changeset.minlat == null || changeset.minlon == null ||
            changeset.maxlat == null || changeset.maxlon == null) {
            throw new TypeError(`changeset is empty`);
        }
        return L.rectangle([
            [changeset.minlat, changeset.minlon],
            [changeset.maxlat, changeset.maxlon]
        ]);
    }
}
async function downloadAndShowElement($a, map, outputDate, elementType, elementId) {
    downloadCommon($a, map, async () => {
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
            addGeometryToMap(map, makeNodeGeometry(element), () => makeElementPopupContents(outputDate, element));
        }
        else if (isOsmWayElement(element)) {
            addGeometryToMap(map, makeWayGeometry(element, elements), () => makeElementPopupContents(outputDate, element));
        }
        else if (isOsmRelationElement(element)) {
            addGeometryToMap(map, makeRelationGeometry(element, elements), () => makeElementPopupContents(outputDate, element));
        }
        else {
            throw new TypeError(`OSM API error: requested element has unknown type`); // shouldn't happen
        }
    });
    function makeNodeGeometry(node) {
        return L.circleMarker([node.lat, node.lon]);
    }
    function makeWayGeometry(way, elements) {
        const coords = [];
        for (const id of way.nodes) {
            const node = elements.node[id];
            if (!node)
                throw new TypeError(`OSM API error: referenced element not found in response data`);
            coords.push([node.lat, node.lon]);
        }
        return L.polyline(coords);
    }
    function makeRelationGeometry(relation, elements) {
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
                geometry.addLayer(makeWayGeometry(way, elements));
            }
            // TODO indicate that there might be relations, their data may be incomplete
        }
        return geometry;
    }
}
async function downloadCommon($a, map, downloadSpecific) {
    $a.classList.add('loading');
    try {
        // TODO cancel already running response
        await downloadSpecific();
        $a.classList.remove('absent');
        $a.title = '';
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
function getChangesetFromOsmApiResponse(data) {
    if (!data)
        throw new TypeError(`OSM API error: invalid response data`);
    const changesetArray = data.elements;
    if (!Array.isArray(changesetArray))
        throw new TypeError(`OSM API error: invalid response data`);
    if (changesetArray.length != 1)
        throw new TypeError(`OSM API error: invalid response data`);
    const changeset = changesetArray[0];
    if (!isOsmChangeset(changeset))
        throw new TypeError(`OSM API error: invalid changeset in response data`);
    return changeset;
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
function makeChangesetPopupContents(outputDate, changeset) {
    const contents = [];
    const p = (...s) => makeElement('p')()(...s);
    const h = (...s) => p(makeElement('strong')()(...s));
    const c = (...s) => p(makeElement('em')()(...s));
    const changesetHref = e `https://www.openstreetmap.org/changeset/${changeset.id}`;
    contents.push(h(`Changeset: `, makeLink(String(changeset.id), changesetHref)));
    if (changeset.tags?.comment)
        contents.push(c(changeset.tags.comment));
    const $p = p();
    if (changeset.closed_at) {
        $p.append(`Closed on `, getDate(changeset.closed_at, outputDate));
    }
    else {
        $p.append(`Created on `, getDate(changeset.created_at, outputDate));
    }
    $p.append(` by `, getUser(changeset));
    contents.push($p);
    const $tags = getTags(changeset.tags, 'comment');
    if ($tags)
        contents.push($tags);
    return contents;
}
function makeElementPopupContents(outputDate, element) {
    const p = (...s) => makeElement('p')()(...s);
    const h = (...s) => p(makeElement('strong')()(...s));
    const elementHref = e `https://www.openstreetmap.org/${element.type}/${element.id}`;
    const contents = [
        h(capitalize(element.type) + `: `, makeLink(getElementName(element), elementHref)),
        h(`Version #${element.version} · `, makeLink(`View History`, elementHref + '/history'), ` · `, makeLink(`Edit`, e `https://www.openstreetmap.org/edit?${element.type}=${element.id}`)),
        p(`Edited on `, getDate(element.timestamp, outputDate), ` by `, getUser(element), ` · Changeset #`, makeLink(String(element.changeset), e `https://www.openstreetmap.org/changeset/${element.changeset}`))
    ];
    const $tags = getTags(element.tags);
    if ($tags)
        contents.push($tags);
    return contents;
}
function addGeometryToMap(map, geometry, makePopupContents) {
    const popupWriter = () => {
        const $removeButton = document.createElement('button');
        $removeButton.textContent = `Remove from map view`;
        $removeButton.onclick = () => {
            map.elementLayer.clearLayers();
        };
        return makeDiv('osm-element-popup-contents')(...makePopupContents(), $removeButton);
    };
    map.addOsmElement(geometry, popupWriter);
}
function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}
function getDate(timestamp, outputDate) {
    const readableDate = timestamp.replace('T', ' ').replace('Z', ''); // TODO replace date output fn with active element fn
    return outputDate(readableDate);
}
function getUser(data) {
    return makeUserLink(data.uid, data.user);
}
function getTags(tags, skipKey) {
    if (!tags)
        return null;
    const tagBatchSize = 10;
    const tagList = Object.entries(tags).filter(([k, v]) => k != skipKey);
    if (tagList.length <= 0)
        return null;
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
function getElementName(element) {
    if (element.tags?.name) {
        return `${element.tags.name} (${element.id})`;
    }
    else {
        return String(element.id);
    }
}

class CommentWriter {
    constructor(map, figureDialog, pingNoteSection, receiveTimestamp) {
        const that = this;
        this.wrappedActiveTimeElementClickListener = function (ev) {
            ev.stopPropagation();
            receiveTimestamp(this.dateTime);
        };
        this.wrappedOsmLinkClickListener = function (ev) {
            const $a = this;
            ev.preventDefault();
            ev.stopPropagation();
            if (handleNote($a.dataset.noteId))
                return;
            if (handleChangeset($a.dataset.changesetId))
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
                figureDialog.close();
                pingNoteSection($noteSection);
                return true;
            }
            function handleChangeset(changesetId) {
                if (!changesetId)
                    return false;
                figureDialog.close();
                downloadAndShowChangeset($a, map, (readableDate) => makeDateOutput(readableDate, that.wrappedActiveTimeElementClickListener), changesetId);
                return true;
            }
            function handleElement(elementType, elementId) {
                if (!elementId)
                    return false;
                if (elementType != 'node' && elementType != 'way' && elementType != 'relation')
                    return false;
                figureDialog.close();
                downloadAndShowElement($a, map, (readableDate) => makeDateOutput(readableDate, that.wrappedActiveTimeElementClickListener), elementType, elementId);
                return true;
            }
            function handleMap(zoom, lat, lon) {
                if (!(zoom && lat && lon))
                    return false;
                figureDialog.close();
                map.panAndZoomTo([Number(lat), Number(lon)], Number(zoom));
                return true;
            }
        };
        this.wrappedImageLinkClickListener = function (ev) {
            const $a = this;
            ev.preventDefault();
            ev.stopPropagation();
            figureDialog.toggle($a.href);
        };
    }
    makeCommentElements(commentText, showImages = false) {
        const inlineElements = [];
        const imageElements = [];
        for (const item of getCommentItems(commentText)) {
            if (item.type == 'link' && item.link == 'image') {
                const $inlineLink = makeLink(item.href, item.href);
                $inlineLink.classList.add('listened', 'image', 'inline');
                $inlineLink.addEventListener('click', this.wrappedImageLinkClickListener);
                inlineElements.push($inlineLink);
                const $img = document.createElement('img');
                $img.loading = 'lazy'; // this + display:none is not enough to surely stop the browser from accessing the image link
                if (showImages)
                    $img.src = item.href; // therefore only set the link if user agreed to loading
                $img.alt = `attached photo`;
                $img.addEventListener('error', imageErrorHandler);
                const $floatLink = document.createElement('a');
                $floatLink.classList.add('listened', 'image', 'float');
                $floatLink.href = item.href;
                $floatLink.append($img);
                $floatLink.addEventListener('click', this.wrappedImageLinkClickListener);
                imageElements.push($floatLink);
            }
            else if (item.type == 'link' && item.link == 'osm') {
                const $a = makeLink(item.text, item.href);
                if (item.map)
                    [$a.dataset.zoom, $a.dataset.lat, $a.dataset.lon] = item.map;
                if (item.osm == 'element') {
                    $a.dataset.elementType = item.element;
                    $a.dataset.elementId = String(item.id);
                }
                if (item.osm == 'changeset') {
                    $a.classList.add('changeset');
                    $a.dataset.changesetId = String(item.id);
                }
                if (item.osm == 'note') {
                    $a.classList.add('other-note');
                    $a.dataset.noteId = String(item.id);
                }
                this.installOsmClickListenerAfterDatasets($a, true); // suppress note link updates because handleNotesUpdate() is going to be run anyway - TODO: or not if ran from parse tool?
                inlineElements.push($a);
            }
            else if (item.type == 'date') {
                const $time = makeActiveTimeElement(item.text, item.text);
                $time.addEventListener('click', this.wrappedActiveTimeElementClickListener);
                inlineElements.push($time);
            }
            else {
                inlineElements.push(item.text);
            }
        }
        return [inlineElements, imageElements];
    }
    writeComment($cell, commentText, showImages) {
        const [inlineElements, imageElements] = this.makeCommentElements(commentText, showImages);
        if (imageElements.length > 0) {
            $cell.addEventListener('mouseover', imageCommentHoverListener);
            $cell.addEventListener('mouseout', imageCommentHoverListener);
        }
        $cell.append(...imageElements, ...inlineElements);
    }
    installOsmClickListenerAfterDatasets($a, suppressUpdateNoteLink = false) {
        $a.classList.add('listened', 'osm');
        if (!suppressUpdateNoteLink && $a.classList.contains('other-note'))
            updateNoteLink($a);
        $a.addEventListener('click', this.wrappedOsmLinkClickListener);
    }
}
function handleShowImagesUpdate($table, showImages) {
    for (const $a of $table.querySelectorAll('td.note-comment a.image.float')) {
        if (!($a instanceof HTMLAnchorElement))
            continue;
        const $img = $a.firstChild;
        if (!($img instanceof HTMLImageElement))
            continue;
        if (showImages && !$img.src)
            $img.src = $a.href; // don't remove src when showImages is disabled, otherwise will reload all images when src is set back
    }
}
function handleNotesUpdate($table) {
    for (const $a of $table.querySelectorAll('td.note-comment a.other-note')) {
        if (!($a instanceof HTMLAnchorElement))
            continue;
        updateNoteLink($a);
    }
}
function makeDateOutput(readableDate, activeTimeElementClickListener) {
    const [readableDateWithoutTime] = readableDate.split(' ', 1);
    if (readableDate && readableDateWithoutTime) {
        const $time = makeActiveTimeElement(readableDateWithoutTime, `${readableDate.replace(' ', 'T')}Z`, `${readableDate} UTC`);
        $time.addEventListener('click', activeTimeElementClickListener);
        return $time;
    }
    else {
        const $unknownDateTime = document.createElement('span');
        $unknownDateTime.textContent = `?`;
        return $unknownDateTime;
    }
}
function makeActiveTimeElement(text, dateTime, title) {
    const $time = document.createElement('time');
    $time.classList.add('listened');
    $time.textContent = text;
    $time.dateTime = dateTime;
    if (title)
        $time.title = title;
    return $time;
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
    constructor($container, toolPanel, map, filter, figureDialog, showImages) {
        this.toolPanel = toolPanel;
        this.map = map;
        this.filter = filter;
        this.showImages = showImages;
        this.$table = document.createElement('table');
        this.$selectAllCheckbox = document.createElement('input');
        this.noteSectionLayerIdVisibility = new Map();
        this.notesById = new Map(); // in the future these might be windowed to limit the amount of stuff on one page
        this.usersById = new Map();
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
                        figureDialog.close();
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
        this.wrappedNoteMarkerClickListener = function () {
            that.noteMarkerClickListener(this);
        };
        this.noteSectionVisibilityObserver = new NoteSectionVisibilityObserver(toolPanel, map, this.noteSectionLayerIdVisibility);
        this.commentWriter = new CommentWriter(this.map, figureDialog, $noteSection => this.focusOnNote($noteSection), timestamp => toolPanel.receiveTimestamp(timestamp));
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
            $row.append($checkboxCell, makeHeaderCell('id'), makeHeaderCell('date'), makeHeaderCell('user'), makeHeaderCell('?', `action performed along with adding the comment`), makeHeaderCell('comment'));
        }
        function makeHeaderCell(text, title) {
            const $cell = document.createElement('th');
            $cell.textContent = text;
            if (title)
                $cell.title = title;
            return $cell;
        }
        this.updateCheckboxDependents();
        const looseParserPopup = new LooseParserPopup($container, ($a) => this.commentWriter.installOsmClickListenerAfterDatasets($a));
        this.looseParserListener = new LooseParserListener((x, y, text) => {
            const parseResult = parseLoose(text);
            if (!parseResult)
                return;
            looseParserPopup.open(x, y, ...parseResult);
        });
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
        this.toolPanel.receiveNoteCounts(nFetched, nVisible);
        this.updateCheckboxDependents();
        handleNotesUpdate(this.$table);
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
                    $cell.append(makeDateOutput(toReadableDate(comment.date), this.commentWriter.wrappedActiveTimeElementClickListener));
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
                    $cell.innerHTML = `<svg class="icon-${getActionClass(comment.action)}">` +
                        `<title>${comment.action}</title><use href="#table-note" />` +
                        `</svg>`;
                }
                {
                    const $cell = $row.insertCell();
                    $cell.classList.add('note-comment');
                    this.commentWriter.writeComment($cell, comment.text, this.showImages);
                    this.looseParserListener.listen($cell);
                }
                iComment++;
            }
        }
        if (this.toolPanel.fitMode == 'allNotes') {
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
        this.toolPanel.receiveNoteCounts(nFetched, nVisible);
        handleNotesUpdate(this.$table);
        return nUnfilteredNotes;
    }
    setShowImages(showImages) {
        this.showImages = showImages;
        this.$table.classList.toggle('with-images', showImages);
        handleShowImagesUpdate(this.$table, showImages);
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
        this.toolPanel.receiveSelectedNotes(checkedNotes, checkedNoteUsers);
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
    constructor(toolPanel, map, noteSectionLayerIdVisibility) {
        this.isMapFittingHalted = false;
        const noteSectionVisibilityHandler = () => {
            const visibleLayerIds = [];
            for (const [layerId, visibility] of noteSectionLayerIdVisibility) {
                if (visibility)
                    visibleLayerIds.push(layerId);
            }
            map.showNoteTrack(visibleLayerIds);
            if (!this.isMapFittingHalted && toolPanel.fitMode == 'inViewNotes')
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

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __classPrivateFieldGet(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

function __classPrivateFieldSet(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
}

class Tool {
    constructor(id, name, title) {
        this.id = id;
        this.name = name;
        this.title = title;
        this.$buttonsRequiringSelectedNotes = [];
    }
    getInfo() { return undefined; }
    onTimestampChange(timestamp) { return false; }
    onNoteCountsChange(nFetched, nVisible) { return false; }
    onSelectedNotesChange(selectedNotes, selectedNoteUsers) {
        let reactedToButtons = false;
        if (this.$buttonsRequiringSelectedNotes.length > 0) {
            for (const $button of this.$buttonsRequiringSelectedNotes) {
                $button.disabled = selectedNotes.length <= 0;
            }
            reactedToButtons = true;
        }
        const reactedToOthers = this.onSelectedNotesChangeWithoutHandlingButtons(selectedNotes, selectedNoteUsers);
        return reactedToButtons || reactedToOthers;
    }
    onSelectedNotesChangeWithoutHandlingButtons(selectedNotes, selectedNoteUsers) { return false; }
    makeRequiringSelectedNotesButton() {
        const $button = document.createElement('button');
        $button.disabled = true;
        this.$buttonsRequiringSelectedNotes.push($button);
        return $button;
    }
}
function makeMapIcon(type) {
    const $span = document.createElement('span');
    $span.innerHTML = `<span class='icon-map-${type}'><svg><use href="#tools-map" /></svg><span>map ${type}</span></span>`;
    return $span;
}
function makeNotesIcon(type) {
    const $span = document.createElement('span');
    $span.innerHTML = `<span class='icon-notes-${type}'><svg><use href="#tools-notes" /></svg><span>${type} notes</span></span>`;
    return $span;
}

const p$4 = (...ss) => makeElement('p')()(...ss);
const em$2 = (s) => makeElement('em')()(s);
const dfn$1 = (s) => makeElement('dfn')()(s);
const ul$1 = (...ss) => makeElement('ul')()(...ss);
const li$1 = (...ss) => makeElement('li')()(...ss);
class AutozoomTool extends Tool {
    constructor() {
        super('autozoom', `Automatic zoom`, `Pan and zoom the map to visible notes`);
    }
    getInfo() {
        return [p$4(`Pan and zoom the map to notes in the table. `, `Can be used as `, em$2(`zoom to data`), ` for notes layer if `, dfn$1(`to all notes`), ` is selected. `), p$4(dfn$1(`To notes in table view`), ` allows to track notes in the table that are currently visible on screen, panning the map as you scroll through the table. `, `This option is convenient to use when `, em$2(`Track between notes`), ` map layer is enabled (and it is enabled by default). This way you can see the current sequence of notes from the table on the map, connected by a line in an order in which they appear in the table.`)];
    }
    getTool(callbacks, map) {
        const $fitModeSelect = document.createElement('select');
        $fitModeSelect.append(new Option('is disabled', 'none'), new Option('to notes in table view', 'inViewNotes'), new Option('to all notes', 'allNotes'));
        $fitModeSelect.onchange = () => {
            if ($fitModeSelect.value == 'allNotes') {
                callbacks.onFitModeChange(this, $fitModeSelect.value);
                map.fitNotes();
            }
            else if ($fitModeSelect.value == 'inViewNotes') {
                callbacks.onFitModeChange(this, $fitModeSelect.value);
                map.fitNoteTrack();
            }
            else {
                callbacks.onFitModeChange(this, undefined);
            }
        };
        return [$fitModeSelect];
    }
}
class TimestampTool extends Tool {
    constructor() {
        super('timestamp', `Timestamp for historic queries`);
        this.$timestampInput = document.createElement('input');
    }
    getInfo() {
        return [p$4(`Allows to select a timestamp for use with `, em$2(`Overpass`), ` and `, em$2(`Overpass turbo`), ` commands. `, `You can either enter the timestamp in ISO format (or anything else that Overpass understands) manually here click on a date of/in a note comment. `, `If present, a `, makeLink(`date setting`, `https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#date`), ` is added to Overpass queries. `, `The idea is to allow for examining the OSM data at the moment some note was opened/commented/closed to evaluate if this action was correct.`), p$4(`Timestamps inside note comments are usually generated by apps like `, makeLink(`MAPS.ME`, `https://wiki.openstreetmap.org/wiki/MAPS.ME`), ` to indicate their OSM data version.`)];
    }
    getTool(callbacks) {
        // this.$timestampInput.type='datetime-local' // no standard datetime input for now because they're being difficult with UTC and 24-hour format.
        // this.$timestampInput.step='1'
        this.$timestampInput.type = 'text';
        this.$timestampInput.size = 20;
        this.$timestampInput.oninput = () => {
            callbacks.onTimestampChange(this, this.$timestampInput.value);
        };
        const $clearButton = document.createElement('button');
        $clearButton.type = 'reset';
        $clearButton.textContent = 'Clear';
        const $form = makeElement('form')()(this.$timestampInput, ` `, $clearButton);
        $form.onreset = () => {
            callbacks.onTimestampChange(this, '');
        };
        return [$form];
    }
    onTimestampChange(timestamp) {
        this.$timestampInput.value = timestamp;
        return true;
    }
}
class ParseTool extends Tool {
    constructor() {
        super('parse', `Parse links`);
    }
    getInfo() {
        return [p$4(`Parse text as if it's a note comment and get its first active element. If such element exists, it's displayed as a link after →.`, `Currently detected active elements are: `), ul$1(li$1(`links to images made in `, makeLink(`StreetComplete`, `https://wiki.openstreetmap.org/wiki/StreetComplete`)), li$1(`links to OSM notes (clicking the output link is not yet implemented)`), li$1(`links to OSM changesets`), li$1(`links to OSM elements`), li$1(`ISO-formatted timestamps`)), p$4(`May be useful for displaying an arbitrary OSM element in the map view. Paste the element URL and click the output link.`)];
    }
    getTool(callbacks, map, figureDialog) {
        const commentWriter = new CommentWriter(map, figureDialog, () => { }, // TODO ping note section
        (timestamp) => callbacks.onTimestampChange(this, timestamp));
        const $input = document.createElement('input');
        $input.type = 'text';
        $input.size = 50;
        $input.classList.add('complicated');
        const $parseButton = document.createElement('button');
        $parseButton.type = 'submit';
        $parseButton.textContent = 'Parse';
        const $clearButton = document.createElement('button');
        $clearButton.type = 'reset';
        $clearButton.textContent = 'Clear';
        const $output = document.createElement('code');
        $output.append(getFirstActiveElement([]));
        const $form = makeElement('form')()($input, ` `, $parseButton, ` `, $clearButton);
        $form.onsubmit = (ev) => {
            ev.preventDefault();
            const [elements] = commentWriter.makeCommentElements($input.value);
            $output.replaceChildren(getFirstActiveElement(elements));
        };
        $form.onreset = () => {
            $output.replaceChildren(getFirstActiveElement([]));
        };
        return [$form, ` → `, $output];
        function getFirstActiveElement(elements) {
            for (const element of elements) {
                if (element instanceof HTMLAnchorElement) {
                    element.textContent = `link`;
                    return element;
                }
                else if (element instanceof HTMLTimeElement) {
                    element.textContent = `date`;
                    return element;
                }
            }
            return `none`;
        }
    }
}
class CountTool extends Tool {
    constructor() {
        super('counts', `Note counts`);
        this.$fetchedNoteCount = document.createElement('output');
        this.$visibleNoteCount = document.createElement('output');
        this.$selectedNoteCount = document.createElement('output');
    }
    getTool() {
        this.$fetchedNoteCount.textContent = '0';
        this.$visibleNoteCount.textContent = '0';
        this.$selectedNoteCount.textContent = '0';
        return [
            this.$fetchedNoteCount, ` fetched, `,
            this.$visibleNoteCount, ` visible, `,
            this.$selectedNoteCount, ` selected`
        ];
    }
    onNoteCountsChange(nFetched, nVisible) {
        this.$fetchedNoteCount.textContent = String(nFetched);
        this.$visibleNoteCount.textContent = String(nVisible);
        return true;
    }
    onSelectedNotesChangeWithoutHandlingButtons(selectedNotes, selectedNoteUsers) {
        this.$selectedNoteCount.textContent = String(selectedNotes.length);
        return true;
    }
}
class LegendTool extends Tool {
    constructor() {
        super('legend', `Legend`, `What do icons in command panel mean`);
    }
    getTool() {
        return [
            makeMapIcon('center'), ` = map center, `, makeMapIcon('area'), ` = map area, `, makeNotesIcon('selected'), ` = selected notes`
        ];
    }
}
class SettingsTool extends Tool {
    constructor() {
        super('settings', `⚙️`, `Settings`);
    }
    getTool(callbacks) {
        const $openAllButton = document.createElement('button');
        $openAllButton.textContent = `+ open all tools`;
        $openAllButton.onclick = () => callbacks.onToolOpenToggle(this, true);
        const $closeAllButton = document.createElement('button');
        $closeAllButton.textContent = `− close all tools`;
        $closeAllButton.onclick = () => callbacks.onToolOpenToggle(this, false);
        return [$openAllButton, ` `, $closeAllButton];
    }
}

const p$3 = (...ss) => makeElement('p')()(...ss);
class OverpassTool extends Tool {
    constructor() {
        super(...arguments);
        this.timestamp = '';
    }
    onTimestampChange(timestamp) {
        this.timestamp = timestamp;
        return true;
    }
    getOverpassQueryPreamble(map) {
        const bounds = map.bounds;
        let query = '';
        if (this.timestamp)
            query += `[date:"${this.timestamp}"]\n`;
        query += `[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}]\n`;
        query += `;\n`;
        return query;
    }
}
class OverpassTurboTool extends OverpassTool {
    constructor() {
        super('overpass-turbo', `Overpass turbo`);
    }
    getInfo() {
        return [p$3(`Some Overpass queries to run from `, makeLink(`Overpass turbo`, 'https://wiki.openstreetmap.org/wiki/Overpass_turbo'), `, web UI for Overpass API. `, `Useful to inspect historic data at the time a particular note comment was made.`)];
    }
    getTool(callbacks, map) {
        const $overpassButtons = [];
        const buttonClickListener = (withRelations, onlyAround) => {
            const e = makeEscapeTag(encodeURIComponent);
            let query = this.getOverpassQueryPreamble(map);
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
            const url = e `https://overpass-turbo.eu/?C=${location}&Q=${query}`;
            open(url, 'overpass-turbo');
        };
        {
            const $button = document.createElement('button');
            $button.append(`Load `, makeMapIcon('area'), ` without relations`);
            $button.onclick = () => buttonClickListener(false, false);
            $overpassButtons.push($button);
        }
        {
            const $button = document.createElement('button');
            $button.append(`Load `, makeMapIcon('area'), ` with relations`);
            $button.title = `May fetch large unwanted relations like routes.`;
            $button.onclick = () => buttonClickListener(true, false);
            $overpassButtons.push($button);
        }
        {
            const $button = document.createElement('button');
            $button.append(`Load around `, makeMapIcon('center'));
            $button.onclick = () => buttonClickListener(false, true);
            $overpassButtons.push($button);
        }
        const result = [];
        for (const $button of $overpassButtons) {
            result.push(` `, $button);
        }
        return result;
    }
}
class OverpassDirectTool extends OverpassTool {
    constructor() {
        super('overpass', `Overpass`);
    }
    getInfo() {
        return [p$3(`Query `, makeLink(`Overpass API`, 'https://wiki.openstreetmap.org/wiki/Overpass_API'), ` without going through Overpass turbo. `, `Shows results on the map. Also gives link to the element page on the OSM website.`)];
    }
    getTool(callbacks, map) {
        const $button = document.createElement('button');
        $button.append(`Find closest node to `, makeMapIcon('center'));
        const $output = document.createElement('code');
        $output.textContent = `none`;
        $button.onclick = async () => {
            $button.disabled = true;
            $output.textContent = `none`;
            try {
                const radius = 10;
                let query = this.getOverpassQueryPreamble(map);
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
                const $a = makeLink(`link`, url);
                $output.replaceChildren($a);
                const that = this;
                downloadAndShowElement($a, map, (readableDate) => makeDateOutput(readableDate, function () {
                    that.timestamp = this.dateTime;
                    callbacks.onTimestampChange(that, this.dateTime);
                }), 'node', closestNodeId);
            }
            finally {
                $button.disabled = false;
            }
        };
        return [$button, ` → `, $output];
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

const p$2 = (...ss) => makeElement('p')()(...ss);
const em$1 = (s) => makeElement('em')()(s);
class RcTool extends Tool {
    constructor() {
        super('rc', `RC`, `JOSM (or another editor) Remote Control`);
        this.selectedNotes = [];
    }
    getInfo() {
        return [p$2(`Load note/map data to an editor with `, makeLink(`remote control`, 'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl'), `.`)];
    }
    getTool(callbacks, map) {
        const e = makeEscapeTag(encodeURIComponent);
        const $loadNotesButton = this.makeRequiringSelectedNotesButton();
        $loadNotesButton.append(`Load `, makeNotesIcon('selected'));
        $loadNotesButton.onclick = async () => {
            for (const { id } of this.selectedNotes) {
                const noteUrl = e `https://www.openstreetmap.org/note/${id}`;
                const rcUrl = e `http://127.0.0.1:8111/import?url=${noteUrl}`;
                const success = await openRcUrl($loadNotesButton, rcUrl);
                if (!success)
                    break;
            }
        };
        const $loadMapButton = document.createElement('button');
        $loadMapButton.append(`Load `, makeMapIcon('area'));
        $loadMapButton.onclick = () => {
            const bounds = map.bounds;
            const rcUrl = e `http://127.0.0.1:8111/load_and_zoom` +
                `?left=${bounds.getWest()}&right=${bounds.getEast()}` +
                `&top=${bounds.getNorth()}&bottom=${bounds.getSouth()}`;
            openRcUrl($loadMapButton, rcUrl);
        };
        return [$loadNotesButton, ` `, $loadMapButton];
    }
    onSelectedNotesChangeWithoutHandlingButtons(selectedNotes, selectedNoteUsers) {
        this.selectedNotes = selectedNotes;
        return true;
    }
}
class IdTool extends Tool {
    constructor() {
        super('id', `iD`);
    }
    getInfo() {
        return [p$2(`Follow your notes by zooming from one place to another in one `, makeLink(`iD editor`, 'https://wiki.openstreetmap.org/wiki/ID'), ` window. `, `It could be faster to do first here in note-viewer than in iD directly because note-viewer won't try to download more data during panning. `, `After zooming in note-viewer, click the `, em$1(`Open`), ` button to open this location in iD. `, `When you go back to note-viewer, zoom to another place and click the `, em$1(`Open`), ` button for the second time, the already opened iD instance zooms to that place. `, `Your edits are not lost between such zooms.`), p$2(`Technical details: this is an attempt to make something like `, em$1(`remote control`), ` in iD editor. `, `Convincing iD to load notes has proven to be tricky. `, `Your best chance of seeing the selected notes is importing them as a `, em$1(`gpx`), ` file. `, `See `, makeLink(`this diary post`, `https://www.openstreetmap.org/user/Anton%20Khorev/diary/398991`), ` for further explanations.`), p$2(`Zooming/panning is easier to do, and that's what is currently implemented. `, `It's not without quirks however. You'll notice that the iD window opened from here doesn't have the OSM website header. `, `This is because the editor is opened at `, makeLink(`/id`, `https://www.openstreetmap.org/id`), ` url instead of `, makeLink(`/edit`, `https://www.openstreetmap.org/edit`), `. `, `It has to be done because otherwise iD won't listen to `, em$1(`#map`), ` changes in the webpage location.`)];
    }
    getTool(callbacks, map) {
        // limited to what hashchange() lets you do here https://github.com/openstreetmap/iD/blob/develop/modules/behavior/hash.js
        // which is zooming/panning
        const $zoomButton = document.createElement('button');
        $zoomButton.append(`Open `, makeMapIcon('center'));
        $zoomButton.onclick = () => {
            const e = makeEscapeTag(encodeURIComponent);
            const url = e `https://www.openstreetmap.org/id#map=${map.zoom}/${map.lat}/${map.lon}`;
            open(url, 'id');
        };
        return [$zoomButton];
    }
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

const p$1 = (...ss) => makeElement('p')()(...ss);
const em = (s) => makeElement('em')()(s);
const dfn = (s) => makeElement('dfn')()(s);
const code = (s) => makeElement('code')()(s);
const ul = (...ss) => makeElement('ul')()(...ss);
const li = (...ss) => makeElement('li')()(...ss);
class ExportTool extends Tool {
    constructor() {
        super(...arguments);
        this.selectedNotes = [];
        this.selectedNoteUsers = new Map();
    }
    onSelectedNotesChangeWithoutHandlingButtons(selectedNotes, selectedNoteUsers) {
        this.selectedNotes = selectedNotes;
        this.selectedNoteUsers = selectedNoteUsers;
        return true;
    }
    getInfo() {
        return [
            ...this.getInfoWithoutDragAndDrop(),
            p$1(`Instead of clicking the `, em(`Export`), ` button, you can drag it and drop into a place that accepts data sent by `, makeLink(`Drag and Drop API`, `https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API`), `. `, `Not many places actually do, and those who do often can handle only plaintext. `, `That's why there's a type selector, with which plaintext format can be forced on transmitted data.`)
        ];
    }
    getTool() {
        const $optionSelects = Object.fromEntries(Object.entries(this.describeOptions()).map(([key, valuesWithTexts]) => {
            const $select = document.createElement('select');
            $select.append(...valuesWithTexts.map(([value, text]) => new Option(text, value)));
            return [key, $select];
        }));
        const $dataTypeSelect = document.createElement('select');
        $dataTypeSelect.append(...this.listDataTypes().map(type => new Option(type)));
        const $exportNotesButton = this.makeRequiringSelectedNotesButton();
        $exportNotesButton.append(`Export `, makeNotesIcon('selected'));
        $exportNotesButton.onclick = () => {
            const data = this.generateData(getOptionValues());
            const filename = this.generateFilename();
            const file = new File([data], filename);
            const $a = document.createElement('a');
            $a.href = URL.createObjectURL(file);
            $a.download = filename;
            $a.click();
            URL.revokeObjectURL($a.href);
        };
        $exportNotesButton.draggable = true;
        $exportNotesButton.ondragstart = (ev) => {
            const data = this.generateData(getOptionValues());
            if (!ev.dataTransfer)
                return;
            ev.dataTransfer.setData($dataTypeSelect.value, data);
        };
        return [
            $exportNotesButton, ` `,
            ...this.writeOptions($optionSelects), `, `,
            makeLabel('inline')(`set `, $dataTypeSelect, ` type in drag and drop events`)
        ];
        function getOptionValues() {
            return Object.fromEntries(Object.entries($optionSelects).map(([key, $select]) => [key, $select.value]));
        }
    }
    getCommentStrings(comments, all) {
        const ts = [];
        for (const comment of comments) {
            let t = '';
            if (comment.uid) {
                const username = this.selectedNoteUsers.get(comment.uid);
                if (username != null) {
                    t += `${username}`;
                }
                else {
                    t += `user #${comment.uid}`;
                }
            }
            else {
                t += `anonymous user`;
            }
            if (all)
                t += ` ${comment.action}`;
            t += ` at ${toReadableDate(comment.date)}`;
            if (comment.text)
                t += `: ${comment.text}`;
            ts.push(t);
            if (!all)
                break;
        }
        return ts;
    }
}
class GpxTool extends ExportTool {
    constructor() {
        super('gpx', `GPX`);
    }
    getInfoWithoutDragAndDrop() {
        return [p$1(`Export selected notes in `, makeLink(`GPX`, 'https://wiki.openstreetmap.org/wiki/GPX'), ` (GPS exchange) format. `, `During the export, each selected note is treated as a waypoint with its name set to note id, description set to comments and link pointing to note's page on the OSM website. `, `This allows OSM notes to be used in applications that can't show them directly. `, `Also it allows a particular selection of notes to be shown if an application can't filter them. `, `One example of such app is `, makeLink(`iD editor`, 'https://wiki.openstreetmap.org/wiki/ID'), `. `, `Unfortunately iD doesn't fully understand the gpx format and can't show links associated with waypoints. `, `You'll have to enable the notes layer in iD and compare its note marker with waypoint markers from the gpx file.`), p$1(`By default only the `, dfn(`first comment`), ` is added to waypoint descriptions. `, `This is because some apps such as iD and especially `, makeLink(`JOSM`, `https://wiki.openstreetmap.org/wiki/JOSM`), ` try to render the entire description in one line next to the waypoint marker, cluttering the map.`), p$1(`It's possible to pretend that note waypoints are connected by a `, makeLink(`route`, `https://www.topografix.com/GPX/1/1/#type_rteType`), ` by using the `, dfn(`connected by route`), ` option. `, `This may help to go from a note to the next one in an app by visually following the route line. `, `There's also the `, dfn(`connected by track`), ` option in case the app makes it easier to work with `, makeLink(`tracks`, `https://www.topografix.com/GPX/1/1/#type_trkType`), ` than with the routes.`)];
    }
    describeOptions() {
        return {
            connect: [
                ['no', `without connections`],
                ['rte', `connected by route`],
                ['trk', `connected by track`],
            ],
            commentQuantity: [
                ['first', `first comment`],
                ['all', `all comments`],
            ]
        };
    }
    writeOptions($selects) {
        return [
            makeLabel('inline')(`as waypoints `, $selects.connect), ` `,
            makeLabel('inline')(`with `, $selects.commentQuantity, ` in descriptions`),
        ];
    }
    listDataTypes() {
        return ['text/xml', 'application/gpx+xml', 'text/plain'];
    }
    generateFilename() {
        return 'notes.gpx';
    }
    generateData(options) {
        const e = makeEscapeTag(escapeXml);
        const getPoints = (pointTag, getDetails = () => '') => {
            let gpx = '';
            for (const note of this.selectedNotes) {
                const firstComment = note.comments[0];
                gpx += e `<${pointTag} lat="${note.lat}" lon="${note.lon}">\n`;
                if (firstComment)
                    gpx += e `<time>${toUrlDate(firstComment.date)}</time>\n`;
                gpx += getDetails(note);
                gpx += e `</${pointTag}>\n`;
            }
            return gpx;
        };
        let gpx = e `<?xml version="1.0" encoding="UTF-8" ?>\n`;
        gpx += e `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">\n`;
        // TODO <name>selected notes of user A</name>
        gpx += getPoints('wpt', note => {
            let gpx = '';
            gpx += e `<name>${note.id}</name>\n`;
            if (note.comments.length > 0) {
                gpx += `<desc>`;
                gpx += this.getCommentStrings(note.comments, options.commentQuantity == 'all').map(escapeXml).join(`&#xA;\n`); // JOSM wants this kind of double newline, otherwise no space between comments is rendered
                gpx += `</desc>\n`;
            }
            const noteUrl = `https://www.openstreetmap.org/note/` + encodeURIComponent(note.id);
            gpx += e `<link href="${noteUrl}">\n`;
            gpx += e `<text>note #${note.id} on osm</text>\n`;
            gpx += e `</link>\n`;
            gpx += e `<type>${note.status}</type>\n`;
            return gpx;
        });
        if (options.connect == 'rte') {
            gpx += `<rte>\n`;
            gpx += getPoints('rtept');
            gpx += `</rte>\n`;
        }
        if (options.connect == 'trk') {
            gpx += `<trk><trkseg>\n`;
            gpx += getPoints('trkpt');
            gpx += `</trkseg></trk>\n`;
        }
        gpx += `</gpx>\n`;
        return gpx;
    }
}
class GeoJsonTool extends ExportTool {
    constructor() {
        super('geojson', `GeoJSON`);
    }
    getInfoWithoutDragAndDrop() {
        return [p$1(`Export selected notes in `, makeLink(`GeoJSON`, 'https://wiki.openstreetmap.org/wiki/GeoJSON'), ` format. `, `The exact features and properties exported are made to be close to OSM API `, code(`.json`), ` output:`), ul(li(`the entire note collection is represented as a `, makeLink(`FeatureCollection`, 'https://www.rfc-editor.org/rfc/rfc7946.html#section-3.3')), li(`each note is represented as a `, makeLink(`Point`, 'https://www.rfc-editor.org/rfc/rfc7946.html#section-3.1.2'), ` `, makeLink(`Feature`, 'https://www.rfc-editor.org/rfc/rfc7946.html#section-3.2'))), p$1(`There are few differences to OSM API output, not including modifications using tool options described later:`), ul(li(`comments don't have `, code(`html`), ` property, their content is available only as plaintext`), li(`dates may be incorrect in case of hidden note comments (something that happens very rarely)`)), p$1(`Like GPX exports, this tool allows OSM notes to be used in applications that can't show them directly. `, `Also it allows a particular selection of notes to be shown if an application can't filter them. `, `One example of such app is `, makeLink(`iD editor`, 'https://wiki.openstreetmap.org/wiki/ID'), `. `, `Given that GeoJSON specification doesn't define what goes into feature properties, the support for rendering notes this way is lower than the one of GPX export. `, `Particularly neither iD nor JOSM seem to render any labels for note markers. `, `Also clicking the marker in JOSM is not going to open the note webpage. `, `On the other hand there's more clarity about how to to display properties outside of the editor map view. `, `All of the properties are displayed like `, makeLink(`OSM tags`, 'https://wiki.openstreetmap.org/wiki/Tags'), `, which opens some possibilities: `), ul(li(`properties are editable in JOSM with a possibility to save results to a file`), li(`it's possible to access the note URL in iD, something that was impossible with GPX format`)), p$1(`While accessing the URLs, note that they are OSM API URLs, not the website URLs you might expect. `, `This is how OSM API outputs them. `, `Since that might be inconvenient, there's an `, dfn(`OSM website URLs`), ` option. `, `With it you're able to select the note url in iD by triple-clicking its value.`), p$1(`Another consequence of displaying properties like tags is that they work best when they are strings. `, `OSM tags are strings, and that's what editors expect to display in their tag views. `, `When used for properties of notes, there's one non-string property: `, em(`comments`), `. `, `iD is unable to display it. `, `If you want to force comments to be represented by strings, like in GPX exports, there's an options for that. `, `There's also option to output each comment as a separate property, making it easier to see them all in the tags table.`), p$1(`It's possible to pretend that note points are connected by a `, makeLink(`LineString`, `https://www.rfc-editor.org/rfc/rfc7946.html#section-3.1.4`), ` by using the `, dfn(`connected by line`), ` option. `, `This may help to go from a note to the next one in an app by visually following the route line. `, `However, enabling the line makes it difficult to click on note points in iD.`)];
    }
    describeOptions() {
        return {
            connect: [
                ['no', `without connections`],
                ['line', `connected by line`],
            ],
            urls: [
                ['api', `OSM API`],
                ['web', `OSM website`],
            ],
            commentQuantity: [
                ['all', `all comments`],
                ['first', `first comment`],
            ],
            commentType: [
                ['array', `array property`],
                ['string', `string property`],
                ['strings', `separate string properties`],
            ],
        };
    }
    writeOptions($selects) {
        return [
            makeLabel('inline')(`as points `, $selects.connect), ` `,
            makeLabel('inline')(`with `, $selects.urls, ` URLs in properties`), ` and `,
            makeLabel('inline')($selects.commentQuantity, ` of each note `),
            makeLabel('inline')(`written as `, $selects.commentType),
        ];
    }
    listDataTypes() {
        return ['application/json', 'application/geo+json', 'text/plain'];
    }
    generateFilename() {
        return 'notes.geojson'; // JOSM doesn't like .json
    }
    generateData(options) {
        // https://github.com/openstreetmap/openstreetmap-website/blob/master/app/views/api/notes/_note.json.jbuilder
        const self = this;
        const e = makeEscapeTag(encodeURIComponent);
        const features = this.selectedNotes.map(note => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [note.lon, note.lat]
            },
            properties: {
                id: note.id,
                ...generateNoteUrls(note),
                ...generateNoteDates(note),
                status: note.status,
                ...generateNoteComments(note.comments),
            }
        }));
        if (options.connect == 'line' && this.selectedNotes.length > 1) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: this.selectedNotes.map(note => [note.lon, note.lat]),
                },
                properties: null
            });
        }
        const featureCollection = {
            type: 'FeatureCollection',
            features
        };
        return JSON.stringify(featureCollection, undefined, 2);
        function generateNoteUrls(note) {
            if (options.urls == 'web')
                return {
                    url: e `https://www.openstreetmap.org/note/${note.id}`
                };
            const urlBase = e `https://api.openstreetmap.org/api/0.6/notes/${note.id}`;
            const result = {
                url: urlBase + `.json`
            };
            if (note.status == 'closed') {
                result.reopen_url = urlBase + `/reopen.json`;
            }
            else {
                result.comment_url = urlBase + `/comment.json`;
                result.close_url = urlBase + `/close.json`;
            }
            return result;
        }
        function generateNoteDates(note) {
            const result = {};
            if (note.comments.length > 0) {
                result.date_created = formatDate(note.comments[0].date);
                if (note.status == 'closed') {
                    const closeComment = lastCloseComment(note);
                    if (closeComment) {
                        result.closed_at = formatDate(closeComment.date);
                    }
                }
            }
            return result;
        }
        function generateNoteComments(comments) {
            if (comments.length == 0)
                return {};
            if (options.commentType == 'strings') {
                return Object.fromEntries(self.getCommentStrings(comments, options.commentQuantity == 'all').map((v, i) => ['comment' + (i > 0 ? i + 1 : ''), v.replace(/\n/g, '\n ')]));
            }
            else if (options.commentType == 'string') {
                return {
                    comments: self.getCommentStrings(comments, options.commentQuantity == 'all').join(`; `).replace(/\n/g, '\n ')
                };
            }
            else {
                const toPropObject = (comment) => ({
                    date: formatDate(comment.date),
                    ...generateCommentUserProperties(comment),
                    action: comment.action,
                    text: comment.text
                });
                if (options.commentQuantity == 'all') {
                    return {
                        comments: comments.map(toPropObject)
                    };
                }
                else {
                    return {
                        comments: [toPropObject(comments[0])]
                    };
                }
            }
        }
        function generateCommentUserProperties(comment) {
            const result = {};
            if (comment.uid == null)
                return result;
            result.uid = comment.uid;
            const username = self.selectedNoteUsers.get(comment.uid);
            if (username == null)
                return result;
            result.user = username;
            if (options.urls == 'web') {
                result.user_url = e `https://www.openstreetmap.org/user/${username}`;
            }
            else {
                result.user_url = e `https://api.openstreetmap.org/user/${username}`;
            }
            return result;
        }
        function lastCloseComment(note) {
            for (let i = note.comments.length - 1; i >= 0; i--) {
                if (note.comments[i].action == 'closed')
                    return note.comments[i];
            }
        }
        function formatDate(date) {
            return toReadableDate(date) + ' UTC';
        }
    }
}

const p = (...ss) => makeElement('p')()(...ss);
class StreetViewTool extends Tool {
    getTool(callbacks, map) {
        const $viewButton = document.createElement('button');
        $viewButton.append(`Open `, makeMapIcon('center'));
        $viewButton.onclick = () => {
            open(this.generateUrl(map), this.id);
        };
        return [$viewButton];
    }
}
class YandexPanoramasTool extends StreetViewTool {
    constructor() {
        super('yandex-panoramas', `Y.Panoramas`, `Yandex.Panoramas (Яндекс.Панорамы)`);
    }
    getInfo() {
        return [p(`Open a map location in `, makeLink(`Yandex.Panoramas`, 'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B'), ` street view. `, `Could be useful to find out if an object mentioned in a note existed at a certain point of time. `, `Yandex.Panoramas have a year selector in the upper right corner. Use it to get a photo made close to the date of interest.`)];
    }
    generateUrl(map) {
        const e = makeEscapeTag(encodeURIComponent);
        const coords = map.lon + ',' + map.lat;
        return e `https://yandex.ru/maps/?ll=${coords}&panorama%5Bpoint%5D=${coords}&z=${map.zoom}`; // 'll' is required if 'z' argument is present
    }
}
class MapillaryTool extends StreetViewTool {
    constructor() {
        super('mapillary', `Mapillary`);
    }
    getInfo() {
        return [p(`Open a map location in `, makeLink(`Mapillary`, 'https://wiki.openstreetmap.org/wiki/Mapillary'), `. `, `Not yet fully implemented. The idea is to jump straight to the best available photo, but in order to do that, Mapillary API has to be queried for available photos. That's impossible to do without an API key.`)];
    }
    generateUrl(map) {
        const e = makeEscapeTag(encodeURIComponent);
        return e `https://www.mapillary.com/app/?lat=${map.lat}&lng=${map.lon}&z=${map.zoom}&focus=photo`;
    }
}

const toolMakerSequence = [
    () => new AutozoomTool, () => new TimestampTool, () => new ParseTool,
    () => new OverpassTurboTool, () => new OverpassDirectTool,
    () => new RcTool, () => new IdTool,
    () => new GpxTool, () => new GeoJsonTool,
    () => new YandexPanoramasTool, () => new MapillaryTool,
    () => new CountTool, () => new LegendTool, () => new SettingsTool
];

var _ToolPanel_fitMode;
class ToolBroadcaster {
    constructor(tools) {
        this.tools = tools;
        this.sources = new Set();
    }
    broadcastTimestampChange(fromTool, timestamp) {
        this.broadcast(fromTool, tool => tool.onTimestampChange(timestamp));
    }
    broadcastNoteCountsChange(fromTool, nFetched, nVisible) {
        this.broadcast(fromTool, tool => tool.onNoteCountsChange(nFetched, nVisible));
    }
    broadcastSelectedNotesChange(fromTool, selectedNotes, selectedNoteUsers) {
        this.broadcast(fromTool, tool => tool.onSelectedNotesChange(selectedNotes, selectedNoteUsers));
    }
    broadcast(fromTool, sendMessageToTool) {
        if (fromTool) {
            if (this.sources.has(fromTool))
                return;
            this.sources.add(fromTool);
        }
        for (const [tool, $tool] of this.tools) {
            if (this.sources.has(tool))
                continue;
            const reacted = sendMessageToTool(tool);
            if (reacted)
                startOrResetFadeAnimation($tool, 'tool-ping-fade', 'ping');
        }
        if (fromTool) {
            this.sources.delete(fromTool);
        }
    }
}
class ToolPanel {
    constructor($container, map, figureDialog, storage) {
        _ToolPanel_fitMode.set(this, void 0);
        const tools = [];
        const toolCallbacks = {
            onFitModeChange: (fromTool, fitMode) => __classPrivateFieldSet(this, _ToolPanel_fitMode, fitMode, "f"),
            onTimestampChange: (fromTool, timestamp) => {
                this.toolBroadcaster.broadcastTimestampChange(fromTool, timestamp);
            },
            onToolOpenToggle: (fromTool, setToOpen) => {
                for (const [, $tool] of tools)
                    $tool.open = setToOpen;
            }
        };
        for (const makeTool of toolMakerSequence) {
            const tool = makeTool();
            const storageKey = 'commands-' + tool.id;
            const $toolDetails = document.createElement('details');
            $toolDetails.classList.add('tool');
            $toolDetails.open = !!storage.getItem(storageKey);
            const $toolSummary = document.createElement('summary');
            $toolSummary.textContent = tool.name;
            if (tool.title)
                $toolSummary.title = tool.title;
            $toolDetails.addEventListener('toggle', () => {
                if ($toolDetails.open) {
                    storage.setItem(storageKey, '1');
                }
                else {
                    storage.removeItem(storageKey);
                }
            });
            $toolDetails.append($toolSummary, ...tool.getTool(toolCallbacks, map, figureDialog));
            $toolDetails.addEventListener('animationend', toolAnimationEndListener);
            const infoElements = tool.getInfo();
            if (infoElements) {
                const $infoDetails = document.createElement('details');
                $infoDetails.classList.add('info');
                const $infoSummary = document.createElement('summary');
                $infoSummary.textContent = `${tool.name} info`;
                $infoDetails.append($infoSummary, ...infoElements);
                const $infoButton = document.createElement('button');
                $infoButton.classList.add('info');
                $infoButton.innerHTML = `<svg><title>Tool info</title><use href="#tools-info" /></svg>`;
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
            tools.push([tool, $toolDetails]);
        }
        this.toolBroadcaster = new ToolBroadcaster(tools);
    }
    receiveNoteCounts(nFetched, nVisible) {
        this.toolBroadcaster.broadcastNoteCountsChange(null, nFetched, nVisible);
    }
    receiveSelectedNotes(selectedNotes, selectedNoteUsers) {
        this.toolBroadcaster.broadcastSelectedNotesChange(null, selectedNotes, selectedNoteUsers);
    }
    receiveTimestamp(timestamp) {
        this.toolBroadcaster.broadcastTimestampChange(null, timestamp);
    }
    get fitMode() {
        return __classPrivateFieldGet(this, _ToolPanel_fitMode, "f");
    }
}
_ToolPanel_fitMode = new WeakMap();
function toolAnimationEndListener() {
    this.classList.remove('ping');
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
    constructor(storage, db, $container, $notesContainer, $moreContainer, $toolContainer, filterPanel, extrasPanel, map, figureDialog, restoreScrollPosition) {
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
            $toolContainer.innerHTML = ``;
        }
        function runStartFetcher(query, clearStore) {
            figureDialog.close();
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
            const toolPanel = new ToolPanel($toolContainer, map, figureDialog, storage);
            noteTable = new NoteTable($notesContainer, toolPanel, map, filterPanel.noteFilter, figureDialog, $showImagesCheckboxes[0]?.checked);
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
            this.$bboxInput.required = true; // otherwise could submit empty bbox without entering anything
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
    const $toolContainer = makeDiv('panel', 'command')();
    const $mapContainer = makeDiv('map')();
    const $figureDialog = document.createElement('dialog');
    $figureDialog.classList.add('figure');
    const $scrollingPart = makeDiv('scrolling')($fetchContainer, $filterContainer, $extrasContainer, $notesContainer, $moreContainer);
    const $stickyPart = makeDiv('sticky')($toolContainer);
    const $textSide = makeDiv('text-side')($scrollingPart, $stickyPart);
    const $graphicSide = makeDiv('graphic-side')($mapContainer, $figureDialog);
    const flipped = !!storage.getItem('flipped');
    if (flipped)
        document.body.classList.add('flipped');
    document.body.append($textSide, $graphicSide);
    const scrollRestorer = new ScrollRestorer($scrollingPart);
    const map = new NoteMap($mapContainer);
    const figureDialog = new FigureDialog($figureDialog);
    writeFlipLayoutButton(storage, $fetchContainer, map);
    writeResetButton($fetchContainer);
    const extrasPanel = new ExtrasPanel(storage, db, $extrasContainer);
    const filterPanel = new NoteFilterPanel($filterContainer);
    new NoteFetchPanel(storage, db, $fetchContainer, $notesContainer, $moreContainer, $toolContainer, filterPanel, extrasPanel, map, figureDialog, () => scrollRestorer.run($notesContainer));
    scrollRestorer.run($notesContainer);
}
function writeFlipLayoutButton(storage, $container, map) {
    const $button = document.createElement('button');
    $button.classList.add('global', 'flip');
    $button.innerHTML = `<svg><title>Flip layout</title><use href="#flip" /></svg>`;
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
    $button.classList.add('global', 'reset');
    $button.innerHTML = `<svg><title>Reset query</title><use href="#reset" /></svg>`;
    $button.addEventListener('click', () => {
        location.href = location.pathname + location.search;
    });
    $container.append($button);
}
