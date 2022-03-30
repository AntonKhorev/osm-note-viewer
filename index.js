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
        const timestamp = Date.now();
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
class NoteMap extends L.Map {
    constructor($container) {
        super($container);
        this.needToFitNotes = false;
        this.addLayer(L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>",
            maxZoom: 19
        })).fitWorld();
        this.noteLayer = L.featureGroup().addTo(this);
        this.filteredNoteLayer = L.featureGroup();
        this.trackLayer = L.featureGroup().addTo(this);
        const crosshairLayer = new CrosshairLayer().addTo(this);
        const layersControl = L.control.layers();
        layersControl.addOverlay(this.noteLayer, `Notes`);
        layersControl.addOverlay(this.filteredNoteLayer, `Filtered notes`);
        layersControl.addOverlay(this.trackLayer, `Track between notes`);
        layersControl.addOverlay(crosshairLayer, `Crosshair`);
        layersControl.addTo(this);
    }
    clearNotes() {
        this.noteLayer.clearLayers();
        this.filteredNoteLayer.clearLayers();
        this.trackLayer.clearLayers();
        this.needToFitNotes = true;
    }
    fitNotesIfNeeded() {
        if (!this.needToFitNotes)
            return;
        const bounds = this.noteLayer.getBounds();
        if (!bounds.isValid())
            return;
        this.fitBounds(bounds);
        this.needToFitNotes = false;
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
        this.fitBounds(this.trackLayer.getBounds());
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

function makeUserLink(user, text) {
    const fromId = (id) => `https://api.openstreetmap.org/api/0.6/user/${encodeURIComponent(id)}`;
    const fromName = (name) => `https://www.openstreetmap.org/user/${encodeURIComponent(name)}`;
    if (typeof user == 'string') {
        return makeLink(text ?? user, fromName(user));
    }
    else if (user.userType == 'id') {
        return makeLink(text ?? '#' + user.uid, fromId(user.uid));
    }
    else {
        return makeLink(text ?? user.username, fromName(user.username));
    }
}
function makeLink(text, href, title) {
    const $link = document.createElement('a');
    $link.href = href;
    $link.textContent = text;
    if (title != null)
        $link.title = title;
    return $link;
}

class CommandPanel {
    constructor($container, map, storage) {
        this.checkedNoteIds = [];
        const centerChar = '⌖';
        const areaChar = '▭';
        {
            const $div = document.createElement('div');
            const $label = document.createElement('label');
            const $trackCheckbox = document.createElement('input');
            $trackCheckbox.type = 'checkbox';
            $trackCheckbox.addEventListener('change', () => {
                if ($trackCheckbox.checked)
                    map.fitNoteTrack();
            });
            $label.append($trackCheckbox, ` track visible notes on the map`);
            $div.append($label);
            $container.append($div);
            this.$trackCheckbox = $trackCheckbox;
        }
        {
            const $commandGroup = makeCommandGroup('timestamp', `Timestamp for historic queries`);
            const $commentTimeSelectLabel = document.createElement('label');
            const $commentTimeSelect = document.createElement('select');
            $commentTimeSelect.append(new Option('from comment text', 'text'), new Option('of comment', 'comment'));
            $commentTimeSelectLabel.append(`pick time `, $commentTimeSelect);
            $commentTimeSelectLabel.title = `"from comment text" looks for time inside the comment text. Useful for MAPS.ME-generated comments. Falls back to the comment time if no time detected in the text.`;
            this.$commentTimeSelect = $commentTimeSelect;
            const $commentTimeInputLabel = document.createElement('label');
            const $commentTimeInput = document.createElement('input');
            // $commentTimeInput.type='datetime-local'
            // $commentTimeInput.step='1'
            $commentTimeInput.type = 'text';
            $commentTimeInput.size = 20;
            // $commentTimeInput.readOnly=true
            $commentTimeInputLabel.append(`picked `, $commentTimeInput);
            $commentTimeInputLabel.title = `In whatever format Overpass understands. No standard datetime input for now because they're being difficult with UTC and 24-hour format.`;
            this.$commentTimeInput = $commentTimeInput;
            $commentTimeSelect.addEventListener('input', () => this.pickCommentTime());
            const $clearButton = document.createElement('button');
            $clearButton.textContent = 'Clear';
            $clearButton.addEventListener('click', () => {
                $commentTimeInput.value = '';
            });
            $commandGroup.append($commentTimeSelectLabel, ` — `, $commentTimeInputLabel, ` `, $clearButton);
        }
        {
            const $commandGroup = makeCommandGroup('overpass-turbo', `Overpass turbo`, 'https://wiki.openstreetmap.org/wiki/Overpass_turbo');
            const $overpassButtons = [];
            const buttonClickListener = (withRelations, onlyAround) => {
                const center = map.getCenter();
                let query = this.getOverpassQueryPreamble(map);
                if (withRelations) {
                    query += `nwr`;
                }
                else {
                    query += `nw`;
                }
                if (onlyAround) {
                    const radius = 10;
                    query += `(around:${radius},${center.lat},${center.lng})`;
                }
                query += `;\n`;
                query += `out meta geom;`;
                const location = `${center.lat};${center.lng};${map.getZoom()}`;
                const url = `https://overpass-turbo.eu/?C=${encodeURIComponent(location)}&Q=${encodeURIComponent(query)}`;
                open(url, 'overpass-turbo');
            };
            {
                const $button = document.createElement('button');
                $button.textContent = `Load ${areaChar} without relations`;
                $button.addEventListener('click', () => buttonClickListener(false, false));
                $overpassButtons.push($button);
            }
            {
                const $button = document.createElement('button');
                $button.textContent = `Load ${areaChar} with relations`;
                $button.title = `May fetch large unwanted relations like routes.`;
                $button.addEventListener('click', () => buttonClickListener(true, false));
                $overpassButtons.push($button);
            }
            {
                const $button = document.createElement('button');
                $button.textContent = `Load around ${centerChar}`;
                $button.addEventListener('click', () => buttonClickListener(false, true));
                $overpassButtons.push($button);
            }
            for (const $button of $overpassButtons) {
                $commandGroup.append(` `, $button);
            }
        }
        {
            const $commandGroup = makeCommandGroup('overpass', `Overpass`, 'https://wiki.openstreetmap.org/wiki/Overpass_API');
            const $button = document.createElement('button');
            $button.textContent = `Find closest node to ${centerChar}`;
            $button.addEventListener('click', async () => {
                $button.disabled = true;
                try {
                    const radius = 10;
                    const center = map.getCenter();
                    let query = this.getOverpassQueryPreamble(map);
                    query += `node(around:${radius},${center.lat},${center.lng});\n`;
                    query += `out skel;`;
                    const doc = await makeOverpassQuery($button, query);
                    if (!doc)
                        return;
                    const closestNodeId = getClosestNodeId(doc, center.lat, center.lng);
                    if (!closestNodeId) {
                        $button.classList.add('error');
                        $button.title = `Could not find nodes nearby`;
                        return;
                    }
                    const url = `https://www.openstreetmap.org/node/` + encodeURIComponent(closestNodeId);
                    open(url);
                }
                finally {
                    $button.disabled = false;
                }
            });
            $commandGroup.append($button);
        }
        {
            const $commandGroup = makeCommandGroup('rc', `RC`, 'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl', `JOSM (or another editor) Remote Control`);
            const $loadNotesButton = document.createElement('button');
            $loadNotesButton.disabled = true;
            $loadNotesButton.textContent = `Load selected notes`;
            $loadNotesButton.addEventListener('click', async () => {
                for (const noteId of this.checkedNoteIds) {
                    const noteUrl = `https://www.openstreetmap.org/note/` + encodeURIComponent(noteId);
                    const rcUrl = `http://127.0.0.1:8111/import?url=` + encodeURIComponent(noteUrl);
                    const success = await openRcUrl($loadNotesButton, rcUrl);
                    if (!success)
                        break;
                }
            });
            const $loadMapButton = document.createElement('button');
            $loadMapButton.textContent = `Load ${areaChar}`;
            $loadMapButton.addEventListener('click', () => {
                const bounds = map.getBounds();
                const rcUrl = `http://127.0.0.1:8111/load_and_zoom` +
                    `?left=` + encodeURIComponent(bounds.getWest()) +
                    `&right=` + encodeURIComponent(bounds.getEast()) +
                    `&top=` + encodeURIComponent(bounds.getNorth()) +
                    `&bottom=` + encodeURIComponent(bounds.getSouth());
                openRcUrl($loadMapButton, rcUrl);
            });
            $commandGroup.append($loadNotesButton, ` `, $loadMapButton);
            this.$loadNotesButton = $loadNotesButton;
        }
        {
            const $commandGroup = makeCommandGroup('yandex-panoramas', `Y.Panoramas`, 'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B', `Yandex.Panoramas (Яндекс.Панорамы)`);
            const $yandexPanoramasButton = document.createElement('button');
            $yandexPanoramasButton.textContent = `Open ${centerChar}`;
            $yandexPanoramasButton.addEventListener('click', () => {
                const center = map.getCenter();
                const coords = center.lng + ',' + center.lat;
                const url = `https://yandex.ru/maps/` +
                    `?ll=` + encodeURIComponent(coords) + // required if 'z' argument is present
                    `&panorama%5Bpoint%5D=` + encodeURIComponent(coords) +
                    `&z=` + encodeURIComponent(map.getZoom());
                open(url, 'yandex');
            });
            $commandGroup.append($yandexPanoramasButton);
        }
        {
            const $commandGroup = makeCommandGroup('mapillary', `Mapillary`, 'https://wiki.openstreetmap.org/wiki/Mapillary');
            const $mapillaryButton = document.createElement('button');
            $mapillaryButton.textContent = `Open ${centerChar}`;
            $mapillaryButton.addEventListener('click', () => {
                const center = map.getCenter();
                const url = `https://www.mapillary.com/app/` +
                    `?lat=` + encodeURIComponent(center.lat) +
                    `&lng=` + encodeURIComponent(center.lng) +
                    `&z=` + encodeURIComponent(map.getZoom()) +
                    `&focus=photo`;
                open(url, 'mapillary');
            });
            $commandGroup.append($mapillaryButton);
        }
        {
            const $commandGroup = makeCommandGroup('counts', `Note counts`);
            this.$fetchedNoteCount = document.createElement('span');
            this.$fetchedNoteCount.textContent = '0';
            this.$visibleNoteCount = document.createElement('span');
            this.$visibleNoteCount.textContent = '0';
            this.$checkedNoteCount = document.createElement('span');
            this.$checkedNoteCount.textContent = '0';
            $commandGroup.append(this.$fetchedNoteCount, ` fetched, `, this.$visibleNoteCount, ` visible, `, this.$checkedNoteCount, ` selected`);
        }
        {
            const $commandGroup = makeCommandGroup('legend', `Legend`);
            $commandGroup.append(`${centerChar} = map center, ${areaChar} = map area`);
        }
        function makeCommandGroup(name, title, linkHref, linkTitle) {
            const storageKey = 'commands-' + name;
            const $commandGroup = document.createElement('details');
            $commandGroup.open = !!storage.getItem(storageKey);
            const $summary = document.createElement('summary');
            if (linkHref == null) {
                $summary.textContent = title;
            }
            else {
                const $a = makeLink(title, linkHref, linkTitle);
                $a.target = '_blank';
                $summary.append($a);
            }
            $commandGroup.append($summary);
            $commandGroup.addEventListener('toggle', () => {
                if ($commandGroup.open) {
                    storage.setItem(storageKey, '1');
                }
                else {
                    storage.removeItem(storageKey);
                }
            });
            $container.append($commandGroup);
            return $commandGroup;
        }
    }
    receiveNoteCounts(nFetched, nVisible) {
        this.$fetchedNoteCount.textContent = String(nFetched);
        this.$visibleNoteCount.textContent = String(nVisible);
    }
    receiveCheckedNoteIds(checkedNoteIds) {
        this.$checkedNoteCount.textContent = String(checkedNoteIds.length);
        this.checkedNoteIds = checkedNoteIds;
        this.$loadNotesButton.disabled = checkedNoteIds.length <= 0;
    }
    receiveCheckedComment(checkedCommentTime, checkedCommentText) {
        this.checkedCommentTime = checkedCommentTime;
        this.checkedCommentText = checkedCommentText;
        this.pickCommentTime();
    }
    isTracking() {
        return this.$trackCheckbox.checked;
    }
    disableTracking() {
        this.$trackCheckbox.checked = false;
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
        const bounds = map.getBounds();
        let query = '';
        if (time)
            query += `[date:"${time}"]\n`;
        query += `[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}]\n`;
        // query+=`[bbox:${bounds.toBBoxString()}];\n` // nope, different format
        query += `;\n`;
        return query;
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

const defaultLowerDate = Date.parse('2001-01-01 00:00:00Z') / 1000;
function displayNameAndUserToUserQuery(display_name, user) {
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
function noteQueryToUserQuery(noteQuery) {
    return displayNameAndUserToUserQuery(noteQuery.display_name, noteQuery.user);
}
function makeNoteQueryFromUserQueryAndValues(userQuery, textValue, fromValue, toValue, closedValue, sortValue, orderValue) {
    const noteQuery = {
        closed: toNoteQueryClosed(closedValue),
        sort: toNoteQuerySort(sortValue),
        order: toNoteQueryOrder(orderValue)
    };
    {
        if (userQuery.userType == 'invalid')
            return undefined;
        if (userQuery.userType == 'name') {
            noteQuery.display_name = userQuery.username;
        }
        else if (userQuery.userType == 'id') {
            noteQuery.user = userQuery.uid;
        }
    }
    {
        const s = textValue.trim();
        if (s)
            noteQuery.q = s;
    }
    {
        const dateTimeQuery = toDateQuery(fromValue);
        if (dateTimeQuery.dateType == 'invalid')
            return undefined;
        if (dateTimeQuery.dateType == 'valid')
            noteQuery.from = dateTimeQuery.date;
    }
    {
        const dateTimeQuery = toDateQuery(toValue);
        if (dateTimeQuery.dateType == 'invalid')
            return undefined;
        if (dateTimeQuery.dateType == 'valid')
            noteQuery.to = dateTimeQuery.date;
    }
    return noteQuery;
    function toNoteQueryClosed(value) {
        const n = Number(value || undefined);
        if (Number.isInteger(n))
            return n;
        return -1;
    }
    function toNoteQuerySort(value) {
        if (value == 'updated_at')
            return value;
        return 'created_at';
    }
    function toNoteQueryOrder(value) {
        if (value == 'oldest')
            return value;
        return 'newest';
    }
}
function makeNoteQueryFromInputValues(userValue, textValue, fromValue, toValue, closedValue, sortValue, orderValue) {
    return makeNoteQueryFromUserQueryAndValues(toUserQuery(userValue), textValue, fromValue, toValue, closedValue, sortValue, orderValue);
}
function makeNoteQueryFromHash(queryString) {
    const paramString = (queryString[0] == '#')
        ? queryString.slice(1)
        : queryString;
    const searchParams = new URLSearchParams(paramString);
    if (searchParams.get('mode') != 'search')
        return undefined;
    const userQuery = displayNameAndUserToUserQuery(searchParams.get('display_name'), Number(searchParams.get('user') || undefined));
    return makeNoteQueryFromUserQueryAndValues(userQuery, searchParams.get('q') || '', searchParams.get('from') || '', searchParams.get('to') || '', searchParams.get('closed') || '', searchParams.get('sort') || '', searchParams.get('order') || '');
}
function toNoteQueryHash(query) {
    if (query) {
        return '#mode=search&' + toNoteQueryString(query);
    }
    else {
        return '';
    }
}
function toNoteQueryString(query) {
    const parameters = [];
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
        parameters: toNoteQueryString(updatedQuery) + '&limit=' + encodeURIComponent(limit),
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

class NoteTable {
    constructor($container, commandPanel, map, filter) {
        this.commandPanel = commandPanel;
        this.map = map;
        this.filter = filter;
        this.noteSectionLayerIdVisibility = new Map();
        const that = this;
        this.wrappedNoteMarkerClickListener = function () {
            that.noteMarkerClickListener(this);
        };
        this.wrappedNoteSectionMouseoverListener = function () {
            that.deactivateAllNotes();
            that.activateNote(this);
        };
        this.wrappedNoteSectionMouseoutListener = function () {
            that.deactivateNote(this);
        };
        this.wrappedNoteSectionClickListener = function () {
            that.focusMapOnNote(this);
        };
        this.wrappedNoteCheckboxClickListener = function (ev) {
            that.noteCheckboxClickListener(this, ev);
        };
        this.wrappedCommentRadioClickListener = function (ev) {
            that.commentRadioClickListener(this, ev);
        };
        this.noteRowObserver = makeNoteSectionObserver(commandPanel, map, this.noteSectionLayerIdVisibility);
        this.$table = document.createElement('table');
        $container.append(this.$table);
        {
            const $header = this.$table.createTHead();
            const $row = $header.insertRow();
            $row.append(makeHeaderCell(''), makeHeaderCell('id'), makeHeaderCell('date'), makeHeaderCell('user'), makeHeaderCell('?', `Action performed along with adding the comment. Also a radio button. Click to select comment for Overpass turbo commands.`), makeHeaderCell('comment'));
        }
        function makeHeaderCell(text, title) {
            const $cell = document.createElement('th');
            $cell.textContent = text;
            if (title)
                $cell.title = title;
            return $cell;
        }
        commandPanel.receiveCheckedNoteIds(getCheckedNoteIds(this.$table));
    }
    updateFilter(notes, users, filter) {
        let nFetched = 0;
        let nVisible = 0;
        this.filter = filter;
        const noteById = new Map();
        for (const note of notes) {
            noteById.set(note.id, note);
        }
        const uidMatcher = this.makeUidMatcher(users);
        for (const $noteSection of this.$table.querySelectorAll('tbody')) {
            const noteId = Number($noteSection.dataset.noteId);
            const note = noteById.get(noteId);
            const layerId = Number($noteSection.dataset.layerId);
            if (note == null)
                continue;
            nFetched++;
            if (this.filter.matchNote(note, uidMatcher)) {
                nVisible++;
                const marker = this.map.filteredNoteLayer.getLayer(layerId);
                if (marker) {
                    this.map.filteredNoteLayer.removeLayer(marker);
                    this.map.noteLayer.addLayer(marker);
                }
                $noteSection.classList.remove('hidden');
            }
            else {
                this.deactivateNote($noteSection);
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
        this.commandPanel.receiveCheckedNoteIds(getCheckedNoteIds(this.$table));
    }
    /**
     * @returns number of added notes that passed through the filter
     */
    addNotes(notes, users) {
        let nUnfilteredNotes = 0;
        const uidMatcher = this.makeUidMatcher(users);
        for (const note of notes) {
            const isVisible = this.filter.matchNote(note, uidMatcher);
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
                    const readableDate = toReadableDate(comment.date);
                    const [readableDateWithoutTime] = readableDate.split(' ', 1);
                    if (readableDate && readableDateWithoutTime) {
                        const $time = document.createElement('time');
                        $time.textContent = readableDateWithoutTime;
                        $time.dateTime = `${readableDate}Z`;
                        $time.title = `${readableDate} UTC`;
                        $cell.append($time);
                    }
                    else {
                        const $unknownDateTime = document.createElement('span');
                        $unknownDateTime.textContent = `?`;
                        $unknownDateTime.title = String(comment.date);
                        $cell.append($unknownDateTime);
                    }
                }
                {
                    const $cell = $row.insertCell();
                    $cell.classList.add('note-user');
                    if (comment.uid != null) {
                        const username = users[comment.uid];
                        if (username != null) {
                            $cell.append(makeUserLink(username));
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
                    $cell.textContent = comment.text;
                }
                iComment++;
            }
        }
        this.map.fitNotesIfNeeded();
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
        return nUnfilteredNotes;
    }
    makeUidMatcher(users) {
        return (uid, username) => users[uid] == username;
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
        $noteSection.addEventListener('mouseover', this.wrappedNoteSectionMouseoverListener);
        $noteSection.addEventListener('mouseout', this.wrappedNoteSectionMouseoutListener);
        $noteSection.addEventListener('click', this.wrappedNoteSectionClickListener);
        this.noteSectionLayerIdVisibility.set(layerId, false);
        this.noteRowObserver.observe($noteSection);
        return $noteSection;
    }
    noteMarkerClickListener(marker) {
        this.commandPanel.disableTracking();
        this.deactivateAllNotes();
        const $noteRows = document.getElementById(`note-` + marker.noteId);
        if (!$noteRows)
            return;
        $noteRows.scrollIntoView({ block: 'nearest' });
        this.activateNote($noteRows);
        this.focusMapOnNote($noteRows);
    }
    noteCheckboxClickListener($checkbox, ev) {
        ev.stopPropagation();
        const $clickedNoteSection = $checkbox.closest('tbody');
        if ($clickedNoteSection) {
            if (ev.shiftKey && this.$lastClickedNoteSection) {
                for (const $section of getTableSectionRange(this.$table, this.$lastClickedNoteSection, $clickedNoteSection)) {
                    const $checkbox = $section.querySelector('.note-checkbox input');
                    if ($checkbox instanceof HTMLInputElement)
                        $checkbox.checked = $checkbox.checked;
                }
            }
            this.$lastClickedNoteSection = $clickedNoteSection;
        }
        this.commandPanel.receiveCheckedNoteIds(getCheckedNoteIds(this.$table));
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
    deactivateAllNotes() {
        for (const $noteRows of this.$table.querySelectorAll('tbody.active')) {
            this.deactivateNote($noteRows);
        }
    }
    deactivateNote($noteSection) {
        this.currentLayerId = undefined;
        $noteSection.classList.remove('active');
        const layerId = Number($noteSection.dataset.layerId);
        const marker = this.map.noteLayer.getLayer(layerId);
        if (!(marker instanceof L.Marker))
            return;
        marker.setZIndexOffset(0);
        marker.setOpacity(0.5);
    }
    activateNote($noteSection) {
        const layerId = Number($noteSection.dataset.layerId);
        const marker = this.map.noteLayer.getLayer(layerId);
        if (!(marker instanceof L.Marker))
            return;
        marker.setOpacity(1);
        marker.setZIndexOffset(1000);
        $noteSection.classList.add('active');
    }
    focusMapOnNote($noteSection) {
        const layerId = Number($noteSection.dataset.layerId);
        const marker = this.map.noteLayer.getLayer(layerId);
        if (!(marker instanceof L.Marker))
            return;
        if (layerId == this.currentLayerId) {
            const z1 = this.map.getZoom();
            const z2 = this.map.getMaxZoom();
            const nextZoom = Math.min(z2, z1 + Math.ceil((z2 - z1) / 2));
            this.map.flyTo(marker.getLatLng(), nextZoom);
        }
        else {
            this.currentLayerId = layerId;
            this.map.panTo(marker.getLatLng());
        }
    }
}
function makeNoteSectionObserver(commandPanel, map, noteSectionLayerIdVisibility) {
    let noteSectionVisibilityTimeoutId;
    return new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!(entry.target instanceof HTMLElement))
                continue;
            const layerId = entry.target.dataset.layerId;
            if (layerId == null)
                continue;
            noteSectionLayerIdVisibility.set(Number(layerId), entry.isIntersecting);
        }
        clearTimeout(noteSectionVisibilityTimeoutId);
        noteSectionVisibilityTimeoutId = setTimeout(noteSectionVisibilityHandler);
    });
    function noteSectionVisibilityHandler() {
        const visibleLayerIds = [];
        for (const [layerId, visibility] of noteSectionLayerIdVisibility) {
            if (visibility)
                visibleLayerIds.push(layerId);
        }
        map.showNoteTrack(visibleLayerIds);
        if (commandPanel.isTracking())
            map.fitNoteTrack();
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
/**
 * range including $lastClickedSection but excluding $currentClickedSection
 * excludes $currentClickedSection if equals to $lastClickedSection
 */
function* getTableSectionRange($table, $lastClickedSection, $currentClickedSection) {
    const $sections = $table.tBodies;
    let i = 0;
    let $guardSection;
    for (; i < $sections.length; i++) {
        const $section = $sections[i];
        if ($section == $lastClickedSection) {
            $guardSection = $currentClickedSection;
            break;
        }
        if ($section == $currentClickedSection) {
            $guardSection = $lastClickedSection;
            break;
        }
    }
    if (!$guardSection)
        return;
    for (; i < $sections.length; i++) {
        const $section = $sections[i];
        if ($section != $currentClickedSection) {
            yield $section;
        }
        if ($section == $guardSection) {
            return;
        }
    }
}
function getCheckedNoteIds($table) {
    const checkedNoteIds = [];
    const $checkedBoxes = $table.querySelectorAll('.note-checkbox :checked');
    for (const $checkbox of $checkedBoxes) {
        const $noteSection = $checkbox.closest('tbody');
        if (!$noteSection)
            continue;
        const noteId = Number($noteSection.dataset.noteId);
        if (!Number.isInteger(noteId))
            continue;
        checkedNoteIds.push(noteId);
    }
    return checkedNoteIds;
}

const maxSingleAutoLoadLimit = 200;
const maxTotalAutoLoadLimit = 1000;
const maxFullyFilteredFetches = 10;
async function startFetcher(db, $notesContainer, $moreContainer, filterPanel, commandPanel, map, $limitSelect, $autoLoadCheckbox, $fetchButton, moreButtonIntersectionObservers, query, clearStore) {
    filterPanel.unsubscribe();
    let noteTable;
    const [notes, users, mergeNotesAndUsers] = makeNotesAndUsersAndMerger();
    const queryString = toNoteQueryString(query);
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
    filterPanel.subscribe(noteFilter => noteTable?.updateFilter(notes, users, noteFilter));
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
        if (!noteTable) {
            noteTable = new NoteTable($notesContainer, commandPanel, map, filterPanel.noteFilter);
        }
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

class NoteFetchPanel {
    constructor(storage, db, $container, $notesContainer, $moreContainer, $commandContainer, filterPanel, extrasPanel, map) {
        const $form = document.createElement('form');
        const $userInput = document.createElement('input');
        const $textInput = document.createElement('input');
        const $fromInput = document.createElement('input');
        const $toInput = document.createElement('input');
        const $statusSelect = document.createElement('select');
        const $sortSelect = document.createElement('select');
        const $orderSelect = document.createElement('select');
        const $limitSelect = document.createElement('select');
        const $autoLoadCheckbox = document.createElement('input');
        const $fetchButton = document.createElement('button');
        const moreButtonIntersectionObservers = [];
        window.addEventListener('hashchange', ev => {
            const query = makeNoteQueryFromHash(location.hash);
            modifyHistory(query, false); // in case location was edited manually
            populateInputs(query);
            runStartFetcher(query, false);
        });
        const query = makeNoteQueryFromHash(location.hash);
        modifyHistory(query, false);
        populateInputs(query);
        {
            const $fieldset = document.createElement('fieldset');
            {
                const $legend = document.createElement('legend');
                $legend.textContent = `Scope and order`;
                $fieldset.append($legend);
            }
            {
                $userInput.type = 'text';
                $userInput.name = 'user';
                const $div = document.createElement('div');
                $div.classList.add('major-input');
                const $label = document.createElement('label');
                $label.append(`OSM username, URL or #id: `, $userInput);
                $div.append($label);
                $fieldset.append($div);
            }
            {
                $textInput.type = 'text';
                $textInput.name = 'user';
                const $div = document.createElement('div');
                $div.classList.add('major-input');
                const $label = document.createElement('label');
                $label.append(`Comment text search query: `, $textInput);
                $div.append($label);
                $fieldset.append($div);
            }
            {
                $fromInput.type = 'text';
                $fromInput.size = 20;
                $fromInput.name = 'from';
                const $fromLabel = document.createElement('label');
                $fromLabel.append(`from `, $fromInput);
                $toInput.type = 'text';
                $toInput.size = 20;
                $toInput.name = 'to';
                const $toLabel = document.createElement('label');
                $toLabel.append(`to `, $toInput);
                const $div = document.createElement('div');
                $div.append(`Date range: `, $fromLabel, ` `, $toLabel);
                $fieldset.append($div);
            }
            {
                const $div = document.createElement('div');
                $statusSelect.append(new Option(`both open and closed`, '-1'), new Option(`open and recently closed`, '7'), new Option(`only open`, '0'));
                $sortSelect.append(new Option(`creation`, 'created_at'), new Option(`last update`, 'updated_at'));
                $orderSelect.append(new Option('newest'), new Option('oldest'));
                $div.append(span(`Fetch matching `, $statusSelect, ` notes`), ` `, span(`sorted by `, $sortSelect, ` date`), `, `, span($orderSelect, ` first`));
                $fieldset.append($div);
                function span(...items) {
                    const $span = document.createElement('span');
                    $span.append(...items);
                    return $span;
                }
            }
            $form.append($fieldset);
        }
        {
            const $fieldset = document.createElement('fieldset');
            // TODO (re)store input values
            {
                const $legend = document.createElement('legend');
                $legend.textContent = `Download mode (can change anytime)`;
                $fieldset.append($legend);
            }
            {
                const $div = document.createElement('div');
                $limitSelect.append(new Option('20'), new Option('100'), new Option('500'), new Option('2500'));
                $div.append(`Download these in batches of `, $limitSelect, ` notes`);
                $fieldset.append($div);
            }
            {
                $autoLoadCheckbox.type = 'checkbox';
                $autoLoadCheckbox.checked = true;
                const $div = document.createElement('div');
                const $label = document.createElement('label');
                $label.append($autoLoadCheckbox, ` Automatically load more notes when scrolled to the end of the table`);
                $div.append($label);
                $fieldset.append($div);
            }
            $form.append($fieldset);
        }
        {
            $fetchButton.textContent = `Fetch notes`;
            $fetchButton.type = 'submit';
            const $div = document.createElement('div');
            $div.classList.add('major-input');
            $div.append($fetchButton);
            $form.append($div);
        }
        $userInput.addEventListener('input', () => {
            const userQuery = toUserQuery($userInput.value);
            if (userQuery.userType == 'invalid') {
                $userInput.setCustomValidity(userQuery.message);
            }
            else {
                $userInput.setCustomValidity('');
            }
        });
        for (const $input of [$fromInput, $toInput])
            $input.addEventListener('input', () => {
                const query = toDateQuery($input.value);
                if (query.dateType == 'invalid') {
                    $input.setCustomValidity(query.message);
                }
                else {
                    $input.setCustomValidity('');
                }
            });
        $form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const query = makeNoteQueryFromInputValues($userInput.value, $textInput.value, $fromInput.value, $toInput.value, $statusSelect.value, $sortSelect.value, $orderSelect.value);
            if (!query)
                return;
            modifyHistory(query, true);
            runStartFetcher(query, true);
        });
        $container.append($form);
        runStartFetcher(query, false);
        function populateInputs(query) {
            if (query?.display_name) {
                $userInput.value = query.display_name;
            }
            else if (query?.user) {
                $userInput.value = '#' + query.user;
            }
            else {
                $userInput.value = '';
            }
            $textInput.value = query?.q ?? '';
            $fromInput.value = toReadableDate(query?.from);
            $toInput.value = toReadableDate(query?.to);
            $statusSelect.value = query ? String(query.closed) : '';
            $sortSelect.value = query?.sort ?? '';
            $orderSelect.value = query?.order ?? '';
        }
        function resetNoteDependents() {
            while (moreButtonIntersectionObservers.length > 0)
                moreButtonIntersectionObservers.pop()?.disconnect();
            map.clearNotes();
            $notesContainer.innerHTML = ``;
            $commandContainer.innerHTML = ``;
        }
        function runStartFetcher(query, clearStore) {
            resetNoteDependents();
            if (query) {
                extrasPanel.rewrite(query, Number($limitSelect.value));
            }
            else {
                extrasPanel.rewrite();
            }
            if (query) {
                const commandPanel = new CommandPanel($commandContainer, map, storage);
                startFetcher(db, $notesContainer, $moreContainer, filterPanel, commandPanel, map, $limitSelect, $autoLoadCheckbox, $fetchButton, moreButtonIntersectionObservers, query, clearStore);
            }
        }
    }
}
function modifyHistory(query, push) {
    const canonicalQueryHash = toNoteQueryHash(query);
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

class NoteFilter {
    constructor(query) {
        this.query = query;
        this.statements = [];
        lineLoop: for (const untrimmedLine of query.split('\n')) {
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
                let match;
                if (match = term.match(/^user\s*(!?=)\s*(.+)$/)) {
                    const [, operator, user] = match;
                    if (operator != '=' && operator != '!=')
                        continue; // impossible
                    const userQuery = toUserQuery(user);
                    if (userQuery.userType == 'invalid' || userQuery.userType == 'empty')
                        continue; // TODO parse error?
                    conditions.push({ type: 'user', operator, ...userQuery });
                    continue;
                }
                else if (match = term.match(/^action\s*(!?=)\s*(.+)$/)) {
                    const [, operator, action] = match;
                    if (operator != '=' && operator != '!=')
                        continue; // impossible
                    if (action != 'opened' && action != 'closed' && action != 'reopened' && action != 'commented' && action != 'hidden')
                        continue;
                    conditions.push({ type: 'action', operator, action });
                    continue;
                }
                // TODO parse error?
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
    matchNote(note, uidMatcher) {
        // console.log('> match',this.statements,note.comments)
        const isCommentValueEqualToConditionValue = (condition, comment) => {
            if (condition.type == 'user') {
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
                        if (!uidMatcher(comment.uid, condition.username))
                            return false;
                    }
                }
                return true;
            }
            else if (condition.type == 'action') {
                return comment.action == condition.action;
            }
            return false; // shouldn't happen
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
                    let ok = isCommentValueEqualToConditionValue(condition, comment);
                    if (condition.operator == '=') ;
                    else if (condition.operator == '!=') {
                        ok = !ok;
                    }
                    if (!ok)
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
	<li><dl><dt><kbd>user ${term('comparison operator')} ${term('user descriptor')}</kbd>
		<dd>comment (not) by a specified user
	</dl>
	<li><dl><dt><kbd>user ${term('comparison operator')} ${term('action descriptor')}</kbd>
		<dd>comment (not) performing a specified action
	</dl>
	</ul>
<dt>${term('comparison operator')}
<dd>One of: <kbd>=</kbd> <kbd>!=</kbd>
<dt>${term('user descriptor')}
<dd>OSM username, URL or #id, like in a fetch query input. Additionally you can specify username <kbd>0</kbd> or id <kbd>#0</kbd> to match anonymous users. No user with actual name "0" can exist because it's too short.
<dt>${term('action descriptor')}
<dd>One of: <kbd>opened</kbd> <kbd>closed</kbd> <kbd>reopened</kbd> <kbd>commented</kbd> <kbd>hidden</kbd>
</dl>`;
const syntaxExamples = [
    [`Notes commented by user A`, [`user = A`]],
    [`Notes commented by user A, later commented by user B`, [`user = A`, `*`, `user = B`]],
    [`Notes opened by user A`, [`^`, `user = A`]],
    [`Notes closed by user A that were opened by somebody else`, [`^`, `user != A`, `*`, `user = A, action = closed`]],
];
function term(t) {
    return `<em>&lt;${t}&gt;</em>`;
}
class NoteFilterPanel {
    constructor($container) {
        const $form = document.createElement('form');
        const $textarea = document.createElement('textarea');
        const $button = document.createElement('button');
        this.noteFilter = new NoteFilter($textarea.value);
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
        });
        $form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            this.noteFilter = new NoteFilter($textarea.value);
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
                $row.insertCell().append(makeLink(`[${++n}]`, '#mode=search&' + fetchEntry.queryString));
                const $userCell = $row.insertCell();
                const searchParams = new URLSearchParams(fetchEntry.queryString);
                const username = searchParams.get('display_name');
                if (username)
                    $userCell.append(makeUserLink(username));
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
            const userQuery = noteQueryToUserQuery(query);
            if (userQuery.userType == 'name' || userQuery.userType == 'id')
                writeBlock(() => [
                    `API links to queries on `,
                    makeUserLink(userQuery, `this user`),
                    `: `,
                    makeNoteQueryLink(`with specified limit`, query, limit),
                    `, `,
                    makeNoteQueryLink(`with max limit`, query, 10000),
                    ` (may be slow)`
                ]);
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
        function makeNoteQueryLink(text, query, limit) {
            return makeLink(text, `https://api.openstreetmap.org/api/0.6/notes/search.json?` + getNextFetchDetails(query, limit).parameters);
        }
        this.$container.append($details);
    }
}

main();
async function main() {
    const storage = new NoteViewerStorage('osm-note-viewer-');
    const db = await NoteViewerDB.open();
    const flipped = !!storage.getItem('flipped');
    if (flipped)
        document.body.classList.add('flipped');
    const $textSide = document.createElement('div');
    $textSide.id = 'text';
    const $mapSide = document.createElement('div');
    $mapSide.id = 'map';
    document.body.append($textSide, $mapSide);
    const $scrollingPart = document.createElement('div');
    $scrollingPart.classList.add('scrolling');
    const $stickyPart = document.createElement('div');
    $stickyPart.classList.add('sticky');
    $textSide.append($scrollingPart, $stickyPart);
    const $fetchContainer = document.createElement('div');
    $fetchContainer.classList.add('panel', 'fetch');
    const $filterContainer = document.createElement('div');
    $filterContainer.classList.add('panel', 'fetch');
    const $extrasContainer = document.createElement('div');
    $extrasContainer.classList.add('panel');
    const $notesContainer = document.createElement('div');
    $notesContainer.classList.add('notes');
    const $moreContainer = document.createElement('div');
    $moreContainer.classList.add('more');
    const $commandContainer = document.createElement('div');
    $commandContainer.classList.add('panel', 'command');
    $scrollingPart.append($fetchContainer, $filterContainer, $extrasContainer, $notesContainer, $moreContainer);
    $stickyPart.append($commandContainer);
    const map = new NoteMap($mapSide);
    writeFlipLayoutButton(storage, $fetchContainer, map);
    writeResetButton($fetchContainer);
    const extrasPanel = new ExtrasPanel(storage, db, $extrasContainer);
    const filterPanel = new NoteFilterPanel($filterContainer);
    new NoteFetchPanel(storage, db, $fetchContainer, $notesContainer, $moreContainer, $commandContainer, filterPanel, extrasPanel, map);
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
