function getStorageString(storage, k) {
    return storage.getItem(k) ?? '';
}
function setStorageString(storage, k, v) {
    if (v != '') {
        storage.setItem(k, v);
    }
    else {
        storage.removeItem(k);
    }
}
function getStorageBoolean(storage, k) {
    return !!storage.getItem(k);
}
function setStorageBoolean(storage, k, v) {
    if (v) {
        storage.setItem(k, '1');
    }
    else {
        storage.removeItem(k);
    }
}
class PrefixedLocalStorage {
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
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k?.startsWith(this.prefix))
                continue;
            result.push(k.substring(this.prefix.length));
        }
        return result;
    }
    clear() {
        for (const k of this.getKeys()) {
            this.removeItem(k);
        }
    }
}

class NoteViewerStorage extends PrefixedLocalStorage {
    constructor() {
        super('osm-note-viewer-');
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

class Connection {
    constructor(server, authStorage) {
        this.server = server;
        this.authStorage = authStorage;
    }
    get token() {
        return this.authStorage.token;
    }
    get username() {
        return this.authStorage.login?.username;
    }
    get uid() {
        return this.authStorage.login?.uid;
    }
    get isModerator() {
        return this.authStorage.login?.roles?.includes('moderator') ?? false;
    }
}

function isArrayOfStrings(value) {
    return isArray(value) && value.every(item => typeof item == 'string');
}
function isArrayOfNumbers(value) {
    return isArray(value) && value.every(item => typeof item == 'number');
}
function isArray(value) {
    return Array.isArray(value);
}

function makeLogin$1(data) {
    if (!data || typeof data != 'object' ||
        !('scope' in data) || typeof data.scope != 'string' ||
        !('uid' in data) || typeof data.uid != 'number' ||
        !('username' in data) || typeof data.username != 'string')
        throw new TypeError(`Invalid login data`);
    const login = {
        scope: data.scope,
        uid: data.uid,
        username: data.username
    };
    if (('roles' in data) && isArrayOfStrings(data.roles)) {
        login.roles = data.roles;
    }
    return login;
}
class AuthStorage {
    constructor(storage, host, installUri) {
        this.storage = storage;
        this.host = host;
        this.installUri = installUri;
        this.manualCodeUri = `urn:ietf:wg:oauth:2.0:oob`;
    }
    get prefix() {
        return `host[${this.host}].`;
    }
    get clientId() {
        return getStorageString(this.storage, `${this.prefix}clientId`);
    }
    set clientId(clientId) {
        setStorageString(this.storage, `${this.prefix}clientId`, clientId);
    }
    get isManualCodeEntry() {
        return getStorageBoolean(this.storage, `${this.prefix}isManualCodeEntry`);
    }
    set isManualCodeEntry(isManualCodeEntry) {
        setStorageBoolean(this.storage, `${this.prefix}isManualCodeEntry`, isManualCodeEntry);
    }
    get token() {
        return getStorageString(this.storage, `${this.prefix}token`);
    }
    set token(token) {
        setStorageString(this.storage, `${this.prefix}token`, token);
    }
    get redirectUri() {
        return this.isManualCodeEntry ? this.manualCodeUri : this.installUri;
    }
    getLogins() {
        const logins = new Map;
        const loginsString = this.storage.getItem(`${this.prefix}logins`);
        if (loginsString == null)
            return logins;
        let loginsArray;
        try {
            loginsArray = JSON.parse(loginsString);
        }
        catch { }
        if (!isArray(loginsArray))
            return logins;
        for (const loginsArrayEntry of loginsArray) {
            if (!isArray(loginsArrayEntry))
                continue;
            const [token, loginData] = loginsArrayEntry;
            if (typeof token != 'string')
                continue;
            try {
                const login = makeLogin$1(loginData);
                logins.set(token, login);
            }
            catch { }
        }
        return logins;
    }
    setLogin(token, login) {
        const logins = this.getLogins();
        logins.set(token, login);
        this.setLoginsStorageItem(logins);
    }
    deleteLogin(token) {
        const logins = this.getLogins();
        logins.delete(token);
        this.setLoginsStorageItem(logins);
    }
    get login() {
        return this.getLogins().get(this.token);
    }
    setLoginsStorageItem(logins) {
        this.storage.setItem(`${this.prefix}logins`, JSON.stringify([...logins.entries()]));
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
function makeElement(tag) {
    return (...classes) => (...items) => {
        const $element = document.createElement(tag);
        if (classes.length > 0)
            $element.classList.add(...classes);
        $element.append(...items);
        return $element;
    };
}
const makeDiv = makeElement('div');
const makeLabel = makeElement('label');
function makeSemiLink(...classes) {
    const makeWithItems = makeElement('a')(...classes);
    return (...items) => {
        const $a = makeWithItems(...items);
        $a.setAttribute('tabindex', '0');
        $a.addEventListener('keydown', semiLinkKeydownListener);
        return $a;
    };
}
function semiLinkKeydownListener(ev) {
    if (ev.key != 'Enter')
        return;
    this.click();
    ev.preventDefault();
    ev.stopPropagation();
}
function startAnimation($element, animationName, animationDuration) {
    if (resetAnimation($element, animationName))
        return;
    $element.style.animationName = animationName;
    $element.style.animationDuration = animationDuration;
}
function resetAnimation($element, animationName) {
    const animation = getAnimation($element, animationName);
    if (!animation)
        return false;
    animation.currentTime = 0;
    return true;
}
function cleanupAnimationOnEnd($element) {
    $element.addEventListener('animationend', animationEndListener);
}
function animationEndListener() {
    this.style.removeProperty('animation-name');
    this.style.removeProperty('animation-duration');
}
function getAnimation($element, animationName) {
    if (typeof CSSAnimation == 'undefined')
        return; // experimental technology, implemented in latest browser versions
    for (const animation of $element.getAnimations()) {
        if (!(animation instanceof CSSAnimation))
            continue;
        if (animation.animationName == animationName)
            return animation;
    }
}
async function wrapFetch($actionButton, action, getErrorMessage, $errorClassReceiver, writeErrorMessage) {
    try {
        $actionButton.disabled = true;
        $errorClassReceiver.classList.remove('error');
        writeErrorMessage('');
        await action();
    }
    catch (ex) {
        $errorClassReceiver.classList.add('error');
        writeErrorMessage(getErrorMessage(ex));
    }
    finally {
        $actionButton.disabled = false;
    }
}
function wrapFetchForButton($actionButton, action, getErrorMessage) {
    return wrapFetch($actionButton, action, getErrorMessage, $actionButton, message => $actionButton.title = message);
}
function makeGetKnownErrorMessage(KnownError // KnownError: typeof TypeError,
) {
    return (ex) => {
        if (ex instanceof TypeError && ex instanceof KnownError) {
            return ex.message;
        }
        else {
            return `Unknown error ${ex}`;
        }
    };
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
class OsmProvider {
    get fetch() {
        let method;
        const headers = {};
        let body;
        const fetcher = (path, init) => {
            const hasHeaders = Object.keys(headers).length > 0;
            if (method != null || hasHeaders || body != null) {
                init = { ...init };
                if (method != null) {
                    init.method = method;
                }
                if (hasHeaders) {
                    init.headers = new Headers([
                        ...new Headers(headers),
                        ...new Headers(init.headers)
                    ]);
                }
                if (body != null && init.body == null) {
                    init.body = body;
                }
            }
            return fetch(this.getUrl(path), init);
        };
        fetcher.post = (path, init) => {
            method = 'POST';
            return fetcher(path, init);
        };
        fetcher.delete = (path, init) => {
            method = 'DELETE';
            return fetcher(path, init);
        };
        fetcher.withUrlencodedBody = (parameters) => {
            headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
            body = parameters.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
            return fetcher;
        };
        fetcher.withToken = (token) => {
            if (token)
                headers['Authorization'] = 'Bearer ' + token;
            return fetcher;
        };
        return fetcher;
    }
}
class WebProvider extends OsmProvider {
    constructor(urls) {
        super();
        this.urls = urls;
    }
    getUrl(path) {
        return `${this.urls[0]}${path}`;
    }
    getNoteLocationUrl(lat, lon) {
        return this.getUrl(`#map=15/${lat.toFixed(4)}/${lon.toFixed(4)}&layers=N`);
    }
    makeUserLink(uid, username) {
        const href = this.getUrl(`user/` + encodeURIComponent(username));
        const $a = makeLink(username, href);
        $a.classList.add('listened');
        $a.dataset.userName = username;
        $a.dataset.userId = String(uid);
        return $a;
    }
}
class ApiProvider extends OsmProvider {
    constructor(url) {
        super();
        this.url = url;
    }
    getUrl(path) {
        return `${this.url}api/0.6/${path}`;
    }
    getRootUrl(rootPath) {
        return `${this.url}${rootPath}`;
    }
}
class TileProvider {
    constructor(urlTemplate, attributionUrl, attributionText, maxZoom, owner) {
        this.urlTemplate = urlTemplate;
        this.attributionUrl = attributionUrl;
        this.attributionText = attributionText;
        this.maxZoom = maxZoom;
        this.owner = owner;
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
    get statusUrl() {
        return this.url + `status.php?format=json`;
    }
}
class OverpassProvider {
    constructor(url) {
        this.url = url;
    }
    async fetch(query) {
        try {
            let response;
            try {
                response = await fetch(this.url + `api/interpreter`, {
                    method: 'POST',
                    body: new URLSearchParams({ data: query })
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
    get statusUrl() {
        return this.url + `api/status`;
    }
}
class OverpassTurboProvider {
    constructor(url) {
        this.url = url;
    }
    getUrl(query, lat, lon, zoom) {
        const e = makeEscapeTag(encodeURIComponent);
        const location = `${lat};${lon};${zoom}`;
        return this.url + e `?C=${location}&Q=${query}`;
    }
}
class Server {
    constructor(host, apiUrl, webUrls, tileUrlTemplate, tileAttributionUrl, tileAttributionText, tileMaxZoom, tileOwner, nominatimUrl, overpassUrl, overpassTurboUrl, noteUrl, noteText, world, oauthId, 
    /**
      * App location registered with OSM server to receive auth redirects
      */
    oauthUrl) {
        this.host = host;
        this.noteUrl = noteUrl;
        this.noteText = noteText;
        this.world = world;
        this.oauthId = oauthId;
        this.oauthUrl = oauthUrl;
        this.web = new WebProvider(webUrls);
        this.api = new ApiProvider(apiUrl);
        this.tile = new TileProvider(tileUrlTemplate, tileAttributionUrl, tileAttributionText, tileMaxZoom, tileOwner);
        if (nominatimUrl != null)
            this.nominatim = new NominatimProvider(nominatimUrl);
        if (overpassUrl != null)
            this.overpass = new OverpassProvider(overpassUrl);
        if (overpassTurboUrl != null)
            this.overpassTurbo = new OverpassTurboProvider(overpassTurboUrl);
    }
}

// can't use URLSearchParams for encoding because of different escaping
function getHashFromLocation() {
    return (location.hash[0] == '#'
        ? location.hash.slice(1)
        : location.hash);
}
function detachValueFromHash(key, hash) {
    let metKey = false;
    let value = null;
    const restParts = [];
    for (const part of hash.split('&')) {
        if (metKey) {
            restParts.push(part);
            continue;
        }
        const detectedValue = new URLSearchParams(part).get(key);
        if (detectedValue == null) {
            restParts.push(part);
        }
        else {
            value = detectedValue;
            metKey = true;
        }
    }
    return [value, restParts.join('&')];
}
function attachValueToFrontOfHash(key, value, restOfHash) {
    if (value == null)
        return restOfHash;
    const valueHash = `${key}=${escapeHash(value)}`;
    if (!restOfHash)
        return valueHash;
    return `${valueHash}&${restOfHash}`;
}
function attachValueToBackOfHash(key, value, restOfHash) {
    if (value == null)
        return restOfHash;
    const valueHash = `${key}=${escapeHash(value)}`;
    if (!restOfHash)
        return valueHash;
    return `${restOfHash}&${valueHash}`;
}

const em = (...ss) => makeElement('em')()(...ss);
const strong = (...ss) => makeElement('strong')()(...ss);
const sup = (...ss) => makeElement('sup')()(...ss);
const dfn = (...ss) => makeElement('dfn')()(...ss);
const kbd = (...ss) => makeElement('kbd')()(...ss);
const code = (...ss) => makeElement('code')()(...ss);
const mark = (...ss) => makeElement('mark')()(...ss);
const a = (...ss) => makeElement('a')()(...ss);
const p = (...ss) => makeElement('p')()(...ss);
const ul = (...ss) => makeElement('ul')()(...ss);
const ol = (...ss) => makeElement('ol')()(...ss);
const li = (...ss) => makeElement('li')()(...ss);

class HashServerSelector {
    constructor(serverList) {
        this.serverList = serverList;
        const hash = getHashFromLocation();
        [this.hostHashValue] = detachValueFromHash('host', hash);
    }
    // generic server selector methods
    selectServer() {
        return this.getServerForHostHashValue(this.hostHashValue);
    }
    getServerSelectHref(server) {
        const baseLocation = location.pathname + location.search;
        const hashValue = this.getHostHashValueForServer(server);
        return baseLocation + (hashValue ? `#host=` + escapeHash(hashValue) : '');
    }
    addServerSelectToAppInstallLocationHref(server, installLocationHref) {
        const hashValue = this.getHostHashValueForServer(server);
        return installLocationHref + (hashValue ? `#host=` + escapeHash(hashValue) : '');
    }
    makeServerSelectErrorMessage() {
        const hostHash = (this.hostHashValue != null
            ? `host=` + escapeHash(this.hostHashValue)
            : ``);
        return [
            `Unknown server in URL hash parameter `, code(hostHash), `.`
        ];
    }
    // host-hash-specific methods
    getHostHashValueForServer(server) {
        let hostHashValue = null;
        if (server != this.serverList.defaultServer) {
            hostHashValue = server.host;
        }
        return hostHashValue;
    }
    getServerForHostHashValue(hostHashValue) {
        if (hostHashValue == null)
            return this.serverList.defaultServer;
        return this.serverList.servers.get(hostHashValue);
    }
    installHashChangeListener(cx, callback, callBackImmediately = false) {
        window.addEventListener('hashchange', () => {
            const hash = getHashFromLocation();
            const [hostHashValue, hostlessHash] = detachValueFromHash('host', hash);
            if (!cx) {
                if (hostHashValue != this.hostHashValue)
                    location.reload();
                return;
            }
            if (hostHashValue != this.getHostHashValueForServer(cx.server)) {
                location.reload();
                return;
            }
            callback(hostlessHash);
        });
        if (callBackImmediately) {
            const hash = getHashFromLocation();
            const [, hostlessHash] = detachValueFromHash('host', hash);
            callback(hostlessHash);
        }
    }
    getHostlessHash() {
        const hash = getHashFromLocation();
        const [, hostlessHash] = detachValueFromHash('host', hash);
        return hostlessHash;
    }
    pushHostlessHashInHistory(hostlessHash) {
        this.pushOrReplaceHostlessHashInHistory(hostlessHash, true);
    }
    replaceHostlessHashInHistory(hostlessHash) {
        this.pushOrReplaceHostlessHashInHistory(hostlessHash, false);
    }
    pushOrReplaceHostlessHashInHistory(hostlessHash, push = false) {
        const hash = attachValueToFrontOfHash('host', this.hostHashValue, hostlessHash);
        const fullHash = hash ? '#' + hash : '';
        if (fullHash != location.hash) {
            const url = fullHash || location.pathname + location.search;
            if (push) {
                history.pushState(history.state, '', url);
            }
            else {
                history.replaceState(history.state, '', url);
            }
        }
    }
}

function parseServerListSource(configSource) {
    if (Array.isArray(configSource)) {
        return configSource.map(parseServerListItem);
    }
    else {
        return [parseServerListItem(configSource)];
    }
}
function parseServerListItem(config) {
    let apiUrl;
    let webUrls;
    let tileUrlTemplate = `https://tile.openstreetmap.org/{z}/{x}/{y}.png`;
    let tileAttributionUrl = `https://www.openstreetmap.org/copyright`;
    let tileAttributionText = `OpenStreetMap contributors`;
    let tileMaxZoom = 19;
    let tileOwner = false;
    let nominatimUrl;
    let overpassUrl;
    let overpassTurboUrl;
    let noteUrl;
    let noteText;
    let world = 'earth';
    let oauthId;
    let oauthUrl;
    if (typeof config == 'string') {
        webUrls = [requireUrlStringProperty('web', config)];
    }
    else if (typeof config == 'object' && config) {
        if ('web' in config) {
            if (Array.isArray(config.web)) {
                if (config.web.length == 0)
                    throw new RangeError(`web property as array required to be non-empty`);
                webUrls = config.web.map(value => requireUrlStringProperty('web', value));
            }
            else {
                webUrls = [requireUrlStringProperty('web', config.web)];
            }
        }
        if ('api' in config) {
            apiUrl = requireUrlStringProperty('api', config.api);
        }
        if ('nominatim' in config) {
            nominatimUrl = requireUrlStringProperty('nominatim', config.nominatim);
        }
        if ('overpass' in config) {
            overpassUrl = requireUrlStringProperty('overpass', config.overpass);
        }
        if ('overpassTurbo' in config) {
            overpassTurboUrl = requireUrlStringProperty('overpassTurbo', config.overpassTurbo);
        }
        if ('tiles' in config) {
            tileOwner = true;
            tileAttributionUrl = tileAttributionText = undefined;
            if (typeof config.tiles == 'object' && config.tiles) {
                if ('template' in config.tiles) {
                    tileUrlTemplate = requireStringProperty('tiles.template', config.tiles.template);
                }
                if ('attribution' in config.tiles) {
                    [tileAttributionUrl, tileAttributionText] = parseUrlTextPair('tiles.attribution', tileAttributionUrl, tileAttributionText, config.tiles.attribution);
                }
                if ('zoom' in config.tiles) {
                    tileMaxZoom = requireNumberProperty('tiles.zoom', config.tiles.zoom);
                }
            }
            else {
                tileUrlTemplate = requireStringProperty('tiles', config.tiles);
            }
        }
        if ('world' in config) {
            world = requireStringProperty('world', config.world);
        }
        if ('note' in config) {
            [noteUrl, noteText] = parseUrlTextPair('note', noteUrl, noteText, config.note);
        }
        if ('oauth' in config) {
            if (!config.oauth || typeof config.oauth != 'object') {
                throw new RangeError(`oauth property required to be object`);
            }
            if ('id' in config.oauth) {
                oauthId = requireStringProperty('oauth.id', config.oauth.id);
            }
            else {
                throw new RangeError(`oauth property when defined required to contain id`);
            }
            if ('url' in config.oauth) {
                oauthUrl = requireStringProperty('oauth.url', config.oauth.url);
            }
        }
    }
    else if (config == null) {
        apiUrl = `https://api.openstreetmap.org/`;
        webUrls = [
            `https://www.openstreetmap.org/`,
            `https://openstreetmap.org/`,
            `https://www.osm.org/`,
            `https://osm.org/`,
        ];
        noteText = `main OSM server`;
        nominatimUrl = `https://nominatim.openstreetmap.org/`;
        overpassUrl = `https://www.overpass-api.de/`;
        overpassTurboUrl = `https://overpass-turbo.eu/`;
        tileOwner = true;
    }
    else {
        throw new RangeError(`server specification expected to be null, string or array; got ${type(config)} instead`);
    }
    if (!webUrls) {
        throw new RangeError(`missing required web property`);
    }
    let host;
    try {
        const hostUrl = new URL(webUrls[0]);
        host = hostUrl.host;
    }
    catch {
        throw new RangeError(`invalid web property value "${webUrls[0]}"`); // shouldn't happen
    }
    return [
        host,
        apiUrl ?? webUrls[0],
        webUrls,
        tileUrlTemplate,
        tileAttributionUrl ?? deriveAttributionUrl(webUrls),
        tileAttributionText ?? deriveAttributionText(webUrls),
        tileMaxZoom, tileOwner,
        nominatimUrl, overpassUrl, overpassTurboUrl,
        noteUrl, noteText,
        world,
        oauthId,
        oauthUrl
    ];
}
function requireUrlStringProperty(name, value) {
    if (typeof value != 'string')
        throw new RangeError(`${name} property required to be string; got ${type(value)} instead`);
    try {
        return new URL(value).href;
    }
    catch {
        throw new RangeError(`${name} property required to be url; got "${value}"`);
    }
}
function requireStringProperty(name, value) {
    if (typeof value != 'string')
        throw new RangeError(`${name} property required to be string; got ${type(value)} instead`);
    return value;
}
function requireNumberProperty(name, value) {
    if (typeof value != 'number')
        throw new RangeError(`${name} property required to be number; got ${type(value)} instead`);
    return value;
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
function parseUrlTextPairItem(name, urlValue, textValue, newValue) {
    if (typeof newValue != 'string')
        throw new RangeError(`${name} array property requires all elements to be strings; got ${type(newValue)} instead`);
    try {
        const url = new URL(newValue);
        return [url.href, textValue];
    }
    catch {
        return [urlValue, newValue];
    }
}
function parseUrlTextPair(name, urlValue, textValue, newItems) {
    if (typeof newItems == 'string') {
        [urlValue, textValue] = parseUrlTextPairItem(name, urlValue, textValue, newItems);
    }
    else if (Array.isArray(newItems)) {
        for (const newValue of newItems) {
            [urlValue, textValue] = parseUrlTextPairItem(name, urlValue, textValue, newValue);
        }
    }
    else {
        throw new RangeError(`${name} property required to be string or array of strings; got ${type(newItems)} instead`);
    }
    return [urlValue, textValue];
}
function type(value) {
    if (Array.isArray(value)) {
        return 'array';
    }
    else if (value == null) {
        return 'null';
    }
    else {
        return typeof value;
    }
}

class ServerList {
    constructor(...configSources) {
        this.servers = new Map();
        [this.defaultServerListConfig] = configSources;
        for (const configSource of configSources) {
            try {
                const parametersList = parseServerListSource(configSource);
                for (const parameters of parametersList) {
                    const server = new Server(...parameters);
                    this.servers.set(server.host, server);
                }
            }
            catch { }
        }
        if (this.servers.size == 0) {
            const parameters = parseServerListItem(null); // shouldn't throw
            const server = new Server(...parameters);
            this.servers.set(server.host, server);
        }
        [this.defaultServer] = this.servers.values();
    }
}

function makeCodeForm(initialValue, stashedValue, summary, textareaLabel, applyButtonLabel, isSameInput, checkInput, applyInput, runCallback, syntaxDescription, syntaxExamples) {
    const $formDetails = document.createElement('details');
    const $form = document.createElement('form');
    const $output = document.createElement('output');
    const $textarea = document.createElement('textarea');
    const $applyButton = document.createElement('button');
    const $clearButton = document.createElement('button');
    const $undoClearButton = document.createElement('button');
    $textarea.value = initialValue;
    const isEmpty = () => !$textarea.value;
    const canUndoClear = () => !!stashedValue && isEmpty();
    const reactToChanges = () => {
        const isSame = isSameInput($textarea.value);
        $output.replaceChildren();
        if (!isSame) {
            $output.append(` (with unapplied changes)`);
        }
        else if (isEmpty()) {
            $output.append(` (currently not set)`);
        }
        $applyButton.disabled = isSame;
        $clearButton.disabled = isEmpty();
        $undoClearButton.hidden = !($clearButton.hidden = canUndoClear());
        try {
            checkInput($textarea.value);
            $textarea.setCustomValidity('');
        }
        catch (ex) {
            let message = `Syntax error`;
            if (ex instanceof RangeError || ex instanceof SyntaxError)
                message = ex.message;
            $textarea.setCustomValidity(message);
        }
    };
    reactToChanges();
    {
        $formDetails.classList.add('with-code-form');
        $formDetails.open = !isEmpty();
        const $formSummary = document.createElement('summary');
        $formSummary.append(summary, $output);
        $formDetails.append($formSummary, $form);
    }
    {
        const $syntaxDetails = document.createElement('details');
        $syntaxDetails.classList.add('syntax');
        $syntaxDetails.innerHTML = syntaxDescription;
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
        $syntaxDetails.append($examplesTitle, $examplesList);
        $form.append($syntaxDetails);
    }
    {
        $textarea.rows = 5;
        $form.append(makeDiv('major-input-group')(makeLabel()(textareaLabel, ` `, $textarea)));
    }
    {
        $applyButton.textContent = applyButtonLabel;
        $clearButton.textContent = `Clear`;
        $undoClearButton.textContent = `Restore previous`;
        $undoClearButton.type = $clearButton.type = 'button';
        $form.append(makeDiv('gridded-input-group')($applyButton, $clearButton, $undoClearButton));
    }
    $textarea.oninput = reactToChanges;
    $clearButton.onclick = () => {
        stashedValue = $textarea.value;
        $textarea.value = '';
        $undoClearButton.textContent = `Undo clear`;
        reactToChanges();
    };
    $undoClearButton.onclick = () => {
        $textarea.value = stashedValue;
        reactToChanges();
    };
    $form.onsubmit = (ev) => {
        ev.preventDefault();
        try {
            applyInput($textarea.value);
        }
        catch (ex) {
            return;
        }
        runCallback();
        reactToChanges();
    };
    return $formDetails;
}

class RadioTable {
    constructor(radioName, columns) {
        this.radioName = radioName;
        this.$table = makeElement('table')()();
        this.cellClassesList = [];
        this.nRows = 0;
        const $row = this.$table.insertRow();
        for (const [cellClasses, cellLabels] of [[[], []], ...columns]) {
            $row.append(makeElement('th')(...cellClasses)(...cellLabels));
            this.cellClassesList.push(cellClasses);
        }
    }
    addRow(provideCellContent) {
        const $radio = document.createElement('input');
        $radio.type = 'radio';
        $radio.name = this.radioName;
        $radio.id = `${this.radioName}-${this.nRows}`;
        const $row = this.$table.insertRow();
        const contentList = [[$radio], ...provideCellContent($radio)];
        for (const [i, cellContent] of contentList.entries()) {
            const cellClasses = this.cellClassesList[i] ?? [];
            let rawCellContent;
            if (typeof cellContent == 'undefined') {
                rawCellContent = [];
            }
            else if (typeof cellContent == 'boolean') {
                rawCellContent = [cellContent ? '+' : ''];
            }
            else if (typeof cellContent == 'string') {
                rawCellContent = [cellContent ? makeLink('+', cellContent) : ''];
            }
            else {
                rawCellContent = cellContent;
            }
            $row.append(makeElement('td')(...cellClasses)(...rawCellContent));
        }
        this.nRows++;
    }
}

// TODO html-escape
function term$1(t) {
    return `<em>&lt;${t}&gt;</em>`;
}
function property(t) {
    return `<strong><code>${t}</code></strong>`;
}
// TODO html-escape app name
const makeSyntaxDescription = (appName) => `<summary>Custom server configuration syntax</summary>
<p>Uses <a href=https://en.wikipedia.org/wiki/JSON>JSON</a> format to describe one or more custom servers.
These servers can be referred to in the <code>host</code> URL parameter and appear in the list above.
The entire custom servers input can be one of:</p>
<ul>
<li>empty when no custom servers are specified
<li>an <em>array</em> where each element is a ${term$1('server specification')}
<li>a single ${term$1('server specification')}
</ul>
<p>A ${term$1('server specification')} is <em>null</em> for default OSM server configuration, a <em>URL string</em> for a quick configuration, or an <em>object</em> with optional properties described below.
A <em>string</em> is equivalent to an <em>object</em> with only the ${property('web')} property set.
Possible <em>object</em> properties are:</p>
<dl>
<dt>${property('web')}
<dd><strong>required</strong>; a <em>URL string</em> or an <em>array</em> of <em>URL strings</em>; used to generate/detect links to users/notes/elements/changesets
<dt>${property('api')}
<dd>a <em>URL string</em>; used for OSM API requests; defaults to ${property('web')} property value if not specified
<dt>${property('nominatim')}
<dd>a <em>URL string</em> pointing to a <a href=https://wiki.openstreetmap.org/wiki/Nominatim>Nominatim</a> service
<dt>${property('overpass')}
<dd>a <em>URL string</em> pointing to an <a href=https://wiki.openstreetmap.org/wiki/Overpass_API>Overpass API</a> server
<dt>${property('overpassTurbo')}
<dd>a <em>URL string</em> pointing to an <a href=https://wiki.openstreetmap.org/wiki/Overpass_turbo>Overpass turbo</a> web page
<dt>${property('tiles')}
<dd>a ${term$1('tiles specification')}
<dt>${property('world')}
<dd>a <em>string</em>; if it's not <code>"earth"</code>, street view tools won't be shown
<dt>${property('oauth')}
<dd>an ${term$1('oauth specification')}
<dt>${property('note')}
<dd>a <em>URL string</em>, a <em>text string</em> or an <em>array</em> of both representing a note about the server visible on the server list
</dl>
<p>A ${term$1('tiles specification')} is a <em>string</em> or an <em>object</em> with optional properties described below.
A <em>string</em> value is equivalent to an <em>object</em> with only the ${property('template')} property set.
Possible <em>object</em> properties are:</p>
<dl>
<dt>${property('template')}
<dd>a <em>string</em> with template parameters like "<code>https://tile.openstreetmap.org/{z}/{x}/{y}.png</code>" or "<code>https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png</code>" to generate tile URLs
<dt>${property('attribution')}
<dd>a <em>URL string</em>, a <em>text string</em> or an <em>array</em> of both containing an <a href=https://wiki.osmfoundation.org/wiki/Licence/Attribution_Guidelines#Interactive_maps>attribution</a> displayed in the corner of the map
<dt>${property('zoom')}
<dd>a number with max zoom level; defaults to the OSM max zoom value of 19
</dl>
<p>An ${term$1('oauth specification')} is an <em>object</em> describing the registration of <em>${appName}</em> as an <a href=https://wiki.openstreetmap.org/wiki/OAuth#OAuth_2.0_2>OAuth 2 app</a> on this OSM server.
It can have the following properties:</p>
<dl>
<dt>${property('id')}
<dd>a <em>string</em> with the OAuth <em>client id</em>; this property is <strong>required</strong> when an ${term$1('oauth specification')} is present
<dt>${property('url')}
<dd>a <em>string</em> with the OAuth <em>redirect URI</em> matching the location where <em>${appName}</em> is hosted;
this property is optional, it is used to remind about the correct location that is going to receive OAuth redirects in case if <em>${appName}</em> is copied to a different location
</dl>
`;
const makeSyntaxExamples = (defaultServerListConfig) => [
    [`Local server on port 3333`, [`"http://127.0.0.1:3333/"`]],
    [`Dev server with custom tiles`, [
            `{`,
            `  "web": "https://api06.dev.openstreetmap.org/",`,
            `  "tiles": "https://tile.openstreetmap.de/{z}/{x}/{y}.png",`,
            `  "note": "dev server with German tiles"`,
            `}`
        ]],
    [`Dev server with custom tiles and different max zoom`, [
            `{`,
            `  "web": "https://api06.dev.openstreetmap.org/",`,
            `  "tiles": {`,
            `    "template": "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",`,
            `    "zoom": 20`,
            `  },`,
            `  "note": "dev server with CyclOSM tiles"`,
            `}`
        ]],
    [`Default configuration`, [JSON.stringify(defaultServerListConfig, undefined, 2)]]
];
class ServerListSection {
    constructor($section, appName, storage, server, serverList, serverSelector) {
        $section.append(makeElement('h2')()(`Servers`));
        if (!server)
            $section.append(makeDiv('notice', 'error')(...serverSelector.makeServerSelectErrorMessage(), ` Please select one of the servers below.`));
        {
            const serverTable = new RadioTable('host', [
                [[], [`host`]],
                [['capability'], [`website`]],
                [['capability'], [`own tiles`]],
                [['capability'], [`Nominatim`]],
                [['capability'], [`Overpass`]],
                [['capability'], [`Overpass turbo`]],
                [[], [`note`]],
            ]);
            for (const [availableHost, availableServer] of serverList.servers) {
                const availableServerLocation = serverSelector.getServerSelectHref(availableServer);
                let note = '';
                if (availableServer.noteText && !availableServer.noteUrl) {
                    note = availableServer.noteText;
                }
                else if (availableServer.noteUrl) {
                    note = makeLink(availableServer.noteText || `[note]`, availableServer.noteUrl);
                }
                serverTable.addRow(($radio) => {
                    $radio.checked = server == availableServer;
                    $radio.tabIndex = -1;
                    const $a = makeLink(availableHost, availableServerLocation);
                    const $label = makeElement('label')()($a);
                    $label.htmlFor = $radio.id;
                    $radio.onclick = () => $a.click();
                    return [
                        [$label],
                        availableServer.web.getUrl(''),
                        availableServer.tile.owner,
                        availableServer.nominatim?.statusUrl,
                        availableServer.overpass?.statusUrl,
                        availableServer.overpassTurbo?.url,
                        [note]
                    ];
                });
            }
            $section.append(serverTable.$table);
        }
        $section.append(makeCodeForm(getStorageString(storage, 'servers'), '', `Custom servers configuration`, `Configuration`, `Apply changes`, input => input == getStorageString(storage, 'servers'), input => {
            if (input.trim() == '')
                return;
            const configSource = JSON.parse(input);
            parseServerListSource(configSource);
        }, input => {
            setStorageString(storage, 'servers', input.trim());
        }, () => {
            location.reload();
        }, makeSyntaxDescription(appName), makeSyntaxExamples(serverList.defaultServerListConfig)));
    }
}

class AppSection {
    constructor($section, appName, oauthScope, authStorage, server, serverSelector) {
        const app = () => em(appName);
        const isSecureWebInstall = (location.protocol == 'https:' ||
            location.protocol == 'http:' && location.hostname == '127.0.0.1');
        const $clientIdInput = document.createElement('input');
        $clientIdInput.id = 'auth-app-client-id';
        $clientIdInput.type = 'text';
        $clientIdInput.value = authStorage.clientId;
        const manualCodeEntryLabel = `Manual authorization code entry`;
        const $manualCodeEntryCheckbox = document.createElement('input');
        $manualCodeEntryCheckbox.id = 'auth-app-manual-code-entry';
        $manualCodeEntryCheckbox.type = 'checkbox';
        $manualCodeEntryCheckbox.checked = authStorage.isManualCodeEntry;
        const $registrationNotice = makeDiv('notice')();
        const $useBuiltinRegistrationButton = makeElement('button')()(`Use the built-in registration`);
        const updateRegistrationNotice = () => {
            $registrationNotice.replaceChildren();
            if (!server.oauthId)
                return;
            $registrationNotice.append(`With `, makeLink(`the selected OSM server`, server.web.getUrl('')), `, `);
            if (authStorage.installUri == server.oauthUrl || !server.oauthUrl) {
                $registrationNotice.append(app(), ` has a built-in registration`);
                if (authStorage.installUri == server.oauthUrl) {
                    const href = serverSelector.addServerSelectToAppInstallLocationHref(server, server.oauthUrl);
                    $registrationNotice.append(` for `, makeLink(`its install location`, href));
                }
                if (!authStorage.clientId) {
                    $registrationNotice.append(` — `, $useBuiltinRegistrationButton);
                }
                else if (authStorage.clientId != server.oauthId) {
                    $registrationNotice.append(` but the current `, em(`client id`), ` doesn't match it`, ` — `, $useBuiltinRegistrationButton);
                }
                else {
                    $registrationNotice.append(` which matches the current `, em(`client id`), ` ✓`);
                }
            }
            else {
                const href = serverSelector.addServerSelectToAppInstallLocationHref(server, server.oauthUrl);
                $registrationNotice.append(app(), ` has a built-in registration for `, makeLink(`a different install location`, href));
            }
        };
        const $overallClientIdPresence = makeElement('span')()();
        const updateOverallClientIdPresence = () => {
            $overallClientIdPresence.replaceChildren(authStorage.clientId
                ? `you have it`
                : `you don't have it`);
        };
        updateOverallClientIdPresence();
        const onRegistrationInput = (...$inputs) => {
            for (const $input of $inputs) {
                if ($input == $clientIdInput) {
                    authStorage.clientId = $clientIdInput.value.trim();
                    updateRegistrationNotice();
                    updateOverallClientIdPresence();
                }
                else if ($input == $manualCodeEntryCheckbox) {
                    authStorage.isManualCodeEntry = $manualCodeEntryCheckbox.checked;
                }
            }
            this.onRegistrationUpdate?.();
        };
        const useBuiltinRegistration = () => {
            if (!server.oauthId)
                return;
            $clientIdInput.value = server.oauthId;
            $manualCodeEntryCheckbox.checked = false;
            onRegistrationInput($clientIdInput, $manualCodeEntryCheckbox);
        };
        $clientIdInput.oninput = () => onRegistrationInput($clientIdInput);
        $manualCodeEntryCheckbox.oninput = () => onRegistrationInput($manualCodeEntryCheckbox);
        $useBuiltinRegistrationButton.onclick = useBuiltinRegistration;
        if (server.oauthId && !authStorage.clientId &&
            (authStorage.installUri == server.oauthUrl || !server.oauthUrl)) {
            useBuiltinRegistration();
        }
        else {
            updateRegistrationNotice();
        }
        const value = (text) => {
            const $kbd = makeElement('kbd')('copy')(text);
            $kbd.onclick = () => navigator.clipboard.writeText(text);
            return $kbd;
        };
        const registrationDetails = (isOpen, redirectUri, isManualCodeEntry, summary, lead) => {
            const makeInputLink = ($input, ...content) => {
                const $anchor = document.createElement('a');
                $anchor.href = '#' + $input.id;
                $anchor.classList.add('input-link');
                $anchor.append(...content);
                $anchor.onclick = ev => {
                    ev.preventDefault();
                    $input.focus();
                };
                return $anchor;
            };
            const $details = makeElement('details')()(makeElement('summary')()(summary), ...lead, ol(li(`Go to `, makeLink(`My Settings > OAuth 2 applications > Register new application`, server.web.getUrl(`oauth2/applications/new`)), ` on `, em(server.host), `.`), li(`For `, em(`Name`), ` enter anything that would help users to identify your copy of `, app(), `, for example, `, value(`${appName} @ ${authStorage.installUri}`), `. `, `Users will see this name on the authorization granting page and in their `, makeLink(`active authorizations list`, server.web.getUrl(`oauth2/authorized_applications`)), ` after they log in here.`), li(`For `, em(`Redirect URIs`), ` enter `, mark(value(redirectUri)), `.`), li(`Uncheck `, em(`Confidential application?`)), li(`In `, em(`Permissions`), ` check:`, makePermissionsList(oauthScope)), li(`Click `, em(`Register`), `.`), li(`Copy the `, em(`Client ID`), ` to `, makeInputLink($clientIdInput, `the input below`), `.`), li(`Don't copy the `, em(`Client Secret`), `. `, `You can write it down somewhere but it's going to be useless because `, app(), ` is not a confidential app and can't keep secrets.`), li(mark(isManualCodeEntry ? `Check` : `Uncheck`), ` `, makeInputLink($manualCodeEntryCheckbox, em(manualCodeEntryLabel), ` below`), `.`)), p(`After these steps you should be able to see `, app(), ` with its client id and permissions in `, makeLink(`your client applications`, server.web.getUrl(`oauth2/applications`)), `.`));
            if (isOpen)
                $details.open = true;
            return $details;
        };
        const $overallDetails = makeElement('details')()(makeElement('summary')()(`Only required if you want logins and don't have a `, em(`client id`), ` (`, $overallClientIdPresence, `).`), p(`You have to get a `, em(`client id`), ` if you want to run your own copy of `, app(), ` and be able to perform actions requiring a login. `, `There are two possible app registration methods described below. `, `Their necessary steps are the same except for the `, mark(`marked`), ` parts.`), registrationDetails(!authStorage.clientId && isSecureWebInstall, authStorage.installUri, false, `Instructions for setting up automatic logins`, [
            p(`This method sets up the most expected login workflow: login happens after the `, em(`Authorize`), ` button is pressed.`), ` `,
            p(`This method will only work when `, app(), ` served over `, em(`https`), ` or over `, em(`http`), ` on localhost. `, ...(isSecureWebInstall
                ? [`This seems to be the case with your install.`]
                : [
                    strong(`This doesn't seem to be the case with your install.`), ` `,
                    `If you register `, app(), ` with this method, logins will likely fail after pressing the `, em(`Authorize`), ` button. `,
                    `Use the registration method with manual code entry described below or move `, app(), ` to a secure web server.`
                ]))
        ]), registrationDetails(!authStorage.clientId && !isSecureWebInstall, authStorage.manualCodeUri, true, `Instructions for setting up logins where users have to copy the authorization code manually`, [
            p(`This sets up a less user-friendly login workflow: after pressing the `, em(`Authorize`), ` an `, em(`Authorization code`), ` appears that has to be copied into the `, em(`Authorization code`), ` input below the login button on this page.`), ` `,
            p(`This setup method is required when `, app(), ` is not running on a secure web server. `, ...(!isSecureWebInstall
                ? [`This seems to be the case with your install.`]
                : [
                    strong(`This doesn't seem to be the case with your install.`), ` `,
                    `You may still use this method but the one described before gives a simpler login workflow.`
                ]))
        ]), makeElement('details')()(makeElement('summary')()(`Additional instructions for building your own copy of `, app(), ` with a registration included`), ol(li(`Register an OAuth 2 app with one of the methods described above.`), li(`Open `, code(`servers.json`), ` in `, app(), `'s source code. `, `The format of this file is described here in `, em(`Custom server configuration syntax`), `.`), li(`If you're using a custom server specified on this page, copy its configuration to `, code(`servers.json`), `.`), li(`Find the `, code(`oauth`), ` property corresponding to the server you're using or add one if it doesn't exist.`), li(`Copy the `, em(`Client ID`), ` to the `, code(`id`), ` property inside `, code(`oauth`), `.`), li(`If you're not using manual authorization code entry, copy `, app(), `'s install location (`, value(authStorage.installUri), `) to the `, code(`url`), ` property inside `, code(`oauth`), `.`), li(`Rebuild `, app(), `.`))), makeDiv('major-input-group')(makeLabel()(`Client ID `, $clientIdInput)), makeDiv('major-input-group')(makeLabel()($manualCodeEntryCheckbox, ` ` + manualCodeEntryLabel), ` (for non-https/non-secure install locations)`), $registrationNotice);
        $overallDetails.open = !authStorage.clientId;
        $section.append(makeElement('h2')()(`Register app`), $overallDetails);
    }
}
// openstreetmap-website/config/locales/en.yml en.oauth.authorize.scopes
const oauthScopeNames = {
    read_prefs: `Read user preferences`,
    write_prefs: `Modify user preferences`,
    write_diary: `Create diary entries, comments and make friends`,
    write_api: `Modify the map`,
    read_gpx: `Read private GPS traces`,
    write_gpx: `Upload GPS traces`,
    write_notes: `Modify notes`,
};
function makePermissionsList(oauthScope) {
    return ul(...oauthScope.split(' ').map(s => li(oauthScopeNames[s])));
}

class AuthError extends TypeError {
}
class LoginForms {
    constructor($container, appName, isManualCodeEntry, getRequestCodeUrl, exchangeCodeForToken) {
        this.isManualCodeEntry = isManualCodeEntry;
        this.$loginButton = makeElement('button')()(`Login`);
        this.$cancelLoginButton = makeElement('button')()(`Cancel login`);
        this.$manualCodeForm = document.createElement('form');
        this.$manualCodeButton = document.createElement('button');
        this.$manualCodeInput = document.createElement('input');
        this.$error = makeDiv('notice')();
        this.$manualCodeInput.type = 'text';
        this.$manualCodeInput.required = true;
        this.$manualCodeButton.textContent = `Login with the authorization code`;
        this.stopWaitingForAuthorization();
        this.$loginButton.onclick = async () => {
            const codeVerifier = getCodeVerifier();
            const codeChallenge = await getCodeChallenge(codeVerifier);
            const width = 600;
            const height = 600;
            const loginWindow = open(getRequestCodeUrl(codeChallenge), '_blank', `width=${width},height=${height},left=${screen.width / 2 - width / 2},top=${screen.height / 2 - height / 2}`);
            if (loginWindow == null)
                return;
            this.waitForAuthorization(loginWindow, code => exchangeCodeForToken(code, codeVerifier));
        };
        this.$cancelLoginButton.onclick = () => {
            this.stopWaitingForAuthorization();
        };
        window.addEventListener('beforeunload', () => {
            this.stopWaitingForAuthorization();
        });
        // TODO write that you may not get a confirmation page if you are already logged in - in this case logout first
        //	^ to do this, need to check if anything user-visible appears in the popup at all with auto-code registrations
        const app = () => em(appName);
        this.$manualCodeForm.append(p(`If the manual code copying method was used to register `, app(), `, copy the code into the input below.`), makeDiv('major-input-group')(makeLabel()(`Authorization code `, this.$manualCodeInput)), makeDiv('major-input-group')(this.$manualCodeButton));
        $container.append(makeDiv('major-input-group')(this.$loginButton, this.$cancelLoginButton), this.$manualCodeForm, this.$error);
    }
    respondToAppRegistration(isManualCodeEntry) {
        this.isManualCodeEntry = isManualCodeEntry;
        this.stopWaitingForAuthorization();
        this.clearError();
    }
    waitForAuthorization(loginWindow, submitCode) {
        const wrapAction = (action) => wrapFetch(this.$manualCodeButton, action, makeGetKnownErrorMessage(AuthError), this.$error, message => this.$error.textContent = message);
        if (this.isManualCodeEntry) {
            this.$manualCodeForm.onsubmit = async (ev) => {
                ev.preventDefault();
                await wrapAction(async () => {
                    await submitCode(this.$manualCodeInput.value.trim());
                    this.stopWaitingForAuthorization(); // keep the login popup on error in case user copied the code incorrectly
                });
            };
        }
        else {
            window.receiveOsmAuthCode = async (code) => {
                await wrapAction(async () => {
                    if (typeof code != 'string') {
                        throw new AuthError(`Unexpected code parameter type received from popup window`);
                    }
                    await submitCode(code);
                });
                this.stopWaitingForAuthorization();
            };
            window.receiveOsmAuthDenial = async (errorDescription) => {
                await wrapAction(async () => {
                    throw new AuthError(typeof errorDescription == 'string'
                        ? errorDescription
                        : `Unknown authorization error`);
                });
                this.stopWaitingForAuthorization();
            };
        }
        this.loginWindow = loginWindow;
        this.$loginButton.hidden = true;
        this.$cancelLoginButton.hidden = false;
        this.$manualCodeForm.hidden = !this.isManualCodeEntry;
        if (this.isManualCodeEntry) {
            this.$manualCodeInput.focus();
        }
        this.clearError();
    }
    stopWaitingForAuthorization() {
        this.$manualCodeForm.onsubmit = (ev) => ev.preventDefault();
        delete window.receiveOsmAuthCode;
        delete window.receiveOsmAuthDenial;
        this.loginWindow?.close();
        this.loginWindow = undefined;
        this.$loginButton.hidden = false;
        this.$cancelLoginButton.hidden = true;
        this.$manualCodeForm.hidden = true;
        this.$manualCodeInput.value = '';
    }
    clearError() {
        this.$error.replaceChildren();
    }
}
function getCodeVerifier() {
    const byteLength = 48; // verifier string length == byteLength * 8/6
    return encodeBase64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}
async function getCodeChallenge(codeVerifier) {
    const codeVerifierArray = new TextEncoder().encode(codeVerifier);
    const codeChallengeBuffer = await crypto.subtle.digest('SHA-256', codeVerifierArray);
    return encodeBase64url(new Uint8Array(codeChallengeBuffer));
}
function encodeBase64url(bytes) {
    const string = String.fromCharCode(...bytes);
    return btoa(string).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isAuthErrorData(data) {
    return (data &&
        typeof data == 'object' &&
        typeof data.error_description == 'string');
}
function isAuthTokenData(data) {
    return (data &&
        typeof data == 'object' &&
        typeof data.access_token == 'string' &&
        typeof data.scope == 'string');
}
function isUserData(data) {
    return (data &&
        data.user &&
        typeof data.user == 'object' &&
        typeof data.user.id == 'number' &&
        typeof data.user.display_name == 'string' &&
        hasCorrectRoles(data.user.roles));
    function hasCorrectRoles(roles) {
        if (roles === undefined)
            return true;
        return isArrayOfStrings(roles);
    }
}
function makeLogin(scope, userData) {
    const login = {
        scope,
        uid: userData.user.id,
        username: userData.user.display_name
    };
    if (userData.user.roles)
        login.roles = userData.user.roles;
    return login;
}
class LoginSection {
    constructor($section, appName, oauthScope, loginReasons, authStorage, server, onLoginChange) {
        this.$section = $section;
        this.authStorage = authStorage;
        this.$clientIdRequired = makeDiv('notice')(`Please register the app and enter the `, em(`client id`), ` below to be able to login.`);
        this.$loginForms = makeDiv()();
        this.$loginMessage = makeDiv()();
        this.$loginTable = makeDiv()();
        const webPostUrlencodedWithPossibleAuthError = async (webPath, parameters, whenMessage) => {
            const response = await server.web.fetch.withUrlencodedBody(parameters).post(webPath);
            if (response.ok)
                return response;
            let errorData;
            try {
                errorData = await response.json();
            }
            catch { }
            if (isAuthErrorData(errorData)) {
                throw new AuthError(`Error ${whenMessage}: ${errorData.error_description}`);
            }
            else {
                throw new AuthError(`Error ${whenMessage} with unknown error format`);
            }
        };
        const fetchUserData = async (token) => {
            const userResponse = await server.api.fetch.withToken(token)(`user/details.json`);
            if (!userResponse.ok) {
                throw new AuthError(`Error while getting user details`);
            }
            let userData;
            try {
                userData = await userResponse.json();
            }
            catch { }
            if (!isUserData(userData)) {
                throw new AuthError(`Unexpected response format when getting user details`);
            }
            return userData;
        };
        const switchToToken = (token) => {
            authStorage.token = token;
            onLoginChange();
        };
        const updateInResponseToLogin = () => {
            const logins = authStorage.getLogins();
            if (logins.size == 0) {
                this.$loginMessage.replaceChildren(`No active logins. Press the button above to login. `, ...loginReasons);
                this.$loginTable.replaceChildren();
                return;
            }
            const loginTable = new RadioTable('login', [
                [['number'], [`user id`]],
                [[], [`username`]],
                [['capability'], [`profile`]],
                [['capability'], [`moderator`]],
            ]);
            loginTable.addRow(($radio) => {
                $radio.checked = !authStorage.token;
                $radio.onclick = () => {
                    switchToToken('');
                };
                const $usernameLabel = makeElement('label')()(em(`anonymous`));
                $usernameLabel.htmlFor = $radio.id;
                return [
                    [],
                    [$usernameLabel]
                ];
            });
            for (const [token, login] of logins) {
                const userHref = server.web.getUrl(`user/` + encodeURIComponent(login.username));
                const $updateButton = makeElement('button')()(`Update user info`);
                const $logoutButton = makeElement('button')()(`Logout`);
                $updateButton.onclick = () => wrapFetchForButton($updateButton, async () => {
                    const userData = await fetchUserData(token);
                    authStorage.setLogin(token, makeLogin(login.scope, userData));
                    updateInResponseToLogin();
                }, makeGetKnownErrorMessage(AuthError));
                $logoutButton.onclick = () => wrapFetchForButton($logoutButton, async () => {
                    await webPostUrlencodedWithPossibleAuthError(`oauth2/revoke`, [
                        ['token', token],
                        // ['token_type_hint','access_token']
                        ['client_id', authStorage.clientId]
                    ], `while revoking a token`);
                    authStorage.deleteLogin(token);
                    if (authStorage.token == token) {
                        switchToToken('');
                    }
                    updateInResponseToLogin();
                }, makeGetKnownErrorMessage(AuthError));
                loginTable.addRow(($radio) => {
                    $radio.checked = authStorage.token == token;
                    $radio.onclick = () => {
                        switchToToken(token);
                    };
                    const $uidLabel = makeElement('label')()(String(login.uid));
                    const $usernameLabel = makeElement('label')()(login.username);
                    $uidLabel.htmlFor = $usernameLabel.htmlFor = $radio.id;
                    return [
                        [$uidLabel],
                        [$usernameLabel],
                        userHref,
                        login.roles?.includes('moderator'),
                        [$updateButton],
                        [$logoutButton],
                    ];
                });
            }
            this.$loginMessage.replaceChildren(`You can login again and have several different active logins. Use the table below to switch between them.`);
            this.$loginTable.replaceChildren(loginTable.$table);
        };
        this.loginForms = new LoginForms(this.$loginForms, appName, authStorage.isManualCodeEntry, (codeChallenge) => {
            return server.web.getUrl('oauth2/authorize') + '?' + [
                ['client_id', authStorage.clientId],
                ['redirect_uri', authStorage.redirectUri],
                ['scope', oauthScope],
                ['response_type', 'code'],
                ['code_challenge', codeChallenge],
                ['code_challenge_method', 'S256']
            ].map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
        }, async (code, codeVerifier) => {
            const tokenResponse = await webPostUrlencodedWithPossibleAuthError(`oauth2/token`, [
                ['client_id', authStorage.clientId],
                ['redirect_uri', authStorage.redirectUri],
                ['grant_type', 'authorization_code'],
                ['code', code],
                ['code_verifier', codeVerifier]
            ], `while getting a token`);
            let tokenData;
            try {
                tokenData = await tokenResponse.json();
            }
            catch { }
            if (!isAuthTokenData(tokenData)) {
                throw new AuthError(`Unexpected response format when getting a token`);
            }
            const userData = await fetchUserData(tokenData.access_token);
            authStorage.setLogin(tokenData.access_token, makeLogin(tokenData.scope, userData));
            switchToToken(tokenData.access_token);
            updateInResponseToLogin();
        });
        this.updateVisibility();
        updateInResponseToLogin();
        $section.append(makeElement('h2')()(`Logins`), this.$clientIdRequired, this.$loginForms, this.$loginMessage, this.$loginTable);
    }
    respondToAppRegistration() {
        this.loginForms.respondToAppRegistration(this.authStorage.isManualCodeEntry);
        this.updateVisibility();
    }
    focusOnLogin() {
        this.$section.scrollIntoView();
        if (!this.$loginForms.hidden && !this.loginForms.$loginButton.hidden) {
            this.loginForms.$loginButton.focus();
        }
    }
    updateVisibility() {
        const canLogin = !!this.authStorage.clientId;
        this.$clientIdRequired.hidden = canLogin;
        this.$loginForms.hidden = !canLogin;
        this.$loginMessage.hidden = !canLogin;
        this.$loginTable.hidden = !canLogin;
    }
}

function isAuthOpener(o) {
    return (o && typeof o == 'object' &&
        typeof o.receiveOsmAuthCode == 'function' &&
        typeof o.receiveOsmAuthDenial == 'function');
}
function checkAuthRedirectForInstallUri(appName, installUri) {
    const app = () => em(appName);
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    if (code == null && error == null) {
        return false;
    }
    if (!isAuthOpener(window.opener)) {
        document.body.append(makeDiv('notice')(`This is the location of authentication redirect for `, app(), `. `, `It is expected to be opened in a popup window when performing a login. `, `Instead it is opened outside of a popup and cannot function properly. `, `If you want to continue using `, app(), `, please open `, makeLink(`this link`, installUri), `.`));
    }
    else if (code != null) {
        window.opener.receiveOsmAuthCode(code);
    }
    else if (error != null) {
        window.opener.receiveOsmAuthDenial(errorDescription ?? error);
    }
    return true;
}

const installUri = `${location.protocol}//${location.host}${location.pathname}`;
function checkAuthRedirect(appName) {
    return checkAuthRedirectForInstallUri(appName, installUri);
}
class Net {
    constructor(appName, oauthScope, loginReasons, serverListConfig, storage, makeServerSelector, onLoginChange) {
        this.$sections = [];
        const serverListConfigSources = [serverListConfig];
        try {
            const customServerListConfig = storage.getItem('servers');
            if (customServerListConfig != null) {
                serverListConfigSources.push(JSON.parse(customServerListConfig));
            }
        }
        catch { }
        this.serverList = new ServerList(...serverListConfigSources);
        this.serverSelector = makeServerSelector(this.serverList);
        const server = this.serverSelector.selectServer();
        this.$serverListSection = makeElement('section')()();
        new ServerListSection(this.$serverListSection, appName, storage, server, this.serverList, this.serverSelector);
        if (server) {
            const authStorage = new AuthStorage(storage, server.host, installUri);
            this.cx = new Connection(server, authStorage);
            this.$appSection = makeElement('section')()();
            this.$loginSection = makeElement('section')()();
            const appSection = new AppSection(this.$appSection, appName, oauthScope, authStorage, server, this.serverSelector);
            const loginSection = new LoginSection(this.$loginSection, appName, oauthScope, loginReasons, authStorage, server, onLoginChange);
            appSection.onRegistrationUpdate = () => loginSection.respondToAppRegistration();
            this.$sections.push(this.$loginSection, this.$appSection);
            this.loginSection = loginSection;
        }
        this.$sections.push(this.$serverListSection);
    }
    focusOnLogin() {
        this.loginSection?.focusOnLogin(); // TODO move to connection?
    }
}

function bubbleEvent($target, type) {
    return $target.dispatchEvent(new Event(type, { bubbles: true }));
}
function bubbleCustomEvent($target, type, detail) {
    return $target.dispatchEvent(new CustomEvent(type, {
        bubbles: true,
        detail
    }));
}

class GlobalEventListener {
    constructor($root) {
        $root.addEventListener('click', ev => {
            if (!(ev.target instanceof Element))
                return;
            const $e = ev.target.closest('a.listened, time.listened');
            if ($e instanceof HTMLAnchorElement) {
                if ($e.dataset.noteId && $e.dataset.self) {
                    bubbleEvent($e, 'osmNoteViewer:updateNoteLinkClick');
                }
                else if ($e.dataset.noteId) {
                    bubbleEvent($e, 'osmNoteViewer:noteLinkClick');
                }
                else if ($e.dataset.userId) {
                    bubbleEvent($e, 'osmNoteViewer:userLinkClick');
                }
                else if ($e.dataset.elementType && $e.dataset.elementId) {
                    bubbleEvent($e, 'osmNoteViewer:elementLinkClick');
                }
                else if ($e.dataset.changesetId) {
                    bubbleEvent($e, 'osmNoteViewer:changesetLinkClick');
                }
                else if ($e.dataset.zoom && $e.dataset.lat && $e.dataset.lon) {
                    bubbleCustomEvent($e, 'osmNoteViewer:mapMoveTrigger', {
                        zoom: $e.dataset.zoom,
                        lat: $e.dataset.lat,
                        lon: $e.dataset.lon,
                    });
                }
                else if ($e.classList.contains('image')) {
                    let siblingImageSelector;
                    if ($e.classList.contains('float')) {
                        siblingImageSelector = 'a.listened.image.float';
                    }
                    else {
                        siblingImageSelector = 'a.listened.image.inline';
                    }
                    const urlSet = new Set;
                    if ($e.parentElement && siblingImageSelector) {
                        const $siblingImageLinks = $e.parentElement.querySelectorAll('a.listened.image');
                        for (const $siblingImageLink of $siblingImageLinks) {
                            if (!($siblingImageLink instanceof HTMLAnchorElement))
                                continue;
                            if (!$siblingImageLink.href)
                                continue;
                            urlSet.add($siblingImageLink.href);
                        }
                    }
                    const urls = [...urlSet.values()];
                    let index = urls.indexOf($e.href);
                    if (index < 0) {
                        index = urls.length;
                        urls.push($e.href);
                    }
                    bubbleCustomEvent($e, 'osmNoteViewer:imageToggle', { urls, index });
                }
                else {
                    return; // don't stop event propagation
                }
                ev.preventDefault();
                ev.stopPropagation();
            }
            else if ($e instanceof HTMLTimeElement) {
                if ($e.dateTime) {
                    bubbleCustomEvent($e, 'osmNoteViewer:timestampChange', $e.dateTime);
                    ev.preventDefault();
                    ev.stopPropagation();
                }
            }
        });
        $root.addEventListener('keydown', ev => {
            if (!(ev.target instanceof HTMLElement))
                return;
            if (ev.key != 'Enter')
                return;
            const $e = ev.target.closest('time.listened');
            if ($e instanceof HTMLTimeElement) {
                $e.click();
                ev.preventDefault();
                ev.stopPropagation();
            }
        });
    }
}

class GlobalHistory {
    constructor($root, $scrollingPart, net) {
        this.$root = $root;
        this.$scrollingPart = $scrollingPart;
        this.net = net;
        this.rememberScrollPosition = false;
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
        net.serverSelector.installHashChangeListener(net.cx, hostlessHash => {
            const [mapHashValue, queryHash] = detachValueFromHash('map', hostlessHash);
            if (mapHashValue) {
                this.onMapHashChange(mapHashValue);
            }
            // TODO don't run stuff below if only map hash changed? or don't zoom to notes if map hash present?
            bubbleCustomEvent($root, 'osmNoteViewer:queryHashChange', queryHash);
            this.restoreScrollPosition();
        });
        $root.addEventListener('osmNoteViewer:mapMoveEnd', ({ detail: { zoom, lat, lon } }) => {
            const mapHashValue = `${zoom}/${lat}/${lon}`;
            const hostlessHash = net.serverSelector.getHostlessHash();
            const [, queryHash] = detachValueFromHash('map', hostlessHash);
            const updatedHostlessHash = attachValueToBackOfHash('map', mapHashValue, queryHash);
            net.serverSelector.replaceHostlessHashInHistory(updatedHostlessHash);
        });
        $root.addEventListener('osmNoteViewer:newNoteStream', ({ detail: [queryHash, isNewStart] }) => {
            if (!net.cx)
                return;
            let mapHashValue = null;
            if (!isNewStart) {
                const hostlessHash = net.serverSelector.getHostlessHash();
                [mapHashValue] = detachValueFromHash('map', hostlessHash);
            }
            const updatedHostlessHash = attachValueToBackOfHash('map', mapHashValue, queryHash);
            if (isNewStart) {
                net.serverSelector.pushHostlessHashInHistory(updatedHostlessHash);
            }
            else {
                net.serverSelector.replaceHostlessHashInHistory(updatedHostlessHash);
            }
        });
    }
    triggerInitialMapHashChange() {
        const hostlessHash = this.net.serverSelector.getHostlessHash();
        const [mapHashValue] = detachValueFromHash('map', hostlessHash);
        if (mapHashValue) {
            this.onMapHashChange(mapHashValue);
        }
    }
    restoreScrollPosition() {
        if (!this.$resizeObservationTarget)
            return;
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
        const hostlessHash = this.net.serverSelector.getHostlessHash();
        const [, queryHash] = detachValueFromHash('map', hostlessHash);
        return queryHash;
    }
    hasMapHash() {
        const hostlessHash = this.net.serverSelector.getHostlessHash();
        const [mapHashValue] = detachValueFromHash('map', hostlessHash);
        return !!mapHashValue;
    }
    onMapHashChange(mapHashValue) {
        const [zoom, lat, lon] = mapHashValue.split('/');
        if (zoom && lat && lon) {
            bubbleCustomEvent(this.$root, 'osmNoteViewer:mapMoveTrigger', { zoom, lat, lon });
        }
    }
}

const e$9 = makeEscapeTag(escapeXml);
class NoteMarker extends L.Marker {
    constructor(web, note) {
        const $a = document.createElement('a');
        $a.href = web.getUrl(`note/` + encodeURIComponent(note.id));
        $a.classList.add('listened', 'other-note');
        $a.dataset.noteId = String(note.id);
        const icon = getNoteMarkerIcon($a, web, note, false);
        super([note.lat, note.lon], { icon });
        this.$a = $a;
        this.noteId = note.id;
    }
    updateIcon(web, note, isSelected) {
        const icon = getNoteMarkerIcon(this.$a, web, note, isSelected);
        this.setIcon(icon);
    }
}
function getNoteMarkerIcon($a, web, note, isSelected) {
    const width = 25;
    const height = 40;
    const auraThickness = 4;
    const r = width / 2;
    const widthWithAura = width + auraThickness * 2;
    const heightWithAura = height + auraThickness;
    const rWithAura = widthWithAura / 2;
    const nInnerCircles = 4;
    let html = ``;
    html += e$9 `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-rWithAura} ${-rWithAura} ${widthWithAura} ${heightWithAura}">`;
    html += e$9 `<path d="${computeMarkerOutlinePath(heightWithAura - .5, rWithAura - .5)}" class="aura" fill="none" />`;
    html += e$9 `<path d="${computeMarkerOutlinePath(height, r)}" fill="${getStatusColor(note.status)}" />`;
    const statuses = [...noteCommentsToStatuses(note.comments)];
    html += drawStateCircles(r, nInnerCircles, statuses.slice(-nInnerCircles, -1));
    if (isSelected) {
        html += drawCheckMark();
    }
    html += e$9 `</svg>`;
    $a.innerHTML = html;
    $a.title = `${note.status} note #${note.id}`;
    $a.style.width = widthWithAura + 'px';
    $a.style.height = heightWithAura + 'px';
    return L.divIcon({
        html: $a,
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
    function drawStateCircles(r, nInnerCircles, statusesToDraw) {
        const dcr = (r - .5) / nInnerCircles;
        let html = ``;
        for (let i = 2; i >= 0; i--) {
            if (i >= statusesToDraw.length)
                continue;
            const cr = dcr * (i + 1);
            html += e$9 `<circle r="${cr}" fill="${color()}" stroke="white" />`;
            function color() {
                if (i == 0 && statuses.length <= nInnerCircles)
                    return 'white';
                return getStatusColor(statusesToDraw[i]);
            }
        }
        return html;
    }
    function drawCheckMark() {
        const path = `M-${r / 4},0 L0,${r / 4} L${r / 2},-${r / 4}`;
        let html = ``;
        html += e$9 `<path d="${path}" fill="none" stroke-width="6" stroke-linecap="round" stroke="blue" />`;
        html += e$9 `<path d="${path}" fill="none" stroke-width="2" stroke-linecap="round" stroke="white" />`;
        return html;
    }
    function getStatusColor(status) {
        if (status == 'open') {
            return 'red';
        }
        else if (status == 'closed') {
            return 'green';
        }
        else {
            return 'black';
        }
    }
}
function* noteCommentsToStatuses(comments) {
    let currentStatus = 'open';
    for (const comment of comments) {
        if (comment.action == 'opened' || comment.action == 'reopened') {
            currentStatus = 'open';
        }
        else if (comment.action == 'closed') {
            currentStatus = 'closed';
        }
        else if (comment.action == 'hidden') {
            currentStatus = 'hidden';
        }
        yield currentStatus;
    }
}

class NoteMapBounds {
    constructor(bounds, precision) {
        this.w = bounds.getWest().toFixed(precision);
        this.s = bounds.getSouth().toFixed(precision);
        this.e = bounds.getEast().toFixed(precision);
        this.n = bounds.getNorth().toFixed(precision);
    }
    get wsen() {
        return [this.w, this.s, this.e, this.n];
    }
    get swne() {
        return [this.s, this.w, this.n, this.e];
    }
}

class NoteLayer extends L.FeatureGroup {
    getLayerId(marker) {
        if (marker instanceof NoteMarker) {
            return marker.noteId;
        }
        else {
            throw new RangeError(`invalid feature in note layer`);
        }
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
class OsmDataLayers {
    constructor() {
        this.baseDataLayer = L.featureGroup();
        this.createdDataLayer = L.featureGroup();
        this.modifiedDataLayer = L.featureGroup();
        this.deletedDataLayer = L.featureGroup();
    }
    addToMap(leafletMap) {
        this.baseDataLayer.addTo(leafletMap);
        this.createdDataLayer.addTo(leafletMap);
        this.modifiedDataLayer.addTo(leafletMap);
        this.deletedDataLayer.addTo(leafletMap);
    }
    addToLayersControl(layersControl) {
        layersControl.addOverlay(this.baseDataLayer, `Base OSM data`);
        layersControl.addOverlay(this.createdDataLayer, `Created OSM data`);
        layersControl.addOverlay(this.modifiedDataLayer, `Modidied OSM data`);
        layersControl.addOverlay(this.deletedDataLayer, `Deleted OSM data`);
    }
    clearLayers() {
        this.baseDataLayer.clearLayers();
        this.createdDataLayer.clearLayers();
        this.modifiedDataLayer.clearLayers();
        this.deletedDataLayer.clearLayers();
    }
    addGeometryAndGetLayerDataMap(geometryData) {
        const layerDataMap = new Map();
        let [baseLayer, baseData] = geometryData.baseGeometry;
        if (!baseLayer) {
            baseLayer = L.circleMarker([0, 0]);
        }
        const addLayerWithData = (group, layer, data) => {
            group.addLayer(layer);
            const layerId = group.getLayerId(layer);
            layerDataMap.set(layerId, data);
            return layerId;
        };
        const baseLayerId = addLayerWithData(this.baseDataLayer, baseLayer, baseData);
        const addLayersWithData = (group, layersWithData) => {
            if (!layersWithData)
                return;
            for (const [layer, data] of layersWithData) {
                addLayerWithData(group, layer, data);
            }
        };
        addLayersWithData(this.createdDataLayer, geometryData.createdGeometry);
        addLayersWithData(this.modifiedDataLayer, geometryData.modifiedGeometry);
        addLayersWithData(this.deletedDataLayer, geometryData.deletedGeometry);
        // return [baseLayer,baseLayerId,layerDataMap]
        return [baseLayer, baseLayerId, baseData];
    }
}

function isOsmBaseApiData(d) {
    if (!d || typeof d != 'object')
        return false;
    if (!('id' in d) || !Number.isInteger(d.id))
        return false;
    if (('user' in d) && (typeof d.user != 'string'))
        return false;
    if (!('uid' in d) || !Number.isInteger(d.uid))
        return false;
    if (('tags' in d) && (typeof d.tags != 'object'))
        return false;
    return true;
}

function isOsmElementBaseApiData(e) {
    if (!isOsmBaseApiData(e))
        return false;
    if (!('type' in e) || (e.type != 'node' && e.type != 'way' && e.type != 'relation'))
        return false;
    if (!('timestamp' in e) || typeof e.timestamp != 'string')
        return false;
    if (!('version' in e) || !Number.isInteger(e.version))
        return false;
    if (!('changeset' in e) || !Number.isInteger(e.changeset))
        return false;
    return true;
}
function isOsmVisibleNodeApiData(e) {
    if (!isOsmElementBaseApiData(e))
        return false;
    if (e.type != 'node')
        return false;
    if (!('lat' in e) || typeof e.lat != 'number')
        return false;
    if (!('lon' in e) || typeof e.lon != 'number')
        return false;
    return true;
}
function isOsmVisibleWayApiData(e) {
    if (!isOsmElementBaseApiData(e))
        return false;
    if (e.type != 'way')
        return false;
    if (!('nodes' in e) || !isArray(e.nodes))
        return false;
    if (!e.nodes.every(v => Number.isInteger(v)))
        return false;
    return true;
}
function isOsmVisibleRelationApiData(e) {
    if (!isOsmElementBaseApiData(e))
        return false;
    if (e.type != 'relation')
        return false;
    if (!('members' in e) || !isArray(e.members))
        return false;
    if (!e.members.every(m => (m && typeof m == 'object' &&
        'type' in m && (m.type == 'node' || m.type == 'way' || m.type == 'relation') &&
        'ref' in m && Number.isInteger(m.ref) &&
        'role' in m && typeof m.role == 'string')))
        return false;
    return true;
}
function getElementsFromOsmApiResponse(data) {
    const node = {};
    const way = {};
    const relation = {};
    if (!data || typeof data != 'object')
        throw new TypeError(`OSM API error: invalid response data`);
    if (!('elements' in data) || !isArray(data.elements))
        throw new TypeError(`OSM API error: no elements array in response data`);
    const elementArray = data.elements;
    for (const element of elementArray) {
        if (isOsmVisibleNodeApiData(element)) {
            node[element.id] = element;
        }
        else if (isOsmVisibleWayApiData(element)) {
            way[element.id] = element;
        }
        else if (isOsmVisibleRelationApiData(element)) {
            relation[element.id] = element;
        }
        else {
            throw new TypeError(`OSM API error: invalid element in response data`);
        }
    }
    return { node, way, relation };
}

function isOsmChangesetApiData(c) {
    if (!isOsmBaseApiData(c))
        return false;
    if (!('created_at' in c) || typeof c.created_at != 'string')
        return false;
    if (('closed_at' in c) && typeof c.closed_at != 'string')
        return false;
    return true;
}
function hasBbox(c) {
    if (!('minlat' in c) || !Number.isFinite(c.minlat))
        return false;
    if (!('maxlat' in c) || !Number.isFinite(c.maxlat))
        return false;
    if (!('minlon' in c) || !Number.isFinite(c.minlon))
        return false;
    if (!('maxlon' in c) || !Number.isFinite(c.maxlon))
        return false;
    return true;
}
function getChangesetFromOsmApiResponse(data) {
    if (!data || typeof data != 'object')
        throw new TypeError(`OSM API error: invalid response data`);
    if (!('elements' in data) || !isArray(data.elements))
        throw new TypeError(`OSM API error: no 'elements' array with changesets in response data`);
    const changesetArray = data.elements;
    if (changesetArray.length != 1)
        throw new TypeError(`OSM API error: invalid number of changesets in response data`);
    const changeset = changesetArray[0];
    if (!isOsmChangesetApiData(changeset))
        throw new TypeError(`OSM API error: invalid changeset in response data`);
    return changeset;
}
function getChangesetsFromOsmApiResponse(data) {
    if (!data || typeof data != 'object')
        throw new TypeError(`OSM API error: invalid response data`);
    if (!('changesets' in data) || !isArray(data.changesets))
        throw new TypeError(`OSM API error: no changesets array in response data`);
    const changesetArray = data.changesets;
    if (!changesetArray.every(isOsmChangesetApiData))
        throw new TypeError(`OSM API error: invalid changeset in response data`);
    return changesetArray;
}

function toUserQuery(apiUrlLister, webUrlLister, value) {
    const s = value.trim();
    if (s == '')
        return {
            type: 'empty'
        };
    if (s[0] == '#') {
        let match;
        if (match = s.match(/^#\s*(\d+)$/)) {
            const [, uid] = match;
            return {
                type: 'id',
                uid: Number(uid)
            };
        }
        else if (match = s.match(/^#\s*\d*(.)/)) {
            const [, c] = match;
            return {
                type: 'invalid',
                message: `uid cannot contain non-digits, found ${c}`
            };
        }
        else {
            return {
                type: 'invalid',
                message: `uid cannot be empty`
            };
        }
    }
    if (s.includes('/')) {
        const hosts = new Set();
        for (const urlString of [apiUrlLister.url, ...webUrlLister.urls]) {
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
                    type: 'invalid',
                    message: `URL has to be of an OSM domain, ${domainString}`
                };
            }
            const [, typeDir] = url.pathname.split('/', 2);
            if (typeDir == 'user') {
                const [, , userDir] = url.pathname.split('/', 3);
                if (!userDir)
                    return {
                        type: 'invalid',
                        message: `OSM user URL has to include username`
                    };
                return {
                    type: 'name',
                    username: decodeURIComponent(userDir)
                };
            }
            else if (typeDir == 'api') {
                const [, , apiVersionDir, apiCall, apiValue] = url.pathname.split('/', 5);
                if (apiVersionDir != '0.6' || apiCall != 'user')
                    return {
                        type: 'invalid',
                        message: `OSM API URL has to be "api/0.6/user/..."`
                    };
                const [uidString] = apiValue.split('.');
                const uid = Number(uidString);
                if (!Number.isInteger(uid))
                    return {
                        type: 'invalid',
                        message: `OSM API URL has to include valid user id"`
                    };
                return {
                    type: 'id',
                    uid
                };
            }
            else {
                return {
                    type: 'invalid',
                    message: `OSM URL has to be either user page or user api link`
                };
            }
        }
        catch {
            return {
                type: 'invalid',
                message: `string containing "/" character has to be a valid URL`
            };
        }
    }
    return {
        type: 'name',
        username: s
    };
}

function renderOsmElement(element, elements) {
    if (element.type == 'node') {
        const layer = makeOsmNodeLayer(element);
        return { baseGeometry: [
                layer, { type: 'element', adiff: false, item: element }
            ] };
    }
    else if (element.type == 'way') {
        const layer = makeOsmWayLayer(element, elements);
        return { baseGeometry: [
                layer, { type: 'element', adiff: false, item: element }
            ] };
    }
    else if (element.type == 'relation') {
        const [layer, skippedRelationIds] = makeOsmRelationLayerAndSkippedRelations(element, elements);
        return { baseGeometry: [
                layer, {
                    type: 'element', adiff: false, item: element, skippedRelationIds,
                    emptyReason: layer ? undefined : `the relation has no direct node/way members`
                }
            ] };
    }
    else {
        throw new TypeError(`OSM API error: requested element has unknown type`); // shouldn't happen
    }
}
function renderOsmChangeset(changeset) {
    const baseLayer = makeOsmChangesetLayer(changeset);
    return { baseGeometry: [
            baseLayer, {
                type: 'changeset', adiff: false, item: changeset,
                emptyReason: baseLayer ? undefined : `the changeset is empty`
            }
        ] };
}
function renderOsmChangesetAdiff(changeset, adiff) {
    const colorAdded = '#39dbc0'; // color values from OSMCha
    const colorModifiedOld = '#db950a';
    const colorModifiedNew = '#e8e845';
    const colorDeleted = '#cc2c47';
    const baseLayer = makeOsmChangesetLayer(changeset, { color: '#000', fill: false });
    const extraBaseLayer = makeOsmChangesetLayer(changeset, { color: '#000', stroke: false, interactive: false });
    const geometryData = {
        baseGeometry: [
            baseLayer, {
                type: 'changeset', adiff: true, item: changeset,
                emptyReason: baseLayer ? undefined : `the changeset is empty`
            }
        ],
        createdGeometry: [],
        modifiedGeometry: [],
        deletedGeometry: []
    };
    if (extraBaseLayer)
        geometryData.extraBaseLayer = extraBaseLayer;
    const addOsmElementLayer = (adiffAction, makeLayer) => {
        if (adiffAction.action == 'create') {
            geometryData.createdGeometry.push([
                makeLayer(adiffAction.newElement, colorAdded),
                { type: 'element', adiff: true, item: adiffAction }
            ]);
        }
        else if (adiffAction.action == 'modify') {
            const modifyLayer = L.featureGroup();
            modifyLayer.addLayer(makeLayer(adiffAction.oldElement, colorModifiedOld));
            modifyLayer.addLayer(makeLayer(adiffAction.newElement, colorModifiedNew));
            geometryData.modifiedGeometry.push([
                modifyLayer,
                { type: 'element', adiff: true, item: adiffAction }
            ]);
        }
        else if (adiffAction.action == 'delete') {
            geometryData.deletedGeometry.push([
                makeLayer(adiffAction.oldElement, colorDeleted),
                { type: 'element', adiff: true, item: adiffAction }
            ]);
        }
    };
    for (const adiffElement of Object.values(adiff.way)) {
        addOsmElementLayer(adiffElement, makeAdiffWayLayer);
    }
    for (const adiffElement of Object.values(adiff.node)) {
        addOsmElementLayer(adiffElement, makeAdiffNodeLayer);
    }
    return geometryData;
}
function makeOsmNodeLayer(node) {
    return L.circleMarker([node.lat, node.lon]);
}
function makeOsmWayLayer(way, elements) {
    const coords = [];
    for (const id of way.nodes) {
        const node = elements.node[id];
        if (!node)
            throw new TypeError(`OSM API error: referenced element not found in response data`);
        coords.push([node.lat, node.lon]);
    }
    return L.polyline(coords);
}
function makeOsmRelationLayerAndSkippedRelations(relation, elements) {
    let layer = null;
    const skippedRelationIds = new Set;
    for (const member of relation.members) {
        if (member.type == 'node') {
            const node = elements.node[member.ref];
            if (!node)
                throw new TypeError(`OSM API error: referenced element not found in response data`);
            if (!layer)
                layer = L.featureGroup();
            layer.addLayer(makeOsmNodeLayer(node));
        }
        else if (member.type == 'way') {
            const way = elements.way[member.ref];
            if (!way)
                throw new TypeError(`OSM API error: referenced element not found in response data`);
            if (!layer)
                layer = L.featureGroup();
            layer.addLayer(makeOsmWayLayer(way, elements));
        }
        else if (member.type == 'relation') {
            skippedRelationIds.add(member.ref);
        }
    }
    return [layer, skippedRelationIds];
}
function makeOsmChangesetLayer(changeset, options = { color: '#000' }) {
    if (!hasBbox(changeset))
        return null;
    return L.rectangle([
        [changeset.minlat, changeset.minlon],
        [changeset.maxlat, changeset.maxlon]
    ], options);
}
function makeAdiffNodeLayer(node, color) {
    if (!node.visible)
        throw new TypeError(`unexpected deleted node`);
    return L.circleMarker([node.lat, node.lon], { radius: 3, color, opacity: .2, fillOpacity: 1 });
}
function makeAdiffWayLayer(way, color) {
    if (!way.visible)
        throw new TypeError(`unexpected deleted way`);
    const coords = way.nodeRefs.map(([, lat, lon]) => [lat, lon]);
    return L.polyline(coords, { weight: 2, color });
}

/**
 * Common lifetime prefixes from https://wiki.openstreetmap.org/wiki/Lifecycle_prefix#Common_prefixes
 */
const lifetimePrefixes = [
    'proposed',
    'planned',
    'construction',
    'disused',
    'abandoned',
    'ruins',
    'demolished',
    'removed',
    'razed',
    'destroyed',
    'was',
];
const lifetimePrefixRegexp = new RegExp('^(' + lifetimePrefixes.join('|') + '):(.*)');
function compareKeys(k1, k2) {
    let prefix1 = '', rest1 = k1;
    let prefix2 = '', rest2 = k2;
    let match1 = k1.match(lifetimePrefixRegexp);
    let match2 = k2.match(lifetimePrefixRegexp);
    if (match1)
        [, prefix1, rest1] = match1;
    if (match2)
        [, prefix2, rest2] = match2;
    return strcmp(rest1, rest2) || strcmp(prefix1, prefix2);
}
function strcmp(k1, k2) {
    return +(k1 > k2) - +(k1 < k2);
}

const e$8 = makeEscapeTag(encodeURIComponent);
const h = (...s) => p(strong(...s));
const c = (...s) => p(em(...s));
function makePopupWriter(server, layerData, clear) {
    return () => {
        const $popup = makeDiv('osm-element-popup-contents')();
        if (layerData.type == 'changeset') {
            const changeset = layerData.item;
            const changesetHref = server.web.getUrl(e$8 `changeset/${changeset.id}`);
            const headerContents = [
                `Changeset: `, makeLink(String(changeset.id), changesetHref)
            ];
            if (layerData.adiff) {
                headerContents.push(` · `, makeChangesetLink(server, changeset.id, `Hide adiff`));
            }
            else {
                if (server.overpass)
                    headerContents.push(` · `, makeChangesetAdiffLink(server, changeset.id, `Show adiff`));
            }
            $popup.append(h(...headerContents));
            if (changeset.tags?.comment)
                $popup.append(c(changeset.tags.comment));
            const $p = p();
            if (changeset.closed_at) {
                $p.append(`Closed on `, makeDate(changeset.closed_at));
            }
            else {
                $p.append(`Created on `, makeDate(changeset.created_at));
            }
            $p.append(` by `, makeUserLink(server, changeset));
            $popup.append($p);
            const $tags = makeTagsFigure(changeset.tags, 'comment');
            if ($tags)
                $popup.append($tags);
        }
        else if (layerData.type == 'element' && !layerData.adiff) {
            const element = layerData.item;
            const headerContents = makeElementHeaderContents(server, element, element.type);
            $popup.append(h(...headerContents), ...makeElementContents(server, element));
        }
        else if (layerData.type == 'element' && layerData.adiff) {
            if (layerData.item.action == 'create') {
                const { newElement } = layerData.item;
                const headerContents = makeElementHeaderContents(server, newElement, newElement.type);
                $popup.append(h(...headerContents), ...makeElementContents(server, newElement, newElement.visible, `New version`));
            }
            else if (layerData.item.action == 'modify' || layerData.item.action == 'delete') {
                const { oldElement, newElement } = layerData.item;
                const headerContents = makeElementHeaderContents(server, newElement, newElement.type);
                $popup.append(h(...headerContents), makeElementAdiffTable(server, oldElement, newElement));
            }
        }
        if (layerData.skippedRelationIds?.size) {
            const type = layerData.skippedRelationIds.size > 1 ? `relations` : `relation`;
            const $details = makeElement('details')()(makeElement('summary')()(`${layerData.skippedRelationIds.size} member ${type}`), ...[...layerData.skippedRelationIds].flatMap((subRelationId, i) => {
                const $a = makeRelationLink(server, subRelationId);
                return i ? [`, `, $a] : [$a];
            }));
            if (layerData.skippedRelationIds.size <= 7)
                $details.open = true;
            $popup.append($details);
        }
        if (layerData.emptyReason) {
            $popup.append(p(strong(`Warning`), `: displayed geometry is incorrect because ${layerData.emptyReason}`));
        }
        {
            const $removeButton = document.createElement('button');
            $removeButton.textContent = `Remove from map view`;
            $removeButton.onclick = clear;
            $popup.append($removeButton);
        }
        return $popup;
    };
}
function makeElementHeaderContents(server, element, elementType) {
    const elementPath = e$8 `${elementType}/${element.id}`;
    const headerContents = [
        capitalize(elementType) + `: `,
        makeLink(getElementName(element), server.web.getUrl(elementPath)),
        ` · `, makeLink(`View History`, server.web.getUrl(elementPath + '/history')),
        ` · `, makeLink(`Edit`, server.web.getUrl(e$8 `edit?${elementType}=${element.id}`))
    ];
    return headerContents;
}
function makeElementContents(server, element, visisble = true, versionTitle = `Version`) {
    const content = [];
    content.push(h(`${versionTitle} #${element.version}`, visisble ? `` : ` · DELETED`), p(`Edited on `, makeDate(element.timestamp), ` by `, makeUserLink(server, element), ` · Changeset #`, makeChangesetLink(server, element.changeset)));
    const $tags = makeTagsFigure(element.tags);
    if ($tags)
        content.push($tags);
    return content;
}
function makeElementAdiffTable(server, oldElement, newElement) {
    const $figure = document.createElement('figure');
    const $table = document.createElement('table');
    $figure.append($table);
    $table.insertRow().append(makeElement('th')()(`timestamp`), makeElement('td')()(makeDate(oldElement.timestamp, true)), makeElement('td')()(makeDate(newElement.timestamp, true)));
    $table.insertRow().append(makeElement('th')()(`user`), makeElement('td')()(makeUserLink(server, oldElement)), makeElement('td')()(makeUserLink(server, newElement)));
    $table.insertRow().append(makeElement('th')()(`version`), makeElement('td')()(String(oldElement.version)), makeElement('td')()(String(newElement.version)));
    $table.insertRow().append(makeElement('th')()(`changeset`), makeElement('td')()(makeChangesetLink(server, oldElement.changeset)), makeElement('td')()(makeChangesetLink(server, newElement.changeset)));
    const allKeys = new Set();
    if (oldElement.tags) {
        for (const k of Object.keys(oldElement.tags)) {
            allKeys.add(k);
        }
    }
    if (newElement.tags) {
        for (const k of Object.keys(newElement.tags)) {
            allKeys.add(k);
        }
    }
    if (allKeys.size == 0)
        return $figure;
    const sortedAllKeys = [...allKeys.values()].sort(compareKeys);
    const changedKeys = [];
    const unchangedKeys = [];
    for (const k of sortedAllKeys) {
        ((oldElement.tags?.[k] == newElement.tags?.[k]) ? unchangedKeys : changedKeys).push(k);
    }
    const $tagsTh = makeElement('th')()(`tags`);
    $tagsTh.colSpan = 3;
    $table.insertRow().append($tagsTh);
    const tagList = [...changedKeys, ...unchangedKeys].map(k => [
        k,
        oldElement.tags?.[k] ?? '',
        newElement.tags?.[k] ?? ''
    ]);
    startWritingTags($figure, $table, tagList);
    return $figure;
}
function makeTagsFigure(tags, skipKey) {
    if (!tags)
        return null;
    const tagList = Object.entries(tags).filter(([k]) => k != skipKey);
    if (tagList.length <= 0)
        return null;
    const $figure = document.createElement('figure');
    const $figcaption = document.createElement('figcaption');
    $figcaption.textContent = `Tags`;
    const $table = document.createElement('table');
    $figure.append($figcaption, $table);
    startWritingTags($figure, $table, tagList);
    return $figure;
}
function startWritingTags($figure, $table, tagList) {
    const tagBatchSize = 10;
    let $button;
    let i = 0;
    writeTagBatch();
    function writeTagBatch() {
        for (let j = 0; i < tagList.length && j < tagBatchSize; i++, j++) {
            const [k, ...vs] = tagList[i];
            const $row = $table.insertRow();
            const $keyCell = $row.insertCell();
            $keyCell.textContent = k;
            if (k.length > 30)
                $keyCell.classList.add('long');
            let lastV;
            let $lastTd;
            for (const v of vs) {
                if ($lastTd && lastV == v) {
                    $lastTd.colSpan++;
                }
                else {
                    $lastTd = $row.insertCell();
                    lastV = v;
                }
                $lastTd.textContent = v;
            }
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
function makeChangesetAdiffLink(server, changesetId, text) {
    const $a = makeChangesetLink(server, changesetId);
    $a.innerText = text;
    $a.dataset.adiff = 'true';
    return $a;
}
function makeChangesetLink(server, changesetId, text) {
    const cid = String(changesetId);
    const $a = makeLink(text ?? cid, server.web.getUrl(e$8 `changeset/${cid}`));
    $a.classList.add('listened');
    $a.dataset.changesetId = cid;
    return $a;
}
function makeRelationLink(server, relationId) {
    const rid = String(relationId);
    const relationPath = e$8 `relation/${rid}`;
    const $a = makeLink(rid, server.web.getUrl(relationPath));
    $a.classList.add('listened');
    $a.dataset.elementType = 'relation';
    $a.dataset.elementId = rid;
    return $a;
}
function makeDate(timestamp, short = false) {
    const readableDate = timestamp.replace('T', ' ').replace('Z', '');
    const $time = document.createElement('time');
    $time.classList.add('listened');
    if (short) {
        $time.title = readableDate + ` UTC`;
        [$time.textContent] = readableDate.split(' ', 1);
    }
    else {
        $time.textContent = readableDate;
    }
    $time.dateTime = timestamp;
    return $time;
}
function makeUserLink(server, data) {
    const $a = (data.user
        ? makeUserNameLink(server, data.user)
        : makeUserIdLink(server, data.uid));
    $a.classList.add('listened');
    $a.dataset.userName = data.user;
    $a.dataset.userId = String(data.uid);
    return $a;
}
function makeUserNameLink(server, username) {
    const fromName = (name) => server.web.getUrl(e$8 `user/${name}`);
    return makeLink(username, fromName(username));
}
function makeUserIdLink(server, uid) {
    const fromId = (id) => server.api.getUrl(e$8 `user/${id}`);
    return makeLink('#' + uid, fromId(uid));
}
function getElementName(element) {
    if (element.tags?.name) {
        return `${element.tags.name} (${element.id})`;
    }
    else {
        return String(element.id);
    }
}
function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}

class NoteMap {
    constructor($root, $container, server) {
        this.$container = $container;
        this.dataLayers = new OsmDataLayers();
        this.needToFitNotes = false;
        this.freezeMode = 'no';
        const e = makeEscapeTag(escapeXml);
        this.leafletMap = L.map($container, {
            worldCopyJump: true,
            zoomControl: false
        }).addControl(L.control.zoom({
            position: 'bottomright'
        })).addControl(L.control.scale({
            position: 'bottomleft'
        })).addLayer(L.tileLayer(server.tile.urlTemplate, {
            attribution: e `© <a href="${server.tile.attributionUrl}">${server.tile.attributionText}</a>`,
            maxZoom: server.tile.maxZoom
        })).fitWorld();
        this.dataLayers.addToMap(this.leafletMap);
        this.unselectedNoteLayer = new NoteLayer().addTo(this.leafletMap);
        this.selectedNoteLayer = new NoteLayer().addTo(this.leafletMap);
        this.filteredNoteLayer = new NoteLayer();
        this.trackLayer = L.featureGroup().addTo(this.leafletMap);
        const crosshairLayer = new CrosshairLayer().addTo(this.leafletMap);
        const layersControl = L.control.layers();
        layersControl.addOverlay(this.unselectedNoteLayer, `Unselected notes`);
        layersControl.addOverlay(this.selectedNoteLayer, `Selected notes`);
        layersControl.addOverlay(this.filteredNoteLayer, `Filtered notes`);
        layersControl.addOverlay(this.trackLayer, `Track between notes`);
        this.dataLayers.addToLayersControl(layersControl);
        layersControl.addOverlay(crosshairLayer, `Crosshair`);
        layersControl.addTo(this.leafletMap);
        this.leafletMap.on('moveend', () => {
            const precision = this.precision;
            bubbleCustomEvent($container, 'osmNoteViewer:mapMoveEnd', {
                zoom: this.zoom.toFixed(0),
                lat: this.lat.toFixed(precision),
                lon: this.lon.toFixed(precision),
            });
            if (!this.queuedPopup)
                return;
            const [baseLayerId, popupWriter] = this.queuedPopup;
            this.queuedPopup = undefined;
            const baseLayer = this.dataLayers.baseDataLayer.getLayer(baseLayerId);
            if (baseLayer) {
                const popup = L.popup({ autoPan: false })
                    .setLatLng(this.leafletMap.getCenter()) // need to tell the popup this exact place after map stops moving, otherwise is sometimes gets opened off-screen
                    .setContent(popupWriter)
                    .openOn(this.leafletMap);
                baseLayer.bindPopup(popup);
            }
        });
        $root.addEventListener('osmNoteViewer:mapMoveTrigger', ({ detail: { zoom, lat, lon } }) => {
            this.panAndZoomTo([Number(lat), Number(lon)], Number(zoom));
        });
        $root.addEventListener('osmNoteViewer:elementRender', ({ detail: [element, elements] }) => {
            // TODO zoom on second click, like with notes
            this.dataLayers.clearLayers();
            this.addOsmData(server, renderOsmElement(element, elements));
        });
        $root.addEventListener('osmNoteViewer:changesetRender', ({ detail: changeset }) => {
            // TODO zoom on second click, like with notes
            this.dataLayers.clearLayers();
            this.addOsmData(server, renderOsmChangeset(changeset));
        });
        $root.addEventListener('osmNoteViewer:changesetAdiffRender', ({ detail: [changeset, adiff] }) => {
            // TODO zoom on second click, like with notes
            this.dataLayers.clearLayers();
            this.addOsmData(server, renderOsmChangesetAdiff(changeset, adiff));
        });
        // TODO maybe have :dataClear event
        // this.elementLayer.clearLayers()
        $root.addEventListener('osmNoteViewer:noteFocus', ({ detail: [noteId, isNegativeZoom] }) => {
            const marker = this.getNoteMarker(noteId);
            if (!marker)
                return;
            if (this.isCloseEnoughToCenter(marker.getLatLng())) {
                let nextZoom;
                const z1 = this.zoom;
                if (!isNegativeZoom && z1 < this.maxZoom) {
                    const z2 = this.maxZoom;
                    nextZoom = Math.min(z2, z1 + Math.ceil((z2 - z1) / 2));
                }
                else if (isNegativeZoom && z1 > 0) {
                    const z2 = 0;
                    nextZoom = Math.max(z2, z1 + Math.ceil((z2 - z1) / 2));
                }
                if (nextZoom != null) {
                    this.panAndZoomTo(marker.getLatLng(), nextZoom);
                    return;
                }
            }
            this.panTo(marker.getLatLng());
        });
    }
    hide(hidden) {
        if (hidden) {
            this.$container.style.visibility = 'hidden';
        }
        else {
            this.$container.style.removeProperty('visibility');
        }
    }
    getNoteMarker(noteId) {
        for (const layer of [this.unselectedNoteLayer, this.selectedNoteLayer, this.filteredNoteLayer]) {
            const marker = layer.getLayer(noteId);
            if (marker instanceof NoteMarker) {
                return marker;
            }
        }
    }
    removeNoteMarker(noteId) {
        for (const layer of [this.unselectedNoteLayer, this.selectedNoteLayer, this.filteredNoteLayer]) {
            layer.removeLayer(noteId);
        }
    }
    moveNoteMarkerToLayer(noteId, toLayer) {
        for (const layer of [this.unselectedNoteLayer, this.selectedNoteLayer, this.filteredNoteLayer]) {
            const marker = layer.getLayer(noteId);
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
        this.dataLayers.clearLayers();
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
    showNoteTrack(noteIds) {
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
        for (const noteId of noteIds) {
            const marker = this.getNoteMarker(noteId);
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
    addOsmData(server, geometryData) {
        const clear = () => this.dataLayers.clearLayers();
        if (geometryData.extraBaseLayer) {
            this.dataLayers.baseDataLayer.addLayer(geometryData.extraBaseLayer);
        }
        let [baseLayerIfDefined, baseData] = geometryData.baseGeometry;
        const baseLayer = baseLayerIfDefined ?? L.circleMarker([0, 0]);
        this.dataLayers.baseDataLayer.addLayer(baseLayer);
        const baseLayerId = this.dataLayers.baseDataLayer.getLayerId(baseLayer);
        const addLayersWithData = (group, layersWithData) => {
            if (!layersWithData)
                return;
            for (const [layer, data] of layersWithData) {
                group.addLayer(layer);
                layer.bindPopup(makePopupWriter(server, data, clear));
            }
        };
        addLayersWithData(this.dataLayers.createdDataLayer, geometryData.createdGeometry);
        addLayersWithData(this.dataLayers.modifiedDataLayer, geometryData.modifiedGeometry);
        addLayersWithData(this.dataLayers.deletedDataLayer, geometryData.deletedGeometry);
        const popupWriter = makePopupWriter(server, baseData, clear);
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
                baseLayer.bindPopup(popup, { offset: [0, 0] });
                const $popupContainer = popup.getElement();
                if (!$popupContainer)
                    return;
                const fadeoutTransitionTime = 200;
                restorePopupTipTimeoutId = setTimeout(() => {
                    restorePopupTipTimeoutId = undefined;
                    restorePopupTip($popupContainer);
                }, fadeoutTransitionTime);
            };
            baseLayer.on('popupopen', onOpenPopup).on('popupclose', onClosePopup);
            baseLayer.bindPopup(popup).openPopup();
        }
        else if (baseLayer instanceof L.CircleMarker) {
            this.queuedPopup = [baseLayerId, popupWriter];
            const minZoomForNode = 10;
            if (this.zoom < minZoomForNode) {
                this.flyToIfNotFrozen(baseLayer.getLatLng(), minZoomForNode, { duration: .5 });
            }
            else {
                this.panToIfNotFrozen(baseLayer.getLatLng());
            }
        }
        else {
            const bounds = this.dataLayers.baseDataLayer.getBounds();
            if (bounds.isValid()) {
                this.queuedPopup = [baseLayerId, popupWriter];
                this.fitBoundsIfNotFrozen(bounds);
            }
            else {
                baseLayer.bindPopup(popupWriter).openPopup();
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
    get bounds() {
        return this.leafletMap.getBounds();
    }
    get precisionBounds() {
        return new NoteMapBounds(this.bounds, this.precision);
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
    get precision() {
        return Math.max(0, Math.ceil(Math.log2(this.zoom)));
    }
}
function hidePopupTip($popupContainer) {
    $popupContainer.style.marginBottom = '0';
    const $tip = $popupContainer.querySelector('.leaflet-popup-tip-container');
    if ($tip instanceof HTMLElement) {
        $tip.hidden = true;
    }
}
function restorePopupTip($popupContainer) {
    $popupContainer.style.removeProperty('margin-bottom');
    const $tip = $popupContainer.querySelector('.leaflet-popup-tip-container');
    if ($tip instanceof HTMLElement) {
        $tip.hidden = false;
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

class ConfirmedButtonListener {
    constructor($initButton, $cancelButton, $confirmButton, runAction, isConfirmationRequired = () => true) {
        this.$initButton = $initButton;
        this.$cancelButton = $cancelButton;
        this.$confirmButton = $confirmButton;
        this.reset();
        $initButton.onclick = async () => {
            if (isConfirmationRequired()) {
                this.ask();
                this.$cancelButton.focus();
            }
            else {
                await runAction();
            }
        };
        $cancelButton.onclick = () => {
            this.reset();
            this.$initButton.focus();
        };
        $confirmButton.onclick = async () => {
            await runAction();
            this.reset();
            this.$initButton.focus();
        };
    }
    reset() {
        clearTimeout(this.confirmDelayId);
        this.$confirmButton.disabled = true;
        this.$initButton.hidden = false;
        this.$confirmButton.hidden = true;
        this.$cancelButton.hidden = true;
    }
    ask() {
        this.confirmDelayId = setTimeout(() => {
            this.$confirmButton.disabled = false;
        }, 1000);
        this.$initButton.hidden = true;
        this.$confirmButton.hidden = false;
        this.$cancelButton.hidden = false;
    }
}

class StorageSection {
    constructor($section, storage, db, serverSelector) {
        $section.append(makeElement('h2')()(`Storage`));
        const $updateFetchesButton = document.createElement('button');
        $updateFetchesButton.textContent = `Update stored fetch list`;
        $section.append(makeDiv('major-input-group')($updateFetchesButton));
        const $fetchesContainer = makeDiv()(p(`Click Update button above to see stored fetches.`));
        $section.append($fetchesContainer);
        $updateFetchesButton.addEventListener('click', async () => {
            $updateFetchesButton.disabled = true;
            let fetchEntries = [];
            try {
                fetchEntries = await db.listFetches();
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
                const host = searchParams.get('host');
                const fetchEntryServer = serverSelector.getServerForHostHashValue(host);
                if (username) {
                    if (fetchEntryServer) {
                        const href = fetchEntryServer.web.getUrl(`user/` + encodeURIComponent(username));
                        $userCell.append(`user `, makeLink(username, href));
                    }
                    else {
                        $userCell.append(`user ${username}`);
                    }
                }
                else if (ids) {
                    const match = ids.match(/\d+/);
                    if (match) {
                        const [id] = match;
                        if (fetchEntryServer) {
                            const href = fetchEntryServer.web.getUrl(`note/` + encodeURIComponent(id));
                            $userCell.append(`note `, makeLink(id, href), `, ...`);
                        }
                        else {
                            $userCell.append(`note ${id}, ...`);
                        }
                    }
                }
                $row.insertCell().append(new Date(fetchEntry.accessTimestamp).toISOString());
                const $deleteButton = document.createElement('button');
                $deleteButton.textContent = `Delete`;
                $deleteButton.addEventListener('click', async () => {
                    $deleteButton.disabled = true;
                    await db.deleteFetch(fetchEntry);
                    $updateFetchesButton.click();
                });
                $row.insertCell().append($deleteButton);
            }
            $fetchesContainer.append($table);
        });
        {
            const $clearButton = makeElement('button')()(`Clear settings`);
            const $cancelButton = makeElement('button')()(`Cancel clear settings`);
            const $confirmButton = makeElement('button')()(`Confirm clear settings`);
            new ConfirmedButtonListener($clearButton, $cancelButton, $confirmButton, async () => storage.clear());
            $section.append(makeDiv('major-input-group')($clearButton, $cancelButton, $confirmButton));
        }
    }
}

function makeHelpDialog(closeButtonLabel, content) {
    const $helpDialog = makeElement('dialog')('help')();
    const $closeButton = makeElement('button')('close')();
    $closeButton.title = closeButtonLabel;
    $closeButton.innerHTML = `<svg><use href="#reset" /></svg>`;
    $closeButton.onclick = () => {
        $helpDialog.close();
    };
    $helpDialog.append($closeButton, ...content, makeDiv('notice')(`Press `, kbd(`F1`), ` again to access the default browser help; press `, kbd(`Esc`), ` to close this dialog.`));
    return $helpDialog;
}

function makeMenuButton() {
    const $button = makeElement('button')('global', 'menu')();
    $button.innerHTML = `<svg><use href="#menu" /></svg>`;
    $button.onclick = () => {
        bubbleEvent($button, 'osmNoteViewer:menuToggle');
    };
    return $button;
}
class OverlayDialog {
    constructor($root, storage, db, net, map, $menuButton) {
        this.map = map;
        this.$menuButton = $menuButton;
        this.$menuPanel = makeElement('div')('menu')();
        this.$figureDialog = makeElement('dialog')('figure')();
        this.$figure = document.createElement('figure');
        this.$backdrop = document.createElement('div');
        this.$img = document.createElement('img');
        this.$figureCaption = makeElement('figcaption')()();
        this.$prevImageButton = makeElement('button')('global', 'prev')();
        this.$nextImageButton = makeElement('button')('global', 'next')();
        this.$figureHelpDialog = makeHelpDialog(`Close image viewer help`, [
            makeElement('h2')()(`Image viewer keyboard controls`),
            ul(li(kbd(`Enter`), ` , `, kbd(`Space`), ` , `, kbd(`+`), ` / `, kbd(`-`), ` — toggle image zoom`), li(kbd(`Esc`), ` — close image viewer`)),
            p(`When zoomed out:`),
            ul(li(kbd(`Arrow keys`), ` — go to previous/next image in sequence`), li(kbd(`Home`), ` / `, kbd(`End`), ` — go to first/last image in sequence`))
        ]);
        this.menuHidden = !!net.cx;
        this.$menuButton.disabled = !net.cx;
        this.writeMenuPanel(storage, db, net);
        this.writeFigureDialog();
        $root.append(this.$figureHelpDialog);
        for (const eventType of [
            'osmNoteViewer:newNoteStream',
            'osmNoteViewer:mapMoveTrigger',
            'osmNoteViewer:elementRender',
            'osmNoteViewer:changesetRender',
            'osmNoteViewer:noteFocus'
        ]) {
            $root.addEventListener(eventType, () => this.close());
        }
        $root.addEventListener('osmNoteViewer:imageToggle', ({ detail: imageSequence }) => {
            this.toggleImage(imageSequence);
        });
        $root.addEventListener('osmNoteViewer:menuToggle', ({ detail }) => {
            if (this.imageSequence != null)
                this.close();
            if (detail == 'login') {
                this.menuHidden = false;
                net.focusOnLogin();
            }
            else {
                this.menuHidden = !this.menuHidden;
            }
            this.map?.hide(!this.menuHidden);
        });
    }
    writeFigureDialog() {
        this.$figure.tabIndex = 0;
        this.$backdrop.classList.add('backdrop');
        this.$img.alt = 'attached photo';
        this.updateImageState();
        this.$figure.append(this.$backdrop, this.$img, this.$figureCaption);
        this.$figureDialog.append(this.$figure);
        const $closeButton = makeElement('button')('global', 'close')();
        const buttons = [
            [$closeButton, 'reset', `Close photo`],
            [this.$prevImageButton, 'image-prev', `Previous photo`],
            [this.$nextImageButton, 'image-next', `Next photo`]
        ];
        for (const [$button, href, title] of buttons) {
            $button.tabIndex = -1;
            $button.title = title;
            $button.innerHTML = `<svg><use href="#${href}" /></svg>`;
            this.$figureDialog.append($button);
        }
        this.$figureDialog.onkeydown = ev => {
            if (ev.key == 'Escape') {
                this.close();
            }
            else if (ev.key == 'F1') {
                this.$figureHelpDialog.showModal();
            }
            else if (this.viewingZoomedOutImage) {
                if (ev.key == 'ArrowUp' || ev.key == 'ArrowLeft') {
                    this.switchToImageDelta(-1);
                }
                else if (ev.key == 'ArrowDown' || ev.key == 'ArrowRight') {
                    this.switchToImageDelta(+1);
                }
                else if (ev.key == 'Home') {
                    this.switchToImage(0);
                }
                else if (ev.key == 'End') {
                    this.switchToImage(-1);
                }
                else {
                    return;
                }
                this.updateImageState();
            }
            else {
                return;
            }
            ev.stopPropagation();
            ev.preventDefault();
        };
        this.$figureDialog.onwheel = ev => {
            if (this.viewingZoomedOutImage) {
                const dIndex = Math.sign(ev.deltaY);
                if (!dIndex)
                    return;
                this.switchToImageDelta(dIndex);
                this.updateImageState();
                ev.stopPropagation();
                ev.preventDefault();
            }
        };
        this.$prevImageButton.onclick = () => {
            this.switchToImageDelta(-1);
            this.updateImageState();
        };
        this.$nextImageButton.onclick = () => {
            this.switchToImageDelta(+1);
            this.updateImageState();
        };
        const scrollFigure = (xScrollFraction, yScrollFraction) => {
            const xMaxScrollDistance = this.$figure.scrollWidth - this.$figure.clientWidth;
            const yMaxScrollDistance = this.$figure.scrollHeight - this.$figure.clientHeight;
            if (xMaxScrollDistance > 0)
                this.$figure.scrollLeft = Math.round(xScrollFraction * xMaxScrollDistance);
            if (yMaxScrollDistance > 0)
                this.$figure.scrollTop = Math.round(yScrollFraction * yMaxScrollDistance);
        };
        this.$figure.onkeydown = ev => {
            if (ev.key == 'Enter' || ev.key == ' ') {
                if (this.$figure.classList.toggle('zoomed')) {
                    scrollFigure(.5, .5);
                }
            }
            else if (ev.key == '+') {
                this.$figure.classList.add('zoomed');
                scrollFigure(.5, .5);
            }
            else if (ev.key == '-') {
                this.$figure.classList.remove('zoomed');
            }
            else {
                return;
            }
            ev.stopPropagation();
            ev.preventDefault();
        };
        this.$figure.onclick = ev => {
            if (this.$figure.classList.contains('zoomed')) {
                this.$figure.classList.remove('zoomed');
            }
            else {
                const clamp = (num) => Math.min(Math.max(num, 0), 1);
                let xScrollFraction = (ev.offsetX >= this.$figure.offsetWidth / 2 ? 1 : 0);
                let yScrollFraction = (ev.offsetY >= this.$figure.offsetHeight / 2 ? 1 : 0);
                if (ev.target == this.$img) {
                    xScrollFraction = clamp(ev.offsetX / this.$img.offsetWidth);
                    yScrollFraction = clamp(ev.offsetY / this.$img.offsetHeight);
                }
                this.$figure.classList.add('zoomed');
                scrollFigure(xScrollFraction, yScrollFraction);
            }
        };
        this.$figure.onmousemove = ev => {
            const rect = this.$figure.getBoundingClientRect();
            $closeButton.classList.toggle('right-position', ev.clientX - rect.left >= rect.width / 2);
            $closeButton.classList.toggle('bottom-position', ev.clientY - rect.top >= rect.height / 2);
            for (const [$button] of buttons) {
                startAnimation($button, 'figure-control-fade', '3s');
            }
            startAnimation(this.$figureCaption, 'figure-control-fade', '3s');
        };
        $closeButton.onclick = () => {
            this.close();
        };
        for (const [$button] of buttons) {
            cleanupAnimationOnEnd($button);
        }
        cleanupAnimationOnEnd(this.$figureCaption);
    }
    writeMenuPanel(storage, db, net) {
        const $lead = makeDiv('lead')();
        {
            const $about = makeDiv()(makeElement('strong')()(`note-viewer`));
            const build = document.body.dataset.build;
            if (build)
                $about.append(` build ${build}`);
            $about.append(` — `, makeLink(`source code`, `https://github.com/AntonKhorev/osm-note-viewer`));
            $lead.append($about);
        }
        const $scrolling = makeDiv('panel', 'scrolling')();
        $scrolling.append(...net.$sections);
        {
            const $subsection = makeElement('section')()();
            new StorageSection($subsection, storage, db, net.serverSelector);
            $scrolling.append($subsection);
        }
        $scrolling.append(makeExtraSubsection());
        this.$menuPanel.append($lead, $scrolling);
    }
    close() {
        this.map?.hide(false);
        this.menuHidden = true;
        this.$figureDialog.close();
        this.imageSequence = undefined;
        this.updateImageState();
    }
    toggleImage(imageSequence) {
        this.menuHidden = true;
        if (this.imageSequence && equalUrlSequences(imageSequence, this.imageSequence)) {
            this.close();
            return;
        }
        this.map?.hide(true);
        this.imageSequence = imageSequence;
        this.updateImageState();
        this.$figureDialog.show();
        this.$figure.focus();
    }
    get menuHidden() {
        return this.$menuPanel.hidden;
    }
    set menuHidden(value) {
        this.$menuPanel.hidden = value;
        this.$menuButton.classList.toggle('opened', !value);
        this.$menuButton.setAttribute('aria-expanded', String(!value));
        this.$menuButton.title = value ? `Open menu` : `Close menu`;
    }
    updateImageState() {
        this.$figure.classList.remove('zoomed');
        if (this.imageSequence) {
            const url = this.imageSequence.urls[this.imageSequence.index];
            this.$backdrop.style.backgroundImage = `url(${url})`;
            this.$img.src = url;
            this.$figureCaption.textContent = url;
            this.$prevImageButton.hidden = this.$nextImageButton.hidden = this.imageSequence.urls.length <= 1;
            startAnimation(this.$figureCaption, 'figure-control-fade', '3s');
        }
        else {
            this.$backdrop.style.removeProperty('backgroundImage');
            this.$img.removeAttribute('src');
        }
    }
    switchToImage(index) {
        if (!this.imageSequence)
            return;
        this.imageSequence.index = (this.imageSequence.urls.length + index) % this.imageSequence.urls.length;
    }
    switchToImageDelta(dIndex) {
        if (!this.imageSequence)
            return;
        this.imageSequence.index = (this.imageSequence.index + this.imageSequence.urls.length + dIndex) % this.imageSequence.urls.length;
    }
    get viewingZoomedOutImage() {
        return !!this.imageSequence && !this.$figure.classList.contains('zoomed');
    }
}
function makeExtraSubsection() {
    return makeElement('section')()(makeElement('h2')()(`Extra information`), p(`Notes implementation code: `, makeLink(`notes api controller`, `https://github.com/openstreetmap/openstreetmap-website/blob/master/app/controllers/api/notes_controller.rb`), ` (db search query is build there), `, makeLink(`notes controller`, `https://github.com/openstreetmap/openstreetmap-website/blob/master/app/controllers/notes_controller.rb`), ` (paginated user notes query is build there), `, makeLink(`note model`, `https://github.com/openstreetmap/openstreetmap-website/blob/master/app/models/note.rb`), `, `, makeLink(`note comment model`, `https://github.com/openstreetmap/openstreetmap-website/blob/master/app/models/note_comment.rb`), ` in `, makeLink(`openstreetmap-website`, `https://wiki.openstreetmap.org/wiki/Openstreetmap-website`), ` (not implemented in `, makeLink(`CGIMap`, `https://wiki.openstreetmap.org/wiki/Cgimap`), `)`), p(`OAuth 2.0: `, makeLink(`main RFC`, `https://www.rfc-editor.org/rfc/rfc6749`), `, `, makeLink(`token revocation RFC`, `https://www.rfc-editor.org/rfc/rfc7009`), ` (logouts), `, makeLink(`proof key RFC`, `https://www.rfc-editor.org/rfc/rfc7636`), `, `, makeLink(`Doorkeeper`, `https://github.com/doorkeeper-gem/doorkeeper`), ` (OAuth implementation used in `, em(`openstreetmap-website`), `), `, makeLink(`OSM wiki`, `https://wiki.openstreetmap.org/wiki/OAuth`)), p(`Other documentation: `, makeLink(`Overpass queries`, `https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL`), `, `, makeLink(`Puppeteer`, `https://pptr.dev/`), ` (in-browser testing)`));
}
function equalUrlSequences(seq1, seq2) {
    if (seq1.index != seq2.index)
        return false;
    if (seq1.urls.length != seq2.urls.length)
        return false;
    return seq1.urls.every((_, i) => seq1.urls[i] == seq2.urls[i]);
}

const minHorSideSize = 80;
const minVerSideSize = 80;
const frMultiplier = 100000;
function isHor(side) {
    return side == 'left' || side == 'right';
}
function isFront(side) {
    return side == 'top' || side == 'left';
}
function adjustFraction(side, fraction) {
    return isFront(side) ? fraction : 1 - fraction;
}
class Move {
    constructor($root, $side, ev) {
        this.side = $side.dataset.side = forceValidSide($root, $side.dataset.side);
        const frontSize = getFrontSize($root, $side, this.side);
        const pointerPosition = getPointerPosition(ev, isHor(this.side));
        this.startOffset = pointerPosition - frontSize;
        const targetFrontFraction = getTargetFraction($root, isHor(this.side), frontSize);
        this.startFrontFraction = this.frontFraction = setFrontSizeProperties($root, this.side, targetFrontFraction);
    }
    move($root, ev) {
        const pointerPosition = getPointerPosition(ev, isHor(this.side));
        const targetFrontSize = pointerPosition - this.startOffset;
        const targetFrontFraction = getTargetFraction($root, isHor(this.side), targetFrontSize);
        this.frontFraction = setFrontSizeProperties($root, this.side, targetFrontFraction);
    }
    get sidebarFraction() {
        return adjustFraction(this.side, this.frontFraction);
    }
    get startSidebarFraction() {
        return adjustFraction(this.side, this.startFrontFraction);
    }
}
function makeFlipMargin(side) {
    const $flipMargin = makeDiv('flip-margin')(makeElement('span')('side-indicator')());
    $flipMargin.dataset.side = side;
    $flipMargin.hidden = true;
    return $flipMargin;
}
function forceValidSide($root, side) {
    if (side == 'top' || side == 'bottom' || side == 'left' || side == 'right') {
        return side;
    }
    else {
        return $root.clientHeight > $root.clientWidth ? 'top' : 'left';
    }
}
class SidebarResizer {
    constructor($root, $side, storage) {
        this.$root = $root;
        this.$side = $side;
        this.storage = storage;
        this.$flipMargins = {
            top: makeFlipMargin('top'),
            bottom: makeFlipMargin('bottom'),
            left: makeFlipMargin('left'),
            right: makeFlipMargin('right'),
        };
        $root.append(...Object.values(this.$flipMargins));
        $root.style.setProperty('--min-hor-side-size', `${minHorSideSize}px`);
        $root.style.setProperty('--min-ver-side-size', `${minVerSideSize}px`);
        const side = $side.dataset.side = forceValidSide($root, storage.getItem('sidebar-side'));
        const sidebarFractionItem = storage.getItem(`sidebar-fraction`);
        if (sidebarFractionItem != null) {
            setSidebarSizeProperties($root, side, Number(sidebarFractionItem));
        }
        this.$button = makeElement('button')('global', 'resize')();
        this.$button.innerHTML = `<svg><use href="#resize" /></svg>`;
        this.$button.title = `Resize sidebar`;
    }
    startListening(map) {
        let move;
        this.$button.onpointerdown = ev => {
            move = new Move(this.$root, this.$side, ev);
            this.showFlipMargins(move.side);
            this.$button.setPointerCapture(ev.pointerId);
        };
        this.$button.onpointerup = this.$button.onpointercancel = ev => {
            this.hideFlipMargins();
            if (!move)
                return;
            const newSide = forceValidSide(this.$root, this.$side.dataset.side);
            if (move.side == newSide) {
                this.storeSidebarSize(move.side, move.sidebarFraction);
            }
            else {
                this.storage.setItem('sidebar-side', newSide);
                this.storeSidebarSize(newSide, move.startSidebarFraction);
            }
            move = undefined;
        };
        this.$button.onpointermove = ev => {
            if (!move)
                return;
            let onLeftMargin = ev.clientX < minHorSideSize;
            let onRightMargin = ev.clientX >= this.$root.clientWidth - minHorSideSize;
            let onTopMargin = ev.clientY < minVerSideSize;
            let onBottomMargin = ev.clientY >= this.$root.clientHeight - minVerSideSize;
            if ((+onLeftMargin) + (+onRightMargin) + (+onTopMargin) + (+onBottomMargin) > 1) {
                onLeftMargin = onRightMargin = onTopMargin = onBottomMargin = false;
            }
            this.$flipMargins.left.classList.toggle('active', onLeftMargin && move.side != 'left');
            this.$flipMargins.right.classList.toggle('active', onRightMargin && move.side != 'right');
            this.$flipMargins.top.classList.toggle('active', onTopMargin && move.side != 'top');
            this.$flipMargins.bottom.classList.toggle('active', onBottomMargin && move.side != 'bottom');
            const flipAction = (move, side) => {
                if (move.side == side)
                    return false;
                this.$side.dataset.side = side;
                setSidebarSizeProperties(this.$root, side, move.startSidebarFraction);
                return true;
            };
            if (onLeftMargin && flipAction(move, 'left')) ;
            else if (onRightMargin && flipAction(move, 'right')) ;
            else if (onTopMargin && flipAction(move, 'top')) ;
            else if (onBottomMargin && flipAction(move, 'bottom')) ;
            else {
                this.$side.dataset.side = move.side;
                move.move(this.$root, ev);
            }
            map.invalidateSize();
        };
        this.$button.onkeydown = ev => {
            if (move)
                return;
            const stepBase = ev.shiftKey ? 24 : 8;
            let step;
            const side = this.$side.dataset.side = forceValidSide(this.$root, this.$side.dataset.side);
            const flip = (newSide) => {
                const frontSize = getFrontSize(this.$root, this.$side, side);
                const targetFrontFraction = getTargetFraction(this.$root, isHor(side), frontSize);
                const targetSidebarFraction = adjustFraction(side, targetFrontFraction);
                this.storage.setItem('sidebar-side', this.$side.dataset.side = newSide);
                const sidebarFraction = setSidebarSizeProperties(this.$root, newSide, targetSidebarFraction);
                this.storeSidebarSize(newSide, sidebarFraction);
            };
            if (isHor(side) && ev.key == 'ArrowUp') {
                flip('top');
            }
            else if (isHor(side) && ev.key == 'ArrowDown') {
                flip('bottom');
            }
            else if (!isHor(side) && ev.key == 'ArrowLeft') {
                flip('left');
            }
            else if (!isHor(side) && ev.key == 'ArrowRight') {
                flip('right');
            }
            else if (ev.key == 'ArrowLeft' || ev.key == 'ArrowUp') {
                step = -stepBase;
            }
            else if (ev.key == 'ArrowRight' || ev.key == 'ArrowDown') {
                step = +stepBase;
            }
            else {
                return;
            }
            if (step) {
                const frontSize = getFrontSize(this.$root, this.$side, side);
                const targetFrontSize = frontSize + step;
                const targetFrontFraction = getTargetFraction(this.$root, isHor(side), targetFrontSize);
                const frontFraction = setFrontSizeProperties(this.$root, side, targetFrontFraction);
                this.storeFrontSize(side, frontFraction);
            }
            map.invalidateSize();
            if (step == null)
                return;
            ev.stopPropagation();
            ev.preventDefault();
        };
    }
    showFlipMargins(againstSide) {
        for (const [side, $flipMargin] of Object.entries(this.$flipMargins)) {
            $flipMargin.hidden = side == againstSide;
        }
    }
    hideFlipMargins() {
        for (const $flipMargin of Object.values(this.$flipMargins)) {
            $flipMargin.hidden = true;
            $flipMargin.classList.remove('active');
        }
    }
    storeSidebarSize(side, sidebarFraction) {
        this.storage.setItem(`sidebar-fraction`, String(sidebarFraction));
    }
    storeFrontSize(side, sidebarFraction) {
        this.storage.setItem(`sidebar-fraction`, String(adjustFraction(side, sidebarFraction)));
    }
}
function getPointerPosition(ev, isHor) {
    return isHor ? ev.clientX : ev.clientY;
}
function getFrontSize($root, $side, side) {
    if (side == 'top') {
        return $side.offsetHeight;
    }
    else if (side == 'bottom') {
        return $root.clientHeight - $side.offsetHeight;
    }
    else if (side == 'left') {
        return $side.offsetWidth;
    }
    else if (side == 'right') {
        return $root.clientWidth - $side.offsetWidth;
    }
    else {
        throw new RangeError(`invalid sidebar side`);
    }
}
function getTargetFraction($root, isHor, targetSize) {
    const minSideSize = isHor ? minHorSideSize : minVerSideSize;
    const rootExtraSize = (isHor ? $root.clientWidth : $root.clientHeight) - 2 * minSideSize;
    const targetExtraSize = targetSize - minSideSize;
    return targetExtraSize / rootExtraSize;
}
function setSidebarSizeProperties($root, side, sidebarFraction) {
    const frontFraction = adjustFraction(side, sidebarFraction);
    const outputFrontFraction = setFrontSizeProperties($root, side, frontFraction);
    return adjustFraction(side, outputFrontFraction);
}
function setFrontSizeProperties($root, side, frontFraction) {
    if (frontFraction < 0)
        frontFraction = 0;
    if (frontFraction > 1)
        frontFraction = 1;
    if (Number.isNaN(frontFraction))
        frontFraction = 0.5;
    const fr = Math.round(frontFraction * frMultiplier);
    $root.style.setProperty(isHor(side) ? '--left-side-size' : '--top-side-size', `${fr}fr`);
    $root.style.setProperty(isHor(side) ? '--right-side-size' : '--bottom-side-size', `${frMultiplier - fr}fr`);
    return frontFraction;
}

const e$7 = makeEscapeTag(escapeXml);
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
        return !this.$section.hidden;
    }
    onOpen() { }
    onClose() { }
}
// https://www.w3.org/WAI/ARIA/apg/example-index/tabs/tabs-automatic.html
// https://www.w3.org/WAI/ARIA/apg/example-index/tabs/tabs-manual.html
class Navbar {
    constructor($root, $container) {
        this.$tabList = document.createElement('div');
        this.tabs = new Map();
        this.$tabList.setAttribute('role', 'tablist');
        this.$tabList.setAttribute('aria-label', `Note query modes`);
        $container.append(this.$tabList);
        $container.append(makeResetButton());
        $container.onkeydown = ev => {
            const $button = ev.target;
            if (!($button instanceof HTMLButtonElement))
                return;
            const focusButton = (c, o) => {
                const $buttons = [...$container.querySelectorAll('button')];
                const i = $buttons.indexOf($button);
                const l = $buttons.length;
                if (l <= 0 || i < 0)
                    return;
                $buttons[(l + i * c + o) % l].focus();
            };
            if (ev.key == 'ArrowLeft') {
                focusButton(1, -1);
            }
            else if (ev.key == 'ArrowRight') {
                focusButton(1, +1);
            }
            else if (ev.key == 'Home') {
                focusButton(0, 0);
            }
            else if (ev.key == 'End') {
                focusButton(0, -1);
            }
            else {
                return;
            }
            ev.stopPropagation();
            ev.preventDefault();
        };
    }
    addTab(dialog, push = false) {
        const tabId = 'tab-' + dialog.shortTitle;
        const tabPanelId = 'tab-panel-' + dialog.shortTitle;
        const $tab = document.createElement('button');
        $tab.id = tabId;
        $tab.tabIndex = -1;
        $tab.innerText = dialog.shortTitle;
        $tab.setAttribute('role', 'tab');
        $tab.setAttribute('aria-controls', tabPanelId);
        $tab.setAttribute('aria-selected', 'false');
        $tab.classList.toggle('push', push);
        dialog.$section.id = tabPanelId;
        dialog.$section.tabIndex = 0;
        dialog.$section.hidden = true;
        dialog.$section.setAttribute('role', 'tabpanel');
        dialog.$section.setAttribute('aria-labelledby', tabId);
        this.$tabList.append($tab);
        this.tabs.set(dialog, $tab);
        $tab.onclick = () => {
            this.openTab(dialog);
        };
    }
    openTab(targetDialog) {
        for (const [dialog] of this.tabs) {
            const willBeActive = dialog == targetDialog;
            if (!willBeActive && dialog.isOpen()) {
                dialog.onClose();
            }
        }
        for (const [dialog, $tab] of this.tabs) {
            const willBeActive = dialog == targetDialog;
            const willCallOnOpen = (willBeActive && !dialog.isOpen());
            $tab.setAttribute('aria-selected', String(willBeActive));
            $tab.tabIndex = willBeActive ? 0 : -1;
            dialog.$section.hidden = !willBeActive;
            if (willCallOnOpen) {
                dialog.onOpen();
            }
        }
    }
}
function makeResetButton() {
    return makeButton('reset', `Reset query`, () => {
        location.href = location.pathname + location.search;
        // TODO this would have worked better, if it also cleared the notes table:
        // const url=location.pathname+location.search
        // location.href=url+'#'
        // history.replaceState(null,'',url)
    });
}
function makeButton(id, title, listener) {
    const $button = document.createElement('button');
    $button.tabIndex = -1;
    $button.title = title;
    $button.classList.add('global', id);
    $button.innerHTML = e$7 `<svg><use href="#${id}" /></svg>`;
    $button.onclick = listener;
    return $button;
}

function toReadableDate(date) {
    return toShortOrFullReadableDate(date, true);
}
function toShortReadableDate(date) {
    return toShortOrFullReadableDate(date, false);
}
function toShortOrFullReadableDate(date, full) {
    if (date == null)
        return '';
    const pad = (n) => ('0' + n).slice(-2);
    const dateObject = new Date(date * 1000);
    let dateString = '';
    switch (true) {
        case full || dateObject.getUTCSeconds() != 0:
            dateString = ':' + pad(dateObject.getUTCSeconds());
        case dateObject.getUTCMinutes() != 0 || dateObject.getUTCHours() != 0:
            dateString = ' ' + pad(dateObject.getUTCHours()) + ':' + pad(dateObject.getUTCMinutes()) + dateString;
        case dateObject.getUTCDate() != 1 || dateObject.getUTCMonth() != 0:
            dateString = '-' + pad(dateObject.getUTCMonth() + 1) + '-' + pad(dateObject.getUTCDate()) + dateString;
        default:
            dateString = dateObject.getUTCFullYear() + dateString;
    }
    return dateString;
}
function toUrlDate(date, dateSeparator = '', timeSeparator = '') {
    const pad = (n) => ('0' + n).slice(-2);
    const dateObject = new Date(date * 1000);
    const dateString = dateObject.getUTCFullYear() + dateSeparator +
        pad(dateObject.getUTCMonth() + 1) + dateSeparator +
        pad(dateObject.getUTCDate()) +
        'T' +
        pad(dateObject.getUTCHours()) + timeSeparator +
        pad(dateObject.getUTCMinutes()) + timeSeparator +
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
function makeUserQueryFromUserNameAndId(username, uid) {
    if (username != null) {
        return {
            type: 'name',
            username
        };
    }
    else if (uid != null && Number.isInteger(uid)) {
        return {
            type: 'id',
            uid
        };
    }
    else {
        return {
            type: 'empty'
        };
    }
}
function makeNoteSearchQueryFromUserQueryAndValues(userQuery, textValue, fromValue, toValue, closedValue, sortValue, orderValue) {
    const noteSearchQuery = {
        mode: 'search',
        closed: toClosed(closedValue),
        sort: toSort(sortValue),
        order: toOrder(orderValue)
    };
    {
        if (userQuery.type == 'invalid')
            return undefined;
        if (userQuery.type == 'name') {
            noteSearchQuery.display_name = userQuery.username;
        }
        else if (userQuery.type == 'id') {
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
function makeNoteSearchQueryFromValues(apiUrlLister, webUrlLister, userValue, textValue, fromValue, toValue, closedValue, sortValue, orderValue) {
    return makeNoteSearchQueryFromUserQueryAndValues(toUserQuery(apiUrlLister, webUrlLister, userValue), textValue, fromValue, toValue, closedValue, sortValue, orderValue);
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
function makeNoteQueryStringWithHostHash(query, hostHashValue) {
    const queryStringWithoutHostHash = makeNoteQueryString(query);
    if (!queryStringWithoutHostHash)
        return queryStringWithoutHostHash;
    if (hostHashValue)
        return `host=${escapeHash(hostHashValue)}&${queryStringWithoutHostHash}`;
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
    if (!data || typeof data != 'object')
        return false;
    if (!('type' in data) || data.type != 'Feature')
        return false;
    if (!('geometry' in data) || !data.geometry || typeof data.geometry != 'object')
        return false;
    if (!('coordinates' in data.geometry) || !isArrayOfNumbers(data.geometry.coordinates) || data.geometry.coordinates.length < 2)
        return false;
    if (!('properties' in data) || !data.properties || typeof data.properties != 'object')
        return false;
    // TODO data.properties checks
    return true;
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
    const note = {
        id: noteFeature.properties.id,
        lat: noteFeature.geometry.coordinates[1],
        lon: noteFeature.geometry.coordinates[0],
        status: noteFeature.properties.status,
        comments: noteFeature.properties.comments.map(cullCommentProps)
    };
    if (note.comments.length == 0) {
        note.comments = [makeGuessedOpeningComment(noteFeature)];
    }
    else if (note.comments[0].action != 'opened') {
        note.comments.unshift(makeGuessedOpeningComment(noteFeature));
    }
    return note;
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
}
function makeGuessedOpeningComment(noteFeature) {
    return {
        date: transformDate(noteFeature.properties.date_created),
        action: 'opened',
        text: '',
        guessed: true
    };
}
function transformDate(a) {
    const match = a.match(/^\d\d\d\d-\d\d-\d\d\s+\d\d:\d\d:\d\d/);
    if (!match)
        return 0; // shouldn't happen
    const [s] = match;
    return Date.parse(s + 'Z') / 1000;
}
function getNoteUpdateDate(note) {
    return note.comments[note.comments.length - 1]?.date ?? 0;
}

const e$6 = makeEscapeTag(encodeURIComponent);
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
        return ['', this.getRequestUrlParametersWithoutLimit(query) + e$6 `&limit=${limit}`];
    }
    getRequestUrlParametersWithoutLimit(query) {
        return e$6 `bbox=${query.bbox}&closed=${query.closed}`;
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
    constructor({ db, api, token, hostHashValue, noteTable, $moreContainer, getLimit, getAutoLoad, blockDownloads, moreButtonIntersectionObservers }, query, clearStore) {
        this.fetchEntry = null;
        this.notes = new Map();
        this.users = {};
        this.updateRequestHintInAdvancedMode = () => { };
        this.db = db;
        (async () => {
            const queryString = makeNoteQueryStringWithHostHash(query, hostHashValue); // empty string == don't know how to encode the query, thus won't save it to db
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
                    const url = api.getUrl(apiPath);
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
                        const response = await api.fetch.withToken(token)(apiPath);
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
    async updateNote(newNote, newUsers) {
        if (!this.fetchEntry)
            return;
        await this.db.updateDataInFetch(Date.now(), this.fetchEntry, newNote, newUsers);
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
        const pathAndParameters = ['', parametersWithoutLimit + e$6 `&limit=${limit}`];
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

class NoteFetchDialog extends NavDialog {
    constructor($root, $sharedCheckboxes, cx, getRequestApiPaths, submitQuery) {
        super();
        this.$root = $root;
        this.$sharedCheckboxes = $sharedCheckboxes;
        this.cx = cx;
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
    getQueryCaption(query) {
        return makeElement('caption')()(`notes`);
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
        const mainUrl = this.cx.server.api.getUrl(mainApiPath);
        const $a = makeLink(mainUrl, mainUrl);
        $a.classList.add('request');
        this.$requestOutput.replaceChildren(code($a), ` in ${mainType} format`);
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
            const url = this.cx.server.api.getUrl(apiPath);
            this.$requestOutput.append(code(makeLink(type, url)));
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
            $fieldset.append(makeDiv('non-advanced-input-group')(this.limitLeadText, makeLabel()(this.limitLabelBeforeText, this.$limitSelect, this.limitLabelAfterText)), makeDiv('advanced-input-group')(this.limitLeadText, makeLabel()(this.limitLabelBeforeText, this.$limitInput, this.limitLabelAfterText, (this.limitIsParameter
                ? makeElement('span')('advanced-hint')(` (`, code('limit'), ` parameter)`)
                : makeElement('span')('advanced-hint')(` (will make this many API requests each time it downloads more notes)`)))));
        }
        this.writeDownloadModeFieldset($fieldset, $legend);
        const $showImagesCheckbox = document.createElement('input');
        $showImagesCheckbox.type = 'checkbox';
        this.$sharedCheckboxes.showImages.push($showImagesCheckbox);
        $fieldset.append(makeDiv('regular-input-group')(makeLabel()($showImagesCheckbox, ` Load and show images from StreetComplete`)));
        this.$advancedModeCheckbox.type = 'checkbox';
        this.$sharedCheckboxes.advancedMode.push(this.$advancedModeCheckbox);
        $fieldset.append(makeDiv('regular-input-group')(makeLabel()(this.$advancedModeCheckbox, ` Advanced mode`)));
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
    makeInputLink($input, text) {
        const $a = makeElement('a')('input-link')(text);
        $a.tabIndex = 0;
        $a.dataset.inputName = $input.name;
        return $a;
    }
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
        writeDownloadModeFieldset($fieldset) {
            this.$autoLoadCheckbox.type = 'checkbox';
            this.$autoLoadCheckbox.checked = true;
            $fieldset.append(makeDiv('regular-input-group')(makeLabel()(this.$autoLoadCheckbox, ` Automatically load more notes when scrolled to the end of the table`)));
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
            return makeDiv('major-input-group')(this.$fetchButton);
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
                `In `, em(`advanced mode`), ` can be entered as a numeric value. `,
                `When `, em(`advanced mode`), ` is disabled this parameter is available as a dropdown menu with the following values: `,
                makeElement('table')()(makeTr('th')([`label`], [`value`], [`description`]), makeTr('td')([em(`both open and closed`)], [code(`-1`)], [
                    `Special value to ignore how long ago notes were closed. `,
                    `This is the default value for `, em(`note-viewer`), ` because it's the most useful one in conjunction with searching for a given user's notes.`
                ]), makeTr('td')([em(`open and recently closed`)], [code(`7`)], [
                    `The most common value used in other apps like the OSM website.`
                ]), makeTr('td')([em(`only open`)], [code(`0`)], [
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
            const $closedLine = makeDiv('regular-input-group')(`Fetch `, makeElement('span')('non-advanced-input-group')(this.$closedSelect), ` matching notes `, makeLabel('advanced-input-group')(`closed no more than `, this.$closedInput, makeElement('span')('advanced-hint')(` (`, code('closed'), ` parameter)`), ` days ago`));
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
    getQueryCaption(query) {
        if (query.mode != 'search' && query.mode != 'bbox')
            return super.getQueryCaption(query);
        const items = this.getQueryCaptionItems(query);
        const $caption = makeElement('caption')()();
        if (query.closed == 0) {
            $caption.append(`open notes`);
        }
        else if (query.closed == 7) {
            $caption.append(`open and recently closed notes`);
        }
        else if (query.closed > 0) {
            $caption.append(`open notes and notes closed up to ${query.closed} days ago`);
        }
        else {
            $caption.append(`notes`);
        }
        if (items.length > 0) {
            $caption.append(` for `);
            let first = true;
            for (const item of items) {
                if (first) {
                    first = false;
                }
                else {
                    $caption.append(`, `);
                }
                $caption.append(...item);
            }
        }
        return $caption;
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

class TextControl {
    constructor($input, isVisible, canDoWithoutTextState, canDoWithTextState, undoInput, doInput, getUndoLabel, getDoLabel) {
        this.$input = $input;
        this.isVisible = isVisible;
        this.canDoWithoutTextState = canDoWithoutTextState;
        this.canDoWithTextState = canDoWithTextState;
        this.getUndoLabel = getUndoLabel;
        this.getDoLabel = getDoLabel;
        const inputMutationObserver = new MutationObserver(() => {
            this.updateControl();
        });
        inputMutationObserver.observe(this.$input, { attributes: true, attributeFilter: ['disabled'] });
        this.$a = makeSemiLink('input-link')();
        this.$a.onclick = async () => {
            if (this.$input.disabled)
                return;
            if (this.canUndo(this.textState)) {
                undoInput(this.textState);
                this.textState = undefined;
                this.updateControl();
            }
            else if (this.canDo(this.textState)) {
                try {
                    this.$a.classList.add('loading');
                    this.textState = await doInput(this.$a);
                    this.updateControl();
                }
                finally {
                    this.$a.classList.remove('loading');
                }
            }
        };
        this.$input.addEventListener('input', () => {
            if (this.$controls.hidden)
                return;
            this.updateControl();
        });
        this.$controls = makeDiv('text-controls')(this.$a);
        this.$controls.hidden = true;
        this.update();
    }
    update() {
        const toBeVisible = this.isVisible();
        if (toBeVisible && this.$controls.hidden) {
            this.textState = undefined;
            this.updateControl();
        }
        this.$controls.hidden = !toBeVisible;
    }
    updateControl() {
        const canUndo = this.canUndo(this.textState);
        const canDo = this.canDo(this.textState);
        if (!this.$input.disabled && (canUndo || canDo)) {
            this.$a.setAttribute('tabindex', '0');
        }
        else {
            this.$a.removeAttribute('tabindex');
        }
        this.$a.replaceChildren(...(canUndo
            ? this.getUndoLabel()
            : this.getDoLabel()));
    }
    canUndo(textState) {
        return textState != null && !this.canDoWithTextState(textState);
    }
    canDo(textState) {
        return textState != null ? this.canDoWithTextState(textState) : this.canDoWithoutTextState();
    }
}

const rq$1 = (param) => makeElement('span')('advanced-hint')(` (`, code(param), ` parameter)`);
const rq2 = (param1, param2) => makeElement('span')('advanced-hint')(` (`, code(param1), ` or `, code(param2), ` parameter)`);
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
        return [p(`Make a `, makeLink(`search for notes`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Search_for_notes:_GET_/api/0.6/notes/search`), ` request at `, code(this.cx.server.api.getUrl(`notes/search?`), em(`parameters`)), `; see `, em(`parameters`), ` below.`)];
    }
    listParameters(closedDescriptionItems) {
        return [
            ['q', this.$textInput, [
                    `Comment text search query. `,
                    `This is an optional parameter, despite the OSM wiki saying that it's required, which is also suggested by the `, em(`search`), ` API call name. `,
                    `Skipping this parameter disables text searching, all notes that fit other search criteria will go through. `,
                    `Searching is done with English stemming rules and may not work correctly for other languages.`
                ]],
            ['limit', this.$limitInput, [
                    `Max number of notes to fetch. `,
                    `For `, em(`search`), ` mode it corresponds to the size of one batch of notes since it's possible to load additional batches by pressing the `, em(`Load more`), ` button below the note table. `,
                    `This additional downloading is implemented by manipulating the requested date range.`
                ]],
            ['closed', this.$closedInput, closedDescriptionItems],
            ['display_name', this.$userInput, [
                    `Name of a user interacting with a note. `,
                    `Both this parameter and the next one are optional. `,
                    `Providing one of them limits the returned notes to those that were interacted by the given user. `,
                    `This interaction is not limited to creating the note, closing/reopening/commenting also counts. `,
                    `It makes no sense to provide both of these parameters because in this case `, code('user'), ` is going to be ignored by the API, therefore `, em(`note-viewer`), `'s UI has only one input for both. `,
                    `Whether `, code('display_name'), ` or `, code('user'), ` is passed to the API depends on the input value. `,
                    `The `, code('display_name'), ` parameter is passed if the input value contains `, code(`/`), ` or doesn't start with `, code(`#`), `. `,
                    `Value containing `, code(`/`), ` is interpreted as a URL. `,
                    `In case it's an OSM URL containing a username, this name is extracted and passed as `, code('display_name'), `. `,
                    `Value starting with `, code(`#`), ` is treated as a user id, see the next parameter. `,
                    `Everything else is treated as a username.`
                ]],
            ['user', this.$userInput, [
                    `Id of a user interacting with a note. `,
                    `As stated above, the `, code('user'), ` parameter is passed if the input value starts with `, code(`#`), `. `,
                    `In this case the remaining part of the value is treated as a user id number. `,
                    `Ids and URLs can be unambiguously detected in the input because usernames can't contain any of the following characters: `, code(`/;.,?%#`), `.`
                ]],
            ['from', this.$fromInput, [
                    `Beginning of a date range. `,
                    `This parameter is optional but if not provided the API will also ignore the `, code('to'), ` parameter. `,
                    em(`Note-viewer`), ` makes `, code('from'), ` actually optional by providing a value far enough in the past if `, code('to'), ` value is entered while `, code('from'), ` value is not. `,
                    `Also both `, code('from'), ` and `, code('to'), ` parameters are altered in `, em(`Load more`), ` fetches in order to limit the note selection to notes that are not yet downloaded.`
                ]],
            ['to', this.$toInput, [
                    `End of a date range.`
                ]],
            ['sort', this.$sortSelect, [
                    `Date to sort the notes. `,
                    `This can be either a create date or an update date. `,
                    `Sorting by update dates presents some technical difficulties which may lead to unexpected results if additional notes are loaded with `, em(`Load more`), `. `
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
            const userInputControl = new TextControl(this.$userInput, () => this.cx.username != null, () => this.$userInput.value != this.cx.username, () => this.$userInput.value != this.cx.username, (username) => this.$userInput.value = username, async ($a) => {
                if (this.cx.username == null)
                    throw new TypeError(`Undefined user when setting user search value`);
                const oldUsername = this.$userInput.value;
                this.$userInput.value = this.cx.username;
                return oldUsername;
            }, () => [makeElement('span')()(`undo set to`)], () => [makeElement('span')()(`set to`), ` `, em(String(this.cx.username))]);
            $fieldset.append(makeDiv('major-input-group')(userInputControl.$controls, makeLabel()(`Username, URL or #id`, rq2('display_name', 'user'), ` `, this.$userInput)));
            this.$root.addEventListener('osmNoteViewer:loginChange', () => {
                userInputControl.update();
            });
        }
        {
            this.$textInput.type = 'text';
            this.$textInput.name = 'text';
            $fieldset.append(makeDiv('major-input-group')(makeLabel()(`Comment text search query`, rq$1('q'), ` `, this.$textInput)));
        }
        {
            this.$fromInput.type = 'text';
            this.$fromInput.size = 20;
            this.$fromInput.name = 'from';
            this.$toInput.type = 'text';
            this.$toInput.size = 20;
            this.$toInput.name = 'to';
            $fieldset.append(makeDiv('date-range-input-group')(makeLabel('inline')(`From date`, rq$1('from'), ` `, this.$fromInput), ` `, makeLabel('inline')(`To date`, rq$1('to'), ` `, this.$toInput)));
        }
    }
    appendToClosedLine($div) {
        this.$sortSelect.append(new Option(`creation`, 'created_at'), new Option(`last update`, 'updated_at'));
        this.$orderSelect.append(new Option('newest'), new Option('oldest'));
        $div.append(` `, makeLabel('inline')(`sorted by `, this.$sortSelect, rq$1('sort'), ` date`), `, `, makeLabel('inline')(this.$orderSelect, rq$1('order'), ` first`));
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
        this.$userInput.dispatchEvent(new Event('input')); // update text controls
        this.$textInput.value = query?.q ?? '';
        this.$fromInput.value = toShortReadableDate(query?.from);
        this.$toInput.value = toShortReadableDate(query?.to);
        this.$sortSelect.value = query?.sort ?? 'created_at';
        this.$orderSelect.value = query?.order ?? 'newest';
    }
    addEventListenersBeforeClosedLine() {
        this.$userInput.addEventListener('input', () => {
            const userQuery = toUserQuery(this.cx.server.api, this.cx.server.web, this.$userInput.value);
            if (userQuery.type == 'invalid') {
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
        return makeNoteSearchQueryFromValues(this.cx.server.api, this.cx.server.web, this.$userInput.value, this.$textInput.value, this.$fromInput.value, this.$toInput.value, this.closedValue, this.$sortSelect.value, this.$orderSelect.value);
    }
    listQueryChangingInputs() {
        return [
            this.$userInput, this.$textInput, this.$fromInput, this.$toInput,
            this.$closedInput, this.$closedSelect, this.$sortSelect, this.$orderSelect
        ];
    }
    getQueryCaptionItems(query) {
        if (query.mode != 'search')
            return [];
        const items = [];
        if (query.display_name != null) {
            items.push([`user `, this.makeInputLink(this.$userInput, query.display_name)]);
        }
        else if (query.user != null) {
            items.push([`user id `, this.makeInputLink(this.$userInput, String(query.user))]);
        }
        if (query.q != null) {
            items.push([`text `, this.makeInputLink(this.$textInput, query.q)]);
        }
        if (query.from != null && query.to != null) {
            items.push([`dates `,
                this.makeInputLink(this.$textInput, toShortReadableDate(query.from)), `..`,
                this.makeInputLink(this.$textInput, toShortReadableDate(query.to))
            ]);
        }
        else {
            if (query.from != null) {
                items.push([`dates starting at `, this.makeInputLink(this.$textInput, toShortReadableDate(query.from))]);
            }
            if (query.to != null) {
                items.push([`dates ending at `, this.makeInputLink(this.$textInput, toShortReadableDate(query.to))]);
            }
        }
        return items;
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
        $fieldset.append(makeDiv('advanced-hint')(`Make `, makeLink(`Nominatim search query`, `https://nominatim.org/release-docs/develop/api/Search/`), ` at `, code(this.nominatim.getSearchUrl(''), em(`parameters`)), `; see `, em(`parameters`), ` above and below.`));
        this.$input.type = 'text';
        this.$input.required = true;
        this.$input.classList.add('no-invalid-indication'); // because it's inside another form that doesn't require it, don't indicate that it's invalid
        this.$input.name = 'place';
        this.$input.setAttribute('form', 'nominatim-form');
        this.$button.textContent = 'Get';
        this.$button.setAttribute('form', 'nominatim-form');
        $fieldset.append(makeDiv('text-button-input-group')(makeLabel()(`Or get bounding box by place name from Nominatim`, spanRequest$1(` (`, code('q'), ` Nominatim parameter)`), ` `, this.$input), this.$button));
        $fieldset.append(makeDiv('advanced-hint')(`Resulting Nominatim request: `, this.$requestOutput));
    }
    updateRequest() {
        const bounds = this.getMapBounds();
        const parameters = this.bboxFetcher.getParameters(this.$input.value, bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
        const url = this.nominatim.getSearchUrl(parameters);
        const $a = makeLink(url, url);
        $a.classList.add('request');
        this.$requestOutput.replaceChildren(code($a));
    }
    addEventListeners() {
        this.$input.addEventListener('input', () => this.updateRequest());
        this.$form.onsubmit = (ev) => wrapFetchForButton(this.$button, async () => {
            ev.preventDefault();
            const bounds = this.getMapBounds();
            const bbox = await this.bboxFetcher.fetch(Date.now(), this.$input.value, bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth());
            this.setBbox(bbox);
        }, makeGetKnownErrorMessage(TypeError));
    }
}
function makeDumbCache() {
    const cache = new Map();
    return [
        async (timestamp, url) => cache.get(url),
        async (timestamp, url, bbox) => cache.set(url, bbox)
    ];
}

const rq = (param) => makeElement('span')('advanced-hint')(` (`, code(param), ` parameter)`);
const spanRequest = (...ss) => makeElement('span')('advanced-hint')(...ss);
class NoteBboxFetchDialog extends NoteQueryFetchDialog {
    constructor($root, $sharedCheckboxes, cx, getRequestApiPaths, submitQuery, map) {
        super($root, $sharedCheckboxes, cx, getRequestApiPaths, submitQuery);
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
        if (cx.server.nominatim) {
            this.nominatimSubForm = new NominatimSubForm(cx.server.nominatim, () => map.bounds, (bbox) => {
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
        return [p(`Get `, makeLink(`notes by bounding box`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`), ` request at `, code(this.cx.server.api.getUrl(`notes?`), em(`parameters`)), `; see `, em(`parameters`), ` below.`)];
    }
    listParameters(closedDescriptionItems) {
        return [
            ['bbox', this.$bboxInput, [
                    `Bounding box. `,
                    `Expect `, em(`The maximum bbox size is ..., and your request was too large`), ` error if the bounding box is too large.`
                ]],
            ['limit', this.$limitInput, [
                    `Max number of notes to fetch. `,
                    `For `, em(`bbox`), ` mode is corresponds to a total number of notes, not just a batch size. `,
                    `It's impossible to download additional batches of notes because the API call used by this mode lacks date range parameters.`
                ]],
            ['closed', this.$closedInput, closedDescriptionItems],
        ];
    }
    writeScopeAndOrderFieldsetBeforeClosedLine($fieldset) {
        {
            this.$trackMapSelect.append(new Option(`Do nothing`, 'nothing'), new Option(`Update bounding box input`, 'bbox', true, true), new Option(`Fetch notes`, 'fetch'));
            $fieldset.append(makeDiv('regular-input-group')(makeLabel('inline')(this.$trackMapSelect, ` on map view changes`), ` `, this.$trackMapZoomNotice));
        }
        {
            this.$bboxInput.type = 'text';
            this.$bboxInput.name = 'bbox';
            this.$bboxInput.required = true; // otherwise could submit empty bbox without entering anything
            $fieldset.append(makeDiv('major-input-group')(makeLabel()(`Bounding box (`, tip(`left`, `western-most (min) longitude`), `, `, tip(`bottom`, `southern-most (min) latitude`), `, `, tip(`right`, `eastern-most (max) longitude`), `, `, tip(`top`, `northern-most (max) latitude`), `)`, rq('bbox'), spanRequest(` (also `, code('west'), `, `, code('south'), `, `, code('east'), `, `, code('north'), ` Nominatim parameters)`), ` `, this.$bboxInput)));
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
                this.setBbox(...this.map.precisionBounds.wsen);
            }
            this.nominatimSubForm?.updateRequest();
        };
        const updateNotesIfNeeded = () => {
            if (this.isOpen() && this.$trackMapSelect.value == 'fetch' && this.map.zoom >= 8) {
                this.$form.requestSubmit();
            }
        };
        updateTrackMapZoomNotice();
        this.$root.addEventListener('osmNoteViewer:mapMoveEnd', () => {
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
    getQueryCaptionItems(query) {
        if (query.mode != 'bbox')
            return [];
        return [
            [`inside bounding box `, this.makeInputLink(this.$bboxInput, query.bbox)]
        ];
    }
}

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
        this.$fileInput.name = 'xml';
        this.$fileInput.type = 'file';
        return makeDiv('major-input-group')(makeLabel('file-reader')(makeElement('span')('over')(`Read XML file`), ` `, this.$fileInput));
    }
    disableFetchControl(disabled) {
        this.$fileInput.disabled = disabled;
    }
    writePrependedFieldset($fieldset, $legend) {
        if (this.cx.server.host != 'www.openstreetmap.org')
            return;
        $legend.append(`Get notes in a country from `, em(`resultmaps.neis-one.org`));
        {
            $fieldset.append(makeDiv()(makeElement('details')()(makeElement('summary')()(`How to get notes from `, em(`resultmaps.neis-one.org`)), ol(li(`Select a country and a note status, then click `, em(`Download feed file`), `. `, `After this one of the following things will happen, depending on your browser: `, ul(li(`The feed file is downloaded, which is what you want.`), li(`Browser opens a new tab with the feed file. In this case manually save the page.`)), `Also the `, em(`selector`), ` and `, em(`attribute`), ` fields below are updated to extract note ids from this feed.`), li(`Open the file with one of these two methods: `, ul(li(`Click the `, em(`Read XML file`), ` area and use a file picker dialog.`), li(`Drag and drop the file from browser downloads panel/window into the `, em(`Read XML file`), ` area. This is likely a faster method.`)))), p(`Unfortunately these steps of downloading/opening a file cannot be avoided because `, makeLink(`neis-one.org`, `https://resultmaps.neis-one.org/osm-notes`), ` server is not configured to let its data to be accessed by browser scripts.`))));
            this.$neisCountryInput.type = 'text';
            this.$neisCountryInput.required = true;
            this.$neisCountryInput.classList.add('no-invalid-indication'); // because it's inside another form that doesn't require it, don't indicate that it's invalid
            this.$neisCountryInput.name = 'country';
            this.$neisCountryInput.setAttribute('form', 'neis-form');
            const $datalist = document.createElement('datalist');
            $datalist.id = 'neis-countries-list';
            $datalist.append(...neisCountries.map(c => new Option(c)));
            this.$neisCountryInput.setAttribute('list', 'neis-countries-list');
            $fieldset.append(makeDiv('major-input-group')(makeLabel()(`Country `, this.$neisCountryInput, $datalist)));
        }
        {
            this.$neisStatusSelect.name = 'status';
            this.$neisStatusSelect.setAttribute('form', 'neis-form');
            this.$neisStatusSelect.append(...neisFeedStatuses.map(status => new Option(`${status} (up to a week old)`, status)), new Option(`last updated 500`, 'custom'), new Option(`last open 10000`, 'custom-open'));
            $fieldset.append(makeDiv('regular-input-group')(makeLabel()(`Get `, this.$neisStatusSelect, ` notes`), ` for this country`));
        }
        {
            this.$neisButton.textContent = 'Download feed file and populate XML fields below';
            this.$neisButton.setAttribute('form', 'neis-form');
            $fieldset.append(makeDiv('major-input-group')(this.$neisButton));
        }
    }
    writeScopeAndOrderFieldset($fieldset, $legend) {
        $legend.textContent = `Read custom XML file`;
        {
            $fieldset.append(makeDiv('advanced-hint')(p(`Load an arbitrary XML file containing note ids or links. `, `Elements containing the ids are selected by a `, makeLink(`css selector`, `https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors`), ` provided below. `, `Inside the elements ids are looked for in an `, em(`attribute`), ` if specified below, or in text content. `, `After that download each note `, makeLink(`by its id`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Read:_GET_/api/0.6/notes/#id`), `.`)));
        }
        {
            this.$selectorInput.type = 'text';
            this.$selectorInput.name = 'selector';
            this.$selectorInput.required = true;
            $fieldset.append(makeDiv('major-input-group')(makeLabel()(`CSS selector matching XML elements with note ids `, this.$selectorInput)));
        }
        {
            this.$attributeInput.type = 'text';
            this.$attributeInput.name = 'attribute';
            $fieldset.append(makeDiv('major-input-group')(makeLabel()(`Attribute of matched XML elements containing note id (leave blank if note id is in text content) `, this.$attributeInput)));
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
    getQueryCaption(query) {
        return makeElement('caption')()(`notes from xml file `, this.makeInputLink(this.$fileInput, this.$fileInput.value));
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
    constructor($root, $sharedCheckboxes, cx, getRequestApiPaths, submitQuery, noteTable) {
        super($root, $sharedCheckboxes, cx, getRequestApiPaths, submitQuery);
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
            $fieldset.append(makeDiv('checkbox-button-input-group')(this.$copySelectedCheckbox, ' ', this.$copyButton));
        }
        {
            this.$idsTextarea.name = 'ids';
            this.$idsTextarea.required = true;
            this.$idsTextarea.rows = 10;
            $fieldset.append(makeDiv('major-input-group')(makeLabel()(`Note ids separated by anything `, this.$idsTextarea)));
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
    getQueryCaption(query) {
        const showSomeNotesThreshold = 5;
        const showAllNotesThreshold = 7;
        if (query.mode != 'ids')
            return super.getQueryCaption(query);
        const prefix = query.ids.length == 1 ? `note` : `notes`;
        let ids;
        if (query.ids.length <= showAllNotesThreshold) {
            ids = query.ids.join(`, `);
        }
        else {
            ids = query.ids.slice(0, showSomeNotesThreshold).join(`, `) + ` and ${query.ids.length - showSomeNotesThreshold} other notes`;
        }
        return makeElement('caption')()(prefix, ` `, this.makeInputLink(this.$idsTextarea, ids));
    }
}

class NoteFetchDialogs {
    constructor($root, cx, $container, $moreContainer, noteTable, map, hashQuery, submitQueryToDialog, limitChangeListener) {
        const $sharedCheckboxes = {
            showImages: [],
            advancedMode: []
        };
        const makeFetchDialog = (fetcherRequest, fetchDialogCtor) => {
            const dialog = fetchDialogCtor((query, limit) => fetcherRequest.getRequestApiPaths(query, limit), (query) => submitQueryToDialog(dialog, query));
            dialog.limitChangeListener = () => limitChangeListener(dialog);
            dialog.write($container);
            dialog.populateInputs(hashQuery);
            return dialog;
        };
        this.searchDialog = makeFetchDialog(new NoteSearchFetcherRequest, (getRequestApiPaths, submitQuery) => new NoteSearchFetchDialog($root, $sharedCheckboxes, cx, getRequestApiPaths, submitQuery));
        this.bboxDialog = makeFetchDialog(new NoteBboxFetcherRequest, (getRequestApiPaths, submitQuery) => new NoteBboxFetchDialog($root, $sharedCheckboxes, cx, getRequestApiPaths, submitQuery, map));
        this.xmlDialog = makeFetchDialog(new NoteIdsFetcherRequest, (getRequestApiPaths, submitQuery) => new NoteXmlFetchDialog($root, $sharedCheckboxes, cx, getRequestApiPaths, submitQuery));
        this.plaintextDialog = makeFetchDialog(new NoteIdsFetcherRequest, (getRequestApiPaths, submitQuery) => new NotePlaintextFetchDialog($root, $sharedCheckboxes, cx, getRequestApiPaths, submitQuery, noteTable));
        const handleSharedCheckboxes = ($checkboxes, stateChangeListener) => {
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
        };
        handleSharedCheckboxes($sharedCheckboxes.showImages, state => noteTable.setShowImages(state));
        handleSharedCheckboxes($sharedCheckboxes.advancedMode, state => {
            for (const dialog of this.allDialogs) {
                dialog.reactToAdvancedModeChange();
            }
            $container.classList.toggle('advanced-mode', state);
            $moreContainer.classList.toggle('advanced-mode', state);
        });
        $root.addEventListener('osmNoteViewer:newNoteStream', () => {
            for (const dialog of this.allDialogs) {
                dialog.resetFetch();
            }
        });
    }
    get allDialogs() {
        return [this.searchDialog, this.bboxDialog, this.xmlDialog, this.plaintextDialog];
    }
    populateInputs(query) {
        for (const dialog of this.allDialogs) {
            dialog.populateInputs(query);
        }
    }
    getDialogFromQuery(query) {
        if (query.mode == 'search') {
            return this.searchDialog;
        }
        else if (query.mode == 'bbox') {
            return this.bboxDialog;
        }
        else if (query.mode == 'ids') {
            return this.plaintextDialog;
        }
    }
}

class NoteFetchPanel {
    constructor($root, db, cx, $container, $moreContainer, navbar, noteTable, map, queryHash, hasMapHash, hostHashValue) {
        const self = this;
        const moreButtonIntersectionObservers = [];
        const hashQuery = makeNoteQueryFromHash(queryHash);
        const fetchDialogs = new NoteFetchDialogs($root, cx, $container, $moreContainer, noteTable, map, hashQuery, (dialog, query) => {
            startFetcher(query, true, false, dialog);
        }, (dialog) => {
            if (this.fetcherRun && this.fetcherInvoker == dialog) {
                this.fetcherRun.reactToLimitUpdateForAdvancedMode();
            }
        });
        for (const dialog of fetchDialogs.allDialogs) {
            navbar.addTab(dialog);
        }
        $root.addEventListener('osmNoteViewer:queryHashChange', ({ detail: queryHash }) => {
            const query = makeNoteQueryFromHash(queryHash);
            openQueryDialog(navbar, fetchDialogs, query, false);
            fetchDialogs.populateInputs(query);
            startFetcherFromQuery(query, false, false);
        });
        openQueryDialog(navbar, fetchDialogs, hashQuery, true);
        startFetcherFromQuery(hashQuery, false, hasMapHash // when just opened a note-viewer page with map hash set - if query is set too, don't fit its result, keep the map hash
        );
        $root.addEventListener('osmNoteViewer:userLinkClick', ev => {
            if (!(ev.target instanceof HTMLElement))
                return;
            const query = {
                mode: 'search',
                closed: -1,
                sort: 'created_at',
                order: 'newest',
            };
            if (ev.target.dataset.userName) {
                query.display_name = ev.target.dataset.userName;
            }
            else {
                query.user = Number(ev.target.dataset.userId);
            }
            openQueryDialog(navbar, fetchDialogs, query, false);
            fetchDialogs.populateInputs(query);
            fetchDialogs.searchDialog.$section.scrollIntoView();
        });
        $root.addEventListener('osmNoteViewer:noteFetch', ({ detail: [note, users] }) => {
            this.fetcherRun?.updateNote(note, users);
        });
        function startFetcherFromQuery(query, isNewStart, suppressFitNotes) {
            if (!query)
                return;
            const dialog = fetchDialogs.getDialogFromQuery(query);
            if (!dialog)
                return;
            startFetcher(query, isNewStart, suppressFitNotes, dialog);
        }
        function startFetcher(query, isNewStart, suppressFitNotes, dialog) {
            if (query.mode != 'search' && query.mode != 'bbox' && query.mode != 'ids')
                return;
            while (moreButtonIntersectionObservers.length > 0)
                moreButtonIntersectionObservers.pop()?.disconnect();
            if (map) {
                map.clearNotes();
                if (suppressFitNotes) {
                    map.needToFitNotes = false;
                }
            }
            const $caption = dialog.getQueryCaption(query);
            document.title = ($caption.textContent ?? '') + ` | note-viewer`;
            $caption.prepend(`Fetched `);
            $caption.onclick = ev => {
                const $a = ev.target;
                if (!($a instanceof HTMLAnchorElement))
                    return;
                if (!$a.dataset.inputName)
                    return;
                const $input = dialog.$form.elements.namedItem($a.dataset.inputName);
                if (!($input instanceof HTMLInputElement || $input instanceof HTMLTextAreaElement))
                    return;
                $input.focus();
                ev.preventDefault();
                ev.stopPropagation();
            };
            $caption.onkeydown = ev => {
                const $a = ev.target;
                if (!($a instanceof HTMLAnchorElement))
                    return;
                $a.click();
                ev.preventDefault();
                ev.stopPropagation();
            };
            noteTable.reset($caption, getMarkUser(query), getMarkText(query));
            bubbleCustomEvent($container, 'osmNoteViewer:newNoteStream', [makeNoteQueryString(query), isNewStart]);
            const environment = {
                db,
                api: cx.server.api,
                token: cx.token,
                hostHashValue,
                noteTable, $moreContainer,
                getLimit: dialog.getLimit,
                getAutoLoad: dialog.getAutoLoad,
                blockDownloads: (disabled) => dialog.disableFetchControl(disabled),
                moreButtonIntersectionObservers,
            };
            self.fetcherInvoker = dialog;
            if (query.mode == 'search') {
                self.fetcherRun = new NoteSearchFetcherRun(environment, query, isNewStart);
            }
            else if (query.mode == 'bbox') {
                self.fetcherRun = new NoteBboxFetcherRun(environment, query, isNewStart);
            }
            else if (query.mode == 'ids') {
                self.fetcherRun = new NoteIdsFetcherRun(environment, query, isNewStart);
            }
        }
    }
}
function openQueryDialog(navbar, fetchDialogs, query, initial) {
    if (!query) {
        if (initial)
            navbar.openTab(fetchDialogs.searchDialog);
    }
    else {
        const dialog = fetchDialogs.getDialogFromQuery(query);
        if (!dialog)
            return;
        navbar.openTab(dialog);
    }
}
function getMarkUser(query) {
    if (query.mode != 'search')
        return;
    return query.display_name ?? query.user;
}
function getMarkText(query) {
    if (query.mode != 'search')
        return;
    return query.q;
}

function isValidOperator(op) {
    return (op == '=' || op == '!=' || op == '~=');
}
class NoteFilter {
    constructor(apiUrlLister, webUrlLister, query) {
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
                    const userQuery = toUserQuery(apiUrlLister, webUrlLister, user);
                    if (userQuery.type == 'invalid' || userQuery.type == 'empty') {
                        throwError(`Invalid user value "${user}"`);
                    }
                    conditions.push({ type: 'user', operator, user: userQuery });
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
            if (condition.user.type == 'id') {
                if (condition.user.uid == 0) {
                    if (comment.uid != null)
                        return false;
                }
                else {
                    if (comment.uid != condition.user.uid)
                        return false;
                }
            }
            else {
                if (condition.user.username == '0') {
                    if (comment.uid != null)
                        return false;
                }
                else {
                    if (comment.uid == null)
                        return false;
                    if (getUsername(comment.uid) != condition.user.username)
                        return false;
                }
            }
            return true;
        };
        const getConditionActualValue = (condition, comment) => {
            if (condition.type == 'user') {
                if (condition.user.type == 'id') {
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
                if (condition.user.type == 'id') {
                    return condition.user.uid;
                }
                else {
                    return condition.user.username;
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
    constructor(storage, apiUrlLister, webUrlLister, $container) {
        this.noteFilter = new NoteFilter(apiUrlLister, webUrlLister, ``);
        const $form = makeCodeForm('', getStorageString(storage, 'filter'), `Note filter`, `Filter`, `Apply filter`, input => this.noteFilter.isSameQuery(input), input => new NoteFilter(apiUrlLister, webUrlLister, input), input => {
            this.noteFilter = new NoteFilter(apiUrlLister, webUrlLister, input);
            setStorageString(storage, 'filter', input);
        }, () => {
            this.onFilterUpdate?.(this.noteFilter);
        }, syntaxDescription, syntaxExamples);
        $container.append($form);
    }
}

const expanderDescriptions = new Map([
    ['id', [
            true,
            'hor-out', 'hor-in',
            `show all id digits`, `show only changing id digits`
        ]],
    ['comments', [
            true,
            'ver-out', 'ver-in',
            `show all comments/actions`, `show only first comment/action`
        ]],
    ['date', [
            false,
            'hor-out', 'hor-in',
            `show time of day`, `hide time of day`
        ]],
    ['username', [
            false,
            'hor-out', 'hor-in',
            `show full usernames with ids`, `clip long usernames`
        ]],
    ['comment-lines', [
            true,
            'ver-out', 'hor-out',
            `allow line breaks in comments`, `keep comments on one line`
        ]],
    ['map-link', [
            true,
            'hor-out', 'hor-in',
            `stretch map links`, `don't stretch map links`
        ]],
]);
class Expanders {
    constructor(storage, $table) {
        this.storage = storage;
        this.$table = $table;
        for (const [key, [defaultValue]] of expanderDescriptions) {
            const tableClass = `expanded-${key}`;
            const storageKey = `table-expanded[${key}]`;
            const storedValue = this.storage.getItem(storageKey);
            let value = defaultValue;
            if (storedValue == '0')
                value = false;
            if (storedValue == '1')
                value = true;
            if (value)
                this.$table.classList.add(tableClass);
        }
    }
    makeButton(key, clickListener = () => { }) {
        const expanderDescription = expanderDescriptions.get(key);
        if (!expanderDescription)
            return;
        const [, expandButtonClass, collapseButtonClass, expandTitle, collapseTitle] = expanderDescription;
        const $button = makeElement('button')('expander')();
        $button.innerHTML = `<svg><use href="#table-expander" /></svg>`;
        const update = (value) => {
            $button.classList.toggle(expandButtonClass, !value);
            $button.classList.toggle(collapseButtonClass, value);
            $button.title = value ? collapseTitle : expandTitle;
        };
        const tableClass = `expanded-${key}`;
        const storageKey = `table-expanded[${key}]`;
        update(this.$table.classList.contains(tableClass));
        $button.onclick = () => {
            const isExpanded = this.$table.classList.toggle(tableClass);
            this.storage.setItem(storageKey, isExpanded ? '1' : '0');
            update(isExpanded);
            clickListener(isExpanded);
        };
        return $button;
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

const e$5 = makeEscapeTag(encodeURIComponent);
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
        $a.href = this.webUrlLister.getUrl(e$5 `${type}/${id}`);
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
    return '(?:' + webUrlLister.urls.map(webUrl => escapeRegex(stripProtocol(webUrl))).join('|') + ')';
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
    let href = webUrlLister.getUrl(path ?? '');
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
    makeCommentElements(commentText, showImages = false, markText) {
        const inlineElements = [];
        const imageElements = [];
        for (const item of getCommentItems(this.webUrlLister, commentText)) {
            const markedText = makeMarkedText(item.text, markText);
            if (item.type == 'link' && item.link == 'image') {
                const $inlineLink = a(...markedText);
                $inlineLink.href = item.href;
                $inlineLink.classList.add('listened', 'image', 'inline');
                inlineElements.push($inlineLink);
                const $img = document.createElement('img');
                $img.loading = 'lazy'; // this + display:none is not enough to surely stop the browser from accessing the image link
                if (showImages)
                    $img.src = item.href; // therefore only set the link if user agreed to loading
                $img.alt = `attached photo`;
                $img.addEventListener('error', imageErrorHandler);
                const $floatLink = a($img);
                $floatLink.classList.add('listened', 'image', 'float');
                $floatLink.href = item.href;
                imageElements.push($floatLink);
            }
            else if (item.type == 'link' && item.link == 'osm') {
                const $a = a(...markedText);
                $a.href = item.href;
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
                const $time = makeActiveTimeElement(markedText, '', item.text);
                inlineElements.push($time);
            }
            else {
                inlineElements.push(...markedText);
            }
        }
        return [inlineElements, imageElements];
    }
    writeComment($cell, commentText, showImages, markText) {
        const [inlineElements, imageElements] = this.makeCommentElements(commentText, showImages, markText);
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
    const [readableDateWithoutTime, readableDateTime] = readableDate.split(' ', 2);
    if (readableDate && readableDateWithoutTime) {
        return makeActiveTimeElement([readableDateWithoutTime], ` ${readableDateTime}`, `${readableDate.replace(' ', 'T')}Z`, `${readableDate} UTC`);
    }
    else {
        const $unknownDateTime = document.createElement('span');
        $unknownDateTime.textContent = `?`;
        return $unknownDateTime;
    }
}
function makeActiveTimeElement(unwrappedPart, wrappedPart, dateTime, title) {
    const $time = makeElement('time')('listened')(...unwrappedPart);
    $time.tabIndex = 0;
    $time.dateTime = dateTime;
    if (title)
        $time.title = title;
    if (wrappedPart)
        $time.append(makeElement('span')()(wrappedPart));
    return $time;
}
function makeMarkedText(text, markText) {
    if (!markText)
        return [text];
    const result = [];
    let first = true;
    for (const fragment of text.split(markText)) {
        if (first) {
            first = false;
        }
        else {
            result.push(mark(markText));
        }
        if (fragment)
            result.push(fragment);
    }
    return result;
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

function writeHeadSectionRow($section, $checkbox, makeExpanderButton, getNoteSections, rowVisibilityChangeCallback) {
    const makeExpanderCell = (cssClass, title, key, clickListener) => {
        const $th = makeElement('th')(cssClass)();
        const $button = makeExpanderButton(key, clickListener);
        if (title)
            $th.append(title);
        if (title && $button)
            $th.append(` `);
        if ($button)
            $th.append($button);
        return $th;
    };
    const $row = $section.insertRow();
    $row.append(makeElement('th')('note-checkbox')($checkbox), makeExpanderCell('note-link', `id`, 'id'), makeExpanderCell('note-action', ``, 'comments', (isExpanded) => {
        for (const $noteSection of getNoteSections()) {
            hideNoteSectionRows($noteSection, !isExpanded);
        }
        rowVisibilityChangeCallback();
    }), makeExpanderCell('note-date', `date`, 'date'), makeExpanderCell('note-user', `user`, 'username'), makeExpanderCell('note-comment', `comment`, 'comment-lines'), makeExpanderCell('note-map', ``, 'map-link'));
}
/**
 * @returns comment cells
 */
function writeNoteSectionRows(web, commentWriter, $noteSection, $checkbox, note, users, hideRows, showImages, markUser, markText, zoomInOnNote, rowVisibilityChangeCallback) {
    const $commentCells = [];
    let $row = $noteSection.insertRow();
    const nComments = note.comments.length;
    const makeRowSpannedCell = (className) => {
        const $cell = $row.insertCell();
        $cell.classList.add(className);
        if (nComments > 1)
            $cell.rowSpan = nComments;
        return $cell;
    };
    {
        const $cell = makeRowSpannedCell('note-checkbox');
        $cell.append($checkbox);
    }
    {
        const $cell = makeRowSpannedCell('note-link');
        const $a = document.createElement('a');
        $a.href = web.getUrl(`note/` + encodeURIComponent(note.id));
        $a.dataset.noteId = $a.textContent = `${note.id}`;
        $a.dataset.self = 'yes';
        $a.classList.add('listened');
        $a.title = `reload the note`;
        const $refreshWaitProgress = document.createElement('progress');
        $refreshWaitProgress.setAttribute('aria-hidden', 'true'); // otherwise screen reader constantly announces changes of progress elements
        $refreshWaitProgress.value = 0;
        $cell.append(makeDiv()($a, $refreshWaitProgress));
    }
    let iComment = 0;
    for (const comment of note.comments) {
        {
            if (iComment > 0) {
                $row = $noteSection.insertRow();
                if (hideRows)
                    $row.hidden = true;
            }
        }
        {
            const $cell = $row.insertCell();
            $cell.classList.add('note-action');
            if (iComment == 0) {
                const $button = makeElement('button')('icon-comments-count')();
                if (note.comments.length > 1) {
                    $button.innerHTML = `<svg>` +
                        `<use href="#table-comments" /><text x="8" y="8"></text>` +
                        `</svg>`;
                    updateCommentsButton($button, hideRows, note.comments.length - 1);
                    $button.addEventListener('click', commentsButtonClickListener);
                    $button.addEventListener('click', rowVisibilityChangeCallback);
                }
                else {
                    $button.title = `no additional comments`;
                }
                $cell.append($button);
            }
            else {
                const $icon = makeElement('span')('icon-status-' + getActionClass(comment.action))();
                $icon.tabIndex = 0;
                $icon.title = comment.action;
                $icon.innerHTML = `<svg>` +
                    `<use href="#table-note" />` +
                    `</svg>`;
                $cell.append($icon);
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
                const makeUidText = () => ((typeof markUser == 'number' && markUser == comment.uid)
                    ? mark(`#${comment.uid}`)
                    : `#${comment.uid}`);
                const username = users[comment.uid];
                if (username != null) {
                    const $a = web.makeUserLink(comment.uid, username);
                    if (typeof markUser == 'string' && markUser == username) {
                        $cell.append(mark($a));
                    }
                    else {
                        $cell.append($a);
                    }
                    $cell.append(makeElement('span')('uid')(` `, makeUidText()));
                }
                else {
                    $cell.append(makeUidText());
                }
            }
            else {
                const $a = makeElement('a')()(comment.guessed ? `unknown` : `anonymous`);
                $a.tabIndex = 0;
                $cell.append($a);
            }
        }
        {
            const $cell = $row.insertCell();
            $cell.classList.add('note-comment');
            $cell.tabIndex = 0;
            commentWriter.writeComment($cell, comment.text, showImages, markText);
            $commentCells.push($cell);
        }
        if (iComment == 0) {
            const $cell = makeRowSpannedCell('note-map');
            const $a = a();
            $a.href = web.getNoteLocationUrl(note.lat, note.lon);
            $a.title = `show note on map`;
            $a.innerHTML = `<svg><use href="#tools-map" /></svg>`;
            $a.onclick = ev => {
                zoomInOnNote();
                const $map = document.querySelector('.ui .map'); // TODO rewrite this hack
                if ($map instanceof HTMLElement)
                    $map.focus();
                ev.stopPropagation();
                ev.preventDefault();
            };
            $cell.append($a);
        }
        iComment++;
    }
    return $commentCells;
}
function hideNoteSectionRows($noteSection, hideRows) {
    const $button = $noteSection.querySelector('td.note-action button');
    if (!($button instanceof HTMLButtonElement))
        return;
    hideNoteSectionRowsWithButton($noteSection, hideRows, $button);
}
function commentsButtonClickListener(ev) {
    const $button = this;
    const $noteSection = $button.closest('tbody');
    if (!($noteSection instanceof HTMLTableSectionElement))
        return;
    const [, $row2] = $noteSection.rows;
    const wasHidden = $row2?.hidden ?? true;
    hideNoteSectionRowsWithButton($noteSection, !wasHidden, $button);
    ev.stopPropagation();
}
function hideNoteSectionRowsWithButton($noteSection, hideRows, $button) {
    let first = true;
    for (const $row of $noteSection.rows) {
        if (first) {
            first = false;
        }
        else {
            $row.hidden = hideRows;
        }
    }
    updateCommentsButton($button, hideRows, $noteSection.rows.length - 1);
}
function updateCommentsButton($button, hiddenRows, nAdditionalComments) {
    const s = nAdditionalComments > 1 ? `s` : ``;
    const $text = $button.querySelector('text');
    if (!$text)
        return;
    if (hiddenRows) {
        $button.title = `show ${nAdditionalComments} following comment${s}/action${s}`;
        $text.textContent = String(nAdditionalComments);
    }
    else {
        $button.title = `hide ${nAdditionalComments} following comment${s}/action${s}`;
        $text.textContent = `−`;
    }
}
function getActionClass(action) {
    if (action == 'opened' || action == 'reopened') {
        return 'open';
    }
    else if (action == 'closed') {
        return 'closed';
    }
    else if (action == 'hidden') {
        return 'hidden';
    }
    else if (action == 'commented') {
        return 'commented';
    }
    else {
        return 'other';
    }
}

class Pager {
    constructor($scrollingPart) {
        this.$scrollingPart = $scrollingPart;
    }
    goPageUp($items, $fromItem, fromIndex) {
        return getNextPageIndex(this.$scrollingPart, $items, $fromItem, fromIndex, -1, -1);
    }
    goPageDown($items, $fromItem, fromIndex) {
        return getNextPageIndex(this.$scrollingPart, $items, $fromItem, fromIndex, +1, $items.length);
    }
}
function getNextPageIndex($scrollingPart, $items, $fromItem, // possibly not in $items but needed for y calculation
fromIndex, d, indexBound) {
    const getY = ($e) => $e.getBoundingClientRect().y;
    const scrollByY = $scrollingPart.clientHeight;
    const fromY = getY($fromItem);
    const checkIndexBound = (k) => k * d < indexBound * d;
    let i = fromIndex;
    for (; checkIndexBound(i); i += d) {
        if ((getY($items[i]) - fromY) * d >= scrollByY)
            break;
    }
    if (i == fromIndex)
        return i + d; // go ahead by at least one position
    return i;
}

const columnData = [
    ['note-checkbox', 'input', 'input'],
    ['note-link', 'button', 'a'],
    ['note-action', 'button', ':is(button,[class|=icon])'],
    ['note-date', 'button', 'time'],
    ['note-user', 'button', 'a'],
    ['note-comment', 'button', ''],
    ['note-map', 'button', 'a'],
];
const iCheckboxColumn = 0;
const iCommentColumn = 5;
const nColumns = columnData.length;
function getSelector(cellClass, subSelector) {
    let selector = '.' + cellClass;
    if (subSelector)
        selector += ' ' + subSelector;
    return selector;
}
function getCellSelector(i) {
    const [cellClass] = columnData[i];
    return '.' + cellClass;
}
function getHeadSelector(i) {
    const [cellClass, subSelector] = columnData[i];
    return getSelector(cellClass, subSelector);
}
function getBodySelector(i) {
    const [cellClass, , subSelector] = columnData[i];
    return getSelector(cellClass, subSelector);
}
const focusableSelector = `a[href], input, button, [tabindex]`;
const tabbableSelector = `:is(${focusableSelector}):not([tabindex="-1"])`;
const commentSubItemSelector = '.listened:not(.image.float)';
class CursorState {
    constructor($table) {
        this.$table = $table;
        this.iSection = 0;
        this.iRow = 0;
        this.iColumn = 0;
    }
    respondToKeyInHead(ev) {
        const keyResponse = this.respondToAllSelection(ev) ??
            this.respondToHorizontalMovement(ev, true);
        if (keyResponse)
            this.save();
        return keyResponse;
    }
    respondToKeyInBody(ev, pager) {
        const keyResponse = this.respondToAllSelection(ev) ??
            this.respondToMovementInsideComment(ev) ??
            this.respondToHorizontalMovement(ev, false) ??
            this.respondToVerticalMovement(ev, pager);
        if (keyResponse)
            this.save();
        return keyResponse;
    }
    setToNearestVisible() {
        const getIndexOfNearestVisible = ($currentElement, $elementsIterable) => {
            const $elements = [...$elementsIterable];
            const i = $elements.indexOf($currentElement);
            if (i < 0)
                return 0;
            for (let d = 0; i - d >= 0 || i + d < $elements.length; d++) {
                if (i - d >= 0 && !$elements[i - d].hidden) {
                    return i - d;
                }
                if (i + d < $elements.length && !$elements[i + d].hidden) {
                    return i + d;
                }
            }
            return 0;
        };
        const $currentSection = this.getCurrentBodySection();
        if (!$currentSection) {
            this.iSection = 0;
            this.iRow = 0;
            this.iSubItem = undefined;
        }
        else if ($currentSection.hidden) {
            this.iRow = 0;
            this.iSubItem = undefined;
            this.iSection = getIndexOfNearestVisible($currentSection, this.$table.tBodies);
        }
        else {
            const $currentRow = this.getCurrentBodyRow();
            if (!$currentRow) {
                this.iRow = 0;
                this.iSubItem = undefined;
            }
            else {
                const iRow2 = getIndexOfNearestVisible($currentRow, $currentSection.rows);
                if (this.iRow != iRow2) {
                    this.iRow = iRow2;
                    this.iSubItem = undefined;
                }
                else if (this.iColumn == iCommentColumn && this.iSubItem != null) {
                    const $subItems = $currentRow.querySelectorAll(`${getBodySelector(iCommentColumn)} ${commentSubItemSelector}`);
                    if (this.iSubItem < 0 || this.iSubItem >= $subItems.length) {
                        this.iSubItem = undefined;
                    }
                }
                else {
                    this.iSubItem = undefined;
                }
            }
        }
        this.save();
    }
    loseFocus() {
        this.select = undefined;
    }
    /**
     * @returns element to focus if required
     */
    setToClicked($target) {
        this.select = undefined;
        const $cell = $target.closest('td, th');
        if (!($cell instanceof HTMLTableCellElement))
            return;
        const $row = $cell.parentElement;
        if (!($row instanceof HTMLTableRowElement))
            return;
        const $section = $row.parentElement;
        if (!($section instanceof HTMLTableSectionElement))
            return;
        for (let i = 0; i < nColumns; i++) {
            if (!$cell.matches(getCellSelector(i)))
                continue;
            this.iColumn = i;
            if ($section.tagName == 'THEAD') {
                const [$focusElement,] = this.save();
                if ($focusElement && $focusElement != $target.closest(focusableSelector)) {
                    return $focusElement;
                }
            }
            else {
                const iSection = [...this.$table.tBodies].indexOf($section);
                if (iSection < 0)
                    return;
                this.iSection = iSection;
                const iRow = [...$section.rows].indexOf($row);
                if (iRow < 0)
                    return;
                this.iRow = iRow;
                this.iSubItem = undefined;
                if (this.iColumn == iCommentColumn) {
                    const $bodySubItem = $target.closest(commentSubItemSelector);
                    if ($bodySubItem instanceof HTMLElement) {
                        const iSubItem = [...$cell.querySelectorAll(commentSubItemSelector)].indexOf($bodySubItem);
                        if (iSubItem >= 0) {
                            this.iSubItem = iSubItem;
                        }
                    }
                }
                const [, $focusElement] = this.save();
                if ($focusElement && $focusElement != $target.closest(focusableSelector)) {
                    return $focusElement;
                }
            }
        }
    }
    respondToAllSelection(ev) {
        if (ev.ctrlKey && ev.key.toLowerCase() == 'a') {
            const $allCheckbox = this.$table.querySelector('thead .note-checkbox input');
            if (!($allCheckbox instanceof HTMLInputElement))
                return null;
            const selected = !$allCheckbox.checked;
            const select = [...this.$table.tBodies].flatMap(($section, i) => $section.hidden ? [] : [[i, selected]]);
            return {
                select,
                stop: true
            };
        }
        return null;
    }
    respondToMovementInsideComment(ev) {
        if (this.iColumn != iCommentColumn)
            return null;
        const $item = this.getCurrentBodyItem();
        if (!$item)
            return null;
        const makeFocusResponse = ($item) => ({
            focus: {
                $item,
                far: false
            },
            stop: true
        });
        if (this.iSubItem == null) {
            if (ev.key == 'Enter') {
                const $commentSubItem = $item.querySelector(commentSubItemSelector);
                if ($commentSubItem instanceof HTMLElement) {
                    this.iSubItem = 0;
                    return makeFocusResponse($commentSubItem);
                }
            }
        }
        else {
            if (ev.key == 'Escape') {
                this.iSubItem = undefined;
                return makeFocusResponse($item);
            }
            const $commentSubItems = $item.querySelectorAll(commentSubItemSelector);
            if (ev.key == 'ArrowLeft' || ev.key == 'ArrowUp') {
                if (this.iSubItem > 0) {
                    const $commentSubItem = $commentSubItems.item(this.iSubItem - 1);
                    if ($commentSubItem instanceof HTMLElement) {
                        this.iSubItem--;
                        return makeFocusResponse($commentSubItem);
                    }
                }
            }
            else if (ev.key == 'ArrowRight' || ev.key == 'ArrowDown') {
                if (this.iSubItem < $commentSubItems.length - 1) {
                    const $commentSubItem = $commentSubItems.item(this.iSubItem + 1);
                    if ($commentSubItem instanceof HTMLElement) {
                        this.iSubItem++;
                        return makeFocusResponse($commentSubItem);
                    }
                }
            }
        }
        return null;
    }
    respondToHorizontalMovement(ev, isInHead) {
        const updateState = () => {
            if (ev.key == 'ArrowLeft') {
                if (this.iColumn > 0) {
                    this.iColumn--;
                    return true;
                }
            }
            else if (ev.key == 'ArrowRight') {
                if (this.iColumn < nColumns - 1) {
                    this.iColumn++;
                    return true;
                }
            }
            else if (ev.key == 'Home' && !ev.ctrlKey) {
                this.iColumn = 0;
                return true;
            }
            else if (ev.key == 'End' && !ev.ctrlKey) {
                this.iColumn = nColumns - 1;
                return true;
            }
            return false;
        };
        if (!updateState())
            return null;
        this.iSubItem = undefined;
        const $item = isInHead ? this.getCurrentHeadItem() : this.getCurrentBodyItem();
        if (!$item)
            return { stop: true };
        return {
            focus: {
                $item,
                far: false
            },
            stop: true
        };
    }
    respondToVerticalMovement(ev, pager) {
        let $startItem;
        let $startSearchItem;
        let trPseudoClass;
        {
            const [$currentSectionLeadingItem, $currentItem] = this.getSectionLeadingAndCurrentBodyItems();
            if (!$currentItem)
                return null;
            $startItem = $currentItem;
            if (ev.shiftKey) {
                trPseudoClass = `first-child`;
                if (!$currentSectionLeadingItem)
                    return null;
                $startSearchItem = $currentSectionLeadingItem;
            }
            else {
                trPseudoClass = `not([hidden])`;
                $startSearchItem = $currentItem;
            }
        }
        const $items = htmlElementArray(this.$table.querySelectorAll(`tbody:not([hidden]) tr:${trPseudoClass} ${getBodySelector(this.iColumn)}`));
        const iStartItem = $items.indexOf($startSearchItem);
        if (iStartItem < 0)
            return null;
        let iEndItem;
        let d;
        if (ev.key == 'ArrowUp') {
            d = -1;
            iEndItem = iStartItem - 1;
        }
        else if (ev.key == 'ArrowDown') {
            d = +1;
            iEndItem = iStartItem + 1;
        }
        else if (ev.key == 'Home' && ev.ctrlKey) {
            d = -1;
            iEndItem = -1;
        }
        else if (ev.key == 'End' && ev.ctrlKey) {
            d = +1;
            iEndItem = $items.length;
        }
        else if (ev.key == 'PageUp' && pager) {
            d = -1;
            iEndItem = pager.goPageUp($items, $startItem, iStartItem);
        }
        else if (ev.key == 'PageDown' && pager) {
            d = +1;
            iEndItem = pager.goPageDown($items, $startItem, iStartItem);
        }
        else {
            return null;
        }
        const iSafeEndItem = Math.max(0, Math.min($items.length - 1, iEndItem));
        const far = !(ev.key == 'ArrowUp' || ev.key == 'ArrowDown');
        if (ev.shiftKey) {
            const response = { stop: true };
            const focus = this.respondToVerticalMovementByFocusing($items, iStartItem, iSafeEndItem, far);
            if (focus)
                response.focus = focus;
            const select = this.respondToVerticalMovementBySelecting($items, iStartItem, iEndItem, iSafeEndItem, d);
            if (select)
                response.select = select;
            return response;
        }
        else {
            this.select = undefined;
            const focus = this.respondToVerticalMovementByFocusing($items, iStartItem, iSafeEndItem, far);
            if (!focus)
                return null;
            return { focus, stop: true };
        }
    }
    respondToVerticalMovementByFocusing($items, iStartItem, iSafeEndItem, far) {
        if (iStartItem == iSafeEndItem)
            return;
        const $item = $items[iSafeEndItem];
        const $row = $item.closest('tr');
        if (!$row)
            return;
        const $section = $row.parentElement;
        if (!($section instanceof HTMLTableSectionElement))
            return;
        const iRow = [...$section.rows].indexOf($row);
        if (iRow < 0)
            return;
        const iSection = [...this.$table.tBodies].indexOf($section);
        if (iSection < 0)
            return;
        this.iSubItem = undefined;
        this.iRow = iRow;
        this.iSection = iSection;
        return { $item, far };
    }
    respondToVerticalMovementBySelecting($items, iStartItem, iEndItem, iSafeEndItem, d) {
        let $toSection = $items[iEndItem]?.closest('tbody');
        let $fromSection = $items[iStartItem]?.closest('tbody');
        let $selectStartSection;
        if (this.select == null) {
            $selectStartSection = $fromSection;
            if (!$selectStartSection)
                return;
            const $startingCheckbox = $selectStartSection.querySelector(getBodySelector(iCheckboxColumn));
            const startingChecked = ($startingCheckbox instanceof HTMLInputElement) && $startingCheckbox.checked;
            this.select = {
                iStartRow: iStartItem,
                isSelection: !startingChecked
            };
        }
        else {
            $selectStartSection = $items[this.select.iStartRow].closest('tbody');
            if (!$selectStartSection)
                return;
        }
        if (this.select.bumpAgainstEdge == -d) {
            $fromSection = null;
        }
        if (iEndItem != iSafeEndItem) {
            this.select.bumpAgainstEdge = d;
        }
        else {
            delete this.select.bumpAgainstEdge;
        }
        const select = [];
        let inNegative = 0;
        let inPositive = -1;
        if (!$fromSection) {
            inNegative++;
            inPositive++;
        }
        for (let k = d > 0 ? 0 : this.$table.tBodies.length - 1; k >= 0 && k < this.$table.tBodies.length; k += d) {
            const $section = this.$table.tBodies[k];
            inPositive += +($section == $selectStartSection);
            inPositive += +($section == $fromSection);
            inPositive -= +($section == $toSection);
            if (inPositive > 0) {
                select.push([k, this.select.isSelection]);
            }
            else if (inNegative > 0) {
                select.push([k, !this.select.isSelection]);
            }
            inNegative -= +($section == $selectStartSection);
            inNegative += +($section == $fromSection);
            inNegative -= +($section == $toSection);
        }
        return select;
    }
    getCurrentHeadItem() {
        const $headSection = this.$table.tHead;
        if (!$headSection)
            return null;
        return $headSection.querySelector(getHeadSelector(this.iColumn));
    }
    getCurrentBodyItem() {
        const selector = getBodySelector(this.iColumn);
        const $section = this.$table.tBodies.item(this.iSection);
        if (!$section)
            return null;
        const $row = $section.rows.item(this.iRow);
        return $row?.querySelector(selector) ?? $section.querySelector(selector);
    }
    getSectionLeadingAndCurrentBodyItems() {
        const selector = getBodySelector(this.iColumn);
        const $section = this.$table.tBodies.item(this.iSection);
        if (!$section)
            return [null, null];
        const $row = $section.rows.item(this.iRow);
        const toHtmlElement = ($e) => ($e instanceof HTMLElement) ? $e : null;
        const $sectionLeadingItem = toHtmlElement($section.querySelector(selector));
        const $currentItem = toHtmlElement($row?.querySelector(selector));
        return [$sectionLeadingItem, $currentItem ?? $sectionLeadingItem];
    }
    getCurrentBodySection() {
        return this.$table.tBodies.item(this.iSection);
    }
    getCurrentBodyRow() {
        const $section = this.getCurrentBodySection();
        if (!$section)
            return null;
        return $section.rows.item(this.iRow);
    }
    save() {
        for (const $e of this.$table.querySelectorAll(`:is(thead, tbody) ${tabbableSelector}`)) {
            if ($e instanceof HTMLElement)
                $e.tabIndex = -1;
        }
        const $headRecipient = this.getCurrentHeadItem();
        let $bodyRecipient = this.getCurrentBodyItem();
        if ($bodyRecipient && this.iColumn == iCommentColumn && this.iSubItem != null) {
            const $bodySubItem = $bodyRecipient.querySelectorAll(commentSubItemSelector).item(this.iSubItem);
            if ($bodySubItem instanceof HTMLElement)
                $bodyRecipient = $bodySubItem;
        }
        if ($headRecipient)
            $headRecipient.tabIndex = 0;
        if ($bodyRecipient)
            $bodyRecipient.tabIndex = 0;
        return [$headRecipient, $bodyRecipient];
    }
}
const htmlElementArray = ($eIterable) => {
    const $es = [];
    for (const $e of $eIterable) {
        if ($e instanceof HTMLElement)
            $es.push($e);
    }
    return $es;
};

class Cursor {
    constructor($table, selectSections) {
        this.$helpDialog = makeHelpDialog(`Close note table help`, [
            makeElement('h2')()(`Note table controls`),
            ul(li(kbd(`Tab`), ` and `, kbd(`Shift`), ` + `, kbd(`Tab`), ` — switch between table head and body`)),
            p(`Anywhere inside the table:`),
            ul(li(kbd(`Arrow keys`), ` — go to adjacent table cell`), li(kbd(`Home`), ` / `, kbd(`End`), ` — go to first/last column`), li(kbd(`Ctrl`), ` + `, kbd(`A`), ` — select all notes`)),
            p(`Inside the table body:`),
            ul(li(kbd(`Ctrl`), ` + `, kbd(`Home`), ` / `, kbd(`End`), ` — go to first/last row`), li(kbd(`Shift`), ` + left click on a checkbox — select a range of notes starting from the previous click`), li(kbd(`Shift`), ` + any vertical navigation keys — select notes`), li(kbd(`Enter`), ` while in the comment column — go inside the comment cell; `, kbd(`Esc`), ` — go back`), li(kbd(`Enter`), ` while in the map column — switch to the map and zoom to note; `, kbd(`Esc`), ` — switch back`), li(kbd(`+`), ` / `, kbd(`-`), ` — zoom in/out on a note location`)),
        ]);
        this.state = new CursorState($table);
        $table.addEventListener('keydown', ev => {
            if (ev.key == 'F1') {
                this.$helpDialog.showModal();
            }
            else {
                noteTableKeydownListener($table, ev, selectSections, this.state);
            }
        });
        $table.addEventListener('click', ev => {
            const $e = ev.target;
            if (!($e instanceof Element))
                return;
            const $focusElement = this.state.setToClicked($e);
            $focusElement?.focus();
        }, true);
        $table.addEventListener('focusout', ev => {
            const $e = ev.relatedTarget;
            if (!($e instanceof Element)
                || !$table.contains($e)) {
                this.state.loseFocus();
            }
        });
    }
    reset($table) {
        this.state = new CursorState($table);
    }
    updateTabIndex() {
        this.state.setToNearestVisible();
    }
    focus() {
        const $e = this.state.getCurrentBodyItem();
        $e?.focus();
    }
}
function noteTableKeydownListener($table, ev, selectSections, state) {
    if (!(ev.target instanceof HTMLElement))
        return;
    const $section = ev.target.closest('thead, tbody');
    if (!($section instanceof HTMLTableSectionElement))
        return;
    let keyResponse;
    if ($section.tagName == 'THEAD') {
        keyResponse = state.respondToKeyInHead(ev);
    }
    else {
        let pager;
        const $scrollingPart = $table.closest('.scrolling'); // TODO pass
        if ($scrollingPart)
            pager = new Pager($scrollingPart);
        keyResponse = state.respondToKeyInBody(ev, pager);
    }
    if (keyResponse?.select) {
        selectSections(keyResponse.select);
    }
    if (keyResponse?.focus) {
        focus(keyResponse.focus.$item, keyResponse.focus.far);
    }
    if (keyResponse?.stop) {
        ev.stopPropagation();
        ev.preventDefault();
    }
}
function focus($e, far) {
    if (far) {
        $e.focus({ preventScroll: true });
        $e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // TODO delay map autozoom to notes on screen in table
    }
    else {
        $e.focus();
        $e.scrollIntoView({ block: 'nearest' });
    }
}

class NoteSectionVisibilityObserver {
    constructor(handleVisibleNotes) {
        this.isMapFittingHalted = false;
        this.noteIdVisibility = new Map();
        this.stickyHeight = 0;
        const noteSectionVisibilityHandler = () => {
            const visibleNoteIds = [];
            for (const [noteId, visibility] of this.noteIdVisibility) {
                if (visibility)
                    visibleNoteIds.push(noteId);
            }
            handleVisibleNotes(visibleNoteIds, this.isMapFittingHalted);
        };
        this.intersectionObserverCallback = (entries) => {
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
        };
    }
    observe($noteSection) {
        if (!this.intersectionObserver) {
            this.intersectionObserver = new IntersectionObserver(this.intersectionObserverCallback, {
                rootMargin: `-${this.stickyHeight}px 0px 0px 0px`
            });
        }
        if (!$noteSection.dataset.noteId)
            return;
        const noteId = Number($noteSection.dataset.noteId);
        this.noteIdVisibility.set(noteId, false);
        this.intersectionObserver.observe($noteSection);
    }
    disconnect() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = undefined;
        }
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

class IdShortener {
    constructor() {
        this.diverse = false;
    }
    /**
     * @returns if can break
     */
    scan(id) {
        if (this.template == null || this.bound == null) {
            this.template = id;
            this.bound = id.length;
            return false;
        }
        this.diverse || (this.diverse = this.template != id);
        if (this.template.length != id.length) {
            this.bound = 0;
            return true;
        }
        for (let i = 0; i < this.bound; i++) {
            if (this.template[i] != id[i]) {
                this.bound = i;
                break;
            }
        }
        return this.bound == 0;
    }
    split(id) {
        if (!this.diverse || this.bound == null || this.bound < 2)
            return ['', id];
        return [id.slice(0, this.bound), id.slice(this.bound)];
    }
}

class NoteTable {
    constructor($root, $container, storage, map, filter, server) {
        this.map = map;
        this.filter = filter;
        this.server = server;
        this.$table = makeElement('table')()();
        this.$selectAllCheckbox = document.createElement('input');
        this.notesById = new Map(); // in the future these might be windowed to limit the amount of stuff on one page
        this.usersById = new Map();
        this.showImages = false;
        this.expanders = new Expanders(storage, this.$table);
        this.$table.setAttribute('role', 'grid');
        const that = this;
        let $clickReadyNoteSection;
        this.wrappedMarkerLinkListeners = [
            ['mouseenter', function () {
                    const noteId = this.dataset.noteId;
                    if (!noteId)
                        return;
                    const $noteSection = that.getNoteSection(noteId);
                    if (!$noteSection)
                        return;
                    that.activateNote('hover', $noteSection);
                }],
            ['mouseleave', function () {
                    const noteId = this.dataset.noteId;
                    if (!noteId)
                        return;
                    const $noteSection = that.getNoteSection(noteId);
                    if (!$noteSection)
                        return;
                    that.deactivateNote('hover', $noteSection);
                }],
        ];
        this.wrappedNoteSectionListeners = [
            ['mouseenter', function () {
                    that.activateNote('hover', this);
                }],
            ['mouseleave', function () {
                    that.deactivateNote('hover', this);
                }],
            ['mousemove', function () {
                    $clickReadyNoteSection = undefined;
                    if (!this.classList.contains('active-click'))
                        return;
                    resetAnimation(this, 'active-click-fade');
                }],
            ['animationend', function () {
                    that.deactivateNote('click', this);
                }],
            ['mousedown', function () {
                    $clickReadyNoteSection = this;
                }],
            ['click', function (ev) {
                    if (that.$table.classList.contains('expanded-map-link') &&
                        $clickReadyNoteSection == this &&
                        !(ev.target instanceof HTMLElement &&
                            ev.target.closest('a.listened, time.listened'))) {
                        that.focusOnNote(this, true);
                        ev.preventDefault();
                        ev.stopPropagation();
                    }
                    $clickReadyNoteSection = undefined;
                }]
        ];
        this.wrappedNoteSectionKeydownListener = function (ev) {
            const $noteSection = this;
            if (ev.key == '+') {
                that.focusOnNote($noteSection, true, false);
            }
            else if (ev.key == '-') {
                that.focusOnNote($noteSection, true, true);
            }
            else {
                return;
            }
            ev.stopPropagation();
            ev.preventDefault();
        };
        this.wrappedNoteCheckboxClickListener = function (ev) {
            that.noteCheckboxClickListener(this, ev);
        };
        this.wrappedAllNotesCheckboxClickListener = function (ev) {
            that.allNotesCheckboxClickListener(this, ev);
        };
        this.cursor = new Cursor(this.$table, (select) => {
            this.$lastClickedNoteSection = undefined;
            for (const [iSection, selected] of select) {
                const $section = this.$table.tBodies.item(iSection);
                if ($section)
                    this.setNoteSelection($section, selected);
            }
            this.updateCheckboxDependentsAndSendNoteChangeEvents();
        });
        $root.append(this.cursor.$helpDialog);
        this.noteSectionVisibilityObserver = new NoteSectionVisibilityObserver((visibleNoteIds, isMapFittingHalted) => {
            map.showNoteTrack(visibleNoteIds);
            if (!isMapFittingHalted && this.mapFitMode == 'inViewNotes')
                map.fitNoteTrack();
            bubbleCustomEvent(this.$table, 'osmNoteViewer:notesInViewportChange', visibleNoteIds.map(id => this.notesById.get(id)).filter(isDefined));
        });
        this.commentWriter = new CommentWriter(server.web);
        $container.append(this.$table);
        this.reset();
        const looseParserPopup = new LooseParserPopup(server.web, $container);
        this.looseParserListener = new LooseParserListener((x, y, text) => {
            const parseResult = parseLoose(text);
            if (!parseResult)
                return;
            looseParserPopup.open(x, y, ...parseResult);
        });
        $root.addEventListener('osmNoteViewer:noteLinkClick', ev => {
            const $a = ev.target;
            if (!($a instanceof HTMLAnchorElement) || !$a.dataset.noteId)
                return;
            this.pingNoteFromLink($a, $a.dataset.noteId);
        });
        $root.addEventListener('osmNoteViewer:mapFitModeChange', ev => {
            const mapFitMode = ev.detail;
            if (mapFitMode == 'allNotes') {
                this.mapFitMode = mapFitMode;
                map.fitNotes();
            }
            else if (mapFitMode == 'selectedNotes') {
                this.mapFitMode = mapFitMode;
                map.fitSelectedNotes();
            }
            else if (mapFitMode == 'inViewNotes') {
                this.mapFitMode = mapFitMode;
                map.fitNoteTrack();
            }
            else {
                this.mapFitMode = undefined;
            }
        });
        $root.addEventListener('osmNoteViewer:beforeNoteFetch', ({ detail: id }) => {
            const $a = this.getNoteLink(id);
            if (!($a instanceof HTMLAnchorElement))
                return;
            $a.classList.add('loading');
        });
        $root.addEventListener('osmNoteViewer:failedNoteFetch', ({ detail: [id, message] }) => {
            const $a = this.getNoteLink(id);
            if (!($a instanceof HTMLAnchorElement))
                return;
            $a.classList.remove('loading');
            $a.classList.add('absent');
            $a.title = `${message}, try to reload again`;
        });
        $root.addEventListener('osmNoteViewer:noteFetch', ({ detail: [note, users, updateType] }) => {
            const $noteSection = this.getNoteSection(note.id);
            if (!$noteSection)
                return;
            const $a = this.getNoteLink($noteSection);
            if (!$a)
                return;
            $a.classList.remove('loading', 'absent');
            let oldUpdateDate = 0;
            const $time = $noteSection.querySelector('tr:last-of-type td.note-date time');
            if ($time instanceof HTMLTimeElement) {
                const oldUpdateDateInMs = Date.parse($time.dateTime);
                if (oldUpdateDateInMs)
                    oldUpdateDate = oldUpdateDateInMs / 1000;
            }
            if (oldUpdateDate < getNoteUpdateDate(note)) {
                $noteSection.dataset.updated = 'updated';
            }
            if (updateType == 'manual') {
                const nManualUpdates = Number($noteSection.dataset.nManualUpdates);
                if (nManualUpdates) {
                    $noteSection.dataset.nManualUpdates = String(nManualUpdates + 1);
                }
                else {
                    $noteSection.dataset.nManualUpdates = '1';
                }
            }
            else {
                delete $noteSection.dataset.nManualUpdates;
            }
            setUpdateLinkTitle($noteSection, $a);
        });
        $root.addEventListener('osmNoteViewer:noteUpdatePush', ({ detail: [note, users] }) => {
            this.replaceNote(note, users);
        });
        $root.addEventListener('osmNoteViewer:noteRefreshWaitProgress', ev => {
            const [id, progress] = ev.detail;
            const $refreshWaitProgress = this.getNoteSection(id)?.querySelector('td.note-link progress');
            if (!($refreshWaitProgress instanceof HTMLProgressElement))
                return;
            $refreshWaitProgress.value = progress;
        });
    }
    reset($caption, markUser, markText) {
        this.markUser = markUser;
        this.markText = markText;
        this.notesById.clear();
        this.usersById.clear();
        this.cursor.reset(this.$table);
        this.$lastClickedNoteSection = undefined;
        this.noteSectionVisibilityObserver.disconnect();
        this.$table.replaceChildren();
        if ($caption)
            this.$table.append($caption);
        this.updateCheckboxDependentsAndSendNoteChangeEvents();
    }
    updateFilter(filter) {
        this.filter = filter;
        const getUsername = (uid) => this.usersById.get(uid);
        for (const $noteSection of this.$table.tBodies) {
            const noteId = Number($noteSection.dataset.noteId);
            const note = this.notesById.get(noteId);
            if (note == null)
                continue;
            if (this.filter.matchNote(note, getUsername)) {
                let targetLayer = this.map.unselectedNoteLayer;
                if (isSelectedNoteSection($noteSection)) {
                    targetLayer = this.map.selectedNoteLayer;
                }
                this.map.moveNoteMarkerToLayer(noteId, targetLayer);
                $noteSection.hidden = false;
            }
            else {
                this.deactivateNote('click', $noteSection);
                this.deactivateNote('hover', $noteSection);
                this.map.moveNoteMarkerToLayer(noteId, this.map.filteredNoteLayer);
                $noteSection.hidden = true;
                this.setNoteSelection($noteSection, false);
            }
        }
        this.updateCheckboxDependentsAndSendNoteChangeEvents();
        this.cursor.updateTabIndex();
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
        }
        for (const [uid, username] of Object.entries(users)) {
            this.usersById.set(Number(uid), username);
        }
        // output table
        let nUnfilteredNotes = 0;
        const getUsername = (uid) => users[uid];
        for (const note of noteSequence) {
            if (this.$table.rows.length == 0) {
                const $header = this.writeHeadSection();
                this.noteSectionVisibilityObserver.stickyHeight = $header.offsetHeight;
                document.documentElement.style.setProperty('--table-header-height', $header.offsetHeight + 'px');
            }
            const isVisible = this.filter.matchNote(note, getUsername);
            if (isVisible)
                nUnfilteredNotes++;
            const $noteSection = this.$table.createTBody();
            $noteSection.dataset.noteId = String(note.id);
            this.noteSectionVisibilityObserver.observe($noteSection);
            this.makeMarker($noteSection, note, isVisible);
            const $checkbox = document.createElement('input');
            $checkbox.type = 'checkbox';
            // $checkbox.title=`shift+click to select/unselect a range`
            $checkbox.addEventListener('click', this.wrappedNoteCheckboxClickListener);
            this.writeNoteSection($noteSection, $checkbox, note, users, isVisible);
            bubbleCustomEvent(this.$table, 'osmNoteViewer:noteRender', note);
        }
        this.updateShortenedNoteIds();
        if (this.mapFitMode == 'allNotes') {
            this.map.fitNotes();
        }
        else {
            this.map.fitNotesIfNeeded();
        }
        this.sendNoteCounts();
        return nUnfilteredNotes;
    }
    replaceNote(note, users) {
        const $noteSection = this.getNoteSection(note.id);
        if (!$noteSection)
            throw new Error(`note section not found during note replace`);
        const $checkbox = getNoteSectionCheckbox($noteSection);
        if (!$checkbox)
            throw new Error(`note checkbox not found during note replace`);
        const $a = $noteSection.querySelector('td.note-link a');
        if (!($a instanceof HTMLAnchorElement))
            throw new Error(`note link not found during note replace`);
        const isNoteLinkFocused = document.activeElement == $a;
        this.map.removeNoteMarker(note.id);
        // remember note and users
        this.notesById.set(note.id, note);
        for (const [uid, username] of Object.entries(users)) {
            this.usersById.set(Number(uid), username);
        }
        // clean up table section
        $noteSection.innerHTML = '';
        delete $noteSection.dataset.updated;
        $noteSection.className = '';
        // output table section
        const getUsername = (uid) => users[uid];
        const isVisible = this.filter.matchNote(note, getUsername);
        this.makeMarker($noteSection, note, isVisible);
        this.writeNoteSection($noteSection, $checkbox, note, users, isVisible);
        const $a2 = this.getNoteLink($noteSection);
        if (!($a2 instanceof HTMLAnchorElement))
            throw new Error(`note link not found after note replace`);
        setUpdateLinkTitle($noteSection, $a2);
        if (isNoteLinkFocused)
            $a2.focus();
        this.updateShortenedNoteIds(); // id doesn't change but it's overwritten and not shortened by default
        this.updateCheckboxDependentsAndSendNoteChangeEvents();
        bubbleCustomEvent(this.$table, 'osmNoteViewer:noteRender', note);
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
            if (!isSelectedNoteSection($noteSection))
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
        else if ($noteSection.hidden) {
            $a.classList.add('absent');
            $a.title = `The note is filtered out`;
        }
        else {
            $a.classList.remove('absent');
            $a.title = '';
            this.focusOnNote($noteSection);
        }
    }
    focus() {
        this.cursor.focus();
    }
    writeHeadSection() {
        const $headSection = this.$table.createTHead();
        this.$selectAllCheckbox.type = 'checkbox';
        this.$selectAllCheckbox.title = `select all notes`;
        this.$selectAllCheckbox.addEventListener('click', this.wrappedAllNotesCheckboxClickListener);
        writeHeadSectionRow($headSection, this.$selectAllCheckbox, (key, clickListener) => this.expanders.makeButton(key, clickListener), () => this.$table.tBodies, () => this.cursor.updateTabIndex());
        return $headSection;
    }
    makeMarker($noteSection, note, isVisible) {
        const marker = new NoteMarker(this.server.web, note);
        marker.addTo(isVisible ? this.map.unselectedNoteLayer : this.map.filteredNoteLayer);
        for (const [event, listener] of this.wrappedMarkerLinkListeners) {
            marker.$a.addEventListener(event, listener);
        }
        return marker;
    }
    writeNoteSection($noteSection, $checkbox, note, users, isVisible) {
        if (!isVisible)
            $noteSection.hidden = true;
        $noteSection.id = `note-${note.id}`;
        $noteSection.classList.add(`status-${note.status}`);
        for (const [event, listener] of this.wrappedNoteSectionListeners) {
            $noteSection.addEventListener(event, listener);
        }
        $noteSection.addEventListener('keydown', this.wrappedNoteSectionKeydownListener);
        if (isVisible && !$checkbox.checked) {
            if (this.$selectAllCheckbox.checked) {
                this.$selectAllCheckbox.checked = false;
                this.$selectAllCheckbox.indeterminate = true;
            }
        }
        $checkbox.setAttribute('aria-label', `${note.status} note at latitude ${note.lat}, longitude ${note.lon}`);
        const $commentCells = writeNoteSectionRows(this.server.web, this.commentWriter, $noteSection, $checkbox, note, users, !this.$table.classList.contains('expanded-comments'), this.showImages, this.markUser, this.markText, () => this.focusOnNote($noteSection, true, false), () => this.cursor.updateTabIndex());
        for (const $commentCell of $commentCells) {
            this.looseParserListener.listen($commentCell);
        }
        this.cursor.updateTabIndex();
    }
    updateShortenedNoteIds() {
        const shortener = new IdShortener;
        for (const $noteSection of this.$table.tBodies) {
            const $a = this.getNoteLink($noteSection);
            if (!$a)
                continue;
            const id = $a.dataset.noteId;
            if (id == null)
                continue;
            if (shortener.scan(id))
                break;
        }
        for (const $noteSection of this.$table.tBodies) {
            const $a = this.getNoteLink($noteSection);
            if (!$a)
                continue;
            const id = $a.dataset.noteId;
            if (id == null)
                continue;
            const [constantPart, variablePart] = shortener.split(id);
            $a.replaceChildren();
            if (constantPart) {
                $a.append(makeElement('span')('constant')(constantPart));
            }
            if (variablePart) {
                $a.append(makeElement('span')('variable')(variablePart));
            }
        }
    }
    sendNoteCounts() {
        let nFetched = 0;
        let nVisible = 0;
        let nSelected = 0;
        for (const $noteSection of this.$table.tBodies) {
            if (!$noteSection.dataset.noteId)
                continue;
            nFetched++;
            if (!$noteSection.hidden)
                nVisible++;
            if (isSelectedNoteSection($noteSection))
                nSelected++;
        }
        bubbleCustomEvent(this.$table, 'osmNoteViewer:noteCountsChange', [nFetched, nVisible, nSelected]);
    }
    noteCheckboxClickListener($checkbox, ev) {
        ev.stopPropagation();
        const $clickedNoteSection = $checkbox.closest('tbody');
        if ($clickedNoteSection) {
            this.setNoteSelection($clickedNoteSection, $checkbox.checked);
            if (ev.shiftKey && this.$lastClickedNoteSection) {
                for (const $inRangeNoteSection of this.listVisibleNoteSectionsInRange(this.$lastClickedNoteSection, $clickedNoteSection)) {
                    if ($inRangeNoteSection == $clickedNoteSection)
                        continue;
                    this.setNoteSelection($inRangeNoteSection, $checkbox.checked);
                }
            }
            this.$lastClickedNoteSection = $clickedNoteSection;
        }
        this.updateCheckboxDependentsAndSendNoteChangeEvents();
    }
    allNotesCheckboxClickListener($allCheckbox, ev) {
        for (const $noteSection of this.listVisibleNoteSections()) {
            this.setNoteSelection($noteSection, $allCheckbox.checked);
        }
        this.updateCheckboxDependentsAndSendNoteChangeEvents();
    }
    focusOnNote($noteSection, isSectionClicked = false, isNegativeZoom = false) {
        this.activateNote('click', $noteSection);
        this.noteSectionVisibilityObserver.haltMapFitting(); // otherwise scrollIntoView() may ruin note pan/zoom - it may cause observer to fire after exiting this function
        if (!isSectionClicked)
            $noteSection.scrollIntoView({ block: 'nearest' });
        const noteId = Number($noteSection.dataset.noteId);
        bubbleCustomEvent($noteSection, 'osmNoteViewer:noteFocus', [noteId, isNegativeZoom]); // TODO correct target, it could be a marker
        if (!this.$selectAllCheckbox.checked && !this.$selectAllCheckbox.indeterminate) {
            const noteId = Number($noteSection.dataset.noteId);
            const note = this.notesById.get(noteId);
            if (note) {
                const noteUsers = new Map();
                this.addNoteUsersToMap(noteUsers, note);
                bubbleCustomEvent(this.$table, 'osmNoteViewer:notesInput', [[note], noteUsers]);
            }
        }
    }
    deactivateNote(type, $noteSection) {
        $noteSection.classList.remove('active-' + type);
        const noteId = Number($noteSection.dataset.noteId);
        const marker = this.map.getNoteMarker(noteId);
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
                    resetAnimation($noteSection, 'active-click-fade');
            }
            else {
                this.deactivateNote(type, $otherNoteSection);
            }
        }
        if (alreadyActive)
            return;
        const noteId = Number($noteSection.dataset.noteId);
        const marker = this.map.getNoteMarker(noteId);
        if (!marker)
            return;
        marker.setZIndexOffset(1000);
        marker.getElement()?.classList.add('active-' + type);
        $noteSection.classList.add('active-' + type);
    }
    updateCheckboxDependentsAndSendNoteChangeEvents() {
        const [nFetched, nVisible, selectedNotes, selectedNoteUsers] = this.getCheckedData();
        const hasSelected = selectedNotes.length > 0;
        const hasUnselected = nVisible > selectedNotes.length;
        this.$selectAllCheckbox.indeterminate = hasSelected && hasUnselected;
        this.$selectAllCheckbox.checked = hasSelected && !hasUnselected;
        bubbleCustomEvent(this.$table, 'osmNoteViewer:noteCountsChange', [nFetched, nVisible, selectedNotes.length]);
        bubbleCustomEvent(this.$table, 'osmNoteViewer:notesInput', [selectedNotes, selectedNoteUsers]);
        if (this.mapFitMode == 'selectedNotes')
            this.map.fitSelectedNotes();
    }
    getCheckedData() {
        let nFetched = 0;
        let nVisible = 0;
        const selectedNotes = [];
        const selectedNoteUsers = new Map();
        for (const $noteSection of this.$table.tBodies) {
            nFetched++;
            if ($noteSection.hidden)
                continue;
            nVisible++;
            if (!isSelectedNoteSection($noteSection))
                continue;
            const noteId = Number($noteSection.dataset.noteId);
            const note = this.notesById.get(noteId);
            if (!note)
                continue;
            selectedNotes.push(note);
            this.addNoteUsersToMap(selectedNoteUsers, note);
        }
        return [nFetched, nVisible, selectedNotes, selectedNoteUsers];
    }
    setNoteSelection($noteSection, isSelected) {
        const getTargetLayer = () => {
            if ($noteSection.hidden) {
                return this.map.filteredNoteLayer;
            }
            else if (isSelected) {
                return this.map.selectedNoteLayer;
            }
            else {
                return this.map.unselectedNoteLayer;
            }
        };
        const $checkbox = getNoteSectionCheckbox($noteSection);
        if ($checkbox)
            $checkbox.checked = isSelected;
        const noteId = Number($noteSection.dataset.noteId);
        const note = this.notesById.get(noteId);
        if (!note)
            return;
        const marker = this.map.moveNoteMarkerToLayer(noteId, getTargetLayer());
        if (!marker)
            return;
        marker.updateIcon(this.server.web, note, isSelected);
        const activeClasses = ['hover', 'click'].map(type => 'active-' + type).filter(cls => $noteSection.classList.contains(cls));
        marker.getElement()?.classList.add(...activeClasses);
    }
    listVisibleNoteSections() {
        return this.$table.querySelectorAll('tbody:not([hidden])');
    }
    *listVisibleNoteSectionsWithIds() {
        for (const $noteSection of this.listVisibleNoteSections()) {
            const idString = $noteSection.dataset.noteId;
            if (!idString)
                continue;
            yield [$noteSection, Number(idString)];
        }
    }
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
            yield $section;
            if ($section == $guardSection) {
                return;
            }
        }
    }
    getNoteLink(noteIdOrSection) {
        let $noteSection;
        if (noteIdOrSection instanceof HTMLTableSectionElement) {
            $noteSection = noteIdOrSection;
        }
        else {
            $noteSection = this.getNoteSection(noteIdOrSection);
        }
        const $a = $noteSection?.querySelector('td.note-link a');
        if ($a instanceof HTMLAnchorElement)
            return $a;
    }
    getNoteSection(noteId) {
        const $noteSection = document.getElementById(`note-` + noteId); // TODO look in $table
        if (!($noteSection instanceof HTMLTableSectionElement))
            return;
        return $noteSection;
    }
    addNoteUsersToMap(selectedNoteUsers, note) {
        for (const comment of note.comments) {
            if (comment.uid == null)
                continue;
            const username = this.usersById.get(comment.uid);
            if (username == null)
                continue;
            selectedNoteUsers.set(comment.uid, username);
        }
    }
}
function setUpdateLinkTitle($noteSection, $a) {
    const noteReference = ($noteSection.dataset.updated
        ? `the updated note`
        : `the note`);
    const nManualUpdates = $noteSection.dataset.nManualUpdates;
    if (!nManualUpdates) {
        $a.title = `reload ${noteReference}`;
    }
    else if (nManualUpdates == '1') {
        $a.title = `reloaded manually, reload ${noteReference} again`;
    }
    else {
        $a.title = `reloaded manually ${nManualUpdates} times, reload ${noteReference} again`;
    }
}
function getNoteSectionCheckbox($noteSection) {
    const $checkbox = $noteSection.querySelector('.note-checkbox input');
    return $checkbox instanceof HTMLInputElement ? $checkbox : null;
}
function isSelectedNoteSection($noteSection) {
    return getNoteSectionCheckbox($noteSection)?.checked ?? false;
}
function isDefined(argument) {
    return argument !== undefined;
}

class Tool {
    constructor(cx) {
        this.cx = cx;
        this.isFullWidth = false;
        this.$buttonsRequiringSelectedNotes = [];
    }
    write($root, map) {
        if (!this.isActiveWithCurrentServer())
            return [null, null];
        const $tool = makeElement('details')('tool')();
        $tool.classList.toggle('full-width', this.isFullWidth);
        const $toolSummary = makeElement('summary')()(this.name);
        if (this.title)
            $toolSummary.title = this.title;
        $tool.append($toolSummary, ...this.getTool($root, $tool, map));
        cleanupAnimationOnEnd($tool);
        $root.addEventListener('osmNoteViewer:notesInput', ev => {
            const [inputNotes] = ev.detail;
            let reactedToButtons = false;
            for (const $button of this.$buttonsRequiringSelectedNotes) {
                const newDisabled = inputNotes.length <= 0;
                if ($button.disabled != newDisabled) {
                    $button.disabled = newDisabled;
                    reactedToButtons = true;
                }
            }
            if (reactedToButtons)
                this.ping($tool);
        });
        const infoElements = this.getInfo();
        if (infoElements) {
            const $info = makeElement('details')('info')(makeElement('summary')()(`${this.name} info`), ...infoElements);
            const $infoButton = makeElement('button')('info')();
            $infoButton.innerHTML = `<svg><use href="#tools-info" /></svg>`;
            const updateInfoButton = () => {
                $infoButton.title = ($info.open ? `Close` : `Open`) + ` tool info`;
                $infoButton.setAttribute('aria-expanded', String($info.open));
            };
            updateInfoButton();
            $infoButton.onclick = () => {
                $info.open = !$info.open;
            };
            $info.ontoggle = () => {
                updateInfoButton();
            };
            $tool.addEventListener('toggle', () => {
                if ($tool.open)
                    return;
                $info.open = false;
            });
            const $infoButtonContainer = this.getInfoButtonContainer();
            if ($infoButtonContainer) {
                $infoButtonContainer.append($infoButton);
            }
            else {
                $tool.append(` `, $infoButton);
            }
            return [$tool, $info];
        }
        else {
            return [$tool, null];
        }
    }
    isActiveWithCurrentServer() { return true; }
    getInfo() { return undefined; }
    getInfoButtonContainer() { return undefined; }
    makeRequiringSelectedNotesButton() {
        const $button = document.createElement('button');
        $button.disabled = true;
        this.$buttonsRequiringSelectedNotes.push($button);
        return $button;
    }
    ping($tool) {
        startAnimation($tool, 'tool-ping-fade', '1s');
    }
}
function makeMapIcon(type) {
    const $span = makeElement('span')(`icon-map-${type}`)();
    $span.title = `map ${type}`;
    $span.innerHTML = `<svg><use href="#tools-map" /></svg>`;
    return $span;
}
function makeNotesIcon(type) {
    const $span = makeElement('span')(`icon-notes-${type}`)();
    $span.title = `${type} notes`;
    $span.innerHTML = `<svg><use href="#tools-notes" /></svg>`;
    return $span;
}
function makeActionIcon(type, text) {
    const $span = makeElement('span')(`icon-action-${type}`)();
    $span.title = text;
    $span.innerHTML = `<svg><use href="#tools-${type}" /></svg>`;
    return $span;
}
function makeNoteStatusIcon(status, number = 1) {
    const height = 16;
    const width = 8;
    const r = width / 2;
    const $span = makeElement('span')(`icon-note-status`)();
    $span.title = `${status} note${number != 1 ? `s` : ``}`;
    const path = `<path d="${computeMarkerOutlinePath(height, width / 2 - .5)}" stroke="gray" ${pathAttrs()} />`;
    $span.innerHTML = `<svg viewBox="${-r} ${-r} ${width} ${height}">${path}</svg>`;
    return $span;
    function pathAttrs() {
        if (status == 'open') {
            return `fill="red"`;
        }
        else if (status == 'closed') {
            return `fill="green"`;
        }
        else {
            return `fill="#444"`;
        }
    }
    // copypaste from marker.ts
    function computeMarkerOutlinePath(height, r) {
        const rp = height - r;
        const y = r ** 2 / rp;
        const x = Math.sqrt(r ** 2 - y ** 2);
        const xf = x.toFixed(2);
        const yf = y.toFixed(2);
        return `M0,${rp} L-${xf},${yf} A${r},${r} 0 1 1 ${xf},${yf} Z`;
    }
}

class AutozoomTool extends Tool {
    constructor() {
        super(...arguments);
        this.id = 'autozoom';
        this.name = `Map autozoom`;
        this.title = `Select how the map is panned/zoomed to notes`;
    }
    getInfo() {
        return [p(`Pan and zoom the map to notes in the table. `, `Can be used as `, em(`zoom to data`), ` for notes layer if `, dfn(`to all visible notes`), ` is selected. `), p(dfn(`To notes on screen in table`), ` allows to track notes in the table that are currently visible on screen, panning the map as you scroll through the table. `, `This option is convenient to use when `, em(`Track between notes`), ` map layer is enabled (and it is enabled by default). This way you can see the current sequence of notes from the table on the map, connected by a line in an order in which they appear in the table.`)];
    }
    getTool($root, $tool) {
        const $fitModeSelect = makeElement('select')()(new Option('is disabled', 'none'), new Option('to selected notes', 'selectedNotes'), new Option('to notes on screen in table', 'inViewNotes'), new Option('to all visible notes', 'allNotes'));
        $fitModeSelect.onchange = () => {
            bubbleCustomEvent($tool, 'osmNoteViewer:mapFitModeChange', $fitModeSelect.value);
        };
        return [$fitModeSelect];
    }
}
class TimestampTool extends Tool {
    constructor() {
        super(...arguments);
        this.id = 'timestamp';
        this.name = `Timestamp`;
        this.title = `Set timestamp for queries run by Overpass`;
    }
    getInfo() {
        return [p(`Allows to select a timestamp for use with `, em(`Overpass`), ` and `, em(`Overpass turbo`), ` commands. `, `You can either enter the timestamp in ISO format (or anything else that Overpass understands) manually here click on a date of/in a note comment. `, `If present, a `, makeLink(`date setting`, `https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#date`), ` is added to Overpass queries. `, `The idea is to allow for examining the OSM data at the moment some note was opened/commented/closed to evaluate if this action was correct.`), p(`Timestamps inside note comments are usually generated by apps like `, makeLink(`MAPS.ME`, `https://wiki.openstreetmap.org/wiki/MAPS.ME`), ` to indicate their OSM data version.`)];
    }
    getTool($root, $tool) {
        const $timestampInput = document.createElement('input');
        // $timestampInput.type='datetime-local' // no standard datetime input for now because they're being difficult with UTC and 24-hour format.
        // $timestampInput.step='1'
        $timestampInput.type = 'text';
        $timestampInput.size = 20;
        $timestampInput.oninput = () => {
            bubbleCustomEvent($tool, 'osmNoteViewer:timestampChange', $timestampInput.value);
        };
        $root.addEventListener('osmNoteViewer:timestampChange', ev => {
            if (ev.target == $tool)
                return;
            $timestampInput.value = ev.detail;
            this.ping($tool);
        });
        const $clearButton = document.createElement('button');
        $clearButton.type = 'reset';
        $clearButton.textContent = 'Clear';
        const $form = makeElement('form')()($timestampInput, ` `, $clearButton);
        $form.onreset = () => {
            bubbleCustomEvent($tool, 'osmNoteViewer:timestampChange', '');
        };
        return [$form];
    }
}
class CountTool extends Tool {
    constructor() {
        super(...arguments);
        this.id = 'counts';
        this.name = `Note counts`;
        this.title = `See number of fetched/visible/selected notes`;
    }
    getTool($root, $tool) {
        const $fetchedNoteCount = makeElement('output')()('0');
        const $visibleNoteCount = makeElement('output')()('0');
        const $selectedNoteCount = makeElement('output')()('0');
        $root.addEventListener('osmNoteViewer:noteCountsChange', ev => {
            const [nFetched, nVisible, nSelected] = ev.detail;
            $fetchedNoteCount.textContent = String(nFetched);
            $visibleNoteCount.textContent = String(nVisible);
            $selectedNoteCount.textContent = String(nSelected);
            this.ping($tool);
        });
        return [
            $fetchedNoteCount, ` fetched, `,
            $visibleNoteCount, ` visible, `,
            $selectedNoteCount, ` selected`
        ];
    }
}
class LegendTool extends Tool {
    constructor() {
        super(...arguments);
        this.id = 'legend';
        this.name = `Legend`;
        this.title = `What do icons in command panel mean`;
    }
    getTool() {
        return [
            makeMapIcon('center'), ` = map center, `,
            makeMapIcon('area'), ` = map area, `,
            makeNotesIcon('selected'), ` = selected notes, `,
            makeNoteStatusIcon('open'), ` = open (selected) note, `,
            makeNoteStatusIcon('closed'), ` = closed (selected) note`
        ];
    }
}

const e$4 = makeEscapeTag(encodeURIComponent);
/**
 * Errors expected with working connection to the API
 */
class NoteDataError extends TypeError {
}
function getFetchTableNoteErrorMessage(ex) {
    if (ex instanceof TypeError) {
        return ex.message;
    }
    else {
        return `unknown error ${ex}`;
    }
}
/**
 * Reload a single note updating its link
 */
async function fetchTableNote(api, noteId, token) {
    const response = await api.fetch.withToken(token)(e$4 `notes/${noteId}.json`);
    if (!response.ok)
        throw new NoteDataError(`note reload failed`);
    const noteAndUsers = await readNoteResponse(noteId, response);
    return noteAndUsers;
}
async function readNoteResponse(noteId, response) {
    const data = await response.json();
    if (!isNoteFeature(data))
        throw new NoteDataError(`note reload received invalid data`);
    const [newNotes, newUsers] = transformFeatureToNotesAndUsers(data);
    if (newNotes.length != 1)
        throw new NoteDataError(`note reload received unexpected number of notes`);
    const [newNote] = newNotes;
    if (newNote.id != noteId)
        throw new NoteDataError(`note reload received unexpected note`);
    return [newNote, newUsers];
}

function listDecoratedNoteIds(inputIds) {
    const ids = [...inputIds].sort((a, b) => a - b);
    if (ids.length == 0)
        return [];
    const ref = (id) => [String(id), id];
    if (ids.length == 1) {
        const [id] = ids;
        return [['note '], ref(id)];
    }
    const result = [['notes ']];
    let first = true;
    let rangeStart;
    let rangeEnd;
    const appendRange = () => {
        if (rangeStart == null || rangeEnd == null)
            return;
        if (first) {
            first = false;
        }
        else {
            result.push([',']);
        }
        if (rangeEnd == rangeStart) {
            result.push(ref(rangeStart));
        }
        else if (rangeEnd == rangeStart + 1) {
            result.push(ref(rangeStart), [','], ref(rangeEnd));
        }
        else {
            result.push(ref(rangeStart), ['-'], ref(rangeEnd));
        }
    };
    for (const id of ids) {
        if (rangeEnd != null && id == rangeEnd + 1) {
            rangeEnd = id;
        }
        else {
            appendRange();
            rangeStart = rangeEnd = id;
        }
    }
    appendRange();
    return result;
}
function convertDecoratedNoteIdsToPlainText(decoratedIds, limit) {
    const fullResult = decoratedIds.map(([text]) => text).join('');
    if (limit == null || fullResult.length <= limit)
        return fullResult;
    const clipText = `...`;
    let safeResult = '';
    let extraResult = '';
    let nAppends = 0;
    const appendToSafeResult = () => {
        if (safeResult.length + extraResult.length + clipText.length > limit)
            return false;
        safeResult += extraResult;
        extraResult = '';
        nAppends++;
        return true;
    };
    for (const [text, id] of decoratedIds) {
        if (id) {
            if (!appendToSafeResult())
                break;
        }
        extraResult += text;
    }
    appendToSafeResult();
    if (nAppends < 2)
        return ''; // no ids in result
    return safeResult + clipText;
}
const escU = makeEscapeTag(encodeURIComponent);
const escX = makeEscapeTag(escapeXml);
function convertDecoratedNoteIdsToHtmlText(decoratedIds, web) {
    return decoratedIds.map(([text, id]) => {
        if (id == null) {
            return text;
        }
        else {
            const href = web.getUrl(escU `note/${id}`);
            return escX `<a href="${href}">${text}</a>`;
        }
    }).join('');
}

function getMultipleNoteIndicators(web, idsAndStatusesIterable, maxIndividualNotes) {
    const output = [];
    const idsAndStatuses = [...idsAndStatusesIterable];
    if (idsAndStatuses.length == 0) ;
    else if (idsAndStatuses.length <= maxIndividualNotes) {
        for (const [i, [id, status]] of idsAndStatuses.entries()) {
            if (i)
                output.push(`, `);
            output.push(getNoteIndicator(web, id, status));
        }
    }
    else {
        const countsByStatus = new Map();
        for (const [i, [, status]] of idsAndStatuses.entries()) {
            if (i == 0 || i == idsAndStatuses.length - 1)
                continue;
            countsByStatus.set(status, (countsByStatus.get(status) ?? 0) + 1);
        }
        output.push(getNoteIndicator(web, ...idsAndStatuses[0]), ` ...(`);
        for (const [i, [status, count]] of [...countsByStatus].entries()) {
            if (i)
                output.push(`, `);
            output.push(...getNoteCountIndicator(count, status));
        }
        output.push(`)... `, getNoteIndicator(web, ...idsAndStatuses[idsAndStatuses.length - 1]));
    }
    return output;
}
function getNoteIndicator(web, id, status) {
    const href = web.getUrl(`note/` + encodeURIComponent(id));
    const $a = document.createElement('a');
    $a.href = href;
    $a.classList.add('listened');
    $a.dataset.noteId = String(id);
    $a.append(makeNoteStatusIcon(status), ` ${id}`);
    return $a;
}
function getNoteCountIndicator(count, status) {
    return [`${count} × `, makeNoteStatusIcon(status, count)];
}
function getButtonNoteIcon(ids, inputStatus, outputStatus) {
    const outputIcon = [];
    if (outputStatus != inputStatus) {
        outputIcon.push(` → `, makeNoteStatusIcon(outputStatus, ids.length));
    }
    if (ids.length == 0) {
        return [makeNoteStatusIcon(inputStatus, ids.length), ...outputIcon];
    }
    else if (ids.length == 1) {
        return [makeNoteStatusIcon(inputStatus), ` ${ids[0]}`, ...outputIcon];
    }
    else {
        return [...getNoteCountIndicator(ids.length, inputStatus), ...outputIcon, `...`];
    }
}

const e$3 = makeEscapeTag(encodeURIComponent);
class InteractionError extends TypeError {
}
class InteractTool extends Tool {
    constructor(cx) {
        super(cx);
        this.id = 'interact';
        this.name = `Interact`;
        this.title = `Interact with notes on OSM server`;
        this.isFullWidth = true;
        this.$yourNotesApi = document.createElement('span');
        this.$yourNotesWeb = document.createElement('span');
        this.$asOutput = document.createElement('output');
        this.$withOutput = document.createElement('output');
        this.$copyIdsButton = makeElement('button')()('Copy ids');
        this.$commentText = document.createElement('textarea');
        this.$commentButton = document.createElement('button');
        this.$closeButton = document.createElement('button');
        this.$reopenButton = document.createElement('button');
        this.$hideOpenButton = document.createElement('button');
        this.$hideClosedButton = document.createElement('button');
        this.$reactivateButton = document.createElement('button');
        this.$runButton = makeElement('button')('only-with-icon')();
        this.$runOutput = document.createElement('output');
        this.$run = makeDiv('interaction-run')(this.$runButton, this.$runOutput);
        this.$loginLink = makeSemiLink('input-link')('login');
        this.stagedNoteIds = new Map();
        this.interactionDescriptions = [{
                verb: 'POST',
                endpoint: 'comment',
                label: `Comment`,
                runningLabel: `Commenting`,
                $button: this.$commentButton,
                inputNoteStatus: 'open',
                outputNoteStatus: 'open',
                forModerator: false
            }, {
                verb: 'POST',
                endpoint: 'close',
                label: `Close`,
                runningLabel: `Closing`,
                $button: this.$closeButton,
                inputNoteStatus: 'open',
                outputNoteStatus: 'closed',
                forModerator: false
            }, {
                verb: 'POST',
                endpoint: 'reopen',
                label: `Reopen`,
                runningLabel: `Reopening`,
                $button: this.$reopenButton,
                inputNoteStatus: 'closed',
                outputNoteStatus: 'open',
                forModerator: false
            }, {
                verb: 'DELETE',
                label: `Hide`,
                runningLabel: `Hiding`,
                $button: this.$hideOpenButton,
                inputNoteStatus: 'open',
                outputNoteStatus: 'hidden',
                forModerator: true
            }, {
                verb: 'DELETE',
                label: `Hide`,
                runningLabel: `Hiding`,
                $button: this.$hideClosedButton,
                inputNoteStatus: 'closed',
                outputNoteStatus: 'hidden',
                forModerator: true
            }, {
                verb: 'POST',
                endpoint: 'reopen',
                label: `Reactivate`,
                runningLabel: `Reactivating`,
                $button: this.$reactivateButton,
                inputNoteStatus: 'hidden',
                outputNoteStatus: 'open',
                forModerator: true
            }];
        this.updateLoginDependents();
        this.updateWithOutput();
        this.updateButtons();
        this.updateRunButton();
        this.updateRunOutput();
    }
    getInfo() {
        return [p(`Do the following operations with notes:`), ul(li(makeLink(`comment`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Create_a_new_comment:_Create:_POST_/api/0.6/notes/#id/comment`)), li(makeLink(`close`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Close:_POST_/api/0.6/notes/#id/close`)), li(makeLink(`reopen`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Reopen:_POST_/api/0.6/notes/#id/reopen`), ` — for moderators this API call also makes hidden note visible again ("reactivates" it). `, `This means that a hidden note can only be restored to an open state, even if it had been closed before being hidden. `, `If you want the note to be closed again, you have to close it yourself after reactivating. `, `Also, unlike the OSM website, you can reactivate a note and add a comment in one action. `, `The OSM website currently doesn't provide a comment input for note reactivation.`), li(`for moderators there's also a delete method to hide a note: `, code(`DELETE /api/0.6/notes/#id`))), p(`If you want to find the notes you interacted with, try searching for `, this.$yourNotesApi, `. `, `Unfortunately searching using the API doesn't reveal hidden notes even to moderators. `, em(`Plaintext`), ` mode will show hidden notes to moderators, but it requires knowing the note ids. `, `If you've hidden a note and want to see it but don't know its id, look for the note at `, this.$yourNotesWeb, ` on the OSM website.`), p(`The `, em(`Copy ids`), ` button on top is useful for making changeset comments. `, `It copies to the clipboard the same note list that you'd get by using the `, em(`Load map area`), ` remote control command. `, em(`Load map area`), ` sets the changeset comment tag to selected notes as a side effect. `, `If you're not using remote control but want to get the note list for a comment, you can press `, em(`Copy ids`), ` instead.`), p(em(`Copy ids`), ` has the ability to copy note ids as html links if your browser `, makeLink(`supports it`, `https://developer.mozilla.org/en-US/docs/Web/API/Clipboard#clipboard_availability`), `. `, `It should work out of the box on Chrome. `, `On Firefox as of v111 it requires enabling the `, code(`dom.events.asyncClipboard.clipboardItem`), ` setting in `, makeLink(`about:config`, `about:config`), ` and reloading the `, em(`note-viewer`), `.`)];
    }
    getInfoButtonContainer() {
        return this.$run;
    }
    getTool($root, $tool) {
        const appendLastChangeset = new TextControl(this.$commentText, () => this.cx.uid != null, () => true, (append) => !this.$commentText.value.endsWith(append), (append) => {
            this.$commentText.value = this.$commentText.value.slice(0, -append.length);
            this.updateButtons();
        }, async ($a) => {
            if (this.cx.uid == null)
                throw new TypeError(`Undefined user id when getting last changeset`);
            const response = await this.cx.server.api.fetch(e$3 `changesets.json?user=${this.cx.uid}`);
            const data = await response.json();
            const changesetId = getLatestChangesetId(data);
            const append = getParagraphAppend(this.$commentText.value, this.cx.server.web.getUrl(e$3 `changeset/${changesetId}`));
            this.$commentText.value += append;
            this.updateButtons();
            $a.dataset.changesetId = String(changesetId);
            bubbleEvent($a, 'osmNoteViewer:changesetLinkClick');
            return append;
        }, () => [makeElement('span')()(`undo append`)], () => [makeElement('span')()(`append last changeset`)]);
        this.$loginLink.onclick = () => {
            bubbleCustomEvent($root, 'osmNoteViewer:menuToggle', 'login');
        };
        this.$copyIdsButton.onclick = async () => {
            this.$copyIdsButton.title = '';
            this.$copyIdsButton.classList.remove('error');
            const decoratedIds = listDecoratedNoteIds(this.stagedNoteIds.keys());
            const plainText = convertDecoratedNoteIdsToPlainText(decoratedIds);
            try {
                if (navigator.clipboard.write && window.ClipboardItem) {
                    const plainBlob = new Blob([plainText], { type: 'text/plain' });
                    const htmlText = convertDecoratedNoteIdsToHtmlText(decoratedIds, this.cx.server.web);
                    const htmlBlob = new Blob([htmlText], { type: 'text/html' });
                    await navigator.clipboard.write([
                        new ClipboardItem({
                            [plainBlob.type]: plainBlob,
                            [htmlBlob.type]: htmlBlob,
                        })
                    ]);
                    this.$copyIdsButton.title = `Copied html ids`;
                }
                else {
                    await navigator.clipboard.writeText(plainText);
                    this.$copyIdsButton.title = `Copied plaintext ids (see tool info if you're using Firefox)`;
                }
            }
            catch {
                this.$copyIdsButton.title = `Copy ids failed`;
                this.$copyIdsButton.classList.add('error');
            }
        };
        this.$commentText.oninput = () => {
            this.updateButtons();
        };
        const scheduleRunNextNote = this.makeRunScheduler($tool);
        for (const interactionDescription of this.interactionDescriptions) {
            interactionDescription.$button.onclick = () => {
                if (this.run?.status == 'paused') {
                    this.run = undefined;
                    this.updateButtons();
                    this.updateRunButton();
                    this.updateRunOutput();
                }
                else {
                    const inputNoteIds = this.getStagedNoteIdsByStatus().get(interactionDescription.inputNoteStatus);
                    if (!inputNoteIds)
                        return;
                    const runImmediately = inputNoteIds.length <= 1;
                    this.run = {
                        interactionDescription,
                        status: 'paused',
                        requestedStatus: runImmediately ? 'running' : 'paused',
                        inputNoteIds,
                        outputNoteIds: []
                    };
                    if (runImmediately)
                        scheduleRunNextNote();
                    this.updateButtons();
                    this.updateRunButton();
                    this.updateRunOutput();
                }
            };
        }
        this.$runButton.onclick = () => {
            if (!this.run)
                return;
            if (this.run.status == 'running') {
                this.run.requestedStatus = 'paused';
                this.updateRunButton();
            }
            else if (this.run.status == 'paused') {
                this.run.requestedStatus = 'running';
                this.updateRunButton();
                scheduleRunNextNote();
            }
        };
        $root.addEventListener('osmNoteViewer:loginChange', () => {
            appendLastChangeset.update();
            this.updateLoginDependents();
            this.updateButtons();
            this.ping($tool);
        });
        $root.addEventListener('osmNoteViewer:notesInput', ({ detail: [inputNotes] }) => {
            this.stagedNoteIds = new Map(inputNotes.map(note => [note.id, note.status]));
            if (this.run?.status == 'running')
                return;
            this.updateWithOutput();
            this.updateButtons();
            this.ping($tool);
        });
        return [
            this.$asOutput, ` `, this.$withOutput, ` `, this.$copyIdsButton,
            makeDiv('major-input-group')(appendLastChangeset.$controls, makeLabel()(`Comment `, this.$commentText)),
            makeDiv('gridded-input-group')(...this.interactionDescriptions.map(({ $button }) => $button)),
            this.$run
        ];
    }
    updateLoginDependents() {
        this.updateYourNotes();
        this.updateAsOutput();
    }
    updateYourNotes() {
        const apiText = `your own latest updated notes`;
        const webText = `your notes page`;
        if (this.cx.username == null) {
            this.$yourNotesApi.replaceChildren(apiText);
            this.$yourNotesWeb.replaceChildren(webText);
        }
        else {
            const hash = getHashFromLocation();
            const [hostHashValue] = detachValueFromHash('host', hash);
            const queryHash = new URLSearchParams([
                ['mode', 'search'],
                ['display_name', this.cx.username],
                ['sort', 'updated_at']
            ]).toString();
            const apiHref = '#' + attachValueToFrontOfHash('host', hostHashValue, queryHash);
            const webHref = this.cx.server.web.getUrl(e$3 `user/${this.cx.username}/notes`);
            this.$yourNotesApi.replaceChildren(makeLink(apiText, apiHref));
            this.$yourNotesWeb.replaceChildren(makeLink(webText, webHref));
        }
    }
    updateAsOutput() {
        if (this.cx.username == null || this.cx.uid == null) {
            this.$asOutput.replaceChildren(this.$loginLink, ` to interact`);
        }
        else {
            this.$asOutput.replaceChildren(`as `, this.cx.server.web.makeUserLink(this.cx.uid, this.cx.username));
        }
    }
    updateWithOutput() {
        const multipleNoteIndicators = getMultipleNoteIndicators(this.cx.server.web, this.stagedNoteIds, 5);
        if (multipleNoteIndicators.length > 0) {
            this.$withOutput.replaceChildren(`with `, ...multipleNoteIndicators);
        }
        else {
            this.$withOutput.replaceChildren();
        }
    }
    updateButtons() {
        // button next to with-output
        this.$copyIdsButton.disabled = [...this.stagedNoteIds.values()].every(ids => ids.length == 0);
        this.$copyIdsButton.title = '';
        this.$copyIdsButton.classList.remove('error');
        // buttons below comment
        const stagedNoteIdsByStatus = this.getStagedNoteIdsByStatus();
        for (const interactionDescription of this.interactionDescriptions) {
            const inputNoteIds = stagedNoteIdsByStatus.get(interactionDescription.inputNoteStatus) ?? [];
            const { $button } = interactionDescription;
            let cancelCondition = false;
            if (this.run && this.run.status != 'finished') {
                cancelCondition = this.run.status == 'paused' && this.run.interactionDescription == interactionDescription;
                $button.disabled = (this.run.status == 'running' ||
                    this.run.status == 'paused' && this.run.interactionDescription != interactionDescription);
            }
            else {
                $button.disabled = !this.cx.token || inputNoteIds.length == 0;
            }
            if (cancelCondition) {
                $button.replaceChildren(`Cancel`);
            }
            else {
                $button.replaceChildren(`${interactionDescription.label} `, ...getButtonNoteIcon(inputNoteIds, interactionDescription.inputNoteStatus, interactionDescription.outputNoteStatus));
            }
            $button.hidden = interactionDescription.forModerator && !this.cx.isModerator;
        }
        if (this.$commentText.value == '')
            this.$commentButton.disabled = true;
    }
    updateRunButton() {
        const canPause = this.run && this.run.status == 'running';
        this.$runButton.replaceChildren(canPause
            ? makeActionIcon('pause', `Halt`)
            : makeActionIcon('play', `Resume`));
        this.$runButton.disabled = !this.run || this.run.status != this.run.requestedStatus;
    }
    updateRunOutput() {
        let firstFragment = true;
        const outputFragment = (...content) => {
            if (firstFragment) {
                firstFragment = false;
            }
            else {
                this.$runOutput.append(` → `);
            }
            this.$runOutput.append(...content);
        };
        if (!this.run) {
            this.$runOutput.replaceChildren(`Select notes for interaction using checkboxes`);
            return;
        }
        this.$runOutput.replaceChildren(this.run.interactionDescription.runningLabel, ` `);
        if (this.run.inputNoteIds.length > 0) {
            outputFragment(`queued `, ...getNoteCountIndicator(this.run.inputNoteIds.length, this.run.interactionDescription.inputNoteStatus));
        }
        else if (this.run.currentNoteId != null) {
            outputFragment(`queue emptied`);
        }
        if (this.run.currentNoteId != null) {
            const $a = getNoteIndicator(this.cx.server.web, this.run.currentNoteId, this.run.interactionDescription.inputNoteStatus);
            if (this.run.currentNoteError) {
                $a.classList.add('error');
                $a.title = this.run.currentNoteError;
                outputFragment(`error on `, $a);
            }
            else {
                outputFragment(`current `, $a);
            }
        }
        if (this.run.outputNoteIds.length > 0) {
            outputFragment(`completed `, ...getNoteCountIndicator(this.run.outputNoteIds.length, this.run.interactionDescription.outputNoteStatus));
        }
    }
    makeRunScheduler($tool) {
        let runTimeoutId;
        const runNextNote = async () => {
            const transitionToRunning = () => {
                this.$commentText.disabled = true;
                this.updateButtons();
                this.updateRunButton();
            };
            const transitionToPaused = () => {
                this.$commentText.disabled = false;
                this.updateWithOutput(); // may have received input notes change
                this.updateButtons();
                this.updateRunButton();
            };
            const transitionToFinished = () => {
                this.$commentText.disabled = false;
                this.$commentText.value = '';
                this.$commentText.dispatchEvent(new Event('input')); // update text controls
                this.updateWithOutput(); // may have received input notes change
                this.updateButtons();
                this.updateRunButton();
                this.updateRunOutput();
            };
            if (!this.run)
                return false;
            if (this.run.status == 'finished') {
                return false;
            }
            else if (this.run.status == 'paused') {
                if (this.run.requestedStatus == 'paused') {
                    return false;
                }
                else if (this.run.requestedStatus == 'running') {
                    this.run.status = 'running';
                    transitionToRunning();
                }
            }
            else if (this.run.status == 'running') {
                if (this.run.requestedStatus == 'paused') {
                    this.run.status = 'paused';
                    transitionToPaused();
                    return false;
                }
            }
            const id = this.run.currentNoteId ?? this.run.inputNoteIds.shift();
            if (id == null) {
                this.run.status = 'finished';
                transitionToFinished();
                return false;
            }
            this.run.currentNoteId = id;
            this.run.currentNoteError = undefined;
            this.updateRunOutput();
            bubbleCustomEvent($tool, 'osmNoteViewer:beforeNoteFetch', id);
            try {
                let response;
                const fetchBuilder = this.cx.server.api.fetch.withToken(this.cx.token).withUrlencodedBody([
                    ['text', this.$commentText.value]
                ]);
                if (this.run.interactionDescription.verb == 'DELETE') {
                    const path = e$3 `notes/${id}.json`;
                    response = await fetchBuilder.delete(path);
                }
                else { // POST
                    const path = e$3 `notes/${id}/${this.run.interactionDescription.endpoint}.json`;
                    response = await fetchBuilder.post(path);
                }
                if (!response.ok) {
                    const contentType = response.headers.get('content-type');
                    if (contentType?.includes('text/plain')) {
                        throw new InteractionError(await response.text());
                    }
                    else {
                        throw new InteractionError(`${response.status} ${response.statusText}`);
                    }
                }
                const noteAndUsers = await readNoteResponse(id, response);
                bubbleCustomEvent($tool, 'osmNoteViewer:noteFetch', noteAndUsers);
                bubbleCustomEvent($tool, 'osmNoteViewer:noteUpdatePush', noteAndUsers);
                this.run.currentNoteId = undefined;
                this.run.outputNoteIds.push(id);
            }
            catch (ex) {
                if (ex instanceof InteractionError) {
                    this.run.currentNoteError = ex.message;
                }
                else if (ex instanceof NoteDataError) {
                    this.run.currentNoteError = `Error after successful interaction: ${ex.message}`;
                }
                else {
                    this.run.currentNoteError = `Unknown error ${ex}`;
                }
                bubbleCustomEvent($tool, 'osmNoteViewer:failedNoteFetch', [id, this.run.currentNoteError]);
                this.run.status = this.run.requestedStatus = 'paused';
                transitionToPaused();
                this.updateRunOutput();
            }
            return true;
        };
        const wrappedRunNextNote = async () => {
            let reschedule = false;
            try {
                reschedule = await runNextNote();
            }
            catch { }
            runTimeoutId = undefined;
            if (reschedule)
                scheduleRunNextNote();
        };
        const scheduleRunNextNote = () => {
            if (runTimeoutId)
                return;
            runTimeoutId = setTimeout(wrappedRunNextNote);
        };
        return scheduleRunNextNote;
    }
    getStagedNoteIdsByStatus() {
        const stagedNoteIdsByStatus = new Map();
        for (const [id, status] of this.stagedNoteIds) {
            const ids = stagedNoteIdsByStatus.get(status) ?? [];
            ids.push(id);
            stagedNoteIdsByStatus.set(status, ids);
        }
        return stagedNoteIdsByStatus;
    }
}
function getLatestChangesetId(data) {
    if (!data || typeof data != 'object' ||
        !('changesets' in data) ||
        !isArray(data.changesets))
        throw new TypeError(`Invalid changesets data`);
    const latestChangesetData = data.changesets[0];
    if (!latestChangesetData)
        throw new TypeError(`No changesets found`);
    if (typeof latestChangesetData != 'object' ||
        !('id' in latestChangesetData) ||
        typeof latestChangesetData.id != 'number')
        throw new TypeError(`Invalid latest changeset data`);
    return latestChangesetData.id;
}
function getParagraphAppend(text, appended) {
    const nTargetNewlines = 2;
    let i = 0;
    for (; i < nTargetNewlines; i++) {
        if ((text[text.length - 1 - i] ?? '\n') != '\n')
            break;
    }
    return '\n'.repeat(nTargetNewlines - i) + appended;
}

class ReportTool extends Tool {
    constructor() {
        super(...arguments);
        this.id = 'report';
        this.name = `Report`;
        this.title = `Report notes on OSM website`;
    }
    getInfo() {
        return [p(makeLink(`Report`, 'https://wiki.openstreetmap.org/wiki/Notes#Reporting_notes'), ` selected notes. `, `Since reporting on the OSM website works for individual notes but here you can select many, you may choose between opening one and several tabs.`), ul(li(`If you choose to open one tab, it's going to report the first selected note. `, `The full list of notes will be copied to clipboard for you to paste into the `, em(`details`), ` input.`), li(`If you choose to open several tabs, each tab will have a report for every individual note you selected. `, `Since it could be many tabs opened at once, there's a confirmation button appearing for more than five selected notes. `, `Additionally the browser may choose to block opening of new tabs if too many are requested.`)), p(`It's also possible to `, makeLink(`report the user`, 'https://wiki.openstreetmap.org/wiki/Report_user'), ` that opened the selected notes, if all of them were opened by the same user. `, `For moderators there's a `, makeLink(`block`, 'https://wiki.openstreetmap.org/wiki/Data_working_group#User_blocks'), ` button. `, `The clipboard is going to contain a list of notes, like when reporting notes.`)];
    }
    getTool($root, $tool) {
        let inputUid;
        let inputUsername;
        let inputNoteIds = [];
        const $tabCountOutput = document.createElement('output');
        const $confirmTabCountOutput = document.createElement('output');
        const e = makeEscapeTag(encodeURIComponent);
        const getNoteReportUrl = (id) => this.cx.server.web.getUrl(e `reports/new?reportable_id=${id}&reportable_type=Note`);
        const getUserReportUrl = (id) => this.cx.server.web.getUrl(e `reports/new?reportable_id=${id}&reportable_type=User`);
        const getUserBlockUrl = (username) => this.cx.server.web.getUrl(e `blocks/new/${username}`);
        const getNoteListItem = (id) => `- ` + this.cx.server.web.getUrl(e `note/${id}`) + `\n`;
        const getNoteList = () => inputNoteIds.map(getNoteListItem).join('');
        const copyNoteList = () => navigator.clipboard.writeText(getNoteList());
        const $reportOneButton = this.makeRequiringSelectedNotesButton();
        const $reportManyButton = this.makeRequiringSelectedNotesButton();
        const $cancelReportManyButton = this.makeRequiringSelectedNotesButton();
        const $confirmReportManyButton = this.makeRequiringSelectedNotesButton();
        const $reportUserButton = document.createElement('button');
        const $blockUserButton = document.createElement('button');
        $reportOneButton.append(`Report `, makeNotesIcon('selected'), ` in one tab`);
        $reportManyButton.append(`Report `, makeNotesIcon('selected'), ` in `, $tabCountOutput);
        $cancelReportManyButton.append(`Cancel reporting `, makeNotesIcon('selected'), ` in `, $confirmTabCountOutput);
        $confirmReportManyButton.append(`Confirm`);
        $reportUserButton.append(`Report opening user`);
        $blockUserButton.append(`Block opening user`);
        $blockUserButton.disabled = $reportUserButton.disabled = true;
        const updateLoginDependents = () => {
            $blockUserButton.hidden = !this.cx.isModerator;
        };
        updateLoginDependents();
        $reportOneButton.onclick = async () => {
            await copyNoteList();
            const id = inputNoteIds[0];
            open(getNoteReportUrl(id));
        };
        const reportManyListener = new ConfirmedButtonListener($reportManyButton, $cancelReportManyButton, $confirmReportManyButton, async () => {
            await copyNoteList();
            for (const id of inputNoteIds) {
                open(getNoteReportUrl(id));
            }
        }, () => inputNoteIds.length > 5);
        $reportUserButton.onclick = async () => {
            if (inputUid == null)
                return;
            await copyNoteList();
            open(getUserReportUrl(inputUid));
        };
        $blockUserButton.onclick = async () => {
            if (inputUsername == null)
                return;
            await copyNoteList();
            open(getUserBlockUrl(inputUsername));
        };
        $root.addEventListener('osmNoteViewer:notesInput', ({ detail: [inputNotes, inputUsers] }) => {
            inputUid = inputNotes[0]?.comments[0]?.uid;
            inputUsername = inputUid ? inputUsers.get(inputUid) : undefined;
            $blockUserButton.disabled = $reportUserButton.disabled = !(inputUid != null && inputNotes.every(note => note.comments[0]?.uid == inputUid));
            inputNoteIds = inputNotes.map(note => note.id);
            const count = inputNotes.length;
            $tabCountOutput.textContent = $confirmTabCountOutput.textContent = `${count} tab${count == 1 ? '' : 's'}`;
            reportManyListener.reset();
            this.ping($tool);
        });
        $root.addEventListener('osmNoteViewer:loginChange', () => {
            updateLoginDependents();
        });
        return [
            $reportOneButton, ` `,
            $reportManyButton, ` `, $cancelReportManyButton, ` `, $confirmReportManyButton, ` `,
            $reportUserButton, ` `, $blockUserButton
        ];
    }
}

const clamp = (min, value, max) => Math.max(min, Math.min(value, max));
class RefreshToolScheduler {
    constructor(isRunning, refreshPeriod, timeoutCaller, reportRefreshWaitProgress, reportUpdate, reportPostpone, reportHalt, fetchSingleNote) {
        this.isRunning = isRunning;
        this.refreshPeriod = refreshPeriod;
        this.timeoutCaller = timeoutCaller;
        this.reportRefreshWaitProgress = reportRefreshWaitProgress;
        this.reportUpdate = reportUpdate;
        this.reportPostpone = reportPostpone;
        this.reportHalt = reportHalt;
        this.fetchSingleNote = fetchSingleNote;
        this.schedule = new Map();
        if (isRunning) {
            this.timeoutCaller.schedulePeriodicCall((timestamp) => this.receiveScheduledCall(timestamp));
        }
    }
    setPeriod(refreshPeriod) {
        this.refreshPeriod = refreshPeriod;
        // TODO update progress bars
    }
    setRunState(isRunning) {
        if (isRunning == this.isRunning)
            return;
        this.isRunning = isRunning;
        if (isRunning) {
            this.timeoutCaller.schedulePeriodicCall((timestamp) => this.receiveScheduledCall(timestamp));
        }
        else {
            this.timeoutCaller.cancelScheduledCall();
        }
    }
    reset() {
        this.schedule.clear();
    }
    refreshAll(alsoRefreshNotesWithRendingUpdate) {
        for (const scheduleEntry of this.schedule.values()) {
            scheduleEntry.needImmediateRefresh = (alsoRefreshNotesWithRendingUpdate ||
                !scheduleEntry.hasPendingUpdate);
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
    replaceNote(id, refreshTimestamp, updateDate) {
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
                if (needImmediateRefresh) {
                    return id;
                }
                if (hasPendingUpdate)
                    continue;
                if (earliestRefreshTimestamp > refreshTimestamp) {
                    earliestRefreshTimestamp = refreshTimestamp;
                    earliestRefreshId = id;
                }
            }
            if (timestamp - earliestRefreshTimestamp >= this.refreshPeriod) {
                return earliestRefreshId;
            }
        };
        let currentId;
        let futureId;
        try {
            reportAllProgress();
            currentId = getNextId();
            if (currentId != null) {
                await this.fetch(timestamp, currentId);
                futureId = getNextId();
            }
        }
        catch (ex) {
            this.isRunning = false;
            let message = `unknown error`;
            if (ex instanceof Error) {
                message = ex.message;
            }
            this.reportHalt(message);
            return;
        }
        if (futureId) {
            this.timeoutCaller.scheduleImmediateCall((timestamp) => this.receiveScheduledCall(timestamp));
        }
        else if (this.isRunning) {
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
        scheduleEntry.refreshTimestamp = timestamp;
        try {
            const [newNote, newUsers] = await this.fetchSingleNote(id);
            const newUpdateDate = getNoteUpdateDate(newNote);
            if (newUpdateDate <= scheduleEntry.updateDate)
                return postpone();
            scheduleEntry.hasPendingUpdate = true;
            this.reportUpdate(newNote, newUsers);
        }
        catch (ex) {
            if (ex instanceof NoteDataError) {
                return postpone(ex.message);
            }
            else {
                throw ex;
            }
        }
    }
}

class RefreshTool extends Tool {
    constructor() {
        super(...arguments);
        this.id = 'refresh';
        this.name = `Refresh`;
        this.title = `Control automatic and manual refreshing of notes`;
    }
    getTool($root, $tool) {
        const $runButton = makeElement('button')('only-with-icon')();
        const $refreshPeriodInput = document.createElement('input');
        const isOnlineAndVisibleAtLaunch = navigator.onLine && document.visibilityState == 'visible';
        let stoppedBecauseOfflineOrHidden = !isOnlineAndVisibleAtLaunch;
        const defaultRefreshPeriodInMinutes = 5;
        const noteRefreshTimestampsById = new Map();
        const notesWithPendingUpdate = new Set();
        const scheduler = new RefreshToolScheduler(isOnlineAndVisibleAtLaunch, defaultRefreshPeriodInMinutes * 60 * 1000, makeTimeoutCaller(10 * 1000, 100), (id, progress) => {
            bubbleCustomEvent($tool, 'osmNoteViewer:noteRefreshWaitProgress', [id, progress]);
        }, (note, users) => {
            if ($refreshSelect.value == 'replace') {
                bubbleCustomEvent($tool, 'osmNoteViewer:noteUpdatePush', [note, users]);
            }
            else {
                notesWithPendingUpdate.add(note.id);
            }
        }, (id, message) => {
            bubbleCustomEvent($tool, 'osmNoteViewer:noteRefreshWaitProgress', [id, 0]);
            const refreshTimestamp = Date.now();
            noteRefreshTimestampsById.set(id, refreshTimestamp);
            return refreshTimestamp;
        }, (message) => {
            updateUiWithState(message);
            this.ping($tool);
        }, async (id) => {
            bubbleCustomEvent($tool, 'osmNoteViewer:beforeNoteFetch', id);
            let note;
            let users;
            try {
                [note, users] = await fetchTableNote(this.cx.server.api, id, this.cx.token);
            }
            catch (ex) {
                bubbleCustomEvent($tool, 'osmNoteViewer:failedNoteFetch', [id, getFetchTableNoteErrorMessage(ex)]);
                throw ex;
            }
            bubbleCustomEvent($tool, 'osmNoteViewer:noteFetch', [note, users]);
            return [note, users];
        });
        const updateUiWithState = (message) => {
            stoppedBecauseOfflineOrHidden = false; // TODO this is not an ui update
            if (message == null) {
                $runButton.classList.remove('error');
                $runButton.title = (scheduler.isRunning ? `Halt` : `Resume`) + ` note auto refreshing`;
            }
            else {
                $runButton.classList.add('error');
                $runButton.title = message;
            }
            $runButton.replaceChildren(scheduler.isRunning
                ? makeActionIcon('pause', `Halt`)
                : makeActionIcon('play', `Resume`));
        };
        const getHaltMessage = () => (!navigator.onLine
            ? `Refreshes halted in offline mode`
            : `Refreshes halted while the browser window is hidden`) + `. Click to attempt to resume.`;
        const $refreshSelect = makeElement('select')()(new Option('report'), new Option('replace'));
        $refreshPeriodInput.type = 'number';
        $refreshPeriodInput.min = '1';
        $refreshPeriodInput.size = 5;
        $refreshPeriodInput.step = 'any';
        $refreshPeriodInput.value = String(defaultRefreshPeriodInMinutes);
        const $refreshAllButton = makeElement('button')('only-with-icon')(makeActionIcon('refresh', `Refresh now`));
        $refreshAllButton.title = `Refresh all notes currently on the screen in the table above`;
        $runButton.onclick = () => {
            scheduler.setRunState(!scheduler.isRunning);
            stoppedBecauseOfflineOrHidden = false;
            updateUiWithState();
        };
        $refreshPeriodInput.oninput = () => {
            const str = $refreshPeriodInput.value;
            if (!str)
                return;
            const minutes = Number(str);
            if (!Number.isFinite(minutes) || minutes <= 0)
                return;
            scheduler.setPeriod(minutes * 60 * 1000);
        };
        $refreshAllButton.onclick = () => {
            scheduler.refreshAll($refreshSelect.value == 'replace');
        };
        $root.addEventListener('osmNoteViewer:newNoteStream', () => {
            scheduler.reset();
            noteRefreshTimestampsById.clear();
            notesWithPendingUpdate.clear();
        });
        $root.addEventListener('osmNoteViewer:notesInViewportChange', ev => {
            const notes = ev.detail;
            const noteRefreshList = [];
            for (const note of notes) {
                const lastRefreshTimestamp = noteRefreshTimestampsById.get(note.id);
                if (!lastRefreshTimestamp)
                    continue;
                noteRefreshList.push([note.id, lastRefreshTimestamp, getNoteUpdateDate(note), notesWithPendingUpdate.has(note.id)]);
            }
            scheduler.observe(noteRefreshList);
        });
        $root.addEventListener('osmNoteViewer:noteRender', ({ detail: note }) => {
            notesWithPendingUpdate.delete(note.id);
            noteRefreshTimestampsById.set(note.id, Date.now());
            scheduler.replaceNote(note.id, Date.now(), getNoteUpdateDate(note));
        });
        if (isOnlineAndVisibleAtLaunch) {
            updateUiWithState();
        }
        else {
            updateUiWithState(getHaltMessage());
        }
        const handleTemporaryHaltConditions = () => {
            if (navigator.onLine && document.visibilityState == 'visible') {
                if (!stoppedBecauseOfflineOrHidden)
                    return;
                stoppedBecauseOfflineOrHidden = false;
                scheduler.setRunState(true);
                updateUiWithState();
            }
            else {
                if (!scheduler.isRunning)
                    return;
                scheduler.setRunState(false);
                updateUiWithState(getHaltMessage());
                stoppedBecauseOfflineOrHidden = true;
            }
        };
        window.addEventListener('offline', handleTemporaryHaltConditions);
        window.addEventListener('online', handleTemporaryHaltConditions);
        document.addEventListener('visibilitychange', handleTemporaryHaltConditions);
        return [
            $runButton, ` `,
            makeLabel('inline')($refreshSelect, ` updated notes`), ` `,
            makeLabel('inline')(`every `, $refreshPeriodInput), ` min. or `,
            $refreshAllButton
        ];
    }
}
function makeTimeoutCaller(periodicCallDelay, immediateCallDelay) {
    let timeoutId;
    const scheduleCall = (delay) => (callback) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => callback(Date.now()), delay);
    };
    return {
        cancelScheduledCall() {
            clearTimeout(timeoutId);
        },
        schedulePeriodicCall: scheduleCall(periodicCallDelay),
        scheduleImmediateCall: scheduleCall(immediateCallDelay),
    };
}

class ParseTool extends Tool {
    constructor() {
        super(...arguments);
        this.id = 'parse';
        this.name = `Parse links`;
        this.title = `Extract interactive links from plaintext`;
    }
    getInfo() {
        return [p(`Parse text as if it's a note comment and get its first active element. If such element exists, it's displayed as a link after →. `, `Currently detected active elements are: `), ul(li(`links to images made in `, makeLink(`StreetComplete`, `https://wiki.openstreetmap.org/wiki/StreetComplete`)), li(`links to OSM notes (clicking the output link is not yet implemented)`), li(`links to OSM changesets`), li(`links to OSM elements`), li(`ISO-formatted timestamps`)), p(`May be useful for displaying an arbitrary OSM element in the map view. Paste the element URL and click the output link.`)];
    }
    getTool() {
        const commentWriter = new CommentWriter(this.cx.server.web);
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

function findClosingChangesetId(targetTimestamp, changesets) {
    let id;
    let distance = Infinity;
    for (const changeset of changesets) {
        if (changeset.closed_at == null)
            continue;
        const changesetTimestamp = Date.parse(changeset.closed_at) / 1000;
        const changesetDistance = (changesetTimestamp > targetTimestamp
            ? (changesetTimestamp - targetTimestamp) * 3
            : (targetTimestamp - changesetTimestamp));
        if (changesetDistance < distance) {
            distance = changesetDistance;
            id = changeset.id;
        }
    }
    return id;
}

const e$2 = makeEscapeTag(encodeURIComponent);
class ChangesetTool extends Tool {
    constructor() {
        super(...arguments);
        this.id = 'changeset';
        this.name = `Changeset`;
        this.title = `Find changesets related to notes`;
    }
    getInfo() {
        return [p(`Try to find a changeset that contains map changes that lead to the note being closed. `, `Works when exactly one note is selected (which you can do by just clicking the note; you don't have to use checkboxes) and it has a closing action performed. `, `Only the first closing action is considered (most of notes don't have more than one). `, `The success is not guaranteed because the contents of changesets is not examined. `, `The current changeset selection rules are:`), ul(li(`first a collection of changesets is retrieved by `, makeLink(`the changeset query`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Query:_GET_/api/0.6/changesets`), ` OSM API call matching the following: `, ul(li(`changeset belongs to the same user who performed the first closing action on the note`), li(`changeset bounding box is within ±0.001° of lat/lon coordinates of the note`), li(`changeset was open within ±24 hours of the closing action`), li(`changeset is closed`))), li(`among these changesets the one closest in time is selected:`, ul(li(`the time difference considered is the one between the changeset closing time and the note closing action`), li(`time after the closing action is weighted 3× so the changesets closed before the action are favored`))))];
    }
    getTool($root, $tool) {
        const getChangesetLink = (changesetId) => {
            if (changesetId == null)
                return `none`;
            const $a = makeLink(`link`, this.cx.server.web.getUrl(e$2 `changeset/${changesetId}`));
            $a.classList.add('listened');
            $a.dataset.changesetId = String(changesetId);
            return $a;
        };
        const $output = makeElement('code')()(getChangesetLink());
        let closingScope;
        let insideRequest = false;
        const $findClosingButton = makeElement('button')()(`Find closing for `, makeNotesIcon('selected'));
        const updateClosingButton = () => {
            $findClosingButton.disabled = insideRequest || !closingScope;
            if (insideRequest) {
                $findClosingButton.setAttribute('role', 'progressbar');
                // $findClosingButton.setAttribute('aria-valuetext',`loading`) // TODO test with screen reader
            }
            else {
                $findClosingButton.removeAttribute('role');
            }
        };
        updateClosingButton();
        $findClosingButton.onclick = async () => {
            if (!closingScope)
                return;
            insideRequest = true;
            $findClosingButton.classList.remove('error');
            $findClosingButton.title = `loading`;
            updateClosingButton();
            try {
                const coordDelta = 0.001;
                const day = 60 * 60 * 24;
                const response = await this.cx.server.api.fetch(e$2 `changesets.json` +
                    `?bbox=${closingScope.lon - coordDelta},${closingScope.lat - coordDelta}` +
                    `,${closingScope.lon + coordDelta},${closingScope.lat + coordDelta}` +
                    `&user=${closingScope.uid}` +
                    `&time=${toUrlDate(closingScope.date - day)},${toUrlDate(closingScope.date + day)}` +
                    `&closed=true`);
                const data = await response.json();
                const changesets = getChangesetsFromOsmApiResponse(data);
                const changesetId = findClosingChangesetId(closingScope.date, changesets);
                $output.replaceChildren(getChangesetLink(changesetId));
                $findClosingButton.title = ``;
            }
            catch (ex) {
                $findClosingButton.classList.add('error');
                $findClosingButton.title = `error`; // TODO message
            }
            finally {
                insideRequest = false;
                updateClosingButton();
            }
        };
        $root.addEventListener('osmNoteViewer:notesInput', ({ detail: [inputNotes] }) => {
            closingScope = undefined;
            if (inputNotes.length == 1) {
                const [note] = inputNotes;
                for (const comment of note.comments) {
                    if (comment.action != 'closed' || comment.uid == null)
                        continue;
                    closingScope = {
                        lat: note.lat,
                        lon: note.lon,
                        uid: comment.uid,
                        date: comment.date,
                    };
                    break;
                }
            }
            updateClosingButton();
            this.ping($tool);
        });
        return [
            $findClosingButton, ` → `, $output
        ];
    }
}

class OverpassBaseTool extends Tool {
    constructor() {
        super(...arguments);
        this.timestamp = '';
    }
    installTimestampListener($root, $tool) {
        $root.addEventListener('osmNoteViewer:timestampChange', ev => {
            this.timestamp = ev.detail;
            this.ping($tool);
        });
    }
    getOverpassQueryPreamble(map) {
        let query = '';
        if (this.timestamp)
            query += `[date:"${this.timestamp}"]\n`;
        query += `[bbox:${map.precisionBounds.swne}]\n`;
        query += `;\n`;
        return query;
    }
}
class OverpassTurboTool extends OverpassBaseTool {
    constructor() {
        super(...arguments);
        this.id = 'overpass-turbo';
        this.name = `Overpass turbo`;
        this.title = `Open an Overpass turbo window with various queries`;
    }
    isActiveWithCurrentServer() {
        return !!this.cx.server.overpassTurbo;
    }
    getInfo() {
        return [p(`Some Overpass queries to run from `, makeLink(`Overpass turbo`, 'https://wiki.openstreetmap.org/wiki/Overpass_turbo'), `, web UI for Overpass API. `, `Useful to inspect historic data at the time a particular note comment was made.`)];
    }
    getTool($root, $tool, map) {
        this.installTimestampListener($root, $tool);
        const $withRelationsCheckbox = makeElement('input')()();
        const $withLandusesCheckbox = makeElement('input')()();
        const buttonClickListener = (onlyAround) => {
            let query = this.getOverpassQueryPreamble(map);
            const types = $withRelationsCheckbox.checked ? `nwr` : `nw`;
            query += types;
            if (onlyAround) {
                const radius = 10;
                query += `(around:${radius},${map.lat},${map.lon})`;
            }
            query += `;\n`;
            if (!$withLandusesCheckbox.checked) {
                query += `${types}._[!landuse];\n`;
            }
            query += `out meta geom;`;
            if (!this.cx.server.overpassTurbo)
                throw new ReferenceError(`no overpass turbo provider`);
            open(this.cx.server.overpassTurbo.getUrl(query, map.lat, map.lon, map.zoom), 'overpass-turbo');
        };
        const $loadAreaButton = makeElement('button')()(`Load `, makeMapIcon('area'));
        const $loadAroundButton = makeElement('button')()(`Load around `, makeMapIcon('center'));
        $withRelationsCheckbox.type = 'checkbox';
        const $withRelationsLabel = makeLabel('inline')($withRelationsCheckbox, ` relations`);
        $withRelationsLabel.title = `May fetch large unwanted relations like routes`;
        $withLandusesCheckbox.type = 'checkbox';
        $withLandusesCheckbox.checked = true;
        const $withLandusesLabel = makeLabel('inline')($withLandusesCheckbox, ` landuses`);
        $withLandusesLabel.title = `Landuses often overlap with smaller objects and make them difficult to select in Overpass turbo`;
        $loadAreaButton.onclick = () => buttonClickListener(false);
        $loadAroundButton.onclick = () => buttonClickListener(true);
        return [
            $loadAreaButton, ` `, $loadAroundButton, ` `,
            `with `, $withRelationsLabel, ` `, $withLandusesLabel
        ];
    }
}
class OverpassTool extends OverpassBaseTool {
    constructor() {
        super(...arguments);
        this.id = 'overpass';
        this.name = `Overpass`;
        this.title = `Run an Overpass query`;
    }
    isActiveWithCurrentServer() {
        return !!this.cx.server.overpass;
    }
    getInfo() {
        return [p(`Query `, makeLink(`Overpass API`, 'https://wiki.openstreetmap.org/wiki/Overpass_API'), ` without going through Overpass turbo. `, `Shows results on the map. Also gives link to the element page on the OSM website.`)];
    }
    getTool($root, $tool, map) {
        this.installTimestampListener($root, $tool);
        const $button = document.createElement('button');
        $button.append(`Find closest node to `, makeMapIcon('center'));
        const $output = document.createElement('code');
        $output.textContent = `none`;
        $button.onclick = () => wrapFetchForButton($button, async () => {
            $output.textContent = `none`;
            const radius = 10;
            let query = this.getOverpassQueryPreamble(map);
            query += `node(around:${radius},${map.lat},${map.lon});\n`;
            query += `out skel;`;
            if (!this.cx.server.overpass)
                throw new ReferenceError(`no overpass provider`);
            const doc = await this.cx.server.overpass.fetch(query);
            const closestNodeId = getClosestNodeId(doc, map.lat, map.lon);
            if (!closestNodeId)
                throw `Could not find nodes nearby`;
            const url = this.cx.server.web.getUrl(`node/` + encodeURIComponent(closestNodeId));
            const $a = makeLink(`link`, url);
            $a.dataset.elementType = 'node';
            $a.dataset.elementId = String(closestNodeId);
            $a.classList.add('listened', 'osm');
            $output.replaceChildren($a);
        }, ex => {
            if (typeof ex == 'string') {
                return ex;
            }
            else if (ex instanceof QueryError) {
                return `Overpass query failed ${ex.reason}`;
            }
            else {
                return `Unknown error ${ex}`;
            }
        });
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

const e$1 = makeEscapeTag(encodeURIComponent);
class EditorTool extends Tool {
    constructor() {
        super(...arguments);
        this.$actOnElementButton = document.createElement('button');
    }
    getTool($root, $tool, map) {
        this.$actOnElementButton.append(`${this.elementAction} OSM element`);
        this.$actOnElementButton.disabled = true;
        this.$actOnElementButton.onclick = () => {
            if (this.inputElement)
                this.doElementAction(map);
        };
        $root.addEventListener('osmNoteViewer:elementLinkClick', ev => {
            const $a = ev.target;
            if (!($a instanceof HTMLAnchorElement))
                return;
            const elementType = $a.dataset.elementType;
            if (elementType != 'node' && elementType != 'way' && elementType != 'relation')
                return false;
            const elementId = $a.dataset.elementId;
            if (!elementId)
                return;
            this.inputElement = `${elementType[0]}${elementId}`;
            this.$actOnElementButton.disabled = false;
            this.$actOnElementButton.textContent = `${this.elementAction} ${this.inputElement}`;
        });
        return [...this.getSpecificControls($root, $tool, map), ` `, this.$actOnElementButton];
    }
}
class RcTool extends EditorTool {
    constructor() {
        super(...arguments);
        this.id = 'rc';
        this.name = `RC`;
        this.title = `Run remote control commands in external editors (usually JOSM)`;
        this.elementAction = `Load`;
    }
    getInfo() {
        return [p(`Load note/map data to an editor with `, makeLink(`remote control`, 'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl'), `.`), ul(li(`Notes are loaded by `, makeRcCommandLink(`import`), ` RC command `, `with note webpage the OSM website as the `, code(`url`), ` parameter.`), li(`Map area is loaded by `, makeRcCommandLink(`load_and_zoom`), ` RC command. `, `Area loading is also used as an opportunity to set the default changeset source and comment containing note ids using the `, code(`changeset_tags`), ` parameter.`), li(`OSM elements are loaded by `, makeRcCommandLink(`load_object`), ` RC command. The button is enabled after the element link is clicked in some note comment.`))];
    }
    getSpecificControls($root, $tool, map) {
        let inputNotes = [];
        const $loadNotesButton = this.makeRequiringSelectedNotesButton();
        $loadNotesButton.append(`Load `, makeNotesIcon('selected'));
        $loadNotesButton.onclick = async () => {
            for (const { id } of inputNotes) {
                const noteUrl = this.cx.server.web.getUrl(e$1 `note/${id}`);
                const rcPath = e$1 `import?url=${noteUrl}`;
                const success = await openRcPath($loadNotesButton, rcPath);
                if (!success)
                    break;
            }
        };
        const $loadMapButton = document.createElement('button');
        $loadMapButton.append(`Load `, makeMapIcon('area'));
        $loadMapButton.onclick = () => {
            const bounds = map.bounds;
            let rcPath = e$1 `load_and_zoom` +
                `?left=${bounds.getWest()}&right=${bounds.getEast()}` +
                `&top=${bounds.getNorth()}&bottom=${bounds.getSouth()}`;
            if (inputNotes.length >= 1) {
                const maxTagLength = 255;
                const changesetCommentJoiner = ` - `;
                const combinedNoteComment = combineNoteComments(inputNotes);
                const listedNoteIdsComment = convertDecoratedNoteIdsToPlainText(listDecoratedNoteIds(inputNotes.map(note => note.id)), maxTagLength - (combinedNoteComment.length + changesetCommentJoiner.length));
                const changesetCommentParts = [];
                if (combinedNoteComment)
                    changesetCommentParts.push(combinedNoteComment);
                if (listedNoteIdsComment)
                    changesetCommentParts.push(listedNoteIdsComment);
                const changesetComment = changesetCommentParts.join(changesetCommentJoiner);
                const changesetTags = `source=notes|comment=${changesetComment}`;
                rcPath += e$1 `&changeset_tags=${changesetTags}`;
            }
            openRcPath($loadMapButton, rcPath);
        };
        $root.addEventListener('osmNoteViewer:notesInput', ev => {
            [inputNotes] = ev.detail;
            this.ping($tool);
        });
        return [$loadNotesButton, ` `, $loadMapButton];
    }
    doElementAction() {
        const rcPath = e$1 `load_object?objects=${this.inputElement}`;
        openRcPath(this.$actOnElementButton, rcPath);
    }
}
class IdTool extends EditorTool {
    constructor() {
        super(...arguments);
        this.id = 'id';
        this.name = `iD`;
        this.title = `Open an iD editor window`;
        this.elementAction = `Select`;
    }
    getInfo() {
        return [p(`Follow your notes by zooming from one place to another in one `, makeLink(`iD editor`, 'https://wiki.openstreetmap.org/wiki/ID'), ` window. `, `It could be faster to do first here in note-viewer than in iD directly because note-viewer won't try to download more data during panning. `, `After zooming in note-viewer, click the `, em(`Open`), ` button to open this location in iD. `, `When you go back to note-viewer, zoom to another place and click the `, em(`Open`), ` button for the second time, the already opened iD instance zooms to that place. `, `Your edits are not lost between such zooms.`), p(`Technical details: this is an attempt to make something like `, em(`remote control`), ` in iD editor. `, `Convincing iD to load notes has proven to be tricky. `, `Your best chance of seeing the selected notes is importing them as a `, em(`gpx`), ` file. `, `See `, makeLink(`this diary post`, `https://www.openstreetmap.org/user/Anton%20Khorev/diary/398991`), ` for further explanations.`), p(`Zooming/panning is easier to do, and that's what is currently implemented. `, `It's not without quirks however. You'll notice that the iD window opened from here doesn't have the OSM website header. `, `This is because the editor is opened at `, code(makeLink(`/id`, `https://www.openstreetmap.org/id`)), ` url instead of `, code(makeLink(`/edit`, `https://www.openstreetmap.org/edit`)), `. `, `It has to be done because otherwise iD won't listen to `, code(`#map`), ` changes in the webpage location.`), p(`There's also the `, em(`Select element`), ` button, but it's not guaranteed to work every time. `, `There is a way to open a new iD window and have a selected element in it for sure by using `, code(`edit?type=id`), `. `, `When working with existing window however, things work differently. `, `Selecting an element by using the `, code(`id`), ` hash parameter also requires the `, code(`map`), ` parameter, otherwise it's ignored. `, `There's no way for note-viewer to know iD's current map view location because of cross-origin restrictions, so note-viewer's own map location is passed as `, code(`map`), `. `, `Selecting won't work if the element is not already loaded. `, `Therefore when you press the `, em(`Select element`), ` button on a new location, it likely won't select the element because the element is not yet loaded.`)];
    }
    getSpecificControls($root, $tool, map) {
        // limited to what hashchange() lets you do here https://github.com/openstreetmap/iD/blob/develop/modules/behavior/hash.js
        // which is zooming / panning / selecting osm elements
        // selecting requires map parameter set
        const $zoomButton = document.createElement('button');
        $zoomButton.append(`Open `, makeMapIcon('center'));
        $zoomButton.onclick = () => {
            const url = this.cx.server.web.getUrl(e$1 `id#map=${map.zoom}/${map.lat}/${map.lon}`);
            open(url, 'id');
        };
        return [$zoomButton];
    }
    doElementAction(map) {
        const url = this.cx.server.web.getUrl(e$1 `id#id=${this.inputElement}&map=${map.zoom}/${map.lat}/${map.lon}`);
        open(url, 'id');
    }
}
function makeRcCommandLink(command) {
    return code(makeLink(command, `https://josm.openstreetmap.de/wiki/Help/RemoteControlCommands#${command}`));
}
async function openRcPath($button, rcPath) {
    const rcUrl = `http://127.0.0.1:8111/` + rcPath;
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
function combineNoteComments(inputNotes) {
    const maxNoteCommentLength = 100;
    const visitedNoteComments = new Set();
    let combinedNoteComments = '';
    for (const note of inputNotes) {
        if (note.comments.length == 0)
            continue;
        const [comment] = note.comments[0].text.split('\n', 1);
        if (comment.length == 0)
            continue;
        if (comment.length > maxNoteCommentLength)
            break;
        if (visitedNoteComments.has(comment))
            continue;
        if (combinedNoteComments)
            combinedNoteComments += `, `;
        combinedNoteComments += comment;
        if (combinedNoteComments.length > maxNoteCommentLength) {
            return '';
        }
        visitedNoteComments.add(comment);
    }
    return combinedNoteComments;
}

class ExportTool extends Tool {
    constructor() {
        super(...arguments);
        this.inputNotes = [];
        this.inputNoteUsers = new Map();
    }
    getInfo() {
        return [
            ...this.getInfoWithoutDragAndDrop(),
            p(`Instead of clicking the `, em(`Export`), ` button, you can drag it and drop into a place that accepts data sent by `, makeLink(`Drag and Drop API`, `https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API`), `. `, `Not many places actually do, and those who do often can handle only plaintext. `, `That's why there's a type selector, with which plaintext format can be forced on transmitted data.`)
        ];
    }
    getTool($root, $tool) {
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
            const data = this.generateData(this.cx.server, getOptionValues());
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
            const data = this.generateData(this.cx.server, getOptionValues());
            if (!ev.dataTransfer)
                return;
            ev.dataTransfer.setData($dataTypeSelect.value, data);
        };
        $root.addEventListener('osmNoteViewer:notesInput', ev => {
            const [inputNotes, inputNoteUsers] = ev.detail;
            this.inputNotes = inputNotes;
            this.inputNoteUsers = inputNoteUsers;
            this.ping($tool);
        });
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
                const username = this.inputNoteUsers.get(comment.uid);
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
        super(...arguments);
        this.id = 'gpx';
        this.name = `GPX`;
        this.title = `Export selected notes to a .gpx file`;
    }
    getInfoWithoutDragAndDrop() {
        return [p(`Export selected notes in `, makeLink(`GPX`, 'https://wiki.openstreetmap.org/wiki/GPX'), ` (GPS exchange) format. `, `During the export, each selected note is treated as a waypoint with its name set to note id, description set to comments and link pointing to note's page on the OSM website. `, `This allows OSM notes to be used in applications that can't show them directly. `, `Also it allows a particular selection of notes to be shown if an application can't filter them. `, `One example of such app is `, makeLink(`iD editor`, 'https://wiki.openstreetmap.org/wiki/ID'), `. `, `Unfortunately iD doesn't fully understand the gpx format and can't show links associated with waypoints. `, `You'll have to enable the notes layer in iD and compare its note marker with waypoint markers from the gpx file.`), p(`By default only the `, dfn(`first comment`), ` is added to waypoint descriptions. `, `This is because some apps such as iD and especially `, makeLink(`JOSM`, `https://wiki.openstreetmap.org/wiki/JOSM`), ` try to render the entire description in one line next to the waypoint marker, cluttering the map.`), p(`It's possible to pretend that note waypoints are connected by a `, makeLink(`route`, `https://www.topografix.com/GPX/1/1/#type_rteType`), ` by using the `, dfn(`connected by route`), ` option. `, `This may help to go from a note to the next one in an app by visually following the route line. `, `There's also the `, dfn(`connected by track`), ` option in case the app makes it easier to work with `, makeLink(`tracks`, `https://www.topografix.com/GPX/1/1/#type_trkType`), ` than with the routes.`)];
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
            for (const note of this.inputNotes) {
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
            const noteUrl = server.web.getUrl(`note/` + encodeURIComponent(note.id));
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
        super(...arguments);
        this.id = 'geojson';
        this.name = `GeoJSON`;
        this.title = `Export selected notes to a .geojson file`;
    }
    getInfoWithoutDragAndDrop() {
        return [p(`Export selected notes in `, makeLink(`GeoJSON`, 'https://wiki.openstreetmap.org/wiki/GeoJSON'), ` format. `, `The exact features and properties exported are made to be close to OSM API `, code(`.json`), ` output:`), ul(li(`the entire note collection is represented as a `, makeLink(`FeatureCollection`, 'https://www.rfc-editor.org/rfc/rfc7946.html#section-3.3')), li(`each note is represented as a `, makeLink(`Point`, 'https://www.rfc-editor.org/rfc/rfc7946.html#section-3.1.2'), ` `, makeLink(`Feature`, 'https://www.rfc-editor.org/rfc/rfc7946.html#section-3.2'))), p(`There are few differences to OSM API output, not including modifications using tool options described later:`), ul(li(`comments don't have `, code(`html`), ` property, their content is available only as plaintext`), li(`dates may be incorrect in case of hidden note comments (something that happens very rarely)`)), p(`Like GPX exports, this tool allows OSM notes to be used in applications that can't show them directly. `, `Also it allows a particular selection of notes to be shown if an application can't filter them. `, `One example of such app is `, makeLink(`iD editor`, 'https://wiki.openstreetmap.org/wiki/ID'), `. `, `Given that GeoJSON specification doesn't define what goes into feature properties, the support for rendering notes this way is lower than the one of GPX export. `, `Particularly neither iD nor JOSM seem to render any labels for note markers. `, `Also clicking the marker in JOSM is not going to open the note webpage. `, `On the other hand there's more clarity about how to to display properties outside of the editor map view. `, `All of the properties are displayed like `, makeLink(`OSM tags`, 'https://wiki.openstreetmap.org/wiki/Tags'), `, which opens some possibilities: `), ul(li(`properties are editable in JOSM with a possibility to save results to a file`), li(`it's possible to access the note URL in iD, something that was impossible with GPX format`)), p(`While accessing the URLs, note that they are OSM API URLs, not the website URLs you might expect. `, `This is how OSM API outputs them. `, `Since that might be inconvenient, there's an `, dfn(`OSM website URLs`), ` option. `, `With it you're able to select the note url in iD by triple-clicking its value.`), p(`Another consequence of displaying properties like tags is that they work best when they are strings. `, `OSM tags are strings, and that's what editors expect to display in their tag views. `, `When used for properties of notes, there's one non-string property: `, em(`comments`), `. `, `iD is unable to display it. `, `If you want to force comments to be represented by strings, like in GPX exports, there's an options for that. `, `There's also option to output each comment as a separate property, making it easier to see them all in the tags table.`), p(`It's possible to pretend that note points are connected by a `, makeLink(`LineString`, `https://www.rfc-editor.org/rfc/rfc7946.html#section-3.1.4`), ` by using the `, dfn(`connected by line`), ` option. `, `This may help to go from a note to the next one in an app by visually following the route line. `, `However, enabling the line makes it difficult to click on note points in iD.`)];
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
            const username = this.inputNoteUsers.get(comment.uid);
            if (username == null)
                return result;
            result.user = username;
            if (options.urls == 'web') {
                result.user_url = server.web.getUrl(e `user/${username}`);
            }
            else {
                result.user_url = server.api.getRootUrl(e `user/${username}`);
            }
            return result;
        };
        const generateNoteUrls = (note) => {
            if (options.urls == 'web')
                return {
                    url: server.web.getUrl(e `note/${note.id}`)
                };
            const apiBasePath = e `notes/${note.id}`;
            const result = {
                url: server.api.getUrl(apiBasePath + `.json`)
            };
            if (note.status == 'closed') {
                result.reopen_url = server.api.getUrl(apiBasePath + `/reopen.json`);
            }
            else {
                result.comment_url = server.api.getUrl(apiBasePath + `/comment.json`);
                result.close_url = server.api.getUrl(apiBasePath + `/close.json`);
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
        const features = this.inputNotes.map(note => ({
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
        if (options.connect == 'line' && this.inputNotes.length > 1) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: this.inputNotes.map(note => [note.lon, note.lat]),
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

class StreetViewTool extends Tool {
    isActiveWithCurrentServer() {
        return this.cx.server.world == 'earth';
    }
    getTool($root, $tool, map) {
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
        super(...arguments);
        this.id = 'yandex-panoramas';
        this.name = `Y.Panoramas`;
        this.title = `Open a Yandex.Panoramas (Яндекс.Панорамы) window`;
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
        super(...arguments);
        this.id = 'mapillary';
        this.name = `Mapillary`;
        this.title = `Open a Mapillary window`;
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
    InteractTool, ReportTool, RefreshTool,
    AutozoomTool, TimestampTool, ParseTool,
    ChangesetTool, OverpassTurboTool, OverpassTool,
    RcTool, IdTool,
    GpxTool, GeoJsonTool,
    YandexPanoramasTool, MapillaryTool,
    CountTool, LegendTool
].map(ToolClass => (cx) => new ToolClass(cx));

class ToolPanel {
    constructor($root, $toolbar, storage, cx, map) {
        const tools = [];
        for (const makeTool of toolMakerSequence) {
            const tool = makeTool(cx);
            const storageKey = `tools[${tool.id}]`;
            const [$tool, $info] = tool.write($root, map);
            if ($tool) {
                const toolState = storage.getItem(storageKey);
                $tool.open = toolState == '1';
                $tool.hidden = toolState == null;
                $tool.addEventListener('toggle', () => {
                    storage.setItem(storageKey, $tool.open ? '1' : '0');
                });
                $toolbar.append($tool);
                if ($info) {
                    $toolbar.append($info);
                }
            }
            tools.push([tool, $tool, $info]);
        }
        const $settingsDialog = makeSettingsDialog(tools, storage);
        $root.append($settingsDialog);
        const $settingsButton = makeElement('button')('settings')(`⚙️`);
        $settingsButton.title = `Toolbar settings`;
        $settingsButton.onclick = () => {
            $settingsDialog.showModal();
        };
        $toolbar.append($settingsButton);
    }
}
function makeSettingsDialog(toolsWithDetails, storage) {
    const toolsWithDetailsAndCheckboxes = toolsWithDetails.map((twd) => {
        const [tool] = twd;
        const storageKey = `tools[${tool.id}]`;
        const $checkbox = makeElement('input')()();
        $checkbox.type = 'checkbox';
        $checkbox.checked = storage.getItem(storageKey) != null;
        return [...twd, $checkbox];
    });
    const toggleTool = (...[tool, $tool, $info, $checkbox]) => {
        const storageKey = `tools[${tool.id}]`;
        if ($checkbox.checked) {
            if ($tool)
                $tool.hidden = false;
            if ($tool)
                $tool.open = false;
            storage.setItem(storageKey, '0');
        }
        else {
            if ($tool)
                $tool.hidden = true;
            if ($info)
                $info.open = false;
            storage.removeItem(storageKey);
        }
    };
    const $dialog = makeElement('dialog')('help')();
    const $closeButton = makeElement('button')('close')();
    $closeButton.title = `Close toolbar settings`;
    $closeButton.innerHTML = `<svg><use href="#reset" /></svg>`;
    $closeButton.onclick = () => {
        $dialog.close();
    };
    const makeAllToolsListener = (open) => () => {
        for (const [, $tool] of toolsWithDetailsAndCheckboxes) {
            if (!$tool)
                continue;
            $tool.open = open;
        }
    };
    const $openAllButton = makeElement('button')('open-all-tools')(`Open all enabled tools`);
    $openAllButton.onclick = makeAllToolsListener(true);
    const $closeAllButton = makeElement('button')('close-all-tools')(`Close all enabled tools`);
    $closeAllButton.onclick = makeAllToolsListener(false);
    const $allCheckbox = makeElement('input')()();
    $allCheckbox.type = 'checkbox';
    const updateAllCheckbox = () => {
        let hasChecked = false;
        let hasUnchecked = false;
        for (const [, , , $checkbox] of toolsWithDetailsAndCheckboxes) {
            if ($checkbox.checked) {
                hasChecked = true;
            }
            else {
                hasUnchecked = true;
            }
        }
        $allCheckbox.indeterminate = hasChecked && hasUnchecked;
        $allCheckbox.checked = hasChecked && !hasUnchecked;
    };
    $dialog.append($closeButton, makeElement('h2')()(`Toolbar settings`), makeDiv('major-input-group', 'all-tools')(makeLabel()($allCheckbox, ` Show/hide all tools`)));
    for (const [tool, $tool, $info, $checkbox] of toolsWithDetailsAndCheckboxes) {
        const getToolName = () => {
            if ($tool) {
                const $name = makeElement('span')()(tool.name);
                if (tool.title != null)
                    $name.title = tool.title;
                return $name;
            }
            else {
                const $name = makeElement('s')()(tool.name);
                $name.title = `incompatible with current server`;
                return $name;
            }
        };
        $checkbox.oninput = () => {
            toggleTool(tool, $tool, $info, $checkbox);
            updateAllCheckbox();
        };
        $dialog.append(makeDiv('regular-input-group')(makeLabel()($checkbox, ` `, getToolName())));
    }
    updateAllCheckbox();
    $allCheckbox.oninput = () => {
        $allCheckbox.indeterminate = false;
        for (const [tool, $tool, $info, $checkbox] of toolsWithDetailsAndCheckboxes) {
            if ($checkbox.checked == $allCheckbox.checked)
                continue;
            $checkbox.checked = $allCheckbox.checked;
            toggleTool(tool, $tool, $info, $checkbox);
        }
    };
    $dialog.append(makeDiv('major-input-group')($openAllButton, $closeAllButton));
    return $dialog;
}

function getAdiffFromDocument(changeset, doc) {
    const node = {};
    const way = {};
    const changedNodeIds = new Set();
    for (const actionDocElement of doc.querySelectorAll('action')) {
        const actionType = actionDocElement.getAttribute('type');
        if (actionType == 'create') {
            const element = doesElementMatchChangeset(changeset, changedNodeIds, actionDocElement);
            if (element) {
                if (element.type == 'node') {
                    node[element.id] = {
                        action: actionType,
                        newElement: element
                    };
                }
                else if (element.type == 'way') {
                    way[element.id] = {
                        action: actionType,
                        newElement: element
                    };
                }
            }
        }
        else if (actionType == 'modify') {
            const elements = doesNewElementMatchChangeset(changeset, changedNodeIds, actionDocElement);
            if (elements) {
                const [oldElement, newElement] = elements;
                if (oldElement.type == 'node' && newElement.type == 'node') {
                    node[newElement.id] = {
                        action: actionType,
                        oldElement, newElement
                    };
                }
                else if (oldElement.type == 'way' && newElement.type == 'way') {
                    way[newElement.id] = {
                        action: actionType,
                        oldElement, newElement
                    };
                }
            }
        }
        else if (actionType == 'delete') {
            const elements = doesNewElementMatchChangeset(changeset, changedNodeIds, actionDocElement);
            if (elements) {
                const [oldElement, newElement] = elements;
                if (oldElement.type == 'node' && newElement.type == 'node') {
                    node[newElement.id] = {
                        action: actionType,
                        oldElement, newElement
                    };
                }
                else if (oldElement.type == 'way' && newElement.type == 'way') {
                    way[newElement.id] = {
                        action: actionType,
                        oldElement, newElement
                    };
                }
            }
        }
    }
    return { node, way };
}
function doesElementMatchChangeset(changeset, changedNodeIds, parent) {
    const docElement = parent.firstElementChild;
    if (!docElement)
        throw new TypeError(`Overpass error: missing element`);
    const element = readAdiffElement(docElement);
    if (!isElementMatchesChangeset(changeset, changedNodeIds, element))
        return null;
    return element;
}
function doesNewElementMatchChangeset(changeset, changedNodeIds, parent) {
    const [oldChild, newChild] = getOldAndNewChildren(parent);
    if (!oldChild || !newChild)
        throw new TypeError(`Overpass error: missing element`);
    const oldDocElement = oldChild.firstElementChild;
    const newDocElement = newChild.firstElementChild;
    if (!oldDocElement || !newDocElement)
        throw new TypeError(`Overpass error: missing element`);
    const oldElement = readAdiffElement(oldDocElement);
    const newElement = readAdiffElement(newDocElement);
    if (!isElementMatchesChangeset(changeset, changedNodeIds, newElement))
        return null;
    if (oldElement.type == 'node' && newElement.type == 'node') {
        return [oldElement, newElement];
    }
    else if (oldElement.type == 'way' && newElement.type == 'way') {
        return [oldElement, newElement];
    }
    else {
        throw new TypeError(`Overpass error: unexpected element type change`);
    }
}
function getOldAndNewChildren(parent) {
    let oldChild;
    let newChild;
    for (const oldOrNewChild of parent.children) {
        if (oldOrNewChild.tagName == 'old') {
            oldChild = oldOrNewChild;
        }
        else if (oldOrNewChild.tagName == 'new') {
            newChild = oldOrNewChild;
        }
    }
    return [oldChild, newChild];
}
function isElementMatchesChangeset(changeset, changedNodeIds, element) {
    const changesetIdMatched = element.changeset == changeset.id;
    if (element.type == 'node') {
        if (changesetIdMatched) {
            changedNodeIds.add(element.id);
        }
    }
    else if (element.type == 'way' && element.visible) {
        if (!changesetIdMatched) {
            for (const [ref] of element.nodeRefs) {
                if (changedNodeIds.has(ref))
                    return true;
            }
        }
    }
    return changesetIdMatched;
}
function readAdiffElement(docElement) {
    const readAttribute = (k, e = docElement) => {
        const v = e.getAttribute(k);
        if (v == null)
            throw new TypeError(`Overpass error: missing element ${k}`);
        return v;
    };
    const readNumberAttribute = (k, e = docElement) => {
        const v = Number(readAttribute(k, e));
        if (isNaN(v))
            throw new TypeError(`Overpass error: invalid element ${k}`);
        return v;
    };
    const id = readNumberAttribute('id');
    const version = readNumberAttribute('version');
    const timestamp = readAttribute('timestamp');
    const changeset = readNumberAttribute('changeset');
    const uid = readNumberAttribute('uid');
    const user = readAttribute('user');
    const type = docElement.tagName;
    const visible = docElement.getAttribute('visible') != 'false';
    if (!visible) {
        if (type == 'node' || type == 'way') {
            return {
                type, id, version, timestamp, changeset, uid, user, visible
            };
        }
    }
    else {
        let tags;
        for (const tagDocElement of docElement.querySelectorAll('tag')) {
            if (!tags)
                tags = {};
            const k = readAttribute('k', tagDocElement);
            const v = readAttribute('v', tagDocElement);
            tags[k] = v;
        }
        if (type == 'node') {
            const lat = readNumberAttribute('lat');
            const lon = readNumberAttribute('lon');
            return {
                type, id, version, timestamp, changeset, uid, user, visible, tags,
                lat, lon
            };
        }
        else if (type == 'way') {
            const nodeRefs = [];
            for (const nodeRefDocElement of docElement.querySelectorAll('nd')) {
                const ref = readNumberAttribute('ref', nodeRefDocElement);
                const lat = readNumberAttribute('lat', nodeRefDocElement);
                const lon = readNumberAttribute('lon', nodeRefDocElement);
                nodeRefs.push([ref, lat, lon]);
            }
            return {
                type, id, version, timestamp, changeset, uid, user, visible, tags,
                nodeRefs
            };
        }
    }
    throw new TypeError(`Overpass error: unexpected element type "${docElement.tagName}"`);
}

const e = makeEscapeTag(encodeURIComponent);
class OsmDownloader {
    constructor($root, server) {
        let abortController;
        const handleOsmDownloadAndLink = async ($a, path, type, handleResponse) => {
            $a.classList.add('loading'); // TODO aria
            if (abortController)
                abortController.abort();
            abortController = new AbortController();
            try {
                const response = await server.api.fetch(path, { signal: abortController.signal });
                if (!response.ok) {
                    if (response.status == 404) {
                        throw new TypeError(`${type} doesn't exist`);
                    }
                    else if (response.status == 410) {
                        throw new TypeError(`${type} was deleted`);
                    }
                    else {
                        throw new TypeError(`OSM API error: unsuccessful response`);
                    }
                }
                await handleResponse(response);
                $a.classList.remove('absent');
                $a.title = '';
            }
            catch (ex) {
                // TODO maybe fail or clear event
                if (ex instanceof DOMException && ex.name == 'AbortError') {
                    return;
                }
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
        };
        $root.addEventListener('osmNoteViewer:changesetLinkClick', async (ev) => {
            const $a = ev.target;
            if (!($a instanceof HTMLAnchorElement))
                return;
            const changesetId = $a.dataset.changesetId;
            if (!changesetId)
                return;
            await handleOsmDownloadAndLink($a, e `changeset/${changesetId}.json`, `changeset`, async (response) => {
                const data = await response.json();
                const changeset = getChangesetFromOsmApiResponse(data);
                if (!hasBbox(changeset))
                    throw new TypeError(`changeset is empty`);
                if ($a.dataset.adiff) {
                    if (!server.overpass)
                        throw new TypeError(`no overpass provider`);
                    const query = makeAdiffQueryPreamble(changeset) +
                        `(node(changed);way(changed););\n` +
                        `out meta geom;`;
                    const doc = await server.overpass.fetch(query); // TODO also pump through handleOsmDownloadAndLink()
                    const adiff = getAdiffFromDocument(changeset, doc);
                    bubbleCustomEvent($root, 'osmNoteViewer:changesetAdiffRender', [changeset, adiff]);
                }
                else {
                    bubbleCustomEvent($root, 'osmNoteViewer:changesetRender', changeset);
                }
            });
        });
        $root.addEventListener('osmNoteViewer:elementLinkClick', async (ev) => {
            const $a = ev.target;
            if (!($a instanceof HTMLAnchorElement))
                return;
            const elementType = $a.dataset.elementType;
            if (elementType != 'node' && elementType != 'way' && elementType != 'relation')
                return false;
            const elementId = $a.dataset.elementId;
            if (!elementId)
                return;
            const fullBit = (elementType == 'node' ? '' : '/full');
            handleOsmDownloadAndLink($a, e `${elementType}/${elementId}` + `${fullBit}.json`, `element`, async (response) => {
                const data = await response.json();
                const elements = getElementsFromOsmApiResponse(data);
                const element = elements[elementType][elementId];
                if (!element)
                    throw new TypeError(`OSM API error: requested element not found in response data`);
                bubbleCustomEvent($root, 'osmNoteViewer:elementRender', [element, elements]);
            });
        });
    }
}
/**
 * Make augmented diff overpass query preamble for changeset.
 *
 * Time range is (created_at - 1 second) .. (closed_at if closed).
 * Similar to what achavi does, see https://github.com/nrenner/achavi/blob/9934871777b6e744d21bb2f22b112d386bcd9d30/js/map.js#L261
 */
function makeAdiffQueryPreamble(changeset) {
    const startDate = toUrlDate(Date.parse(changeset.created_at) / 1000 - 1, '-', ':');
    const endPart = changeset.closed_at != null ? `,"${changeset.closed_at}"` : ``;
    const swneBounds = (changeset.minlat + ',' + changeset.minlon + ',' +
        changeset.maxlat + ',' + changeset.maxlon);
    return (`[adiff:"${startDate}"${endPart}]\n` +
        `[bbox:${swneBounds}]\n` +
        `;\n`);
}

const units = [
    [1, 'second'],
    [60, 'minute'],
    [60 * 60, 'hour'],
    [60 * 60 * 24, 'day'],
    [60 * 60 * 24 * 7, 'week'],
    [60 * 60 * 24 * 30, 'month'],
    [60 * 60 * 24 * 365, 'year'],
];
const relativeTimeFormat = new Intl.RelativeTimeFormat('en');
function listener(ev) {
    if (!(ev.target instanceof Element))
        return;
    let $time;
    if (ev.target instanceof HTMLTimeElement) {
        $time = ev.target;
    }
    else if (ev.target.parentElement instanceof HTMLTimeElement) { // target is <span> inside <time>
        $time = ev.target.parentElement;
    }
    else {
        return;
    }
    if (!$time.dateTime)
        return;
    const readableTime = $time.dateTime.replace('T', ' ').replace('Z', ' UTC');
    const t1ms = Date.parse($time.dateTime);
    const t2ms = Date.now();
    let relativeTime = 'just now';
    for (const [duration, name] of units) {
        if (t2ms - t1ms < duration * 1500)
            break;
        const timeDifferenceInUnits = Math.round((t1ms - t2ms) / (duration * 1000));
        relativeTime = relativeTimeFormat.format(timeDifferenceInUnits, name);
    }
    $time.title = `${readableTime}, ${relativeTime}`;
}
class TimeTitleUpdater {
    constructor($root) {
        $root.addEventListener('mouseover', listener);
        $root.addEventListener('focusin', listener);
    }
}

var serverListConfig = [
    {
        "web": [
            "https://www.openstreetmap.org/",
            "https://openstreetmap.org/",
            "https://www.osm.org/",
            "https://osm.org/"
        ],
        "api": "https://api.openstreetmap.org/",
        "nominatim": "https://nominatim.openstreetmap.org/",
        "overpass": "https://www.overpass-api.de/",
        "overpassTurbo": "https://overpass-turbo.eu/",
        "tiles": {
            "template": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            "attribution": "OpenStreetMap contributors"
        },
        "note": "main OSM server",
        "oauth": {
            "id": "hRPFdI68dfFi2ucLe8Nt8y6rBM4uwTwIzNioi1EuTms",
            "url": "https://antonkhorev.github.io/osm-note-viewer/"
        }
    },
    {
        "web": "https://master.apis.dev.openstreetmap.org/",
        "note": [
            "OSM sandbox/development server",
            "https://wiki.openstreetmap.org/wiki/Sandbox_for_editing#Experiment_with_the_API_(advanced)"
        ],
        "oauth": {
            "id": "KiQpJiwp0njkF3Y172lIpX2bzru4C98nH8y6FZcBir8",
            "url": "https://antonkhorev.github.io/osm-note-viewer/"
        }
    },
    {
        "web": [
            "https://www.openhistoricalmap.org/",
            "https://openhistoricalmap.org/"
        ],
        "nominatim": "https://nominatim.openhistoricalmap.org/",
        "overpass": "https://overpass-api.openhistoricalmap.org/",
        "overpassTurbo": "https://openhistoricalmap.github.io/overpass-turbo/",
        "oauth": {
            "id": "pEMqG7m8YHHEfqRfctwQecseI1TYm1toHAAoRPzCPMw",
            "url": "https://antonkhorev.github.io/osm-note-viewer/"
        }
    },
    {
        "web": "https://opengeofiction.net/",
        "tiles": {
            "template": "https://tiles04.rent-a-planet.com/ogf-carto/{z}/{x}/{y}.png",
            "attribution": "OpenGeofiction and contributors"
        },
        "overpass": "https://overpass.ogf.rent-a-planet.com/",
        "overpassTurbo": "https://turbo.ogf.rent-a-planet.com/",
        "world": "opengeofiction",
        "oauth": {
            "id": "q7AADWIuLnof-YIo5J6ht31jB73jFNPPp6LreINnwQs",
            "url": "https://antonkhorev.github.io/osm-note-viewer/"
        }
    },
    {
        "web": "https://fosm.org/",
        "tiles": {
            "template": "https://map.fosm.org/default/{z}/{x}/{y}.png",
            "attribution": "https://fosm.org/",
            "zoom": 18
        },
        "note": "mostly useless here because notes are not implemented on this server"
    },
    {
        "web": "http://127.0.0.1:3000/",
        "note": "default local rails dev server"
    }
];

main();
async function main() {
    if (checkAuthRedirect(`osm-note-viewer`)) {
        return;
    }
    const $root = makeDiv('ui')();
    document.body.append($root);
    new GlobalEventListener($root);
    const storage = new NoteViewerStorage();
    const db = await NoteViewerDB.open();
    const net = new Net(`osm-note-viewer`, 'read_prefs write_notes', [`You need to login if you'd like to manipulate notes.`], serverListConfig, storage, serverList => new HashServerSelector(serverList), () => bubbleEvent($root, 'osmNoteViewer:loginChange'));
    const $menuButton = makeMenuButton();
    const $navbarContainer = document.createElement('nav');
    const $fetchContainer = makeDiv('panel', 'fetch')();
    const $moreContainer = makeDiv('more')();
    const $scrollingPart = makeDiv('scrolling')($navbarContainer, $fetchContainer);
    const $stickyPart = makeDiv('sticky')();
    const $graphicSide = makeDiv('graphic-side')($menuButton);
    const $mapContainer = makeDiv('map')();
    $root.append($graphicSide);
    let map;
    const globalHistory = new GlobalHistory($root, $scrollingPart, net);
    if (net.cx) {
        const $textSide = makeDiv('text-side')($scrollingPart, $stickyPart);
        $graphicSide.before($textSide);
        const sidebarResizer = new SidebarResizer($root, $textSide, storage);
        $graphicSide.append(sidebarResizer.$button, $mapContainer);
        map = writeMap($root, $mapContainer, net.cx.server, globalHistory);
        sidebarResizer.startListening(map);
        const navbar = new Navbar($root, $navbarContainer);
        const noteTable = writeBelowFetchPanel($root, $scrollingPart, $stickyPart, $moreContainer, storage, net.cx, globalHistory, map);
        new NoteFetchPanel($root, db, net.cx, $fetchContainer, $moreContainer, navbar, noteTable, map, globalHistory.getQueryHash(), globalHistory.hasMapHash(), net.serverSelector.getHostHashValueForServer(net.cx.server));
        $mapContainer.addEventListener('keydown', ev => {
            if (ev.key != 'Escape')
                return;
            noteTable.focus();
            ev.stopPropagation();
            ev.preventDefault();
        });
    }
    {
        const overlayDialog = new OverlayDialog($root, storage, db, net, map, $menuButton);
        $graphicSide.append(overlayDialog.$menuPanel, overlayDialog.$figureDialog);
    }
    if (net.cx) {
        const server = net.cx.server;
        $root.addEventListener('osmNoteViewer:updateNoteLinkClick', async (ev) => {
            const $a = ev.target;
            if (!($a instanceof HTMLAnchorElement))
                return;
            const id = Number($a.dataset.noteId);
            bubbleCustomEvent($a, 'osmNoteViewer:beforeNoteFetch', id);
            let note;
            let users;
            try {
                [note, users] = await fetchTableNote(server.api, id, net.cx?.token);
            }
            catch (ex) {
                bubbleCustomEvent($a, 'osmNoteViewer:failedNoteFetch', [id, getFetchTableNoteErrorMessage(ex)]);
                return;
            }
            bubbleCustomEvent($a, 'osmNoteViewer:noteFetch', [note, users, 'manual']);
            bubbleCustomEvent($a, 'osmNoteViewer:noteUpdatePush', [note, users]);
        });
        new OsmDownloader($root, server);
        globalHistory.restoreScrollPosition();
    }
    new TimeTitleUpdater($root);
}
function writeMap($root, $mapContainer, server, globalHistory) {
    const map = new NoteMap($root, $mapContainer, server);
    globalHistory.triggerInitialMapHashChange();
    return map;
}
function writeBelowFetchPanel($root, $scrollingPart, $stickyPart, $moreContainer, storage, cx, globalHistory, map) {
    const $filterContainer = makeDiv('panel', 'fetch')();
    const $notesContainer = makeDiv('notes')();
    $scrollingPart.append($filterContainer, $notesContainer, $moreContainer);
    const filterPanel = new NoteFilterPanel(storage, cx.server.api, cx.server.web, $filterContainer);
    const $toolContainer = makeDiv('panel', 'toolbar')();
    $stickyPart.append($toolContainer);
    new ToolPanel($root, $toolContainer, storage, cx, map);
    const noteTable = new NoteTable($root, $notesContainer, storage, map, filterPanel.noteFilter, cx.server);
    filterPanel.onFilterUpdate = noteFilter => noteTable.updateFilter(noteFilter);
    globalHistory.$resizeObservationTarget = $notesContainer;
    return noteTable;
}
