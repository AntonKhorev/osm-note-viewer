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
    listFetches() {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches'], 'readonly');
            tx.onerror = () => reject(new Error(`Database view error: ${tx.error}`));
            const request = tx.objectStore('fetches').index('access').getAll();
            request.onsuccess = () => resolve(request.result);
        });
    }
    deleteFetch(fetch) {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches', 'notes', 'users'], 'readwrite');
            tx.onerror = () => reject(new Error(`Database delete error: ${tx.error}`));
            tx.oncomplete = () => resolve();
            const range = makeTimestampRange(fetch.timestamp);
            tx.objectStore('notes').delete(range);
            tx.objectStore('users').delete(range);
            tx.objectStore('fetches').delete(fetch.timestamp);
        });
    }
    getFetchWithClearedData(timestamp, queryString) {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches', 'notes', 'users'], 'readwrite');
            tx.onerror = () => reject(new Error(`Database clear error: ${tx.error}`));
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
        });
    }
    getFetchWithRestoredData(timestamp, queryString) {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches', 'notes', 'users'], 'readwrite');
            tx.onerror = () => reject(new Error(`Database read error: ${tx.error}`));
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
                    readNotesAndUsersInTx(fetch.timestamp, tx, (notes, users) => resolve([fetch, notes, users]));
                }
            };
        });
    }
    /**
     * @returns [updated fetch, null] on normal update; [null,null] if fetch is stale; [updated fetch, all stored fetch data] if write conflict
     */
    addDataToFetch(timestamp, fetch, newNotes, newUsers) {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches', 'notes', 'users'], 'readwrite');
            tx.onerror = () => reject(new Error(`Database save error: ${tx.error}`));
            const fetchStore = tx.objectStore('fetches');
            const noteStore = tx.objectStore('notes');
            const userStore = tx.objectStore('users');
            const fetchRequest = fetchStore.get(fetch.timestamp);
            fetchRequest.onsuccess = () => {
                if (fetchRequest.result == null)
                    return resolve([null, null]);
                const storedFetch = fetchRequest.result;
                if (storedFetch.writeTimestamp > fetch.writeTimestamp) {
                    storedFetch.accessTimestamp = timestamp;
                    fetchStore.put(storedFetch);
                    return readNotesAndUsersInTx(storedFetch.timestamp, tx, (notes, users) => resolve([storedFetch, [notes, users]]));
                }
                storedFetch.writeTimestamp = storedFetch.accessTimestamp = timestamp;
                fetchStore.put(storedFetch);
                tx.oncomplete = () => resolve([storedFetch, null]);
                const range = makeTimestampRange(fetch.timestamp);
                const noteCursorRequest = noteStore.index('sequence').openCursor(range, 'prev');
                noteCursorRequest.onsuccess = () => {
                    let sequenceNumber = 0;
                    const cursor = noteCursorRequest.result;
                    if (cursor)
                        sequenceNumber = cursor.value.sequenceNumber;
                    writeNotes(noteStore, fetch.timestamp, newNotes, sequenceNumber);
                    writeUsers(userStore, fetch.timestamp, newUsers);
                };
            };
        });
    }
    updateDataInFetch(timestamp, fetch, updatedNote, newUsers) {
        if (this.closed)
            throw new Error(`Database is outdated, please reload the page.`);
        return new Promise((resolve, reject) => {
            const tx = this.idb.transaction(['fetches', 'notes', 'users'], 'readwrite');
            tx.onerror = () => reject(new Error(`Database save error: ${tx.error}`));
            const fetchStore = tx.objectStore('fetches');
            const noteStore = tx.objectStore('notes');
            const userStore = tx.objectStore('users');
            const fetchRequest = fetchStore.get(fetch.timestamp);
            fetchRequest.onsuccess = () => {
                if (fetchRequest.result == null)
                    return resolve(null);
                const storedFetch = fetchRequest.result;
                storedFetch.accessTimestamp = timestamp;
                fetchStore.put(storedFetch);
                tx.oncomplete = () => resolve(null);
                const noteCursorRequest = noteStore.openCursor([fetch.timestamp, updatedNote.id]);
                noteCursorRequest.onsuccess = () => {
                    const cursor = noteCursorRequest.result;
                    if (!cursor)
                        return;
                    const storedNoteEntry = cursor.value;
                    const updatedNoteEntry = {
                        fetchTimestamp: storedNoteEntry.fetchTimestamp,
                        note: updatedNote,
                        sequenceNumber: storedNoteEntry.sequenceNumber
                    };
                    cursor.update(updatedNoteEntry);
                    writeUsers(userStore, fetch.timestamp, newUsers);
                };
            };
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
function readNotesAndUsersInTx(timestamp, tx, callback) {
    const range = makeTimestampRange(timestamp);
    const noteRequest = tx.objectStore('notes').index('sequence').getAll(range);
    noteRequest.onsuccess = () => {
        const notes = noteRequest.result.map(noteEntry => noteEntry.note);
        const userRequest = tx.objectStore('users').getAll(range);
        userRequest.onsuccess = () => {
            const users = {};
            for (const userEntry of userRequest.result) {
                users[userEntry.user.id] = userEntry.user.name;
            }
            callback(notes, users);
        };
    };
}
function writeNotes(noteStore, fetchTimestamp, notes, sequenceNumber) {
    for (const note of notes) {
        sequenceNumber++;
        const noteEntry = {
            fetchTimestamp,
            note,
            sequenceNumber
        };
        noteStore.put(noteEntry);
    }
}
function writeUsers(userStore, fetchTimestamp, users) {
    for (const userId in users) {
        const name = users[userId];
        if (name == null)
            continue;
        const userEntry = {
            fetchTimestamp,
            user: {
                id: Number(userId),
                name
            }
        };
        userStore.put(userEntry);
    }
}

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
function escapeHash(text) {
    return text.replace(/[^0-9a-zA-Z?/:@._~!$'()*+,;-]/g, // https://stackoverflow.com/a/26119120 except & and =
    // https://stackoverflow.com/a/26119120 except & and =
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}` // escape like in https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI#encoding_for_rfc3986
    );
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

class QueryError {
    get reason() {
        return `for unknown reason`;
    }
}
class NetworkQueryError extends QueryError {
    constructor(message) {
        super();
        this.message = message;
    }
    get reason() {
        return `with the following error before receiving a response: ${this.message}`;
    }
}
class ResponseQueryError extends QueryError {
    constructor(text) {
        super();
        this.text = text;
    }
    get reason() {
        return `receiving the following message: ${this.text}`;
    }
}
class NominatimProvider {
    constructor(url) {
        this.url = url;
    }
    async search(parameters) {
        const response = await fetch(this.getSearchUrl(parameters));
        if (!response.ok) {
            throw new TypeError('unsuccessful Nominatim response');
        }
        return response.json();
    }
    getSearchUrl(parameters) {
        return this.url + `search?format=jsonv2&` + parameters;
    }
}
class Server {
    constructor(apiUrl, webUrls, tileUrlTemplate, tileAttributionUrl, tileAttributionText, maxZoom, nominatimUrl, overpassUrl, overpassTurboUrl, noteUrl, noteText) {
        this.apiUrl = apiUrl;
        this.webUrls = webUrls;
        this.tileUrlTemplate = tileUrlTemplate;
        this.tileAttributionUrl = tileAttributionUrl;
        this.tileAttributionText = tileAttributionText;
        this.maxZoom = maxZoom;
        this.overpassUrl = overpassUrl;
        this.overpassTurboUrl = overpassTurboUrl;
        this.noteUrl = noteUrl;
        this.noteText = noteText;
        const hostUrl = new URL(webUrls[0]);
        this.host = hostUrl.host;
        if (nominatimUrl != null)
            this.nominatim = new NominatimProvider(nominatimUrl);
    }
    apiFetch(apiPath) {
        return fetch(this.getApiUrl(apiPath));
    }
    getApiUrl(apiPath) {
        return `${this.apiUrl}api/0.6/${apiPath}`;
    }
    getApiRootUrl(apiRootPath) {
        return `${this.apiUrl}${apiRootPath}`;
    }
    getWebUrl(webPath) {
        return `${this.webUrls[0]}${webPath}`;
    }
    async overpassFetch(overpassQuery) {
        try {
            let response;
            try {
                response = await fetch(this.overpassUrl + `api/interpreter`, {
                    method: 'POST',
                    body: new URLSearchParams({ data: overpassQuery })
                });
            }
            catch (ex) {
                if (ex instanceof TypeError) {
                    throw new NetworkQueryError(ex.message);
                }
                else {
                    throw ex;
                }
            }
            const text = await response.text();
            if (!response.ok) {
                throw new ResponseQueryError(text);
            }
            return new DOMParser().parseFromString(text, 'text/xml');
        }
        catch (ex) {
            if (ex instanceof QueryError) {
                throw ex;
            }
            else {
                throw new QueryError;
            }
        }
    }
    getOverpassTurboUrl(query, lat, lon, zoom) {
        const e = makeEscapeTag(encodeURIComponent);
        const location = `${lat};${lon};${zoom}`;
        return this.overpassTurboUrl + e `?C=${location}&Q=${query}`;
    }
}

function parseServerListItem(config) {
    let apiUrl = `https://api.openstreetmap.org/`;
    let webUrls = [
        `https://www.openstreetmap.org/`,
        `https://openstreetmap.org/`,
        `https://www.osm.org/`,
        `https://osm.org/`,
    ];
    let tileUrlTemplate = `https://tile.openstreetmap.org/{z}/{x}/{y}.png`;
    let tileAttributionUrl = `https://www.openstreetmap.org/copyright`;
    let tileAttributionText = `OpenStreetMap contributors`;
    let maxZoom = 19;
    let nominatimUrl;
    let overpassUrl = `https://www.overpass-api.de/`;
    let overpassTurboUrl = `https://overpass-turbo.eu/`;
    let noteUrl;
    let noteText;
    if (typeof config == 'string') {
        apiUrl = config;
        webUrls = [config];
    }
    else if (typeof config == 'object' && config) {
        if (typeof config.web == 'string') {
            webUrls = [config.web];
        }
        else if (Array.isArray(config.web)) {
            webUrls = config.web;
        }
        if (typeof config.api == 'string') {
            apiUrl = config.api;
        }
        else {
            apiUrl = webUrls[0];
        }
        if (typeof config.nominatim == 'string')
            nominatimUrl = config.nominatim;
        if (typeof config.overpass == 'string')
            overpassUrl = config.overpass;
        if (typeof config.overpassTurbo == 'string')
            overpassTurboUrl = config.overpassTurbo;
        if (typeof config.tiles == 'string') {
            tileAttributionUrl = tileAttributionText = undefined;
            tileUrlTemplate = config.tiles;
        }
        else if (typeof config.tiles == 'object' && config.tiles) {
            tileAttributionUrl = tileAttributionText = undefined;
            if (typeof config.tiles.template == 'string')
                tileUrlTemplate = config.tiles.template;
            [tileAttributionUrl, tileAttributionText] = parseUrlTextPair(tileAttributionUrl, tileAttributionText, config.tiles.attribution);
            if (typeof config.tiles.zoom == 'number')
                maxZoom = config.tiles.zoom;
        }
        [noteUrl, noteText] = parseUrlTextPair(noteUrl, noteText, config.note);
    }
    else if (!config) {
        noteText = `main OSM server`;
        nominatimUrl = `https://nominatim.openstreetmap.org/`;
    }
    return [
        apiUrl, webUrls,
        tileUrlTemplate,
        tileAttributionUrl ?? deriveAttributionUrl(webUrls),
        tileAttributionText ?? deriveAttributionText(webUrls),
        maxZoom,
        nominatimUrl, overpassUrl, overpassTurboUrl,
        noteUrl, noteText
    ];
}
function deriveAttributionUrl(webUrls) {
    return webUrls[0] + `copyright`;
}
function deriveAttributionText(webUrls) {
    try {
        const hostUrl = new URL(webUrls[0]);
        return hostUrl.host + ` contributors`;
    }
    catch {
        return webUrls[0] + ` contributors`;
    }
}
function parseUrlTextPairItem(urlValue, textValue, newValue) {
    try {
        const url = new URL(newValue);
        return [url.href, textValue];
    }
    catch {
        return [urlValue, newValue];
    }
}
function parseUrlTextPair(urlValue, textValue, newItems) {
    if (typeof newItems == 'string') {
        [urlValue, textValue] = parseUrlTextPairItem(urlValue, textValue, newItems);
    }
    else if (Array.isArray(newItems)) {
        for (const newValue of newItems) {
            if (typeof newValue == 'string') {
                [urlValue, textValue] = parseUrlTextPairItem(urlValue, textValue, newValue);
            }
        }
    }
    return [urlValue, textValue];
}

class ServerList {
    constructor(configList) {
        this.servers = new Map();
        let defaultServer;
        for (const config of configList) {
            const server = makeServer(config);
            this.servers.set(server.host, server);
            if (!defaultServer)
                defaultServer = server;
        }
        if (!defaultServer) {
            const server = makeServer();
            this.servers.set(server.host, server);
            defaultServer = server;
        }
        this.defaultServer = defaultServer;
    }
    getHostHash(server) {
        let hostHash = null;
        if (server != this.defaultServer) {
            hostHash = server.host;
        }
        return hostHash;
    }
    getServer(hostHash) {
        if (hostHash == null)
            return this.defaultServer;
        const server = this.servers.get(hostHash);
        if (!server)
            throw new TypeError(`unknown host "${hostHash}"`);
        return server;
    }
}
function makeServer(config) {
    return new Server(...parseServerListItem(config));
}

class GlobalEventListener {
    constructor() {
        document.body.addEventListener('click', ev => {
            if (!(ev.target instanceof HTMLElement))
                return;
            const $e = ev.target.closest('a.listened, time.listened');
            if ($e instanceof HTMLAnchorElement) {
                if (this.noteSelfListener && $e.dataset.noteId && $e.dataset.self) {
                    this.noteSelfListener($e, $e.dataset.noteId);
                }
                else if (this.noteListener && $e.dataset.noteId) {
                    this.noteListener($e, $e.dataset.noteId);
                }
                else if (this.userListener && $e.dataset.userId) {
                    this.userListener($e, Number($e.dataset.userId), $e.dataset.userName);
                }
                else if (this.elementListener && $e.dataset.elementType && $e.dataset.elementId) {
                    this.elementListener($e, $e.dataset.elementType, $e.dataset.elementId);
                }
                else if (this.changesetListener && $e.dataset.changesetId) {
                    this.changesetListener($e, $e.dataset.changesetId);
                }
                else if (this.mapListener && $e.dataset.zoom && $e.dataset.lat && $e.dataset.lon) {
                    this.mapListener($e, $e.dataset.zoom, $e.dataset.lat, $e.dataset.lon);
                }
                else if (this.imageListener && $e.classList.contains('image')) {
                    this.imageListener($e);
                }
                else {
                    return; // don't stop event propagation
                }
                ev.preventDefault();
                ev.stopPropagation();
            }
            else if ($e instanceof HTMLTimeElement) {
                if (this.timestampListener && $e.dateTime) {
                    ev.stopPropagation();
                    this.timestampListener($e.dateTime);
                }
            }
        }, true); // need to capture event before it bubbles to note table sections
    }
}

class GlobalHistory {
    constructor($scrollingPart, $resizeObservationTarget, serverList) {
        this.$scrollingPart = $scrollingPart;
        this.$resizeObservationTarget = $resizeObservationTarget;
        this.serverList = serverList;
        this.rememberScrollPosition = false;
        this.server = this.getServerByReadingHash();
        history.scrollRestoration = 'manual';
        const replaceScrollPositionInHistory = () => {
            const scrollPosition = $scrollingPart.scrollTop;
            history.replaceState({ scrollPosition }, '');
        };
        let rememberScrollPositionTimeoutId;
        $scrollingPart.addEventListener('scroll', () => {
            if (!this.rememberScrollPosition)
                return;
            clearTimeout(rememberScrollPositionTimeoutId);
            rememberScrollPositionTimeoutId = setTimeout(replaceScrollPositionInHistory, 50);
            // TODO save more panel open/closed state... actually all panels open/closed states - Firefox does that, Chrome doesn't
            // ... or save some other kind of position relative to notes table instead of scroll
        });
        window.addEventListener('hashchange', () => {
            const [queryHash, mapHash, hostHash] = this.getAllHashes();
            if (hostHash != this.serverList.getHostHash(this.server)) {
                location.reload();
                return;
            }
            if (this.onMapHashChange && mapHash) {
                this.onMapHashChange(mapHash);
            }
            if (this.onQueryHashChange) {
                this.onQueryHashChange(queryHash); // TODO don't run if only map hash changed? or don't zoom to notes if map hash present?
            }
        });
    }
    triggerInitialMapHashChange() {
        const [, mapHash] = this.getAllHashes();
        if (this.onMapHashChange && mapHash) {
            this.onMapHashChange(mapHash);
        }
    }
    restoreScrollPosition() {
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
        resizeObserver.observe(this.$resizeObservationTarget); // observing $scrollingPart won't work because its size doesn't change
    }
    getQueryHash() {
        return this.getAllHashes()[0];
    }
    setQueryHash(queryHash, pushStateAndRemoveMapHash) {
        let mapHash = '';
        if (!pushStateAndRemoveMapHash) {
            const searchParams = this.getSearchParams();
            mapHash = searchParams.get('map') ?? '';
        }
        const hostHash = this.serverList.getHostHash(this.server);
        const fullHash = this.getFullHash(queryHash, mapHash, hostHash);
        if (fullHash != location.hash) {
            const url = fullHash || location.pathname + location.search;
            if (pushStateAndRemoveMapHash) {
                history.pushState(null, '', url);
            }
            else {
                history.replaceState(null, '', url);
            }
        }
    }
    hasMapHash() {
        const searchParams = this.getSearchParams();
        const mapHash = searchParams.get('map');
        return !!mapHash;
    }
    setMapHash(mapHash) {
        const searchParams = this.getSearchParams();
        searchParams.delete('map');
        const hostHash = searchParams.get('host');
        searchParams.delete('host');
        const queryHash = searchParams.toString();
        history.replaceState(null, '', this.getFullHash(queryHash, mapHash, hostHash));
    }
    getServerByReadingHash() {
        const [, , hostHash] = this.getAllHashes();
        return this.serverList.getServer(hostHash);
    }
    getAllHashes() {
        const searchParams = this.getSearchParams();
        const mapHash = searchParams.get('map');
        searchParams.delete('map');
        const hostHash = searchParams.get('host');
        searchParams.delete('host');
        const queryHash = searchParams.toString();
        return [queryHash, mapHash, hostHash];
    }
    getSearchParams() {
        const paramString = (location.hash[0] == '#')
            ? location.hash.slice(1)
            : location.hash;
        return new URLSearchParams(paramString);
    }
    getFullHash(queryHash, mapHash, hostHash) {
        let fullHash = '';
        const appendToFullHash = (hash) => {
            if (fullHash && hash)
                fullHash += '&';
            fullHash += hash;
        };
        if (hostHash)
            appendToFullHash('host=' + escapeHash(hostHash));
        appendToFullHash(queryHash);
        if (mapHash)
            appendToFullHash('map=' + escapeHash(mapHash));
        if (fullHash)
            fullHash = '#' + fullHash;
        return fullHash;
    }
}

const e$4 = makeEscapeTag(escapeXml);
class NoteMarker extends L.Marker {
    constructor(note) {
        const icon = getNoteMarkerIcon(note, false);
        super([note.lat, note.lon], { icon });
        this.noteId = note.id;
    }
    updateIcon(note, isSelected) {
        const icon = getNoteMarkerIcon(note, isSelected);
        this.setIcon(icon);
    }
}
function getNoteMarkerIcon(note, isSelected) {
    const width = 25;
    const height = 40;
    const auraThickness = 4;
    const r = width / 2;
    const widthWithAura = width + auraThickness * 2;
    const heightWithAura = height + auraThickness;
    const rWithAura = widthWithAura / 2;
    const nInnerCircles = 4;
    let html = ``;
    html += e$4 `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-rWithAura} ${-rWithAura} ${widthWithAura} ${heightWithAura}">`;
    html += e$4 `<title>${note.status} note #${note.id}</title>`,
        html += e$4 `<path d="${computeMarkerOutlinePath(heightWithAura - .5, rWithAura - .5)}" class="aura" fill="none" />`;
    html += e$4 `<path d="${computeMarkerOutlinePath(height, r)}" fill="${note.status == 'open' ? 'red' : 'green'}" />`;
    const states = [...noteCommentsToStates(note.comments)];
    html += drawStateCircles(r, nInnerCircles, states.slice(-nInnerCircles, -1));
    if (isSelected) {
        html += drawCheckMark();
    }
    html += e$4 `</svg>`;
    return L.divIcon({
        html,
        className: 'note-marker',
        iconSize: [widthWithAura, heightWithAura],
        iconAnchor: [(widthWithAura - 1) / 2, heightWithAura],
    });
    function computeMarkerOutlinePath(height, r) {
        const rp = height - r;
        const y = r ** 2 / rp;
        const x = Math.sqrt(r ** 2 - y ** 2);
        const xf = x.toFixed(2);
        const yf = y.toFixed(2);
        return `M0,${rp} L-${xf},${yf} A${r},${r} 0 1 1 ${xf},${yf} Z`;
    }
    function drawStateCircles(r, nInnerCircles, statesToDraw) {
        const dcr = (r - .5) / nInnerCircles;
        let html = ``;
        for (let i = 2; i >= 0; i--) {
            if (i >= statesToDraw.length)
                continue;
            const cr = dcr * (i + 1);
            html += e$4 `<circle r="${cr}" fill="${color()}" stroke="white" />`;
            function color() {
                if (i == 0 && states.length <= nInnerCircles)
                    return 'white';
                if (statesToDraw[i])
                    return 'red';
                return 'green';
            }
        }
        return html;
    }
    function drawCheckMark() {
        const path = `M-${r / 4},0 L0,${r / 4} L${r / 2},-${r / 4}`;
        let html = ``;
        html += e$4 `<path d="${path}" fill="none" stroke-width="6" stroke-linecap="round" stroke="blue" />`;
        html += e$4 `<path d="${path}" fill="none" stroke-width="2" stroke-linecap="round" stroke="white" />`;
        return html;
    }
}
class NoteMap {
    constructor($container, tileSource) {
        this.needToFitNotes = false;
        this.freezeMode = 'no';
        this.leafletMap = L.map($container, {
            worldCopyJump: true
        });
        this.leafletMap.addLayer(L.tileLayer(tileSource.tileUrlTemplate, {
            attribution: e$4 `© <a href="${tileSource.tileAttributionUrl}">${tileSource.tileAttributionText}</a>`,
            maxZoom: tileSource.maxZoom
        })).fitWorld();
        this.elementLayer = L.featureGroup().addTo(this.leafletMap);
        this.unselectedNoteLayer = L.featureGroup().addTo(this.leafletMap);
        this.selectedNoteLayer = L.featureGroup().addTo(this.leafletMap);
        this.filteredNoteLayer = L.featureGroup();
        this.trackLayer = L.featureGroup().addTo(this.leafletMap);
        const crosshairLayer = new CrosshairLayer().addTo(this.leafletMap);
        const layersControl = L.control.layers();
        layersControl.addOverlay(this.elementLayer, `OSM elements`);
        layersControl.addOverlay(this.unselectedNoteLayer, `Unselected notes`);
        layersControl.addOverlay(this.selectedNoteLayer, `Selected notes`);
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
    addNoteMarker(marker, toLayer) {
        marker.addTo(toLayer);
        return toLayer.getLayerId(marker);
    }
    getNoteMarker(layerId) {
        for (const layer of [this.unselectedNoteLayer, this.selectedNoteLayer, this.filteredNoteLayer]) {
            const marker = layer.getLayer(layerId);
            if (marker instanceof NoteMarker) {
                return marker;
            }
        }
    }
    removeNoteMarker(layerId) {
        for (const layer of [this.unselectedNoteLayer, this.selectedNoteLayer, this.filteredNoteLayer]) {
            layer.removeLayer(layerId);
        }
    }
    moveNoteMarkerToLayer(layerId, toLayer) {
        for (const layer of [this.unselectedNoteLayer, this.selectedNoteLayer, this.filteredNoteLayer]) {
            const marker = layer.getLayer(layerId);
            if (marker instanceof NoteMarker) {
                layer.removeLayer(marker);
                toLayer.addLayer(marker);
                return marker;
            }
        }
    }
    invalidateSize() {
        this.leafletMap.invalidateSize();
    }
    clearNotes() {
        this.elementLayer.clearLayers();
        this.unselectedNoteLayer.clearLayers();
        this.selectedNoteLayer.clearLayers();
        this.filteredNoteLayer.clearLayers();
        this.trackLayer.clearLayers();
        this.needToFitNotes = this.freezeMode == 'no';
    }
    fitSelectedNotes() {
        const bounds = this.selectedNoteLayer.getBounds();
        if (bounds.isValid()) {
            this.fitBoundsIfNotFrozen(bounds);
        }
    }
    fitNotes() {
        let bounds;
        for (const layer of [this.unselectedNoteLayer, this.selectedNoteLayer, this.filteredNoteLayer]) {
            if (!this.leafletMap.hasLayer(layer))
                continue;
            if (!bounds) {
                bounds = layer.getBounds();
            }
            else {
                bounds.extend(layer.getBounds());
            }
        }
        if (bounds && bounds.isValid()) {
            this.fitBoundsIfNotFrozen(bounds);
            this.needToFitNotes = false;
        }
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
            const marker = this.getNoteMarker(layerId);
            if (!marker)
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
            this.fitBoundsIfNotFrozen(bounds);
    }
    addOsmElement(geometry, popupWriter) {
        // TODO zoom on second click, like with notes
        this.elementLayer.clearLayers();
        this.elementLayer.addLayer(geometry);
        const layerId = this.elementLayer.getLayerId(geometry);
        // geometry.openPopup() // can't do it here because popup will open on a wrong spot if animation is not finished
        if (this.freezeMode == 'full') {
            const popup = L.popup({ autoPan: false }).setContent(popupWriter);
            let restorePopupTipTimeoutId;
            const onOpenPopup = () => {
                const $popupContainer = popup.getElement();
                if (!$popupContainer)
                    return;
                if (restorePopupTipTimeoutId) {
                    clearTimeout(restorePopupTipTimeoutId);
                    restorePopupTipTimeoutId = undefined;
                    restorePopupTip($popupContainer);
                }
                const offsetWithTip = calculateOffsetsToFit(this.leafletMap, $popupContainer);
                if (offsetWithTip[0] || offsetWithTip[1]) {
                    hidePopupTip($popupContainer);
                    const offsetWithoutTip = calculateOffsetsToFit(this.leafletMap, $popupContainer);
                    popup.options.offset = offsetWithoutTip;
                    popup.update();
                }
            };
            const onClosePopup = () => {
                geometry.bindPopup(popup, { offset: [0, 0] });
                const $popupContainer = popup.getElement();
                if (!$popupContainer)
                    return;
                const fadeoutTransitionTime = 200;
                restorePopupTipTimeoutId = setTimeout(() => {
                    restorePopupTipTimeoutId = undefined;
                    restorePopupTip($popupContainer);
                }, fadeoutTransitionTime);
            };
            geometry.on('popupopen', onOpenPopup).on('popupclose', onClosePopup);
            geometry.bindPopup(popup).openPopup();
        }
        else if (geometry instanceof L.CircleMarker) {
            this.queuedPopup = [layerId, popupWriter];
            const minZoomForNode = 10;
            if (this.zoom < minZoomForNode) {
                this.flyToIfNotFrozen(geometry.getLatLng(), minZoomForNode, { duration: .5 });
            }
            else {
                this.panToIfNotFrozen(geometry.getLatLng());
            }
        }
        else {
            const bounds = this.elementLayer.getBounds();
            if (bounds.isValid()) {
                this.queuedPopup = [layerId, popupWriter];
                this.fitBoundsIfNotFrozen(bounds);
            }
            else {
                geometry.bindPopup(popupWriter).openPopup();
            }
        }
    }
    fitBounds(bounds) {
        this.fitBoundsIfNotFrozen(bounds);
    }
    panTo(latlng) {
        this.panToIfNotFrozen(latlng);
    }
    panAndZoomTo(latlng, zoom) {
        this.flyToIfNotFrozen(latlng, zoom, { duration: .5 }); // default duration is too long despite docs saying it's 0.25
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
    get hash() {
        const precision = Math.max(0, Math.ceil(Math.log2(this.zoom)));
        return `${this.zoom.toFixed(0)}/${this.lat.toFixed(precision)}/${this.lon.toFixed(precision)}`;
    }
    get bounds() {
        return this.leafletMap.getBounds();
    }
    onMoveEnd(fn) {
        this.leafletMap.on('moveend', fn);
    }
    fitBoundsIfNotFrozen(bounds) {
        if (this.freezeMode == 'full')
            return;
        this.leafletMap.fitBounds(bounds);
    }
    panToIfNotFrozen(latlng) {
        if (this.freezeMode == 'full')
            return;
        this.leafletMap.panTo(latlng);
    }
    flyToIfNotFrozen(latlng, zoom, options) {
        if (this.freezeMode == 'full')
            return;
        this.leafletMap.flyTo(latlng, zoom, options);
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
function hidePopupTip($popupContainer) {
    $popupContainer.style.marginBottom = '0';
    const $tip = $popupContainer.querySelector('.leaflet-popup-tip-container');
    if ($tip instanceof HTMLElement) {
        $tip.style.display = 'none';
    }
}
function restorePopupTip($popupContainer) {
    $popupContainer.style.removeProperty('margin-bottom');
    const $tip = $popupContainer.querySelector('.leaflet-popup-tip-container');
    if ($tip instanceof HTMLElement) {
        $tip.style.removeProperty('display');
    }
}
// logic borrowed from _adjustPan() in leaflet's Popup class
function calculateOffsetsToFit(map, $popupContainer) {
    const containerWidth = $popupContainer.offsetWidth;
    const containerLeft = -Math.round(containerWidth / 2);
    const marginBottom = parseInt(L.DomUtil.getStyle($popupContainer, 'marginBottom') ?? '0', 10); // contains tip that is better thrown away
    const containerHeight = $popupContainer.offsetHeight + marginBottom;
    const containerBottom = 0;
    const containerAddPos = L.DomUtil.getPosition($popupContainer);
    const layerPos = new L.Point(containerLeft, -containerHeight - containerBottom);
    layerPos.x += containerAddPos.x;
    layerPos.y += containerAddPos.y;
    const containerPos = map.layerPointToContainerPoint(layerPos);
    const size = map.getSize();
    let dx = 0;
    let dy = 0;
    if (containerPos.x + containerWidth > size.x) { // right
        dx = containerPos.x + containerWidth - size.x;
    }
    if (containerPos.x - dx < 0) { // left
        dx = containerPos.x;
    }
    if (containerPos.y + containerHeight > size.y) { // bottom
        dy = containerPos.y + containerHeight - size.y;
    }
    if (containerPos.y - dy < 0) { // top
        dy = containerPos.y;
    }
    return [-dx, -dy];
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

class NavDialog {
    constructor() {
        this.$section = document.createElement('section');
    }
    write($container) {
        this.$section.classList.add('nav-dialog');
        const $heading = document.createElement('h2');
        $heading.textContent = this.title;
        this.$section.append($heading);
        this.writeSectionContent();
        $container.append(this.$section);
    }
    isOpen() {
        return this.$section.classList.contains('active');
    }
    onOpen() { }
    onClose() { }
}
class Navbar {
    constructor(storage, $container, map) {
        this.$tabList = document.createElement('ul');
        this.tabs = new Map();
        $container.append(this.$tabList, makeFlipLayoutButton(storage, map), makeResetButton());
    }
    addTab(dialog, push = false) {
        const id = 'section-' + dialog.shortTitle;
        dialog.$section.id = id;
        const $a = makeLink(dialog.shortTitle, '#' + id);
        this.$tabList.append(makeElement('li')(...(push ? ['push'] : []))($a));
        this.tabs.set(dialog.shortTitle, [$a, dialog]);
        $a.addEventListener('click', ev => {
            ev.preventDefault();
            this.openTab(dialog.shortTitle);
        });
    }
    openTab(targetShortTitle) {
        for (const [shortTitle, [$a, dialog]] of this.tabs) {
            const willBeActive = shortTitle == targetShortTitle;
            if (!willBeActive && dialog.isOpen()) {
                dialog.onClose();
            }
        }
        for (const [shortTitle, [$a, dialog]] of this.tabs) {
            const willBeActive = shortTitle == targetShortTitle;
            const willCallOnOpen = (willBeActive && !dialog.isOpen());
            $a.classList.toggle('active', willBeActive);
            dialog.$section.classList.toggle('active', willBeActive);
            if (willCallOnOpen) {
                dialog.onOpen();
            }
        }
    }
}
function makeFlipLayoutButton(storage, map) {
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
    return $button;
}
function makeResetButton() {
    const $button = document.createElement('button');
    $button.classList.add('global', 'reset');
    $button.innerHTML = `<svg><title>Reset query</title><use href="#reset" /></svg>`;
    $button.addEventListener('click', () => {
        location.href = location.pathname + location.search;
        // TODO this would have worked better, if it also cleared the notes table:
        // const url=location.pathname+location.search
        // location.href=url+'#'
        // history.replaceState(null,'',url)
    });
    return $button;
}

class AboutDialog extends NavDialog {
    constructor(storage, db, server, serverList) {
        super();
        this.storage = storage;
        this.db = db;
        this.server = server;
        this.serverList = serverList;
        this.shortTitle = `About`;
        this.title = `About`;
    }
    writeSectionContent() {
        const writeSubheading = (s) => {
            this.$section.append(makeElement('h3')()(s));
        };
        const writeBlock = (makeBlockContents) => {
            const $block = makeDiv()(...makeBlockContents());
            this.$section.append($block);
            return $block;
        };
        writeBlock(() => {
            const result = [];
            result.push(makeElement('strong')()(`note-viewer`));
            const build = document.body.dataset.build;
            if (build)
                result.push(` build ${build}`);
            result.push(` — `);
            result.push(makeLink(`source code`, `https://github.com/AntonKhorev/osm-note-viewer`));
            return result;
        });
        writeSubheading(`Servers`);
        writeBlock(() => {
            const $list = makeElement('ul')()();
            const baseLocation = location.pathname + location.search;
            for (const [newHost, newServer] of this.serverList.servers) {
                const hash = this.serverList.getHostHash(newServer);
                const newLocation = baseLocation + (hash ? `#host=` + escapeHash(hash) : '');
                let itemContent = [makeLink(newHost, newLocation)];
                if (newServer.noteText && !newServer.noteUrl) {
                    itemContent.push(` - ` + newServer.noteText);
                }
                else if (newServer.noteUrl) {
                    itemContent.push(` - `, makeLink(newServer.noteText || `note`, newServer.noteUrl));
                }
                if (this.server == newServer) {
                    itemContent.push(` - currently selected`);
                    itemContent = [makeElement('strong')()(...itemContent)];
                }
                $list.append(makeElement('li')()(...itemContent));
            }
            return [$list];
        });
        writeSubheading(`Storage`);
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
                fetchEntries = await this.db.listFetches();
            }
            catch { }
            $updateFetchesButton.disabled = false;
            $fetchesContainer.innerHTML = '';
            const $table = document.createElement('table');
            {
                const $row = $table.insertRow();
                insertCell().append('fetch');
                insertCell().append('mode');
                insertCell().append('content');
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
                const ids = searchParams.get('ids');
                if (username) {
                    const href = this.server.getWebUrl(`user/` + encodeURIComponent(username));
                    $userCell.append(`user `, makeLink(username, href));
                }
                else if (ids) {
                    const match = ids.match(/\d+/);
                    if (match) {
                        const [id] = match;
                        const href = this.server.getWebUrl(`note/` + encodeURIComponent(id));
                        $userCell.append(`note `, makeLink(id, href), `, ...`);
                    }
                }
                $row.insertCell().append(new Date(fetchEntry.accessTimestamp).toISOString());
                const $deleteButton = document.createElement('button');
                $deleteButton.textContent = `Delete`;
                $deleteButton.addEventListener('click', async () => {
                    $deleteButton.disabled = true;
                    await this.db.deleteFetch(fetchEntry);
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
        writeSubheading(`Extra information`);
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
            makeLink(`Overpass queries`, `https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL`)
        ]);
    }
}

function toUserQuery(urlLister, value) {
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
        const hosts = new Set();
        for (const urlString of [urlLister.apiUrl, ...urlLister.webUrls]) {
            try {
                const url = new URL(urlString);
                hosts.add(url.host);
            }
            catch { }
        }
        try {
            const url = new URL(s);
            if (!hosts.has(url.host)) {
                let domainString = `was given ${url.host}`;
                if (!url.host)
                    domainString = `no domain was given`;
                return {
                    userType: 'invalid',
                    message: `URL has to be of an OSM domain, ${domainString}`
                };
            }
            const [, typeDir] = url.pathname.split('/', 2);
            if (typeDir == 'user') {
                const [, , userDir] = url.pathname.split('/', 3);
                if (!userDir)
                    return {
                        userType: 'invalid',
                        message: `OSM user URL has to include username`
                    };
                return {
                    userType: 'name',
                    username: decodeURIComponent(userDir)
                };
            }
            else if (typeDir == 'api') {
                const [, , apiVersionDir, apiCall, apiValue] = url.pathname.split('/', 5);
                if (apiVersionDir != '0.6' || apiCall != 'user')
                    return {
                        userType: 'invalid',
                        message: `OSM API URL has to be "api/0.6/user/..."`
                    };
                const [uidString] = apiValue.split('.');
                const uid = Number(uidString);
                if (!Number.isInteger(uid))
                    return {
                        userType: 'invalid',
                        message: `OSM API URL has to include valid user id"`
                    };
                return {
                    userType: 'id',
                    uid
                };
            }
            else {
                return {
                    userType: 'invalid',
                    message: `OSM URL has to be either user page or user api link`
                };
            }
        }
        catch {
            return {
                userType: 'invalid',
                message: `string containing "/" character has to be a valid URL`
            };
        }
    }
    return {
        userType: 'name',
        username: s
    };
}
function makeUserQueryFromUserNameAndId(username, uid) {
    if (username != null) {
        return {
            userType: 'name',
            username
        };
    }
    else if (uid != null && Number.isInteger(uid)) {
        return {
            userType: 'id',
            uid
        };
    }
    else {
        return {
            userType: 'empty'
        };
    }
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
function makeNoteSearchQueryFromValues(urlLister, userValue, textValue, fromValue, toValue, closedValue, sortValue, orderValue) {
    return makeNoteSearchQueryFromUserQueryAndValues(toUserQuery(urlLister, userValue), textValue, fromValue, toValue, closedValue, sortValue, orderValue);
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
function makeNoteIdsQueryFromValue(idsValue) {
    const ids = [];
    for (const idString of idsValue.matchAll(/\d+/g)) {
        ids.push(Number(idString));
    }
    return {
        mode: 'ids',
        ids
    };
}
function makeNoteQueryFromHash(paramString) {
    const searchParams = new URLSearchParams(paramString);
    const mode = searchParams.get('mode');
    if (mode == 'search') {
        const userQuery = makeUserQueryFromUserNameAndId(searchParams.get('display_name'), Number(searchParams.get('user') || undefined));
        return makeNoteSearchQueryFromUserQueryAndValues(userQuery, searchParams.get('q') || '', searchParams.get('from') || '', searchParams.get('to') || '', searchParams.get('closed') || '', searchParams.get('sort') || '', searchParams.get('order') || '');
    }
    else if (mode == 'bbox') {
        return makeNoteBboxQueryFromValues(searchParams.get('bbox') || '', searchParams.get('closed') || '');
    }
    else if (mode == 'ids') {
        return makeNoteIdsQueryFromValue(searchParams.get('ids') || '');
    }
    else {
        return undefined;
    }
}
/**
 * @returns query string that can be stored in url/db or empty string if the query is not supposed to be stored
 */
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
    else if (query.mode == 'ids') {
        parameters.push(['ids', query.ids.join('.')] // ',' gets urlencoded as '%2C', ';' as '%3B' etc; separator candidates are '.', '-', '_'; let's pick '.' because its horizontally shorter
        );
    }
    else {
        return '';
    }
    return parameters.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}
function makeNoteQueryStringWithHostHash(query, hostHash) {
    const queryStringWithoutHostHash = makeNoteQueryString(query);
    if (!queryStringWithoutHostHash)
        return queryStringWithoutHostHash;
    if (hostHash)
        return `host=${escapeHash(hostHash)}&${queryStringWithoutHostHash}`;
    return queryStringWithoutHostHash;
}
/**
 * Get (next) date-windowed query, which is only relevant for note search queries for now
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
        pathAndParametersList: [['', makeNoteQueryString(updatedQuery, false) + '&limit=' + encodeURIComponent(limit)]],
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
function isNoteFeature(data) {
    return data.type == "Feature";
}
function transformFeatureCollectionToNotesAndUsers(noteFeatureCollection) {
    const users = {};
    const notes = noteFeatureCollection.features.map(noteFeature => transformFeatureToNote(noteFeature, users));
    return [notes, users];
}
function transformFeatureToNotesAndUsers(noteFeature) {
    const users = {};
    const notes = [transformFeatureToNote(noteFeature, users)];
    return [notes, users];
}
function transformFeatureToNote(noteFeature, users) {
    return {
        id: noteFeature.properties.id,
        lat: noteFeature.geometry.coordinates[1],
        lon: noteFeature.geometry.coordinates[0],
        status: noteFeature.properties.status,
        comments: noteFeature.properties.comments.map(cullCommentProps)
    };
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
function getNoteUpdateDate(note) {
    return note.comments[note.comments.length - 1]?.date ?? 0;
}

const e$3 = makeEscapeTag(encodeURIComponent);
const maxSingleAutoLoadLimit = 200;
const maxTotalAutoLoadLimit = 1000;
const maxFullyFilteredFetches = 10;
class NoteFetcherRequest {
    getRequestApiPaths(query, limit) {
        const pathAndParameters = this.getRequestUrlPathAndParameters(query, limit);
        if (pathAndParameters == null)
            return [];
        return ['json', 'xml', 'gpx', 'rss'].map(type => [type, this.constructApiPath(...pathAndParameters, type)]);
    }
    constructApiPath(path, parameters, type = 'json') {
        const extension = type == 'xml' ? '' : '.' + type;
        let url = this.getRequestApiBasePath();
        if (path)
            url += path;
        url += extension;
        if (parameters)
            url += '?' + parameters;
        return url;
    }
}
class NoteSearchFetcherRequest extends NoteFetcherRequest {
    getRequestApiBasePath() {
        return `notes/search`;
    }
    getRequestUrlPathAndParameters(query, limit) {
        if (query.mode != 'search')
            return;
        return getNextFetchDetails(query, limit).pathAndParametersList[0];
    }
}
class NoteBboxFetcherRequest extends NoteFetcherRequest {
    getRequestApiBasePath() {
        return `notes`;
    }
    getRequestUrlPathAndParameters(query, limit) {
        if (query.mode != 'bbox')
            return;
        return ['', this.getRequestUrlParametersWithoutLimit(query) + e$3 `&limit=${limit}`];
    }
    getRequestUrlParametersWithoutLimit(query) {
        return e$3 `bbox=${query.bbox}&closed=${query.closed}`;
    }
}
class NoteIdsFetcherRequest extends NoteFetcherRequest {
    getRequestApiBasePath() {
        return `notes/`;
    }
    getRequestUrlPathAndParameters(query, limit) {
        if (query.mode != 'ids')
            return;
        if (query.ids.length == 0)
            return;
        return [String(query.ids[0]), '']; // TODO actually going to do several requests, can list them here somehow?
    }
}
class NoteFetcherRun {
    constructor({ db, server, hostHash, noteTable, $moreContainer, getLimit, getAutoLoad, blockDownloads, moreButtonIntersectionObservers }, query, clearStore) {
        this.fetchEntry = null;
        this.notes = new Map();
        this.users = {};
        this.updateRequestHintInAdvancedMode = () => { };
        this.db = db;
        this.server = server;
        this.noteTable = noteTable;
        (async () => {
            const queryString = makeNoteQueryStringWithHostHash(query, hostHash); // empty string == don't know how to encode the query, thus won't save it to db
            this.fetchEntry = await (async () => {
                if (!queryString)
                    return null;
                if (clearStore) {
                    return await db.getFetchWithClearedData(Date.now(), queryString);
                }
                else {
                    const [fetchEntry, initialNotes, initialUsers] = await db.getFetchWithRestoredData(Date.now(), queryString); // TODO actually have a reasonable limit here - or have a link above the table with 'clear' arg: "If the stored data is too large, click this link to restart the query from scratch"
                    this.recordData(initialNotes, initialUsers);
                    return fetchEntry;
                }
            })();
            let nFullyFilteredFetches = 0;
            let holdOffAutoLoad = false;
            const addNewNotesToTable = (newNotes) => {
                const nUnfilteredNotes = noteTable.addNotes(newNotes, this.users);
                if (nUnfilteredNotes == 0) {
                    nFullyFilteredFetches++;
                }
                else {
                    nFullyFilteredFetches = 0;
                }
            };
            const rewriteLoadingButton = () => {
                $moreContainer.innerHTML = '';
                const $button = document.createElement('button');
                $button.textContent = `Loading notes...`;
                $button.disabled = true;
                $moreContainer.append(makeDiv()($button));
            };
            const rewriteLoadMoreButton = () => {
                const $requestOutput = document.createElement('output');
                this.updateRequestHintInAdvancedMode = () => {
                    const limit = getLimit();
                    const fetchDetails = this.getCycleFetchDetails(limit);
                    if (fetchDetails.pathAndParametersList.length == 0) {
                        $requestOutput.replaceChildren(`no request`);
                        return;
                    }
                    const apiPath = this.request.constructApiPath(...fetchDetails.pathAndParametersList[0]);
                    const url = server.getApiUrl(apiPath);
                    const $a = makeLink(url, url);
                    $a.classList.add('request');
                    $requestOutput.replaceChildren(makeElement('code')()($a));
                };
                this.updateRequestHintInAdvancedMode();
                $moreContainer.innerHTML = '';
                const $button = document.createElement('button');
                $button.textContent = `Load more notes`;
                $button.addEventListener('click', fetchCycle);
                $moreContainer.append(makeDiv()($button), makeDiv('advanced-hint')(`Resulting request: `, $requestOutput));
                if (!this.fetchEntry) {
                    $moreContainer.append(makeDiv()(`The fetch results are not saved locally because ${queryString
                        ? `the fetch is stale (likely the same query was made in another browser tab)`
                        : `saving this query is not supported`}.`));
                }
                return $button;
            };
            const fetchCycle = async () => {
                // TODO check if db data is more fresh than our state
                rewriteLoadingButton();
                const limit = getLimit();
                const fetchDetails = this.getCycleFetchDetails(limit);
                if (fetchDetails == null)
                    return;
                if (fetchDetails.limit > 10000) {
                    rewriteMessage($moreContainer, `Fetching cannot continue because the required note limit exceeds max value allowed by API (this is very unlikely, if you see this message it's probably a bug)`);
                    return;
                }
                blockDownloads(true);
                try {
                    let downloadedNotes = [];
                    let downloadedUsers = {};
                    let lastTriedPath;
                    for (const pathAndParameters of fetchDetails.pathAndParametersList) {
                        const [path, parameters] = pathAndParameters;
                        lastTriedPath = path;
                        const apiPath = this.request.constructApiPath(path, parameters);
                        const response = await server.apiFetch(apiPath);
                        if (!response.ok) {
                            if (response.status == 410) { // likely hidden note in ids query
                                continue; // TODO report it
                            }
                            const responseText = await response.text();
                            rewriteFetchErrorMessage($moreContainer, query, `received the following error response`, responseText);
                            return;
                        }
                        const data = await response.json();
                        if (!this.accumulateDownloadedData(downloadedNotes, downloadedUsers, data)) {
                            rewriteMessage($moreContainer, `Received invalid data`);
                            return;
                        }
                    }
                    let [unseenNotes, unseenUsers] = this.getUnseenData(downloadedNotes, downloadedUsers);
                    if (this.fetchEntry) {
                        const [newFetchEntry, writeConflictData] = await db.addDataToFetch(Date.now(), this.fetchEntry, unseenNotes, unseenUsers);
                        this.fetchEntry = newFetchEntry;
                        if (!writeConflictData) {
                            this.lastLimit = fetchDetails.limit;
                            if (lastTriedPath != null)
                                this.lastTriedPath = lastTriedPath;
                        }
                        else {
                            downloadedNotes = downloadedUsers = undefined // download was discarded
                            ;
                            [unseenNotes, unseenUsers] = this.getUnseenData(...writeConflictData);
                            this.lastLimit = undefined;
                            this.lastTriedPath = undefined;
                        }
                    }
                    else {
                        this.lastLimit = fetchDetails.limit;
                        if (lastTriedPath != null)
                            this.lastTriedPath = lastTriedPath;
                    }
                    this.recordData(unseenNotes, unseenUsers);
                    if (this.notes.size <= 0) {
                        rewriteMessage($moreContainer, `No matching notes found`);
                        return;
                    }
                    addNewNotesToTable(unseenNotes);
                    if (!this.continueCycle($moreContainer, fetchDetails, downloadedNotes))
                        return;
                    const nextFetchDetails = this.getCycleFetchDetails(limit);
                    const $moreButton = rewriteLoadMoreButton();
                    if (holdOffAutoLoad) {
                        holdOffAutoLoad = false;
                    }
                    else if (this.notes.size > maxTotalAutoLoadLimit) {
                        $moreButton.append(` (no auto download because displaying more than ${maxTotalAutoLoadLimit} notes)`);
                    }
                    else if (nextFetchDetails.limit > maxSingleAutoLoadLimit) {
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
                            if (!getAutoLoad())
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
                    blockDownloads(false);
                }
            };
            if (!clearStore) {
                addNewNotesToTable(this.notes.values());
                if (this.notes.size > 0) {
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
        })();
    }
    reactToLimitUpdateForAdvancedMode() {
        this.updateRequestHintInAdvancedMode();
    }
    async updateNote($a, noteId) {
        $a.classList.add('loading');
        try {
            const response = await this.server.apiFetch(e$3 `notes/${noteId}.json`);
            if (!response.ok)
                throw new TypeError(`note reload failed`);
            const data = await response.json();
            if (!isNoteFeature(data))
                throw new TypeError(`note reload received invalid data`);
            const [newNotes, newUsers] = transformFeatureToNotesAndUsers(data);
            if (newNotes.length != 1)
                throw new TypeError(`note reload received unexpected number of notes`);
            const [newNote] = newNotes;
            if (newNote.id != noteId)
                throw new TypeError(`note reload received unexpected note`);
            $a.classList.remove('absent');
            $a.title = '';
            if (this.fetchEntry)
                await this.db.updateDataInFetch(Date.now(), this.fetchEntry, newNote, newUsers);
            this.noteTable.replaceNote(newNote, newUsers);
        }
        catch (ex) {
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
    recordData(newNotes, newUsers) {
        this.prevLastNote = this.lastNote;
        for (const note of newNotes) {
            if (this.notes.has(note.id))
                continue;
            this.notes.set(note.id, note);
            this.lastNote = note;
        }
        Object.assign(this.users, newUsers);
    }
    getUnseenData(newNotes, newUsers) {
        const unseenNotes = [];
        const unseenUsers = {};
        for (const note of newNotes) {
            if (this.notes.has(note.id))
                continue;
            unseenNotes.push(note);
        }
        for (const newUserIdString in newUsers) {
            const newUserId = Number(newUserIdString); // TODO rewrite this hack
            if (this.users[newUserId] != newUsers[newUserId])
                unseenUsers[newUserId] = newUsers[newUserId];
        }
        return [unseenNotes, unseenUsers];
    }
}
class NoteFeatureCollectionFetcherRun extends NoteFetcherRun {
    accumulateDownloadedData(downloadedNotes, downloadedUsers, data) {
        if (!isNoteFeatureCollection(data))
            return false;
        const [newNotes, newUsers] = transformFeatureCollectionToNotesAndUsers(data);
        downloadedNotes.push(...newNotes);
        Object.assign(downloadedUsers, newUsers);
        return true;
    }
}
class NoteSearchFetcherRun extends NoteFeatureCollectionFetcherRun {
    constructor(environment, query, clearStore) {
        super(environment, query, clearStore);
        this.query = query;
    }
    get request() {
        return new NoteSearchFetcherRequest;
    }
    getCycleFetchDetails(limit) {
        return getNextFetchDetails(this.query, limit, this.lastNote, this.prevLastNote, this.lastLimit);
    }
    continueCycle($moreContainer, fetchDetails, downloadedNotes) {
        if (!downloadedNotes)
            return true;
        if (downloadedNotes.length < fetchDetails.limit) {
            rewriteMessage($moreContainer, `Got all ${this.notes.size} notes`);
            return false;
        }
        return true;
    }
}
class NoteBboxFetcherRun extends NoteFeatureCollectionFetcherRun {
    constructor(environment, query, clearStore) {
        super(environment, query, clearStore);
        this.query = query;
    }
    get request() {
        return new NoteBboxFetcherRequest;
    }
    getCycleFetchDetails(limit) {
        const parametersWithoutLimit = this.request.getRequestUrlParametersWithoutLimit(this.query);
        const pathAndParameters = ['', parametersWithoutLimit + e$3 `&limit=${limit}`];
        return {
            pathAndParametersList: [pathAndParameters],
            limit
        };
    }
    continueCycle($moreContainer, fetchDetails, downloadedNotes) {
        if (this.notes.size < fetchDetails.limit) {
            rewriteMessage($moreContainer, `Got all ${this.notes.size} notes in the area`);
        }
        else {
            rewriteMessage($moreContainer, `Got all ${this.notes.size} requested notes`);
        }
        return false;
    }
}
class NoteIdsFetcherRun extends NoteFetcherRun {
    constructor(environment, query, clearStore) {
        super(environment, query, clearStore);
        this.query = query;
        this.uniqueIds = new Set();
        for (const id of query.ids) {
            if (this.uniqueIds.has(id))
                continue;
            this.uniqueIds.add(id);
            this.lastId = id;
        }
    }
    get request() {
        return new NoteIdsFetcherRequest;
    }
    getCycleFetchDetails(limit) {
        const lastTriedId = Number(this.lastTriedPath);
        let skip = true;
        const pathAndParametersList = [];
        for (const id of this.uniqueIds) {
            if (pathAndParametersList.length >= limit)
                break;
            if (skip) {
                if (this.lastTriedPath) {
                    if (id == lastTriedId) {
                        skip = false;
                    }
                    continue;
                }
                else if (this.lastNote) { // was restored from db w/o yet making any fetch
                    if (id == this.lastNote.id) {
                        skip = false;
                    }
                    continue;
                }
                else {
                    skip = false;
                }
            }
            pathAndParametersList.push([String(id), '']);
        }
        return {
            pathAndParametersList,
            limit
        };
    }
    accumulateDownloadedData(downloadedNotes, downloadedUsers, data) {
        if (!isNoteFeature(data))
            return false;
        const [newNotes, newUsers] = transformFeatureToNotesAndUsers(data);
        downloadedNotes.push(...newNotes);
        Object.assign(downloadedUsers, newUsers);
        return true;
    }
    continueCycle($moreContainer, fetchDetails, downloadedNotes) {
        if (this.lastId == null)
            return false;
        if (this.lastTriedPath != null && Number(this.lastTriedPath) == this.lastId) {
            rewriteMessage($moreContainer, `Got all ${this.notes.size} notes`);
            return false;
        }
        return true;
    }
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

const em$7 = (...ss) => makeElement('em')()(...ss);
const sup = (...ss) => makeElement('sup')()(...ss);
const code$4 = (...ss) => makeElement('code')()(...ss);
class NoteFetchDialog extends NavDialog {
    constructor($sharedCheckboxes, server, getRequestApiPaths, submitQuery) {
        super();
        this.$sharedCheckboxes = $sharedCheckboxes;
        this.server = server;
        this.getRequestApiPaths = getRequestApiPaths;
        this.submitQuery = submitQuery;
        this.$form = document.createElement('form');
        this.$advancedModeCheckbox = document.createElement('input');
        this.$limitSelect = document.createElement('select');
        this.$limitInput = document.createElement('input');
        this.$requestOutput = document.createElement('output');
    }
    resetFetch() { }
    writeSectionContent() {
        const appendIfExists = (...$es) => {
            for (const $e of $es) {
                if ($e)
                    this.$form.append($e);
            }
        };
        appendIfExists(this.makePrependedFieldset(), this.makeScopeAndOrderFieldset(), this.makeDownloadModeFieldset(), this.makeFetchControlDiv(), this.makeRequestDiv());
        this.addEventListeners();
        this.addCommonEventListeners();
        this.$section.append(this.$form);
        this.writeExtraForms();
    }
    populateInputs(query) {
        this.populateInputsWithoutUpdatingRequest(query);
        this.updateRequest();
    }
    get getLimit() {
        return () => {
            let limit;
            if (this.$advancedModeCheckbox.checked) {
                limit = Number(this.$limitInput.value);
            }
            else {
                limit = Number(this.$limitSelect.value);
            }
            if (Number.isInteger(limit) && limit >= 1 && limit <= 10000)
                return limit;
            return this.limitDefaultValue;
        };
    }
    updateRequest() {
        const knownTypes = {
            json: `https://wiki.openstreetmap.org/wiki/GeoJSON`,
            gpx: `https://www.topografix.com/GPX/1/1/`,
            rss: `https://www.rssboard.org/rss-specification`, // osm wiki doesn't describe rss format
        };
        const appendLinkIfKnown = (type) => {
            const url = knownTypes[type];
            if (url == null)
                return;
            this.$requestOutput.append(sup(makeLink(`[?]`, url)));
        };
        const query = this.constructQuery();
        if (!query) {
            this.$requestOutput.replaceChildren(`invalid request`);
            return;
        }
        const requestApiPaths = this.getRequestApiPaths(query, this.getLimit());
        if (requestApiPaths.length == 0) {
            this.$requestOutput.replaceChildren(`invalid request`);
            return;
        }
        const [[mainType, mainApiPath], ...otherRequestApiPaths] = requestApiPaths;
        const mainUrl = this.server.getApiUrl(mainApiPath);
        const $a = makeLink(mainUrl, mainUrl);
        $a.classList.add('request');
        this.$requestOutput.replaceChildren(code$4($a), ` in ${mainType} format`);
        appendLinkIfKnown(mainType);
        if (otherRequestApiPaths.length > 0) {
            this.$requestOutput.append(` or other formats: `);
        }
        let first = true;
        for (const [type, apiPath] of otherRequestApiPaths) {
            if (first) {
                first = false;
            }
            else {
                this.$requestOutput.append(`, `);
            }
            const url = this.server.getApiUrl(apiPath);
            this.$requestOutput.append(code$4(makeLink(type, url)));
            appendLinkIfKnown(type);
        }
    }
    makePrependedFieldset() {
        const $fieldset = document.createElement('fieldset');
        const $legend = document.createElement('legend');
        this.writePrependedFieldset($fieldset, $legend);
        if ($fieldset.childElementCount == 0)
            return;
        $fieldset.prepend($legend);
        return $fieldset;
    }
    makeScopeAndOrderFieldset() {
        const $fieldset = document.createElement('fieldset');
        const $legend = document.createElement('legend');
        $legend.textContent = `Scope and order`;
        this.writeScopeAndOrderFieldset($fieldset, $legend);
        if ($fieldset.childElementCount == 0)
            return;
        $fieldset.prepend($legend);
        return $fieldset;
    }
    makeDownloadModeFieldset() {
        const $fieldset = document.createElement('fieldset');
        // TODO (re)store input values
        const $legend = document.createElement('legend');
        $legend.textContent = `Download mode (can change anytime)`;
        $fieldset.append($legend);
        {
            for (const limitValue of this.limitValues) {
                const value = String(limitValue);
                const selected = limitValue == this.limitDefaultValue;
                this.$limitSelect.append(new Option(value, value, selected, selected));
            }
            this.$limitInput.type = 'number';
            this.$limitInput.min = '1';
            this.$limitInput.max = '10000';
            this.$limitInput.value = String(this.limitDefaultValue);
            $fieldset.append(makeDiv('non-advanced-input')(this.limitLeadText, makeLabel()(this.limitLabelBeforeText, this.$limitSelect, this.limitLabelAfterText)), makeDiv('advanced-input')(this.limitLeadText, makeLabel()(this.limitLabelBeforeText, this.$limitInput, this.limitLabelAfterText, (this.limitIsParameter
                ? makeElement('span')('advanced-hint')(` (`, code$4('limit'), ` parameter)`)
                : makeElement('span')('advanced-hint')(` (will make this many API requests each time it downloads more notes)`)))));
        }
        this.writeDownloadModeFieldset($fieldset, $legend);
        const $showImagesCheckbox = document.createElement('input');
        $showImagesCheckbox.type = 'checkbox';
        this.$sharedCheckboxes.showImages.push($showImagesCheckbox);
        $fieldset.append(makeDiv()(makeLabel()($showImagesCheckbox, ` Load and show images from StreetComplete`)));
        this.$advancedModeCheckbox.type = 'checkbox';
        this.$sharedCheckboxes.advancedMode.push(this.$advancedModeCheckbox);
        $fieldset.append(makeDiv()(makeLabel()(this.$advancedModeCheckbox, ` Advanced mode`)));
        return $fieldset;
    }
    makeRequestDiv() {
        return makeDiv('advanced-hint')(`Resulting request: `, this.$requestOutput);
    }
    addCommonEventListeners() {
        for (const $input of this.listQueryChangingInputs()) {
            $input.addEventListener('input', () => this.updateRequest());
        }
        this.$limitSelect.addEventListener('input', () => {
            this.$limitInput.value = this.$limitSelect.value;
            this.updateRequest();
            if (this.limitChangeListener)
                this.limitChangeListener();
        });
        this.$limitInput.addEventListener('input', () => {
            this.$limitSelect.value = String(findClosestValue(Number(this.$limitInput.value), this.limitValues));
            this.updateRequest();
            if (this.limitChangeListener)
                this.limitChangeListener();
            function findClosestValue(vTarget, vCandidates) {
                let dResult = Infinity;
                let vResult = vTarget;
                for (const vCandidate of vCandidates) {
                    const dCandidate = Math.abs(vTarget - vCandidate);
                    if (dCandidate < dResult) {
                        dResult = dCandidate;
                        vResult = vCandidate;
                    }
                }
                return vResult;
            }
        });
        this.$form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const query = this.constructQuery();
            if (!query)
                return;
            this.submitQuery(query);
        });
    }
    reactToAdvancedModeChange() {
        if (this.$limitSelect.value != this.$limitInput.value) {
            this.updateRequest();
            if (this.limitChangeListener)
                this.limitChangeListener();
        }
    }
    writePrependedFieldset($fieldset, $legend) { }
    writeExtraForms() { }
}
function mixinWithAutoLoadCheckbox(c) {
    class WithAutoLoadCheckbox extends c {
        constructor() {
            super(...arguments);
            this.$autoLoadCheckbox = document.createElement('input');
        }
        get getAutoLoad() {
            return () => this.$autoLoadCheckbox.checked;
        }
    }
    return WithAutoLoadCheckbox;
}
function mixinWithFetchButton(c) {
    class WithFetchButton extends c {
        constructor() {
            super(...arguments);
            this.$fetchButton = document.createElement('button');
        }
        makeFetchControlDiv() {
            this.$fetchButton.textContent = `Fetch notes`;
            this.$fetchButton.type = 'submit';
            return makeDiv('major-input')(this.$fetchButton);
        }
        disableFetchControl(disabled) {
            this.$fetchButton.disabled = disabled;
        }
    }
    return WithFetchButton;
}
class NoteQueryFetchDialog extends mixinWithFetchButton(NoteFetchDialog) {
    constructor() {
        super(...arguments);
        this.$closedInput = document.createElement('input');
        this.$closedSelect = document.createElement('select');
    }
    writeScopeAndOrderFieldset($fieldset) {
        {
            $fieldset.append(makeDiv('advanced-hint')(...this.makeLeadAdvancedHint()));
        }
        {
            const $table = document.createElement('table');
            {
                const $row = $table.insertRow();
                $row.append(makeElement('th')()(`parameter`), makeElement('th')()(`description`));
            }
            const makeTr = (cellType) => (...sss) => makeElement('tr')()(...sss.map(ss => makeElement(cellType)()(...ss)));
            const closedDescriptionItems = [
                `Max number of days for closed note to be visible. `,
                `In `, em$7(`advanced mode`), ` can be entered as a numeric value. `,
                `When `, em$7(`advanced mode`), ` is disabled this parameter is available as a dropdown menu with the following values: `,
                makeElement('table')()(makeTr('th')([`label`], [`value`], [`description`]), makeTr('td')([em$7(`both open and closed`)], [code$4(`-1`)], [
                    `Special value to ignore how long ago notes were closed. `,
                    `This is the default value for `, em$7(`note-viewer`), ` because it's the most useful one in conjunction with searching for a given user's notes.`
                ]), makeTr('td')([em$7(`open and recently closed`)], [code$4(`7`)], [
                    `The most common value used in other apps like the OSM website.`
                ]), makeTr('td')([em$7(`only open`)], [code$4(`0`)], [
                    `Ignore closed notes.`
                ]))
            ];
            for (const [parameter, $input, descriptionItems] of this.listParameters(closedDescriptionItems)) {
                const $row = $table.insertRow();
                const $parameter = makeElement('code')('linked-parameter')(parameter); // TODO <a> or other focusable element
                $parameter.onclick = () => $input.focus();
                $row.insertCell().append($parameter);
                $row.insertCell().append(...descriptionItems);
            }
            $fieldset.append(makeDiv('advanced-hint')(makeElement('details')()(makeElement('summary')()(`Supported parameters`), $table)));
        }
        this.writeScopeAndOrderFieldsetBeforeClosedLine($fieldset);
        {
            this.$closedInput.type = 'number';
            this.$closedInput.min = '-1';
            this.$closedInput.value = '-1';
            this.$closedSelect.append(new Option(`both open and closed`, '-1'), new Option(`open and recently closed`, '7'), new Option(`only open`, '0'));
            const $closedLine = makeDiv()(`Fetch `, makeElement('span')('non-advanced-input')(this.$closedSelect), ` matching notes `, makeLabel('advanced-input')(`closed no more than `, this.$closedInput, makeElement('span')('advanced-hint')(` (`, code$4('closed'), ` parameter)`), ` days ago`));
            this.appendToClosedLine($closedLine);
            $fieldset.append($closedLine);
        }
    }
    addEventListeners() {
        this.addEventListenersBeforeClosedLine();
        this.$closedSelect.addEventListener('input', () => {
            this.$closedInput.value = this.$closedSelect.value;
        });
        this.$closedInput.addEventListener('input', () => {
            this.$closedSelect.value = String(restrictClosedSelectValue(Number(this.$closedInput.value)));
        });
    }
    populateInputsWithoutUpdatingRequest(query) {
        this.populateInputsWithoutUpdatingRequestExceptForClosedInput(query);
        if (query && (query.mode == 'search' || query.mode == 'bbox')) {
            this.$closedInput.value = String(query.closed);
            this.$closedSelect.value = String(restrictClosedSelectValue(query.closed));
        }
        else {
            this.$closedInput.value = '-1';
            this.$closedSelect.value = '-1';
        }
    }
    get closedValue() {
        return (this.$advancedModeCheckbox.checked
            ? this.$closedInput.value
            : this.$closedSelect.value);
    }
}
class NoteIdsFetchDialog extends mixinWithAutoLoadCheckbox(NoteFetchDialog) {
    constructor() {
        super(...arguments);
        this.limitValues = [5, 20];
        this.limitDefaultValue = 5;
        this.limitLeadText = `Download these `;
        this.limitLabelBeforeText = `in batches of `;
        this.limitLabelAfterText = ` notes`;
        this.limitIsParameter = false;
    }
    writeDownloadModeFieldset($fieldset) {
        {
            this.$autoLoadCheckbox.type = 'checkbox';
            this.$autoLoadCheckbox.checked = true;
            $fieldset.append(makeDiv()(makeLabel()(this.$autoLoadCheckbox, ` Automatically load more notes when scrolled to the end of the table`)));
        }
    }
}
function restrictClosedSelectValue(v) {
    if (v < 0) {
        return -1;
    }
    else if (v < 1) {
        return 0;
    }
    else {
        return 7;
    }
}

const em$6 = (...ss) => makeElement('em')()(...ss);
const code$3 = (...ss) => makeElement('code')()(...ss);
const rq$1 = (param) => makeElement('span')('advanced-hint')(` (`, code$3(param), ` parameter)`);
const rq2 = (param1, param2) => makeElement('span')('advanced-hint')(` (`, code$3(param1), ` or `, code$3(param2), ` parameter)`);
class NoteSearchFetchDialog extends mixinWithAutoLoadCheckbox(NoteQueryFetchDialog) {
    constructor() {
        super(...arguments);
        this.shortTitle = `Search`;
        this.title = `Search notes for user / text / date range`;
        this.$userInput = document.createElement('input');
        this.$textInput = document.createElement('input');
        this.$fromInput = document.createElement('input');
        this.$toInput = document.createElement('input');
        this.$sortSelect = document.createElement('select');
        this.$orderSelect = document.createElement('select');
        this.limitValues = [20, 100, 500, 2500];
        this.limitDefaultValue = 20;
        this.limitLeadText = `Download these `;
        this.limitLabelBeforeText = `in batches of `;
        this.limitLabelAfterText = ` notes`;
        this.limitIsParameter = true;
    }
    makeLeadAdvancedHint() {
        return [
            `Make a `, makeLink(`search for notes`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Search_for_notes:_GET_/api/0.6/notes/search`),
            ` request at `, code$3(this.server.getApiUrl(`notes/search?`), em$6(`parameters`)), `; see `, em$6(`parameters`), ` below.`
        ];
    }
    listParameters(closedDescriptionItems) {
        return [
            ['q', this.$textInput, [
                    `Comment text search query. `,
                    `This is an optional parameter, despite the OSM wiki saying that it's required, which is also suggested by the `, em$6(`search`), ` API call name. `,
                    `Skipping this parameter disables text searching, all notes that fit other search criteria will go through. `,
                    `Searching is done with English stemming rules and may not work correctly for other languages.`
                ]],
            ['limit', this.$limitInput, [
                    `Max number of notes to fetch. `,
                    `For `, em$6(`search`), ` mode it corresponds to the size of one batch of notes since it's possible to load additional batches by pressing the `, em$6(`Load more`), ` button below the note table. `,
                    `This additional downloading is implemented by manipulating the requested date range.`
                ]],
            ['closed', this.$closedInput, closedDescriptionItems],
            ['display_name', this.$userInput, [
                    `Name of a user interacting with a note. `,
                    `Both this parameter and the next one are optional. `,
                    `Providing one of them limits the returned notes to those that were interacted by the given user. `,
                    `This interaction is not limited to creating the note, closing/reopening/commenting also counts. `,
                    `It makes no sense to provide both of these parameters because in this case `, code$3('user'), ` is going to be ignored by the API, therefore `, em$6(`note-viewer`), `'s UI has only one input for both. `,
                    `Whether `, code$3('display_name'), ` or `, code$3('user'), ` is passed to the API depends on the input value. `,
                    `The `, code$3('display_name'), ` parameter is passed if the input value contains `, code$3(`/`), ` or doesn't start with `, code$3(`#`), `. `,
                    `Value containing `, code$3(`/`), ` is interpreted as a URL. `,
                    `In case it's an OSM URL containing a username, this name is extracted and passed as `, code$3('display_name'), `. `,
                    `Value starting with `, code$3(`#`), ` is treated as a user id, see the next parameter. `,
                    `Everything else is treated as a username.`
                ]],
            ['user', this.$userInput, [
                    `Id of a user interacting with a note. `,
                    `As stated above, the `, code$3('user'), ` parameter is passed if the input value starts with `, code$3(`#`), `. `,
                    `In this case the remaining part of the value is treated as a user id number. `,
                    `Ids and URLs can be unambiguously detected in the input because usernames can't contain any of the following characters: `, code$3(`/;.,?%#`), `.`
                ]],
            ['from', this.$fromInput, [
                    `Beginning of a date range. `,
                    `This parameter is optional but if not provided the API will also ignore the `, code$3('to'), ` parameter. `,
                    em$6(`Note-viewer`), ` makes `, code$3('from'), ` actually optional by providing a value far enough in the past if `, code$3('to'), ` value is entered while `, code$3('from'), ` value is not. `,
                    `Also both `, code$3('from'), ` and `, code$3('to'), ` parameters are altered in `, em$6(`Load more`), ` fetches in order to limit the note selection to notes that are not yet downloaded.`
                ]],
            ['to', this.$toInput, [
                    `End of a date range.`
                ]],
            ['sort', this.$sortSelect, [
                    `Date to sort the notes. `,
                    `This can be either a create date or an update date. `,
                    `Sorting by update dates presents some technical difficulties which may lead to unexpected results if additional notes are loaded with `, em$6(`Load more`), `. `
                ]],
            ['order', this.$orderSelect, [
                    `Sort order. `,
                    `Ascending or descending.`
                ]],
        ];
    }
    writeScopeAndOrderFieldsetBeforeClosedLine($fieldset) {
        {
            this.$userInput.type = 'text';
            this.$userInput.name = 'user';
            $fieldset.append(makeDiv('major-input')(makeLabel()(`OSM username, URL or #id`, rq2('display_name', 'user'), `: `, this.$userInput)));
        }
        {
            this.$textInput.type = 'text';
            this.$textInput.name = 'text';
            $fieldset.append(makeDiv('major-input')(makeLabel()(`Comment text search query`, rq$1('q'), `: `, this.$textInput)));
        }
        {
            this.$fromInput.type = 'text';
            this.$fromInput.size = 20;
            this.$fromInput.name = 'from';
            this.$toInput.type = 'text';
            this.$toInput.size = 20;
            this.$toInput.name = 'to';
            $fieldset.append(makeDiv()(`Date range: `, makeLabel()(`from`, rq$1('from'), ` `, this.$fromInput), ` `, makeLabel()(`to`, rq$1('to'), ` `, this.$toInput)));
        }
    }
    appendToClosedLine($div) {
        this.$sortSelect.append(new Option(`creation`, 'created_at'), new Option(`last update`, 'updated_at'));
        this.$orderSelect.append(new Option('newest'), new Option('oldest'));
        $div.append(` `, makeLabel('inline')(`sorted by `, this.$sortSelect, rq$1('sort'), ` date`), `, `, makeLabel('inline')(this.$orderSelect, rq$1('order'), ` first`));
    }
    writeDownloadModeFieldset($fieldset) {
        {
            this.$autoLoadCheckbox.type = 'checkbox';
            this.$autoLoadCheckbox.checked = true;
            $fieldset.append(makeDiv()(makeLabel()(this.$autoLoadCheckbox, ` Automatically load more notes when scrolled to the end of the table`)));
        }
    }
    populateInputsWithoutUpdatingRequestExceptForClosedInput(query) {
        if (query && query.mode != 'search')
            return;
        if (query?.display_name) {
            this.$userInput.value = query.display_name;
        }
        else if (query?.user) {
            this.$userInput.value = '#' + query.user;
        }
        else {
            this.$userInput.value = '';
        }
        this.$textInput.value = query?.q ?? '';
        this.$fromInput.value = toReadableDate(query?.from);
        this.$toInput.value = toReadableDate(query?.to);
        this.$sortSelect.value = query?.sort ?? 'created_at';
        this.$orderSelect.value = query?.order ?? 'newest';
    }
    addEventListenersBeforeClosedLine() {
        this.$userInput.addEventListener('input', () => {
            const userQuery = toUserQuery(this.server, this.$userInput.value);
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
        return makeNoteSearchQueryFromValues(this.server, this.$userInput.value, this.$textInput.value, this.$fromInput.value, this.$toInput.value, this.closedValue, this.$sortSelect.value, this.$orderSelect.value);
    }
    listQueryChangingInputs() {
        return [
            this.$userInput, this.$textInput, this.$fromInput, this.$toInput,
            this.$closedInput, this.$closedSelect, this.$sortSelect, this.$orderSelect
        ];
    }
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
    constructor(nominatim, fetchFromCache, storeToCache) {
        this.nominatim = nominatim;
        this.fetchFromCache = fetchFromCache;
        this.storeToCache = storeToCache;
    }
    getParameters(q, west, south, east, north) {
        const e = makeEscapeTag(encodeURIComponent);
        let parameters = e `limit=1&q=${q}`;
        if (east > west && north > south && east - west < 360) {
            const viewbox = `${west},${south},${east},${north}`;
            parameters += e `&viewbox=${viewbox}`;
        }
        return parameters;
    }
    async fetch(timestamp, q, west, south, east, north) {
        const parameters = this.getParameters(q, west, south, east, north);
        const cacheBbox = await this.fetchFromCache(timestamp, parameters);
        if (isNominatimBbox(cacheBbox)) {
            await this.storeToCache(timestamp, parameters, cacheBbox);
            return cacheBbox;
        }
        const data = await this.nominatim.search(parameters);
        if (!Array.isArray(data))
            throw new TypeError('Nominatim error: invalid data');
        if (data.length <= 0)
            throw new TypeError('Nominatim failed to find the place');
        const placeData = data[0];
        const bbox = placeData?.boundingbox;
        if (!isNominatimBbox(bbox))
            throw new TypeError('Nominatim error: invalid bbox data');
        await this.storeToCache(timestamp, parameters, bbox);
        return bbox;
    }
}

const em$5 = (...ss) => makeElement('em')()(...ss);
const code$2 = (...ss) => makeElement('code')()(...ss);
const spanRequest$1 = (...ss) => makeElement('span')('advanced-hint')(...ss);
class NominatimSubForm {
    constructor(nominatim, getMapBounds, setBbox) {
        this.nominatim = nominatim;
        this.getMapBounds = getMapBounds;
        this.setBbox = setBbox;
        this.$form = document.createElement('form');
        this.$input = document.createElement('input');
        this.$button = document.createElement('button');
        this.$requestOutput = document.createElement('output');
        this.bboxFetcher = new NominatimBboxFetcher(nominatim, ...makeDumbCache() // TODO real cache in db
        );
        this.$form.id = 'nominatim-form';
    }
    write($fieldset) {
        $fieldset.append(makeDiv('advanced-hint')(`Make `, makeLink(`Nominatim search query`, `https://nominatim.org/release-docs/develop/api/Search/`), ` at `, code$2(this.nominatim.getSearchUrl(''), em$5(`parameters`)), `; see `, em$5(`parameters`), ` above and below.`));
        this.$input.type = 'text';
        this.$input.required = true;
        this.$input.classList.add('no-invalid-indication'); // because it's inside another form that doesn't require it, don't indicate that it's invalid
        this.$input.name = 'place';
        this.$input.setAttribute('form', 'nominatim-form');
        this.$button.textContent = 'Get';
        this.$button.setAttribute('form', 'nominatim-form');
        $fieldset.append(makeDiv('text-button-input')(makeLabel()(`Or get bounding box by place name from Nominatim`, spanRequest$1(` (`, code$2('q'), ` Nominatim parameter)`), `: `, this.$input), this.$button));
        $fieldset.append(makeDiv('advanced-hint')(`Resulting Nominatim request: `, this.$requestOutput));
    }
    updateRequest() {
        const bounds = this.getMapBounds();
        const parameters = this.bboxFetcher.getParameters(this.$input.value, bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
        const url = this.nominatim.getSearchUrl(parameters);
        const $a = makeLink(url, url);
        $a.classList.add('request');
        this.$requestOutput.replaceChildren(code$2($a));
    }
    addEventListeners() {
        this.$input.addEventListener('input', () => this.updateRequest());
        this.$form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            this.$button.disabled = true;
            this.$button.classList.remove('error');
            try {
                const bounds = this.getMapBounds();
                const bbox = await this.bboxFetcher.fetch(Date.now(), this.$input.value, bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
                this.setBbox(bbox);
            }
            catch (ex) {
                this.$button.classList.add('error');
                if (ex instanceof TypeError) {
                    this.$button.title = ex.message;
                }
                else {
                    this.$button.title = `unknown error ${ex}`;
                }
            }
            finally {
                this.$button.disabled = false;
            }
        });
    }
}
function makeDumbCache() {
    const cache = new Map();
    return [
        async (timestamp, url) => cache.get(url),
        async (timestamp, url, bbox) => cache.set(url, bbox)
    ];
}

const em$4 = (...ss) => makeElement('em')()(...ss);
const code$1 = (...ss) => makeElement('code')()(...ss);
const rq = (param) => makeElement('span')('advanced-hint')(` (`, code$1(param), ` parameter)`);
const spanRequest = (...ss) => makeElement('span')('advanced-hint')(...ss);
class NoteBboxFetchDialog extends NoteQueryFetchDialog {
    constructor($sharedCheckboxes, server, getRequestApiPaths, submitQuery, map) {
        super($sharedCheckboxes, server, getRequestApiPaths, submitQuery);
        this.map = map;
        this.shortTitle = `BBox`;
        this.title = `Get notes inside rectangular area`;
        this.$trackMapSelect = document.createElement('select');
        this.$trackMapZoomNotice = makeElement('span')('notice')();
        this.$bboxInput = document.createElement('input');
        this.limitValues = [20, 100, 500, 2500, 10000];
        this.limitDefaultValue = 100; // higher default limit because no progressive loads possible
        this.limitLeadText = `Download `;
        this.limitLabelBeforeText = `at most `;
        this.limitLabelAfterText = ` notes`;
        this.limitIsParameter = true;
        if (server.nominatim) {
            this.nominatimSubForm = new NominatimSubForm(server.nominatim, () => map.bounds, (bbox) => {
                const [minLat, maxLat, minLon, maxLon] = bbox;
                this.setBbox(minLon, minLat, maxLon, maxLat);
                this.$trackMapSelect.value = 'nothing';
                this.map.fitBounds([[Number(minLat), Number(minLon)], [Number(maxLat), Number(maxLon)]]);
            });
        }
    }
    resetFetch() {
        this.mapBoundsForFreezeRestore = undefined;
    }
    get getAutoLoad() {
        return () => false;
    }
    populateInputs(query) {
        super.populateInputs(query);
        this.nominatimSubForm?.updateRequest();
    }
    writeExtraForms() {
        if (this.nominatimSubForm) {
            this.$section.append(this.nominatimSubForm.$form);
        }
    }
    makeLeadAdvancedHint() {
        return [
            `Get `, makeLink(`notes by bounding box`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`),
            ` request at `, code$1(this.server.getApiUrl(`notes?`), em$4(`parameters`)), `; see `, em$4(`parameters`), ` below.`
        ];
    }
    listParameters(closedDescriptionItems) {
        return [
            ['bbox', this.$bboxInput, [
                    `Bounding box. `,
                    `Expect `, em$4(`The maximum bbox size is ..., and your request was too large`), ` error if the bounding box is too large.`
                ]],
            ['limit', this.$limitInput, [
                    `Max number of notes to fetch. `,
                    `For `, em$4(`bbox`), ` mode is corresponds to a total number of notes, not just a batch size. `,
                    `It's impossible to download additional batches of notes because the API call used by this mode lacks date range parameters.`
                ]],
            ['closed', this.$closedInput, closedDescriptionItems],
        ];
    }
    writeScopeAndOrderFieldsetBeforeClosedLine($fieldset) {
        {
            this.$trackMapSelect.append(new Option(`Do nothing`, 'nothing'), new Option(`Update bounding box input`, 'bbox', true, true), new Option(`Fetch notes`, 'fetch'));
            $fieldset.append(makeDiv()(makeLabel('inline')(this.$trackMapSelect, ` on map view changes`), ` `, this.$trackMapZoomNotice));
        }
        {
            this.$bboxInput.type = 'text';
            this.$bboxInput.name = 'bbox';
            this.$bboxInput.required = true; // otherwise could submit empty bbox without entering anything
            $fieldset.append(makeDiv('major-input')(makeLabel()(`Bounding box (`, tip(`left`, `western-most (min) longitude`), `, `, tip(`bottom`, `southern-most (min) latitude`), `, `, tip(`right`, `eastern-most (max) longitude`), `, `, tip(`top`, `northern-most (max) latitude`), `)`, rq('bbox'), spanRequest(` (also `, code$1('west'), `, `, code$1('south'), `, `, code$1('east'), `, `, code$1('north'), ` Nominatim parameters)`), `: `, this.$bboxInput)));
            function tip(text, title) {
                const $span = document.createElement('span');
                $span.textContent = text;
                $span.title = title;
                return $span;
            }
        }
        if (this.nominatimSubForm) {
            this.nominatimSubForm.write($fieldset);
        }
    }
    appendToClosedLine($div) {
        $div.append(` `, `sorted by last update date `, `newest first`);
    }
    writeDownloadModeFieldset($fieldset) {
    }
    populateInputsWithoutUpdatingRequestExceptForClosedInput(query) {
        if (query && query.mode != 'bbox')
            return;
        this.$bboxInput.value = query?.bbox ?? '';
    }
    addEventListenersBeforeClosedLine() {
        const updateTrackMapZoomNotice = () => {
            if (this.$trackMapSelect.value != 'fetch') {
                this.$trackMapZoomNotice.classList.remove('error');
                this.$trackMapZoomNotice.innerText = '';
            }
            else {
                if (this.map.zoom >= 8) {
                    this.$trackMapZoomNotice.classList.remove('error');
                    this.$trackMapZoomNotice.innerText = `(fetching will stop on zooms lower than 8)`;
                }
                else {
                    this.$trackMapZoomNotice.classList.add('error');
                    this.$trackMapZoomNotice.innerText = `(fetching will start on zooms 8 or higher)`;
                }
            }
        };
        const trackMap = () => {
            updateTrackMapZoomNotice();
            if (this.$trackMapSelect.value == 'bbox' || this.$trackMapSelect.value == 'fetch') {
                const bounds = this.map.bounds;
                this.setBbox(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
            }
            this.nominatimSubForm?.updateRequest();
        };
        const updateNotesIfNeeded = () => {
            if (this.isOpen() && this.$trackMapSelect.value == 'fetch' && this.map.zoom >= 8) {
                this.$form.requestSubmit();
            }
        };
        updateTrackMapZoomNotice();
        this.map.onMoveEnd(() => {
            trackMap();
            if (this.isOpen() && this.mapBoundsForFreezeRestore) {
                this.mapBoundsForFreezeRestore = undefined;
            }
            else {
                updateNotesIfNeeded();
            }
        });
        this.$trackMapSelect.addEventListener('input', () => {
            this.map.freezeMode = this.getMapFreezeMode(); // don't update freeze mode on map moves
            trackMap();
            updateNotesIfNeeded();
        });
        this.$bboxInput.addEventListener('input', () => {
            if (!this.validateBbox())
                return;
            this.$trackMapSelect.value = 'nothing';
        });
        if (this.nominatimSubForm) {
            this.nominatimSubForm.addEventListeners();
        }
    }
    constructQuery() {
        return makeNoteBboxQueryFromValues(this.$bboxInput.value, this.closedValue);
    }
    listQueryChangingInputs() {
        return [
            this.$bboxInput, this.$closedInput, this.$closedSelect
        ];
    }
    onOpen() {
        if (this.getMapFreezeMode() == 'full' && this.mapBoundsForFreezeRestore) {
            this.map.fitBounds(this.mapBoundsForFreezeRestore); // assumes map is not yet frozen
            // this.restoreMapBoundsForFreeze=undefined to be done in map move end listener
        }
        else {
            this.mapBoundsForFreezeRestore = undefined;
        }
        this.map.freezeMode = this.getMapFreezeMode();
    }
    onClose() {
        if (this.getMapFreezeMode() == 'full') {
            this.mapBoundsForFreezeRestore = this.map.bounds;
        }
        this.map.freezeMode = 'no';
    }
    getMapFreezeMode() {
        if (this.$trackMapSelect.value == 'fetch')
            return 'full';
        if (this.$trackMapSelect.value == 'bbox')
            return 'initial';
        return 'no';
    }
    setBbox(west, south, east, north) {
        // (left,bottom,right,top)
        this.$bboxInput.value = west + ',' + south + ',' + east + ',' + north;
        this.validateBbox();
        this.updateRequest();
    }
    validateBbox() {
        const splitValue = this.$bboxInput.value.split(',');
        if (splitValue.length != 4) {
            this.$bboxInput.setCustomValidity(`must contain four comma-separated values`);
            return false;
        }
        for (const number of splitValue) {
            if (!isFinite(Number(number))) {
                this.$bboxInput.setCustomValidity(`values must be numbers, "${number}" is not a number`);
                return false;
            }
        }
        this.$bboxInput.setCustomValidity('');
        return true;
    }
}

const em$3 = (...ss) => makeElement('em')()(...ss);
const p$5 = (...ss) => makeElement('p')()(...ss);
const ol = (...ss) => makeElement('ol')()(...ss);
const ul$2 = (...ss) => makeElement('ul')()(...ss);
const li$2 = (...ss) => makeElement('li')()(...ss);
class NoteXmlFetchDialog extends NoteIdsFetchDialog {
    constructor() {
        super(...arguments);
        this.shortTitle = `XML`;
        this.title = `Load an XML file containing note ids, then fetch them`;
        this.$neisForm = document.createElement('form');
        this.$neisCountryInput = document.createElement('input');
        this.$neisStatusSelect = document.createElement('select');
        this.$neisFeedForm = document.createElement('form');
        this.$neisFeedCountryInput = document.createElement('input');
        this.$neisFeedStatusInput = document.createElement('input');
        this.$neisCustomForm = document.createElement('form');
        this.$neisCustomCountryInput = document.createElement('input');
        this.$neisCustomStatusInput = document.createElement('input');
        this.$neisButton = document.createElement('button');
        this.$selectorInput = document.createElement('input');
        this.$attributeInput = document.createElement('input');
        this.$fileInput = document.createElement('input');
    }
    writeExtraForms() {
        this.$neisFeedForm.action = `https://resultmaps.neis-one.org/osm-notes-country-feed`;
        this.$neisFeedForm.target = '_blank'; // if browser chooses to navigate instead of download, open a new window; file download can't be forced without cooperation from server
        this.$neisFeedForm.append(hideInput(this.$neisFeedCountryInput, 'c'), hideInput(this.$neisFeedStatusInput, 'a'));
        this.$neisCustomForm.action = `https://resultmaps.neis-one.org/osm-notes-country-custom`;
        this.$neisCustomForm.target = '_blank';
        this.$neisCustomForm.append(hideInput(this.$neisCustomCountryInput, 'c'), hideInput(this.$neisCustomStatusInput, 'query'));
        this.$neisForm.id = 'neis-form';
        this.$section.append(this.$neisForm, this.$neisFeedForm, this.$neisCustomForm // fully hidden forms, need to be inserted into document anyway otherwise submit doesn't work
        );
        function hideInput($input, name) {
            $input.name = name;
            $input.type = 'hidden';
            return $input;
        }
    }
    makeFetchControlDiv() {
        this.$fileInput.type = 'file';
        return makeDiv('major-input')(makeLabel('file-reader')(makeElement('span')('over')(`Read XML file`), makeElement('span')('colon')(`:`), ` `, this.$fileInput));
    }
    disableFetchControl(disabled) {
        this.$fileInput.disabled = disabled;
    }
    writePrependedFieldset($fieldset, $legend) {
        $legend.append(`Get notes in a country from `, em$3(`resultmaps.neis-one.org`));
        {
            $fieldset.append(makeDiv()(makeElement('details')()(makeElement('summary')()(`How to get notes from `, em$3(`resultmaps.neis-one.org`)), ol(li$2(`Select a country and a note status, then click `, em$3(`Download feed file`), `. `, `After this one of the following things will happen, depending on your browser: `, ul$2(li$2(`The feed file is downloaded, which is what you want.`), li$2(`Browser opens a new tab with the feed file. In this case manually save the page.`)), `Also the `, em$3(`selector`), ` and `, em$3(`attribute`), ` fields below are updated to extract note ids from this feed.`), li$2(`Open the file with one of these two methods: `, ul$2(li$2(`Click the `, em$3(`Read XML file`), ` area and use a file picker dialog.`), li$2(`Drag and drop the file from browser downloads panel/window into the `, em$3(`Read XML file`), ` area. This is likely a faster method.`)))), p$5(`Unfortunately these steps of downloading/opening a file cannot be avoided because `, makeLink(`neis-one.org`, `https://resultmaps.neis-one.org/osm-notes`), ` server is not configured to let its data to be accessed by browser scripts.`))));
            this.$neisCountryInput.type = 'text';
            this.$neisCountryInput.required = true;
            this.$neisCountryInput.classList.add('no-invalid-indication'); // because it's inside another form that doesn't require it, don't indicate that it's invalid
            this.$neisCountryInput.name = 'country';
            this.$neisCountryInput.setAttribute('form', 'neis-form');
            const $datalist = document.createElement('datalist');
            $datalist.id = 'neis-countries-list';
            $datalist.append(...neisCountries.map(c => new Option(c)));
            this.$neisCountryInput.setAttribute('list', 'neis-countries-list');
            $fieldset.append(makeDiv('major-input')(makeLabel()(`Country: `, this.$neisCountryInput, $datalist)));
        }
        {
            this.$neisStatusSelect.name = 'status';
            this.$neisStatusSelect.setAttribute('form', 'neis-form');
            this.$neisStatusSelect.append(...neisFeedStatuses.map(status => new Option(`${status} (up to a week old)`, status)), new Option(`last updated 500`, 'custom'), new Option(`last open 10000`, 'custom-open'));
            $fieldset.append(makeDiv()(makeLabel()(`Get `, this.$neisStatusSelect, ` notes`), ` for this country`));
        }
        {
            this.$neisButton.textContent = 'Download feed file and populate XML fields below';
            this.$neisButton.setAttribute('form', 'neis-form');
            $fieldset.append(makeDiv('major-input')(this.$neisButton));
        }
    }
    writeScopeAndOrderFieldset($fieldset, $legend) {
        $legend.textContent = `Or read custom XML file`;
        {
            $fieldset.append(makeDiv('advanced-hint')(`Load an arbitrary XML file containing note ids or links. `, `Elements containing the ids are selected by a `, makeLink(`css selector`, `https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors`), ` provided below. `, `Inside the elements ids are looked for in an `, em$3(`attribute`), ` if specified below, or in text content. `, `After that download each note `, makeLink(`by its id`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Read:_GET_/api/0.6/notes/#id`), `.`));
        }
        {
            this.$selectorInput.type = 'text';
            this.$selectorInput.name = 'selector';
            this.$selectorInput.required = true;
            $fieldset.append(makeDiv('major-input')(makeLabel()(`CSS selector matching XML elements with note ids: `, this.$selectorInput)));
        }
        {
            this.$attributeInput.type = 'text';
            this.$attributeInput.name = 'attribute';
            $fieldset.append(makeDiv('major-input')(makeLabel()(`Attribute of matched XML elements containing note id (leave blank if note id is in text content): `, this.$attributeInput)));
        }
    }
    populateInputsWithoutUpdatingRequest(query) {
        return; // TODO clear inputs
    }
    addEventListeners() {
        this.$neisForm.addEventListener('submit', ev => {
            ev.preventDefault();
            if (this.$neisStatusSelect.value == 'custom' || this.$neisStatusSelect.value == 'custom-open') {
                this.$selectorInput.value = 'td:nth-child(2)'; // td:nth-child(2):not(:empty) - but empty values are skipped anyway
                this.$attributeInput.value = '';
                this.$neisCustomCountryInput.value = this.$neisCountryInput.value;
                this.$neisCustomStatusInput.value = this.$neisStatusSelect.value == 'custom-open' ? 'open' : '';
                this.$neisCustomForm.submit();
            }
            else {
                this.$selectorInput.value = 'entry link';
                this.$attributeInput.value = 'href';
                this.$neisFeedCountryInput.value = this.$neisCountryInput.value;
                this.$neisFeedStatusInput.value = this.$neisStatusSelect.value;
                this.$neisFeedForm.submit();
            }
        });
        this.$selectorInput.addEventListener('input', () => {
            const selector = this.$selectorInput.value;
            try {
                document.createDocumentFragment().querySelector(selector); // https://stackoverflow.com/a/42149818
                this.$selectorInput.setCustomValidity('');
            }
            catch (ex) {
                this.$selectorInput.setCustomValidity(`has to be a valid css selector`);
            }
        });
        this.$fileInput.ondragenter = () => {
            this.$fileInput.classList.add('active');
        };
        this.$fileInput.ondragleave = () => {
            this.$fileInput.classList.remove('active');
        };
        this.$fileInput.addEventListener('change', () => {
            this.$fileInput.classList.remove('active');
            if (!this.$form.reportValidity())
                return; // doesn't display validity message on drag&drop in Firefox, works ok in Chrome
            const files = this.$fileInput.files;
            if (!files)
                return;
            const [file] = files;
            const fileType = (file.type == 'text/html' ? 'text/html' : 'text/xml');
            const reader = new FileReader();
            reader.readAsText(file);
            reader.onload = () => {
                if (typeof reader.result != 'string')
                    return;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(reader.result, fileType);
                const selector = this.$selectorInput.value;
                const attribute = this.$attributeInput.value;
                const $elements = xmlDoc.querySelectorAll(selector);
                const ids = [];
                for (const $element of $elements) {
                    const value = getValue($element, attribute);
                    if (!value)
                        continue;
                    const match = value.match(/([0-9]+)[^0-9]*$/);
                    if (!match)
                        continue;
                    const [idString] = match;
                    ids.push(Number(idString));
                }
                const query = {
                    mode: 'ids',
                    ids
                };
                this.submitQuery(query);
            };
        });
        function getValue($element, attribute) {
            if (attribute == '') {
                return $element.textContent;
            }
            else {
                return $element.getAttribute(attribute);
            }
        }
    }
    constructQuery() {
        return undefined;
    }
    listQueryChangingInputs() {
        return [];
    }
}
const neisFeedStatuses = [
    'opened',
    'commented',
    'reopened',
    'closed',
];
const neisCountries = [
    'Afghanistan',
    'Albania',
    'Algeria',
    'American Samoa',
    'Andorra',
    'Angola',
    'Anguilla',
    'Antarctica',
    'Antigua and Barbuda',
    'Argentina',
    'Armenia',
    'Aruba',
    'Australia',
    'Austria',
    'Azerbaijan',
    'Bahrain',
    'Baker Island',
    'Bangladesh',
    'Barbados',
    'Belarus',
    'Belgium',
    'Belize',
    'Benin',
    'Bermuda',
    'Bhutan',
    'Bolivia',
    'Bosnia and Herzegovina',
    'Botswana',
    'Bouvet Island',
    'Brazil',
    'British Indian Ocean Territory',
    'British Virgin Islands',
    'Brunei',
    'Bulgaria',
    'Burkina Faso',
    'Burundi',
    'Cambodia',
    'Cameroon',
    'Canada',
    'Cape Verde',
    'Caribbean Netherlands',
    'Cayman Islands',
    'Central African Republic',
    'Chad',
    'Chile',
    'China',
    'Christmas Island',
    'Cocos (Keeling) Islands',
    'Collectivity of Saint Martin',
    'Colombia',
    'Comoros',
    'Congo-Kinshasa',
    'Cook Islands',
    'Costa Rica',
    'Croatia',
    'Cuba',
    'Curaçao',
    'Cyprus',
    'Czech Republic',
    'Denmark',
    'Djibouti',
    'Dominica',
    'Dominican Republic',
    'East Timor',
    'Ecuador',
    'Egypt',
    'El Salvador',
    'Equatorial Guinea',
    'Eritrea',
    'Estonia',
    'Ethiopia',
    'Falkland Islands (Islas Malvinas)',
    'Faroe Islands',
    'Federated States of Micronesia',
    'Fiji',
    'Finland',
    'France',
    'French Guiana',
    'French Polynesia',
    'French Southern & Antarctic Lands',
    'Gabon',
    'Gaza Strip',
    'Georgia',
    'Germany',
    'Ghana',
    'Gibraltar',
    'Greece',
    'Greenland',
    'Grenada',
    'Guadeloupe',
    'Guam',
    'Guatemala',
    'Guernsey',
    'Guinea',
    'Guinea-Bissau',
    'Guyana',
    'Haiti',
    'Heard Island and McDonald Islands',
    'Honduras',
    'Hong Kong',
    'Howland Island',
    'Hungary',
    'Iceland',
    'India',
    'Indonesia',
    'Iran',
    'Iraq',
    'Ireland',
    'Isle of Man',
    'Israel',
    'Italy',
    'Ivory Coast',
    'Jamaica',
    'Jan Mayen',
    'Japan',
    'Jersey',
    'Johnston Atoll',
    'Jordan',
    'Kazakhstan',
    'Kenya',
    'Kiribati',
    'Kuwait',
    'Kyrgyzstan',
    'Laos',
    'Latvia',
    'Lebanon',
    'Lesotho',
    'Liberia',
    'Libya',
    'Liechtenstein',
    'Lithuania',
    'Luxembourg',
    'Macau',
    'Macedonia',
    'Madagascar',
    'Malawi',
    'Malaysia',
    'Maldives',
    'Mali',
    'Malta',
    'Marshall Islands',
    'Martinique',
    'Mauritania',
    'Mauritius',
    'Mayotte',
    'Mexico',
    'Moldova',
    'Monaco',
    'Mongolia',
    'Montenegro',
    'Montserrat',
    'Morocco',
    'Mozambique',
    'Myanmar (Burma)',
    'Namibia',
    'Nauru',
    'Nepal',
    'Netherlands',
    'New Caledonia',
    'New Zealand',
    'Nicaragua',
    'Niger',
    'Nigeria',
    'Niue',
    'Norfolk Island',
    'North Korea',
    'Northern Mariana Islands',
    'Norway',
    'Oman',
    'Pacific Islands (Palau)',
    'Pakistan',
    'Panama',
    'Papua New Guinea',
    'Paracel Islands',
    'Paraguay',
    'Peru',
    'Philippines',
    'Pitcairn Islands',
    'Poland',
    'Portugal',
    'Puerto Rico',
    'Qatar',
    'Republic of Kosovo',
    'Republic of the Congo',
    'Reunion',
    'Romania',
    'Russia',
    'Rwanda',
    'Saint Barthélemy',
    'Samoa',
    'San Marino',
    'Sao Tome and Principe',
    'Saudi Arabia',
    'Senegal',
    'Serbia',
    'Seychelles',
    'Sierra Leone',
    'Singapore',
    'Sint Maarten',
    'Slovakia',
    'Slovenia',
    'Solomon Islands',
    'Somalia',
    'South Africa',
    'South Georgia and the South Sandwich Islands',
    'South Korea',
    'South Sudan',
    'Spain',
    'Spratly Islands',
    'Sri Lanka',
    'St. Helena',
    'St. Kitts and Nevis',
    'St. Lucia',
    'St. Pierre and Miquelon',
    'St. Vincent and the Grenadines',
    'Sudan',
    'Suriname',
    'Svalbard',
    'Swaziland',
    'Sweden',
    'Switzerland',
    'Syria',
    'Taiwan',
    'Tajikistan',
    'Thailand',
    'The Bahamas',
    'The Gambia',
    'Togo',
    'Tonga',
    'Trinidad and Tobago',
    'Tunisia',
    'Turkey',
    'Turkmenistan',
    'Turks and Caicos Islands',
    'Tuvalu',
    'Uganda',
    'Ukraine',
    'United Arab Emirates',
    'United Kingdom',
    'United Republic of Tanzania',
    'United States',
    'United States Virgin Islands',
    'Uruguay',
    'Uzbekistan',
    'Vanuatu',
    'Vatican City',
    'Venezuela',
    'Vietnam',
    'Wake Island',
    'Wallis and Futuna',
    'West Bank',
    'Western Sahara',
    'Yemen',
    'Zambia',
    'Zimbabwe',
];

class NotePlaintextFetchDialog extends mixinWithFetchButton(NoteIdsFetchDialog) {
    constructor($sharedCheckboxes, server, getRequestApiPaths, submitQuery, noteTable) {
        super($sharedCheckboxes, server, getRequestApiPaths, submitQuery);
        this.noteTable = noteTable;
        this.shortTitle = `Plaintext`;
        this.title = `Fetch notes by ids from unstructured text`;
        this.$idsTextarea = document.createElement('textarea');
        this.$copySelectedCheckbox = document.createElement('input');
        this.$copyButton = document.createElement('button');
    }
    writeScopeAndOrderFieldset($fieldset) {
        {
            this.$copySelectedCheckbox.type = 'checkbox';
            this.$copyButton.type = 'button';
            this.$copyButton.textContent = `Copy note ids from table below`;
            $fieldset.append(makeDiv('checkbox-button-input')(this.$copySelectedCheckbox, ' ', this.$copyButton));
        }
        {
            this.$idsTextarea.required = true;
            this.$idsTextarea.rows = 10;
            $fieldset.append(makeDiv('major-input')(makeLabel()(`Note ids separated by anything: `, this.$idsTextarea)));
        }
    }
    addEventListeners() {
        const validateIds = () => {
            const match = this.$idsTextarea.value.match(/\d+/);
            if (!match) {
                this.$idsTextarea.setCustomValidity(`should contain at least one number`);
            }
            else {
                this.$idsTextarea.setCustomValidity('');
            }
        };
        this.$idsTextarea.addEventListener('input', validateIds);
        this.$copySelectedCheckbox.addEventListener('input', () => {
            this.$copyButton.textContent = `Copy${this.$copySelectedCheckbox.checked ? ' selected' : ''} note ids from table below`;
        });
        this.$copyButton.addEventListener('click', () => {
            const ids = (this.$copySelectedCheckbox.checked
                ? this.noteTable.getSelectedNoteIds()
                : this.noteTable.getVisibleNoteIds());
            this.$idsTextarea.value = ids.join();
            validateIds();
        });
    }
    populateInputsWithoutUpdatingRequest(query) {
        if (!query || query.mode != 'ids')
            return;
        this.$idsTextarea.value = query.ids.join();
    }
    constructQuery() {
        return makeNoteIdsQueryFromValue(this.$idsTextarea.value);
    }
    listQueryChangingInputs() {
        return [this.$idsTextarea];
    }
}

class NoteFetchPanel {
    constructor(storage, db, server, serverList, globalEventsListener, globalHistory, $container, $moreContainer, navbar, filterPanel, noteTable, map, figureDialog) {
        const self = this;
        const moreButtonIntersectionObservers = [];
        const $sharedCheckboxes = {
            showImages: [],
            advancedMode: []
        };
        const hashQuery = makeNoteQueryFromHash(globalHistory.getQueryHash());
        // make fetchers and dialogs
        const makeFetchDialog = (fetcherRequest, fetchDialogCtor) => {
            const dialog = fetchDialogCtor((query, limit) => fetcherRequest.getRequestApiPaths(query, limit), (query) => {
                modifyHistory(query, true);
                startFetcher(query, true, false, dialog);
            });
            dialog.limitChangeListener = () => {
                if (this.fetcherRun && this.fetcherInvoker == dialog) {
                    this.fetcherRun.reactToLimitUpdateForAdvancedMode();
                }
            };
            dialog.write($container);
            dialog.populateInputs(hashQuery);
            navbar.addTab(dialog);
            return dialog;
        };
        const searchDialog = makeFetchDialog(new NoteSearchFetcherRequest, (getRequestApiPaths, submitQuery) => new NoteSearchFetchDialog($sharedCheckboxes, server, getRequestApiPaths, submitQuery));
        const bboxDialog = makeFetchDialog(new NoteBboxFetcherRequest, (getRequestApiPaths, submitQuery) => new NoteBboxFetchDialog($sharedCheckboxes, server, getRequestApiPaths, submitQuery, map));
        const xmlDialog = makeFetchDialog(new NoteIdsFetcherRequest, (getRequestApiPaths, submitQuery) => new NoteXmlFetchDialog($sharedCheckboxes, server, getRequestApiPaths, submitQuery));
        const plaintextDialog = makeFetchDialog(new NoteIdsFetcherRequest, (getRequestApiPaths, submitQuery) => new NotePlaintextFetchDialog($sharedCheckboxes, server, getRequestApiPaths, submitQuery, noteTable));
        const aboutDialog = new AboutDialog(storage, db, server, serverList);
        aboutDialog.write($container);
        navbar.addTab(aboutDialog, true);
        handleSharedCheckboxes($sharedCheckboxes.showImages, state => noteTable.setShowImages(state));
        handleSharedCheckboxes($sharedCheckboxes.advancedMode, state => {
            for (const dialog of [searchDialog, bboxDialog, xmlDialog, plaintextDialog]) {
                dialog.reactToAdvancedModeChange();
            }
            $container.classList.toggle('advanced-mode', state);
            $moreContainer.classList.toggle('advanced-mode', state);
        });
        globalHistory.onQueryHashChange = (queryHash) => {
            const query = makeNoteQueryFromHash(queryHash);
            openQueryDialog(query, false);
            modifyHistory(query, false); // in case location was edited manually
            populateInputs(query);
            startFetcherFromQuery(query, false, false);
            globalHistory.restoreScrollPosition();
        };
        openQueryDialog(hashQuery, true);
        modifyHistory(hashQuery, false);
        startFetcherFromQuery(hashQuery, false, globalHistory.hasMapHash() // when just opened a note-viewer page with map hash set - if query is set too, don't fit its result, keep the map hash
        );
        globalEventsListener.userListener = (_, uid, username) => {
            const query = {
                mode: 'search',
                closed: -1,
                sort: 'created_at',
                order: 'newest',
            };
            if (username != null) {
                query.display_name = username;
            }
            else {
                query.user = uid;
            }
            openQueryDialog(query, false);
            populateInputs(query);
            searchDialog.$section.scrollIntoView();
        };
        function openQueryDialog(query, initial) {
            if (!query) {
                if (initial)
                    navbar.openTab(searchDialog.shortTitle);
            }
            else {
                const dialog = getDialogFromQuery(query);
                if (!dialog)
                    return;
                navbar.openTab(dialog.shortTitle);
            }
        }
        function populateInputs(query) {
            searchDialog.populateInputs(query);
            bboxDialog.populateInputs(query);
            xmlDialog.populateInputs(query);
            plaintextDialog.populateInputs(query);
        }
        function startFetcherFromQuery(query, clearStore, suppressFitNotes) {
            if (!query)
                return;
            const dialog = getDialogFromQuery(query);
            if (!dialog)
                return;
            startFetcher(query, clearStore, suppressFitNotes, dialog);
        }
        function getDialogFromQuery(query) {
            if (query.mode == 'search') {
                return searchDialog;
            }
            else if (query.mode == 'bbox') {
                return bboxDialog;
            }
            else if (query.mode == 'ids') {
                return plaintextDialog;
            }
        }
        function startFetcher(query, clearStore, suppressFitNotes, dialog) {
            if (query.mode != 'search' && query.mode != 'bbox' && query.mode != 'ids')
                return;
            bboxDialog.resetFetch(); // TODO run for all dialogs... for now only bboxDialog has meaningful action
            figureDialog.close();
            while (moreButtonIntersectionObservers.length > 0)
                moreButtonIntersectionObservers.pop()?.disconnect();
            map.clearNotes();
            noteTable.reset();
            filterPanel.unsubscribe(); // TODO still needed? table used to be reconstructed but now it's permanent
            filterPanel.subscribe(noteFilter => noteTable.updateFilter(noteFilter));
            if (suppressFitNotes) {
                map.needToFitNotes = false;
            }
            const environment = {
                db, server,
                hostHash: serverList.getHostHash(server),
                noteTable, $moreContainer,
                getLimit: dialog.getLimit,
                getAutoLoad: dialog.getAutoLoad,
                blockDownloads: (disabled) => dialog.disableFetchControl(disabled),
                moreButtonIntersectionObservers,
            };
            self.fetcherInvoker = dialog;
            if (query.mode == 'search') {
                self.fetcherRun = new NoteSearchFetcherRun(environment, query, clearStore);
            }
            else if (query.mode == 'bbox') {
                self.fetcherRun = new NoteBboxFetcherRun(environment, query, clearStore);
            }
            else if (query.mode == 'ids') {
                self.fetcherRun = new NoteIdsFetcherRun(environment, query, clearStore);
            }
        }
        function handleSharedCheckboxes($checkboxes, stateChangeListener) {
            for (const $checkbox of $checkboxes) {
                $checkbox.addEventListener('input', inputListener);
            }
            function inputListener() {
                const state = this.checked;
                for (const $checkbox of $checkboxes) {
                    $checkbox.checked = state;
                }
                stateChangeListener(state);
            }
        }
        function modifyHistory(query, push) {
            const queryHash = query
                ? makeNoteQueryString(query)
                : '';
            globalHistory.setQueryHash(queryHash, push);
        }
    }
    updateNote($a, noteId) {
        if (!this.fetcherRun)
            return;
        this.fetcherRun.updateNote($a, noteId);
    }
}

function isValidOperator(op) {
    return (op == '=' || op == '!=' || op == '~=');
}
class NoteFilter {
    constructor(urlLister, query) {
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
                    const userQuery = toUserQuery(urlLister, user);
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
    constructor(urlLister, $container) {
        const $form = document.createElement('form');
        const $textarea = document.createElement('textarea');
        const $button = document.createElement('button');
        this.noteFilter = new NoteFilter(urlLister, ``);
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
            $textarea.rows = 5;
            $form.append(makeDiv('major-input')(makeLabel()(`Filter: `, $textarea)));
        }
        {
            $button.textContent = `Apply filter`;
            $button.type = 'submit';
            $button.disabled = true;
            $form.append(makeDiv('major-input')($button));
        }
        $textarea.addEventListener('input', () => {
            $button.disabled = this.noteFilter.isSameQuery($textarea.value);
            try {
                new NoteFilter(urlLister, $textarea.value);
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
                this.noteFilter = new NoteFilter(urlLister, $textarea.value);
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

const e$2 = makeEscapeTag(encodeURIComponent);
const makeItem = makeElement('li')();
const makeITEM = makeElement('li')('main');
class LooseParserPopup {
    constructor(webUrlLister, $container) {
        this.webUrlLister = webUrlLister;
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
        $a.href = this.webUrlLister.getWebUrl(e$2 `${type}/${id}`);
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
        $a.classList.add('listened', 'osm');
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

function getCommentItems(webUrlLister, commentText) {
    const matchRegExp = new RegExp(`(?<before>.*?)(?<text>` +
        `(?<date>\\d\\d\\d\\d-\\d\\d-\\d\\d[T ]\\d\\d:\\d\\d:\\d\\dZ)` +
        `|` +
        `(?<link>https?://(?:` +
        `(?<image>westnordost\.de/p/[0-9]+\.jpg)` +
        '|' +
        `(?<osm>` + makeWebUrlRegex(webUrlLister) +
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
        items.push(getMatchItem(webUrlLister, match.groups));
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
function makeWebUrlRegex(webUrlLister) {
    return '(?:' + webUrlLister.webUrls.map(webUrl => escapeRegex(stripProtocol(webUrl))).join('|') + ')';
}
function stripProtocol(webUrl) {
    return webUrl.replace(new RegExp('^[^:]*://'), '');
}
function getMatchItem(webUrlLister, groups) {
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
                href: rewriteOsmHref(webUrlLister, groups.path, groups.hash),
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
function rewriteOsmHref(webUrlLister, path, hash) {
    let href = webUrlLister.getWebUrl(path ?? '');
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

class CommentWriter {
    constructor(webUrlLister) {
        this.webUrlLister = webUrlLister;
    }
    makeCommentElements(commentText, showImages = false) {
        const inlineElements = [];
        const imageElements = [];
        for (const item of getCommentItems(this.webUrlLister, commentText)) {
            if (item.type == 'link' && item.link == 'image') {
                const $inlineLink = makeLink(item.href, item.href);
                $inlineLink.classList.add('listened', 'image', 'inline');
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
                $a.classList.add('listened', 'osm');
                inlineElements.push($a);
            }
            else if (item.type == 'date') {
                const $time = makeActiveTimeElement(item.text, item.text);
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
function makeDateOutput(readableDate) {
    const [readableDateWithoutTime] = readableDate.split(' ', 1);
    if (readableDate && readableDateWithoutTime) {
        return makeActiveTimeElement(readableDateWithoutTime, `${readableDate.replace(' ', 'T')}Z`, `${readableDate} UTC`);
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

class NoteSectionVisibilityObserver {
    constructor(handleVisibleNotes) {
        this.isMapFittingHalted = false;
        this.noteIdVisibility = new Map();
        const noteSectionVisibilityHandler = () => {
            const visibleNoteIds = [];
            for (const [noteId, visibility] of this.noteIdVisibility) {
                if (visibility)
                    visibleNoteIds.push(noteId);
            }
            handleVisibleNotes(visibleNoteIds, this.isMapFittingHalted);
        };
        this.intersectionObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const $noteSection = entry.target;
                if (!($noteSection instanceof HTMLElement))
                    continue;
                if (!$noteSection.dataset.noteId)
                    continue;
                const noteId = Number($noteSection.dataset.noteId);
                if (!this.noteIdVisibility.has(noteId))
                    continue;
                this.noteIdVisibility.set(noteId, entry.isIntersecting);
            }
            clearTimeout(this.visibilityTimeoutId);
            this.visibilityTimeoutId = setTimeout(noteSectionVisibilityHandler);
        });
    }
    observe($noteSection) {
        if (!$noteSection.dataset.noteId)
            return;
        const noteId = Number($noteSection.dataset.noteId);
        this.noteIdVisibility.set(noteId, false);
        this.intersectionObserver.observe($noteSection);
    }
    disconnect() {
        this.intersectionObserver.disconnect();
        this.noteIdVisibility.clear();
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

const e$1 = makeEscapeTag(encodeURIComponent);
const clamp = (min, value, max) => Math.max(min, Math.min(value, max));
class NoteRefresher {
    constructor(refreshPeriod, apiFetcher, timeoutCaller, reportRefreshWaitProgress, reportUpdate, reportPostpone) {
        this.refreshPeriod = refreshPeriod;
        this.apiFetcher = apiFetcher;
        this.timeoutCaller = timeoutCaller;
        this.reportRefreshWaitProgress = reportRefreshWaitProgress;
        this.reportUpdate = reportUpdate;
        this.reportPostpone = reportPostpone;
        this.schedule = new Map();
        this.timeoutCaller.schedulePeriodicCall((timestamp) => this.receiveScheduledCall(timestamp));
    }
    reset() {
        this.schedule.clear();
    }
    refreshAll() {
        for (const scheduleEntry of this.schedule.values()) {
            scheduleEntry.needImmediateRefresh = true;
        }
        this.timeoutCaller.scheduleImmediateCall((timestamp) => this.receiveScheduledCall(timestamp));
    }
    observe(noteRefreshList) {
        const notesToUnschedule = new Set(this.schedule.keys());
        for (const [id, refreshTimestamp, updateDate, hasPendingUpdate] of noteRefreshList) {
            notesToUnschedule.delete(id);
            const entry = this.schedule.get(id);
            if (entry) {
                entry.refreshTimestamp = refreshTimestamp;
            }
            else {
                this.schedule.set(id, {
                    refreshTimestamp,
                    updateDate,
                    hasPendingUpdate,
                    needImmediateRefresh: false
                });
            }
        }
        for (const id of notesToUnschedule) {
            this.schedule.delete(id);
        }
    }
    update(id, refreshTimestamp, updateDate) {
        const entry = this.schedule.get(id);
        if (!entry)
            return;
        entry.refreshTimestamp = refreshTimestamp;
        entry.updateDate = updateDate;
        entry.hasPendingUpdate = false;
        entry.needImmediateRefresh = false;
    }
    async receiveScheduledCall(timestamp) {
        const reportAllProgress = () => {
            for (const [id, { refreshTimestamp, hasPendingUpdate }] of this.schedule) {
                if (hasPendingUpdate) {
                    this.reportRefreshWaitProgress(id, 1);
                }
                else {
                    const progress = clamp(0, (timestamp - refreshTimestamp) / this.refreshPeriod, 1);
                    this.reportRefreshWaitProgress(id, progress);
                }
            }
        };
        const getNextId = () => {
            let earliestRefreshTimestamp = +Infinity;
            let earliestRefreshId;
            for (const [id, { refreshTimestamp, needImmediateRefresh, hasPendingUpdate }] of this.schedule) {
                if (hasPendingUpdate)
                    continue;
                if (needImmediateRefresh) {
                    return id;
                }
                if (earliestRefreshTimestamp > refreshTimestamp) {
                    earliestRefreshTimestamp = refreshTimestamp;
                    earliestRefreshId = id;
                }
            }
            if (timestamp - earliestRefreshTimestamp >= this.refreshPeriod) {
                return earliestRefreshId;
            }
        };
        reportAllProgress();
        const currentId = getNextId();
        if (currentId == null) {
            this.timeoutCaller.schedulePeriodicCall((timestamp) => this.receiveScheduledCall(timestamp));
            return;
        }
        await this.fetch(timestamp, currentId);
        const futureId = getNextId();
        if (futureId) {
            this.timeoutCaller.scheduleImmediateCall((timestamp) => this.receiveScheduledCall(timestamp));
        }
        else {
            this.timeoutCaller.schedulePeriodicCall((timestamp) => this.receiveScheduledCall(timestamp));
        }
    }
    async fetch(timestamp, id) {
        const scheduleEntry = this.schedule.get(id);
        if (!scheduleEntry)
            return;
        const postpone = (message) => {
            const newRefreshTimestamp = this.reportPostpone(id, message);
            scheduleEntry.refreshTimestamp = newRefreshTimestamp;
        };
        scheduleEntry.needImmediateRefresh = false;
        // const progress=clamp(0,(timestamp-scheduleEntry.refreshTimestamp)/this.refreshPeriod,1)
        scheduleEntry.refreshTimestamp = timestamp;
        // this.reportRefreshWaitProgress(id,progress)
        const apiPath = e$1 `notes/${id}.json`;
        const response = await this.apiFetcher.apiFetch(apiPath);
        if (!response.ok)
            return postpone(`note refresh failed`);
        const data = await response.json();
        if (!isNoteFeature(data))
            return postpone(`note refresh received invalid data`);
        const [newNotes] = transformFeatureToNotesAndUsers(data);
        if (newNotes.length != 1)
            return postpone(`note refresh received unexpected number of notes`);
        const [newNote] = newNotes;
        if (newNote.id != id)
            return postpone(`note refresh received unexpected note`);
        const newUpdateDate = getNoteUpdateDate(newNote);
        if (newUpdateDate <= scheduleEntry.updateDate)
            return postpone();
        scheduleEntry.hasPendingUpdate = true;
        this.reportUpdate(id);
    }
}

const makeTimeoutCaller = (periodicCallDelay, immediateCallDelay) => {
    let timeoutId;
    const scheduleCall = (delay) => (callback) => {
        clearTimeout(timeoutId);
        setTimeout(() => callback(Date.now()), delay);
    };
    return {
        schedulePeriodicCall: scheduleCall(periodicCallDelay),
        scheduleImmediateCall: scheduleCall(immediateCallDelay),
    };
};
const setNoteSectionProgress = ($noteSection, progress) => {
    const $refreshWaitProgress = $noteSection.querySelector('td.note-link progress');
    if (!($refreshWaitProgress instanceof HTMLProgressElement))
        return;
    $refreshWaitProgress.value = progress;
};
class NoteTable {
    constructor($container, toolPanel, map, filter, figureDialog, server) {
        this.toolPanel = toolPanel;
        this.map = map;
        this.filter = filter;
        this.server = server;
        this.$table = document.createElement('table');
        this.$selectAllCheckbox = document.createElement('input');
        this.notesById = new Map(); // in the future these might be windowed to limit the amount of stuff on one page
        this.noteRefreshTimestampsById = new Map();
        this.notesWithPendingUpdate = new Set();
        this.usersById = new Map();
        this.showImages = false;
        this.noteRefresher = new NoteRefresher(5 * 60 * 1000, server, makeTimeoutCaller(10 * 1000, 100), (id, progress) => {
            const $noteSection = this.getNoteSection(id);
            if ($noteSection) {
                setNoteSectionProgress($noteSection, progress);
            }
        }, (id) => {
            const $noteSection = this.getNoteSection(id);
            if ($noteSection) {
                $noteSection.dataset.updated = 'updated';
            }
            this.notesWithPendingUpdate.add(id);
        }, (id, message) => {
            // TODO report error by altering the link
            const $noteSection = this.getNoteSection(id);
            if ($noteSection) {
                setNoteSectionProgress($noteSection, 0);
            }
            const refreshTimestamp = Date.now();
            this.noteRefreshTimestampsById.set(id, refreshTimestamp);
            return refreshTimestamp;
        });
        toolPanel.onCommentsViewChange = (onlyFirst, oneLine) => {
            this.$table.classList.toggle('only-first-comments', onlyFirst);
            this.$table.classList.toggle('one-line-comments', oneLine);
        };
        const that = this;
        let $clickReadyNoteSection;
        this.wrappedNoteSectionListeners = [
            ['mouseenter', function () {
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
        this.noteSectionVisibilityObserver = new NoteSectionVisibilityObserver((visibleNoteIds, isMapFittingHalted) => {
            const visibleLayerIds = [];
            for (const noteId of visibleNoteIds) {
                const $noteSection = this.getNoteSection(noteId);
                if (!$noteSection)
                    continue;
                if (!$noteSection.dataset.layerId)
                    continue;
                const layerId = Number($noteSection.dataset.layerId);
                visibleLayerIds.push(layerId);
            }
            map.showNoteTrack(visibleLayerIds);
            if (!isMapFittingHalted && toolPanel.fitMode == 'inViewNotes')
                map.fitNoteTrack();
            const noteRefreshList = [];
            for (const id of visibleNoteIds) {
                const lastRefreshTimestamp = this.noteRefreshTimestampsById.get(id);
                if (!lastRefreshTimestamp)
                    continue;
                const note = this.notesById.get(id);
                if (!note)
                    continue;
                noteRefreshList.push([id, lastRefreshTimestamp, getNoteUpdateDate(note), this.notesWithPendingUpdate.has(id)]);
            }
            this.noteRefresher.observe(noteRefreshList);
        });
        this.commentWriter = new CommentWriter(server);
        $container.append(this.$table);
        this.reset();
        const looseParserPopup = new LooseParserPopup(server, $container);
        this.looseParserListener = new LooseParserListener((x, y, text) => {
            const parseResult = parseLoose(text);
            if (!parseResult)
                return;
            looseParserPopup.open(x, y, ...parseResult);
        });
    }
    reset() {
        this.noteRefresher.reset();
        this.noteRefreshTimestampsById.clear();
        this.notesWithPendingUpdate.clear();
        this.notesById.clear();
        this.usersById.clear();
        this.$lastClickedNoteSection = undefined;
        this.noteSectionVisibilityObserver.disconnect();
        this.$table.innerHTML = '';
        this.toolPanel.receiveNoteCounts(0, 0);
        this.updateCheckboxDependents();
    }
    updateFilter(filter) {
        let nFetched = 0;
        let nVisible = 0;
        this.filter = filter;
        const getUsername = (uid) => this.usersById.get(uid);
        for (const $noteSection of this.$table.tBodies) {
            const noteId = Number($noteSection.dataset.noteId);
            const note = this.notesById.get(noteId);
            const layerId = Number($noteSection.dataset.layerId);
            if (note == null)
                continue;
            nFetched++;
            if (this.filter.matchNote(note, getUsername)) {
                nVisible++;
                let targetLayer = this.map.unselectedNoteLayer;
                const $checkbox = $noteSection.querySelector('.note-checkbox input');
                if ($checkbox instanceof HTMLInputElement && $checkbox.checked) {
                    targetLayer = this.map.selectedNoteLayer;
                }
                this.map.moveNoteMarkerToLayer(layerId, targetLayer);
                $noteSection.classList.remove('hidden');
            }
            else {
                this.deactivateNote('click', $noteSection);
                this.deactivateNote('hover', $noteSection);
                this.map.moveNoteMarkerToLayer(layerId, this.map.filteredNoteLayer);
                $noteSection.classList.add('hidden');
                this.setNoteSelection($noteSection, false);
            }
        }
        this.toolPanel.receiveNoteCounts(nFetched, nVisible);
        this.updateCheckboxDependents();
    }
    /**
     * @returns number of added notes that passed through the filter
     */
    addNotes(notes, users) {
        // remember notes and users
        const noteSequence = [];
        for (const note of notes) {
            noteSequence.push(note);
            this.notesById.set(note.id, note);
            this.notesWithPendingUpdate.delete(note.id);
        }
        for (const [uid, username] of Object.entries(users)) {
            this.usersById.set(Number(uid), username);
        }
        // output table
        if (this.$table.childElementCount == 0)
            this.writeTableHeader();
        let nUnfilteredNotes = 0;
        const getUsername = (uid) => users[uid];
        for (const note of noteSequence) {
            const isVisible = this.filter.matchNote(note, getUsername);
            if (isVisible)
                nUnfilteredNotes++;
            const $noteSection = this.$table.createTBody();
            $noteSection.dataset.noteId = String(note.id);
            this.noteSectionVisibilityObserver.observe($noteSection);
            this.writeNote($noteSection, note, users, isVisible);
        }
        if (this.toolPanel.fitMode == 'allNotes') {
            this.map.fitNotes();
        }
        else {
            this.map.fitNotesIfNeeded();
        }
        this.sendNoteCountsUpdate();
        return nUnfilteredNotes;
    }
    replaceNote(note, users) {
        const $noteSection = this.getNoteSection(note.id);
        if (!$noteSection)
            return;
        const layerId = Number($noteSection.dataset.layerId);
        this.map.removeNoteMarker(layerId);
        // remember note and users
        this.notesById.set(note.id, note);
        for (const [uid, username] of Object.entries(users)) {
            this.usersById.set(Number(uid), username);
            this.notesWithPendingUpdate.delete(note.id);
        }
        // output table section
        $noteSection.innerHTML = '';
        const getUsername = (uid) => users[uid];
        const isVisible = this.filter.matchNote(note, getUsername);
        this.writeNote($noteSection, note, users, isVisible);
        this.sendNoteCountsUpdate(); // TODO only do if visibility changed
        // update refresher
        delete $noteSection.dataset.updated;
        this.noteRefresher.update(note.id, Date.now(), getNoteUpdateDate(note));
    }
    getVisibleNoteIds() {
        const ids = [];
        for (const [, id] of this.listVisibleNoteSectionsWithIds()) {
            ids.push(id);
        }
        return ids;
    }
    getSelectedNoteIds() {
        const ids = [];
        for (const [$noteSection, id] of this.listVisibleNoteSectionsWithIds()) {
            const $checkbox = $noteSection.querySelector('.note-checkbox input');
            if (!($checkbox instanceof HTMLInputElement))
                continue;
            if (!$checkbox.checked)
                continue;
            ids.push(id);
        }
        return ids;
    }
    setShowImages(showImages) {
        this.showImages = showImages;
        this.$table.classList.toggle('with-images', showImages);
        handleShowImagesUpdate(this.$table, showImages);
    }
    pingNoteFromLink($a, noteId) {
        const $noteSection = this.getNoteSection(noteId);
        if (!$noteSection) {
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
            this.focusOnNote($noteSection);
        }
    }
    writeTableHeader() {
        const $header = this.$table.createTHead();
        const $row = $header.insertRow();
        const $checkboxCell = makeHeaderCell('');
        this.$selectAllCheckbox.type = 'checkbox';
        this.$selectAllCheckbox.title = `check/uncheck all`;
        this.$selectAllCheckbox.addEventListener('click', this.wrappedAllNotesCheckboxClickListener);
        $checkboxCell.append(this.$selectAllCheckbox);
        const $actionCell = makeHeaderCell('?');
        $actionCell.title = `action performed along with adding the comment; number of comments`;
        $actionCell.classList.add('note-action');
        $row.append($checkboxCell, makeHeaderCell('id'), makeHeaderCell('date'), makeHeaderCell('user'), $actionCell, makeHeaderCell('comment'));
        function makeHeaderCell(text) {
            const $cell = document.createElement('th');
            $cell.textContent = text;
            return $cell;
        }
    }
    writeNote($noteSection, note, users, isVisible) {
        const marker = new NoteMarker(note);
        const parentLayer = (isVisible ? this.map.unselectedNoteLayer : this.map.filteredNoteLayer);
        const layerId = this.map.addNoteMarker(marker, parentLayer);
        marker.on('click', this.wrappedNoteMarkerClickListener);
        if (!isVisible)
            $noteSection.classList.add('hidden');
        $noteSection.id = `note-${note.id}`;
        $noteSection.classList.add(getStatusClass(note.status));
        $noteSection.dataset.layerId = String(layerId);
        for (const [event, listener] of this.wrappedNoteSectionListeners) {
            $noteSection.addEventListener(event, listener);
        }
        if (isVisible) {
            if (this.$selectAllCheckbox.checked) {
                this.$selectAllCheckbox.checked = false;
                this.$selectAllCheckbox.indeterminate = true;
            }
        }
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
            $cell.classList.add('note-link');
            if (nComments > 1)
                $cell.rowSpan = nComments;
            const $a = document.createElement('a');
            $a.href = this.server.getWebUrl(`note/` + encodeURIComponent(note.id));
            $a.dataset.noteId = $a.textContent = `${note.id}`;
            $a.dataset.self = 'yes';
            $a.classList.add('listened');
            $a.title = `click to reload the note if you know it was updated or want to check it`;
            const $refreshWaitProgress = document.createElement('progress');
            $refreshWaitProgress.value = 0;
            $cell.append(makeDiv()($a, $refreshWaitProgress));
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
                $cell.append(makeDateOutput(toReadableDate(comment.date)));
            }
            {
                const $cell = $row.insertCell();
                $cell.classList.add('note-user');
                if (comment.uid != null) {
                    const username = users[comment.uid];
                    if (username != null) {
                        const href = this.server.getWebUrl(`user/` + encodeURIComponent(username));
                        const $a = makeLink(username, href);
                        $a.classList.add('listened');
                        $a.dataset.userName = username;
                        $a.dataset.userId = String(comment.uid);
                        $cell.append($a);
                    }
                    else {
                        $cell.append(`#${comment.uid}`);
                    }
                }
            }
            {
                let svgs = `<svg class="icon-status-${getActionClass(comment.action)}">` +
                    `<title>${comment.action}</title><use href="#table-note" />` +
                    `</svg>`;
                if (note.comments.length > 1) {
                    svgs += ` <svg class="icon-comments-count">` +
                        `<title>number of additional comments</title><use href="#table-comments" /><text x="8" y="8">${note.comments.length - 1}</text>` +
                        `</svg>`;
                }
                const $cell = $row.insertCell();
                $cell.classList.add('note-action');
                $cell.innerHTML = svgs;
            }
            {
                const $cell = $row.insertCell();
                $cell.classList.add('note-comment');
                this.commentWriter.writeComment($cell, comment.text, this.showImages);
                this.looseParserListener.listen($cell);
            }
            iComment++;
        }
        this.noteRefreshTimestampsById.set(note.id, Date.now());
    }
    sendNoteCountsUpdate() {
        let nFetched = 0;
        let nVisible = 0;
        for (const $noteSection of this.$table.tBodies) {
            if (!$noteSection.dataset.noteId)
                continue;
            nFetched++;
            if (!$noteSection.classList.contains('hidden'))
                nVisible++;
        }
        this.toolPanel.receiveNoteCounts(nFetched, nVisible);
    }
    noteMarkerClickListener(marker) {
        const $noteSection = this.getNoteSection(marker.noteId);
        if ($noteSection)
            this.focusOnNote($noteSection);
    }
    noteCheckboxClickListener($checkbox, ev) {
        ev.stopPropagation();
        const $clickedNoteSection = $checkbox.closest('tbody');
        if ($clickedNoteSection) {
            this.setNoteSelection($clickedNoteSection, $checkbox.checked);
            if (ev.shiftKey && this.$lastClickedNoteSection) {
                for (const $inRangeNoteSection of this.listVisibleNoteSectionsInRange(this.$lastClickedNoteSection, $clickedNoteSection)) {
                    this.setNoteSelection($inRangeNoteSection, $checkbox.checked);
                }
            }
            this.$lastClickedNoteSection = $clickedNoteSection;
        }
        this.updateCheckboxDependents();
    }
    allNotesCheckboxClickListener($allCheckbox, ev) {
        for (const $noteSection of this.listVisibleNoteSections()) {
            this.setNoteSelection($noteSection, $allCheckbox.checked);
        }
        this.updateCheckboxDependents();
    }
    focusOnNote($noteSection, isSectionClicked = false) {
        this.activateNote('click', $noteSection);
        this.noteSectionVisibilityObserver.haltMapFitting(); // otherwise scrollIntoView() may ruin note pan/zoom - it may cause observer to fire after exiting this function
        if (!isSectionClicked)
            $noteSection.scrollIntoView({ block: 'nearest' });
        const layerId = Number($noteSection.dataset.layerId);
        const marker = this.map.getNoteMarker(layerId);
        if (!marker)
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
        const layerId = Number($noteSection.dataset.layerId);
        const marker = this.map.getNoteMarker(layerId);
        if (!marker)
            return;
        marker.getElement()?.classList.remove('active-' + type);
        if ($noteSection.classList.contains('active-hover') || $noteSection.classList.contains('active-click'))
            return;
        marker.setZIndexOffset(0);
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
        const marker = this.map.getNoteMarker(layerId);
        if (!marker)
            return;
        marker.setZIndexOffset(1000);
        marker.getElement()?.classList.add('active-' + type);
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
        if (this.toolPanel.fitMode == 'selectedNotes')
            this.map.fitSelectedNotes();
    }
    setNoteSelection($noteSection, isSelected) {
        const getTargetLayer = () => {
            if ($noteSection.classList.contains('hidden')) {
                return this.map.filteredNoteLayer;
            }
            else if (isSelected) {
                return this.map.selectedNoteLayer;
            }
            else {
                return this.map.unselectedNoteLayer;
            }
        };
        const $checkbox = $noteSection.querySelector('.note-checkbox input');
        if ($checkbox instanceof HTMLInputElement)
            $checkbox.checked = isSelected;
        const noteId = Number($noteSection.dataset.noteId);
        const note = this.notesById.get(noteId);
        if (!note)
            return;
        const layerId = Number($noteSection.dataset.layerId);
        const marker = this.map.moveNoteMarkerToLayer(layerId, getTargetLayer());
        if (!marker)
            return;
        marker.updateIcon(note, isSelected);
    }
    listVisibleNoteSections() {
        return this.$table.querySelectorAll('tbody:not(.hidden)');
    }
    *listVisibleNoteSectionsWithIds() {
        for (const $noteSection of this.listVisibleNoteSections()) {
            const idString = $noteSection.dataset.noteId;
            if (!idString)
                continue;
            yield [$noteSection, Number(idString)];
        }
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
    getNoteSection(noteId) {
        const $noteSection = document.getElementById(`note-` + noteId); // TODO look in $table
        if (!($noteSection instanceof HTMLTableSectionElement))
            return;
        return $noteSection;
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
const label = (...ss) => makeElement('label')('inline')(...ss);
class AutozoomTool extends Tool {
    constructor() {
        super('autozoom', `Map autozoom`, `Pan and zoom the map to visible notes`);
    }
    getInfo() {
        return [p$4(`Pan and zoom the map to notes in the table. `, `Can be used as `, em$2(`zoom to data`), ` for notes layer if `, dfn$1(`to all visible notes`), ` is selected. `), p$4(dfn$1(`To notes on screen in table`), ` allows to track notes in the table that are currently visible on screen, panning the map as you scroll through the table. `, `This option is convenient to use when `, em$2(`Track between notes`), ` map layer is enabled (and it is enabled by default). This way you can see the current sequence of notes from the table on the map, connected by a line in an order in which they appear in the table.`)];
    }
    getTool(callbacks, server, map) {
        const $fitModeSelect = document.createElement('select');
        $fitModeSelect.append(new Option('is disabled', 'none'), new Option('to selected notes', 'selectedNotes'), new Option('to notes on screen in table', 'inViewNotes'), new Option('to all visible notes', 'allNotes'));
        $fitModeSelect.onchange = () => {
            if ($fitModeSelect.value == 'allNotes') {
                callbacks.onFitModeChange(this, $fitModeSelect.value);
                map.fitNotes();
            }
            else if ($fitModeSelect.value == 'selectedNotes') {
                callbacks.onFitModeChange(this, $fitModeSelect.value);
                map.fitSelectedNotes();
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
class CommentsTool extends Tool {
    constructor() {
        super('comments', `Table comments`, `Change how comments are displayed in notes table`);
    }
    getTool(callbacks) {
        const $onlyFirstCommentsCheckbox = document.createElement('input');
        $onlyFirstCommentsCheckbox.type = 'checkbox';
        const $oneLineCommentsCheckbox = document.createElement('input');
        $oneLineCommentsCheckbox.type = 'checkbox';
        $onlyFirstCommentsCheckbox.onchange = $oneLineCommentsCheckbox.onchange = () => {
            callbacks.onCommentsViewChange(this, $onlyFirstCommentsCheckbox.checked, $oneLineCommentsCheckbox.checked);
        };
        return [
            `show `,
            label($onlyFirstCommentsCheckbox, ` only 1st`), `; `,
            label($oneLineCommentsCheckbox, ` on 1 line`),
        ];
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
    getTool(callbacks, server) {
        const commentWriter = new CommentWriter(server);
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
    getTool(callbacks, server, map) {
        const $overpassButtons = [];
        const buttonClickListener = (withRelations, onlyAround) => {
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
            open(server.getOverpassTurboUrl(query, map.lat, map.lon, map.zoom), 'overpass-turbo');
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
    getTool(callbacks, server, map) {
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
                const doc = await server.overpassFetch(query);
                const closestNodeId = getClosestNodeId(doc, map.lat, map.lon);
                if (!closestNodeId) {
                    $button.classList.add('error');
                    $button.title = `Could not find nodes nearby`;
                    return;
                }
                const url = server.getWebUrl(`node/` + encodeURIComponent(closestNodeId));
                const $a = makeLink(`link`, url);
                $a.dataset.elementType = 'node';
                $a.dataset.elementId = String(closestNodeId);
                $a.classList.add('listened', 'osm');
                $output.replaceChildren($a);
                $button.classList.remove('error');
                $button.title = '';
            }
            catch (ex) {
                $button.classList.add('error');
                if (ex instanceof QueryError) {
                    $button.title = `Overpass query failed ${ex.reason}`;
                }
            }
            finally {
                $button.disabled = false;
            }
        };
        return [$button, ` → `, $output];
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
    getTool(callbacks, server, map) {
        const e = makeEscapeTag(encodeURIComponent);
        const $loadNotesButton = this.makeRequiringSelectedNotesButton();
        $loadNotesButton.append(`Load `, makeNotesIcon('selected'));
        $loadNotesButton.onclick = async () => {
            for (const { id } of this.selectedNotes) {
                const noteUrl = server.getWebUrl(e `note/${id}`);
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
    getTool(callbacks, server, map) {
        // limited to what hashchange() lets you do here https://github.com/openstreetmap/iD/blob/develop/modules/behavior/hash.js
        // which is zooming/panning
        const $zoomButton = document.createElement('button');
        $zoomButton.append(`Open `, makeMapIcon('center'));
        $zoomButton.onclick = () => {
            const e = makeEscapeTag(encodeURIComponent);
            const url = server.getWebUrl(e `id#map=${map.zoom}/${map.lat}/${map.lon}`);
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
    getTool(callbacks, server) {
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
            const data = this.generateData(server, getOptionValues());
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
            const data = this.generateData(server, getOptionValues());
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
    generateData(server, options) {
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
            const noteUrl = server.getWebUrl(`note/` + encodeURIComponent(note.id));
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
    generateData(server, options) {
        // https://github.com/openstreetmap/openstreetmap-website/blob/master/app/views/api/notes/_note.json.jbuilder
        const e = makeEscapeTag(encodeURIComponent);
        const formatDate = (date) => {
            return toReadableDate(date) + ' UTC';
        };
        const lastCloseComment = (note) => {
            for (let i = note.comments.length - 1; i >= 0; i--) {
                if (note.comments[i].action == 'closed')
                    return note.comments[i];
            }
        };
        const generateCommentUserProperties = (comment) => {
            const result = {};
            if (comment.uid == null)
                return result;
            result.uid = comment.uid;
            const username = this.selectedNoteUsers.get(comment.uid);
            if (username == null)
                return result;
            result.user = username;
            result.user_url = server[options.urls == 'web'
                ? 'getWebUrl'
                : 'getApiRootUrl'](e `user/${username}`);
            return result;
        };
        const generateNoteUrls = (note) => {
            if (options.urls == 'web')
                return {
                    url: server.getWebUrl(e `note/${note.id}`)
                };
            const apiBasePath = e `notes/${note.id}`;
            const result = {
                url: server.getApiUrl(apiBasePath + `.json`)
            };
            if (note.status == 'closed') {
                result.reopen_url = server.getApiUrl(apiBasePath + `/reopen.json`);
            }
            else {
                result.comment_url = server.getApiUrl(apiBasePath + `/comment.json`);
                result.close_url = server.getApiUrl(apiBasePath + `/close.json`);
            }
            return result;
        };
        const generateNoteDates = (note) => {
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
        };
        const generateNoteComments = (comments) => {
            if (comments.length == 0)
                return {};
            if (options.commentType == 'strings') {
                return Object.fromEntries(this.getCommentStrings(comments, options.commentQuantity == 'all').map((v, i) => ['comment' + (i > 0 ? i + 1 : ''), v.replace(/\n/g, '\n ')]));
            }
            else if (options.commentType == 'string') {
                return {
                    comments: this.getCommentStrings(comments, options.commentQuantity == 'all').join(`; `).replace(/\n/g, '\n ')
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
        };
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
    }
}

const p = (...ss) => makeElement('p')()(...ss);
class StreetViewTool extends Tool {
    getTool(callbacks, server, map) {
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
    () => new AutozoomTool, () => new CommentsTool,
    () => new TimestampTool, () => new ParseTool,
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
    constructor(storage, server, globalEventsListener, $container, map, figureDialog) {
        _ToolPanel_fitMode.set(this, void 0);
        const tools = [];
        const toolCallbacks = {
            onFitModeChange: (fromTool, fitMode) => __classPrivateFieldSet(this, _ToolPanel_fitMode, fitMode, "f"),
            onCommentsViewChange: (fromTool, onlyFirst, oneLine) => this.onCommentsViewChange?.(onlyFirst, oneLine),
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
            $toolDetails.append($toolSummary, ...tool.getTool(toolCallbacks, server, map, figureDialog));
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
        globalEventsListener.timestampListener = (timestamp) => {
            this.toolBroadcaster.broadcastTimestampChange(null, timestamp);
        };
    }
    receiveNoteCounts(nFetched, nVisible) {
        this.toolBroadcaster.broadcastNoteCountsChange(null, nFetched, nVisible);
    }
    receiveSelectedNotes(selectedNotes, selectedNoteUsers) {
        this.toolBroadcaster.broadcastSelectedNotesChange(null, selectedNotes, selectedNoteUsers);
    }
    get fitMode() {
        return __classPrivateFieldGet(this, _ToolPanel_fitMode, "f");
    }
}
_ToolPanel_fitMode = new WeakMap();
function toolAnimationEndListener() {
    this.classList.remove('ping');
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
async function downloadAndShowChangeset($a, server, map, changesetId) {
    downloadCommon($a, map, async () => {
        const response = await server.apiFetch(e `changeset/${changesetId}.json`);
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
        addGeometryToMap(map, makeChangesetGeometry(changeset), () => makeChangesetPopupContents(server, changeset));
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
async function downloadAndShowElement($a, server, map, elementType, elementId) {
    downloadCommon($a, map, async () => {
        const fullBit = (elementType == 'node' ? '' : '/full');
        const response = await server.apiFetch(e `${elementType}/${elementId}` + `${fullBit}.json`);
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
            addGeometryToMap(map, makeNodeGeometry(element), () => makeElementPopupContents(server, element));
        }
        else if (isOsmWayElement(element)) {
            addGeometryToMap(map, makeWayGeometry(element, elements), () => makeElementPopupContents(server, element));
        }
        else if (isOsmRelationElement(element)) {
            addGeometryToMap(map, makeRelationGeometry(element, elements), () => makeElementPopupContents(server, element));
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
function makeChangesetPopupContents(server, changeset) {
    const contents = [];
    const p = (...s) => makeElement('p')()(...s);
    const h = (...s) => p(makeElement('strong')()(...s));
    const c = (...s) => p(makeElement('em')()(...s));
    const changesetHref = server.getWebUrl(e `changeset/${changeset.id}`);
    contents.push(h(`Changeset: `, makeLink(String(changeset.id), changesetHref)));
    if (changeset.tags?.comment)
        contents.push(c(changeset.tags.comment));
    const $p = p();
    if (changeset.closed_at) {
        $p.append(`Closed on `, getDate(changeset.closed_at));
    }
    else {
        $p.append(`Created on `, getDate(changeset.created_at));
    }
    $p.append(` by `, getUser(server, changeset));
    contents.push($p);
    const $tags = getTags(changeset.tags, 'comment');
    if ($tags)
        contents.push($tags);
    return contents;
}
function makeElementPopupContents(server, element) {
    const p = (...s) => makeElement('p')()(...s);
    const h = (...s) => p(makeElement('strong')()(...s));
    const elementPath = e `${element.type}/${element.id}`;
    const contents = [
        h(capitalize(element.type) + `: `, makeLink(getElementName(element), server.getWebUrl(elementPath))),
        h(`Version #${element.version} · `, makeLink(`View History`, server.getWebUrl(elementPath + '/history')), ` · `, makeLink(`Edit`, server.getWebUrl(e `edit?${element.type}=${element.id}`))),
        p(`Edited on `, getDate(element.timestamp), ` by `, getUser(server, element), ` · Changeset #`, getChangeset(server, element.changeset))
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
function getDate(timestamp) {
    const readableDate = timestamp.replace('T', ' ').replace('Z', '');
    const $time = document.createElement('time');
    $time.classList.add('listened');
    $time.textContent = readableDate;
    $time.dateTime = timestamp;
    return $time;
}
function getUser(server, data) {
    const $a = makeUserLink(server, data.uid, data.user);
    $a.classList.add('listened');
    $a.dataset.userName = data.user;
    $a.dataset.userId = String(data.uid);
    return $a;
}
function getChangeset(server, changesetId) {
    const cid = String(changesetId);
    const $a = makeLink(cid, server.getWebUrl(e `changeset/${cid}`));
    $a.classList.add('listened');
    $a.dataset.changesetId = cid;
    return $a;
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
            const $keyCell = $row.insertCell();
            $keyCell.textContent = k;
            if (k.length > 30)
                $keyCell.classList.add('long');
            $row.insertCell().textContent = v;
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
function makeUserLink(server, uid, username) {
    if (username)
        return makeUserNameLink(server, username);
    return makeUserIdLink(server, uid);
}
function makeUserNameLink(server, username) {
    const fromName = (name) => server.getWebUrl(e `user/${name}`);
    return makeLink(username, fromName(username));
}
function makeUserIdLink(server, uid) {
    const fromId = (id) => server.getApiUrl(e `user/${id}`);
    return makeLink('#' + uid, fromId(uid));
}

var serverListConfig = [
    null,
    {
        web: `https://master.apis.dev.openstreetmap.org/`,
        note: [
            `OSM sandbox/development server`,
            `https://wiki.openstreetmap.org/wiki/Sandbox_for_editing#Experiment_with_the_API_(advanced)`
        ]
    },
    {
        web: [
            `https://www.openhistoricalmap.org/`,
            `https://openhistoricalmap.org/`
        ],
        nominatim: `https://nominatim.openhistoricalmap.org/`,
        overpass: `https://overpass-api.openhistoricalmap.org/`,
        overpassTurbo: `https://openhistoricalmap.github.io/overpass-turbo/`,
        note: `no tiles support`
    },
    {
        web: `https://opengeofiction.net/`,
        tiles: {
            template: `https://tiles04.rent-a-planet.com/ogf-carto/{z}/{x}/{y}.png`,
            attribution: `OpenGeofiction and contributors`
        },
        overpass: `https://overpass.ogf.rent-a-planet.com/`,
        overpassTurbo: `https://turbo.ogf.rent-a-planet.com/`,
        note: `no Nominatim support`
    },
    {
        web: `https://fosm.org/`,
        tiles: {
            template: `https://map.fosm.org/default/{z}/{x}/{y}.png`,
            attribution: `https://fosm.org/`,
            zoom: 18
        },
        note: `mostly useless here because notes are not implemented on this server`
    }
];

main();
async function main() {
    const storage = new NoteViewerStorage('osm-note-viewer-');
    const db = await NoteViewerDB.open();
    const serverList = new ServerList(serverListConfig);
    const globalEventsListener = new GlobalEventListener();
    const $navbarContainer = document.createElement('nav');
    const $fetchContainer = makeDiv('panel', 'fetch')();
    const $filterContainer = makeDiv('panel', 'fetch')();
    const $notesContainer = makeDiv('notes')();
    const $moreContainer = makeDiv('more')();
    const $toolContainer = makeDiv('panel', 'command')();
    const $mapContainer = makeDiv('map')();
    const $figureDialog = document.createElement('dialog');
    $figureDialog.classList.add('figure');
    const $scrollingPart = makeDiv('scrolling')($navbarContainer, $fetchContainer, $filterContainer, $notesContainer, $moreContainer);
    const $stickyPart = makeDiv('sticky')($toolContainer);
    const $textSide = makeDiv('text-side')($scrollingPart, $stickyPart);
    const $graphicSide = makeDiv('graphic-side')($mapContainer, $figureDialog);
    const flipped = !!storage.getItem('flipped');
    if (flipped)
        document.body.classList.add('flipped');
    document.body.append($textSide, $graphicSide);
    const globalHistory = new GlobalHistory($scrollingPart, $notesContainer, serverList);
    const server = globalHistory.server;
    const map = new NoteMap($mapContainer, server);
    map.onMoveEnd(() => {
        globalHistory.setMapHash(map.hash);
    });
    globalHistory.onMapHashChange = (mapHash) => {
        const [zoomString, latString, lonString] = mapHash.split('/');
        if (zoomString && latString && lonString) {
            map.panAndZoomTo([Number(latString), Number(lonString)], Number(zoomString));
        }
    };
    globalHistory.triggerInitialMapHashChange();
    const figureDialog = new FigureDialog($figureDialog);
    globalEventsListener.elementListener = ($a, elementType, elementId) => {
        if (elementType != 'node' && elementType != 'way' && elementType != 'relation')
            return false;
        figureDialog.close();
        downloadAndShowElement($a, server, map, elementType, elementId);
    };
    globalEventsListener.changesetListener = ($a, changesetId) => {
        figureDialog.close();
        downloadAndShowChangeset($a, server, map, changesetId);
    };
    globalEventsListener.mapListener = ($a, zoom, lat, lon) => {
        figureDialog.close();
        map.panAndZoomTo([Number(lat), Number(lon)], Number(zoom));
    };
    globalEventsListener.imageListener = ($a) => {
        figureDialog.toggle($a.href);
    };
    const navbar = new Navbar(storage, $navbarContainer, map);
    const filterPanel = new NoteFilterPanel(server, $filterContainer);
    const toolPanel = new ToolPanel(storage, server, globalEventsListener, $toolContainer, map, figureDialog);
    const noteTable = new NoteTable($notesContainer, toolPanel, map, filterPanel.noteFilter, figureDialog, server);
    globalEventsListener.noteListener = ($a, noteId) => {
        noteTable.pingNoteFromLink($a, noteId);
    };
    const fetchPanel = new NoteFetchPanel(storage, db, server, serverList, globalEventsListener, globalHistory, $fetchContainer, $moreContainer, navbar, filterPanel, noteTable, map, figureDialog);
    globalEventsListener.noteSelfListener = ($a, noteId) => {
        fetchPanel.updateNote($a, Number(noteId));
    };
    globalHistory.restoreScrollPosition();
}
