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

function toNoteQueryStatus(value) {
    if (value == 'open' || value == 'recent' || value == 'separate')
        return value;
    return 'mixed';
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
/**
 * @returns fd.parameters - url parameters in this order:
                            display_name, sort, order - these don't change within a query;
                            closed - this may change between phases;
                            limit - this may change within a phase in rare circumstances;
                            from, to - this change for pagination purposes, from needs to be present with a dummy date if to is used
 */
function getNextFetchDetails(query, lastNote, prevLastNote, lastLimit) {
    let closed = -1;
    if (query.status == 'open') {
        closed = 0;
    }
    else if (query.status == 'recent') {
        closed = 7;
    }
    let lowerDateLimit;
    let upperDateLimit;
    let limit = query.limit;
    if (lastNote) {
        if (lastNote.comments.length <= 0)
            throw new Error(`note #${lastNote.id} has no comments`);
        const lastDate = getTargetComment(lastNote).date;
        if (query.order == 'oldest') {
            lowerDateLimit = makeLowerLimit(lastDate);
        }
        else {
            upperDateLimit = makeUpperLimit(lastDate);
        }
        if (prevLastNote) {
            if (prevLastNote.comments.length <= 0)
                throw new Error(`note #${prevLastNote.id} has no comments`);
            if (lastLimit == null)
                throw new Error(`no last limit provided along with previous last note #${prevLastNote.id}`);
            const prevLastDate = getTargetComment(prevLastNote).date;
            if (lastDate == prevLastDate) {
                limit = lastLimit + query.limit;
            }
        }
    }
    if (lowerDateLimit == null && upperDateLimit != null) {
        lowerDateLimit = '2001-01-01T00:00:00Z';
    }
    const parameters = [
        ['display_name', query.user],
        ['sort', query.sort],
        ['order', query.order],
        ['closed', closed],
        ['limit', limit]
    ];
    if (lowerDateLimit != null)
        parameters.push(['from', lowerDateLimit]);
    if (upperDateLimit != null)
        parameters.push(['to', upperDateLimit]);
    return {
        parameters: parameters.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'),
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
function makeLowerLimit(dateInSeconds) {
    return makeISODateString(dateInSeconds);
}
function makeUpperLimit(dateInSeconds) {
    return makeISODateString(dateInSeconds + 1);
}
function makeISODateString(dateInSeconds) {
    const dateObject = new Date(dateInSeconds * 1000);
    const dateString = dateObject.toISOString();
    return dateString.replace(/.\d\d\dZ$/, 'Z');
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

function makeUserLink(username) {
    return makeLink(username, `https://www.openstreetmap.org/user/${encodeURIComponent(username)}`);
}
function makeLink(text, href, title) {
    const $link = document.createElement('a');
    $link.href = href;
    $link.textContent = text;
    if (title != null)
        $link.title = title;
    return $link;
}

function writeNotesTableHeaderAndGetNoteAdder($container, $commandContainer, map) {
    const [$trackCheckbox, $loadNotesButton, $loadMapButton, $yandexPanoramasButton] = writeCommands($commandContainer);
    const noteSectionLayerIdVisibility = new Map();
    let noteSectionVisibilityTimeoutId;
    const noteRowObserver = new IntersectionObserver((entries) => {
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
    let currentLayerId;
    let $lastClickedNoteSection;
    const $table = document.createElement('table');
    $container.append($table);
    {
        const $header = $table.createTHead();
        const $row = $header.insertRow();
        $row.append(makeHeaderCell(''), makeHeaderCell('id'), makeHeaderCell('date'), makeHeaderCell('user'), makeHeaderCell(''), makeHeaderCell('comment'));
    }
    $trackCheckbox.addEventListener('change', () => {
        if ($trackCheckbox.checked)
            map.fitNoteTrack();
    });
    $loadNotesButton.addEventListener('click', async () => {
        const $checkedBoxes = $table.querySelectorAll('.note-checkbox :checked');
        for (const $checkbox of $checkedBoxes) {
            const $noteSection = $checkbox.closest('tbody');
            if (!$noteSection)
                continue;
            const noteId = Number($noteSection.dataset.noteId);
            if (!Number.isInteger(noteId))
                continue;
            const noteUrl = `https://www.openstreetmap.org/note/` + encodeURIComponent(noteId);
            const rcUrl = `http://127.0.0.1:8111/import?url=` + encodeURIComponent(noteUrl);
            fetch(rcUrl);
        }
    });
    $loadMapButton.addEventListener('click', async () => {
        const bounds = map.getBounds();
        const rcUrl = `http://127.0.0.1:8111/load_and_zoom` +
            `?left=` + encodeURIComponent(bounds.getWest()) +
            `&right=` + encodeURIComponent(bounds.getEast()) +
            `&top=` + encodeURIComponent(bounds.getNorth()) +
            `&bottom=` + encodeURIComponent(bounds.getSouth());
        fetch(rcUrl);
    });
    $yandexPanoramasButton.addEventListener('click', async () => {
        const center = map.getCenter();
        const coords = center.lng + ',' + center.lat;
        const url = `https://yandex.ru/maps/2/saint-petersburg/` +
            `?ll=` + encodeURIComponent(coords) + // required if 'z' argument is present
            `&panorama%5Bpoint%5D=` + encodeURIComponent(coords) +
            `&z=` + encodeURIComponent(map.getZoom());
        open(url, 'yandex');
    });
    function makeHeaderCell(text) {
        const $cell = document.createElement('th');
        $cell.textContent = text;
        return $cell;
    }
    function writeNote(note) {
        const marker = map.addNote(note);
        marker.on('click', noteMarkerClickListener);
        const layerId = map.noteLayer.getLayerId(marker);
        const $tableSection = $table.createTBody();
        $tableSection.id = `note-${note.id}`;
        $tableSection.classList.add(getStatusClass(note.status));
        $tableSection.dataset.layerId = String(layerId);
        $tableSection.dataset.noteId = String(note.id);
        $tableSection.addEventListener('mouseover', noteSectionMouseoverListener);
        $tableSection.addEventListener('mouseout', noteSectionMouseoutListener);
        $tableSection.addEventListener('click', noteSectionClickListener);
        noteSectionLayerIdVisibility.set(layerId, false);
        noteRowObserver.observe($tableSection);
        return $tableSection;
    }
    function deactivateAllNotes() {
        for (const $noteRows of $table.querySelectorAll('tbody.active')) {
            deactivateNote($noteRows);
        }
    }
    function deactivateNote($noteSection) {
        currentLayerId = undefined;
        $noteSection.classList.remove('active');
        const layerId = Number($noteSection.dataset.layerId);
        const marker = map.noteLayer.getLayer(layerId);
        if (!(marker instanceof L.Marker))
            return;
        marker.setZIndexOffset(0);
        marker.setOpacity(0.5);
    }
    function activateNote($noteSection) {
        const layerId = Number($noteSection.dataset.layerId);
        const marker = map.noteLayer.getLayer(layerId);
        if (!(marker instanceof L.Marker))
            return;
        marker.setOpacity(1);
        marker.setZIndexOffset(1000);
        $noteSection.classList.add('active');
    }
    function focusMapOnNote($noteSection) {
        const layerId = Number($noteSection.dataset.layerId);
        const marker = map.noteLayer.getLayer(layerId);
        if (!(marker instanceof L.Marker))
            return;
        if (layerId == currentLayerId) {
            const z1 = map.getZoom();
            const z2 = map.getMaxZoom();
            const nextZoom = Math.min(z2, z1 + Math.ceil((z2 - z1) / 2));
            map.flyTo(marker.getLatLng(), nextZoom);
        }
        else {
            currentLayerId = layerId;
            map.panTo(marker.getLatLng());
        }
    }
    function noteMarkerClickListener() {
        $trackCheckbox.checked = false;
        deactivateAllNotes();
        const $noteRows = document.getElementById(`note-` + this.noteId);
        if (!$noteRows)
            return;
        $noteRows.scrollIntoView({ block: 'nearest' });
        activateNote($noteRows);
        focusMapOnNote($noteRows);
    }
    function noteSectionMouseoverListener() {
        deactivateAllNotes();
        activateNote(this);
    }
    function noteSectionMouseoutListener() {
        deactivateNote(this);
    }
    function noteSectionClickListener() {
        focusMapOnNote(this);
    }
    function noteSectionVisibilityHandler() {
        const visibleLayerIds = [];
        for (const [layerId, visibility] of noteSectionLayerIdVisibility) {
            if (visibility)
                visibleLayerIds.push(layerId);
        }
        map.showNoteTrack(visibleLayerIds);
        if ($trackCheckbox.checked)
            map.fitNoteTrack();
    }
    function noteCheckboxClickListener(ev) {
        ev.stopPropagation();
        const $anyCheckedBox = $table.querySelector('.note-checkbox :checked');
        const $clickedNoteSection = this.closest('tbody');
        if ($clickedNoteSection) {
            if (ev.shiftKey && $lastClickedNoteSection) {
                for (const $section of getTableSectionRange($table, $lastClickedNoteSection, $clickedNoteSection)) {
                    const $checkbox = $section.querySelector('.note-checkbox input');
                    if ($checkbox instanceof HTMLInputElement)
                        $checkbox.checked = this.checked;
                }
            }
            $lastClickedNoteSection = $clickedNoteSection;
        }
        $loadNotesButton.disabled = !$anyCheckedBox;
    }
    return (notes, users) => {
        for (const note of notes) {
            const $tableSection = writeNote(note);
            let $row = $tableSection.insertRow();
            const nComments = note.comments.length;
            {
                const $cell = $row.insertCell();
                $cell.classList.add('note-checkbox');
                if (nComments > 1)
                    $cell.rowSpan = nComments;
                const $checkbox = document.createElement('input');
                $checkbox.type = 'checkbox';
                $checkbox.title = `shift+click to check/uncheck a range`;
                $checkbox.addEventListener('click', noteCheckboxClickListener);
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
            let firstCommentRow = true;
            for (const comment of note.comments) {
                {
                    if (firstCommentRow) {
                        firstCommentRow = false;
                    }
                    else {
                        $row = $tableSection.insertRow();
                    }
                }
                {
                    const $cell = $row.insertCell();
                    const dateString = new Date(comment.date * 1000).toISOString();
                    const match = dateString.match(/(\d\d\d\d-\d\d-\d\d)T(\d\d:\d\d:\d\d)/);
                    if (match) {
                        const [, date, time] = match;
                        const $dateTime = document.createElement('time');
                        $dateTime.textContent = date;
                        $dateTime.dateTime = `${date} ${time}Z`;
                        $dateTime.title = `${date} ${time} UTC`;
                        $cell.append($dateTime);
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
                    const $icon = document.createElement('span');
                    $icon.title = comment.action;
                    $icon.classList.add('icon', getActionClass(comment.action));
                    $cell.append($icon);
                }
                {
                    const $cell = $row.insertCell();
                    $cell.classList.add('note-comment');
                    $cell.textContent = comment.text;
                }
            }
        }
    };
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
function writeCommands($container) {
    const $checkbox = document.createElement('input');
    const $loadNotesButton = document.createElement('button');
    const $loadMapButton = document.createElement('button');
    const $yandexPanoramasButton = document.createElement('button');
    {
        const $div = document.createElement('div');
        const $label = document.createElement('label');
        $checkbox.type = 'checkbox';
        $label.append($checkbox, ` track visible notes on the map`);
        $div.append($label);
        $container.append($div);
    }
    {
        const $div = document.createElement('div');
        $loadNotesButton.disabled = true;
        $loadNotesButton.textContent = `Load selected notes`;
        $loadMapButton.textContent = `Load map area`;
        $div.append(makeLink(`RC`, 'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl', `JOSM (or another editor) Remote Control`), `: `, $loadNotesButton, ` `, $loadMapButton);
        $container.append($div);
    }
    {
        const $div = document.createElement('div');
        $yandexPanoramasButton.textContent = `Open map center`;
        $div.append(makeLink(`Y.Panoramas`, 'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B', `Yandex.Panoramas (Яндекс.Панорамы)`), `: `, $yandexPanoramasButton);
        $container.append($div);
    }
    return [$checkbox, $loadNotesButton, $loadMapButton, $yandexPanoramasButton];
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

const maxSingleAutoLoadLimit = 200;
const maxTotalAutoLoadLimit = 1000;
async function startFetcher(saveToQueryStorage, $notesContainer, $moreContainer, $commandContainer, map, $fetchButton, query, initialNotes, initialUsers) {
    const [notes, users, mergeNotesAndUsers] = makeNotesAndUsersAndMerger();
    mergeNotesAndUsers(initialNotes, initialUsers);
    saveToQueryStorage(query, notes, users);
    map.clearNotes();
    $notesContainer.innerHTML = ``;
    $commandContainer.innerHTML = ``;
    let lastNote;
    let prevLastNote;
    let lastLimit;
    let addNotesToTable;
    if (notes.length > 0) {
        addNotesToTable = writeNotesTableHeaderAndGetNoteAdder($notesContainer, $commandContainer, map);
        addNotesToTable(notes, users);
        map.fitNotes();
        lastNote = notes[notes.length - 1];
        rewriteLoadMoreButton();
    }
    else {
        await fetchCycle();
    }
    async function fetchCycle() {
        rewriteLoadingButton();
        const fetchDetails = getNextFetchDetails(query, lastNote, prevLastNote, lastLimit);
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
                rewriteFetchErrorMessage($moreContainer, query.user, `received the following error response`, responseText);
            }
            else {
                const data = await response.json();
                query.endedAt = Date.now();
                if (!isNoteFeatureCollection(data)) {
                    rewriteMessage($moreContainer, `Received invalid data`);
                    return;
                }
                const unseenNotes = mergeNotesAndUsers(...transformFeatureCollectionToNotesAndUsers(data));
                saveToQueryStorage(query, notes, users);
                if (!addNotesToTable && notes.length <= 0) {
                    rewriteMessage($moreContainer, `User `, [query.user], ` has no ${query.status == 'open' ? 'open ' : ''}notes`);
                    return;
                }
                if (!addNotesToTable) {
                    addNotesToTable = writeNotesTableHeaderAndGetNoteAdder($notesContainer, $commandContainer, map);
                    addNotesToTable(unseenNotes, users);
                    map.fitNotes();
                }
                else {
                    addNotesToTable(unseenNotes, users);
                }
                if (data.features.length < fetchDetails.limit) {
                    rewriteMessage($moreContainer, `Got all ${notes.length} notes`);
                    return;
                }
                prevLastNote = lastNote;
                lastNote = notes[notes.length - 1];
                lastLimit = fetchDetails.limit;
                const $moreButton = rewriteLoadMoreButton();
                if (notes.length <= maxTotalAutoLoadLimit &&
                    getNextFetchDetails(query, lastNote, prevLastNote, lastLimit).limit <= maxSingleAutoLoadLimit) {
                    const moreButtonIntersectionObserver = new IntersectionObserver((entries) => {
                        if (entries.length <= 0)
                            return;
                        if (!entries[0].isIntersecting)
                            return;
                        moreButtonIntersectionObserver.disconnect();
                        $moreButton.click();
                    });
                    moreButtonIntersectionObserver.observe($moreButton);
                }
            }
        }
        catch (ex) {
            if (ex instanceof TypeError) {
                rewriteFetchErrorMessage($moreContainer, query.user, `failed with the following error before receiving a response`, ex.message);
            }
            else {
                rewriteFetchErrorMessage($moreContainer, query.user, `failed for unknown reason`, `${ex}`);
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
        for (const note of newNotes) {
            if (seenNotes[note.id])
                continue;
            seenNotes[note.id] = true;
            notes.push(note);
            unseenNotes.push(note);
        }
        Object.assign(users, newUsers);
        return unseenNotes;
    };
    return [notes, users, merger];
}
function rewriteMessage($container, ...items) {
    $container.innerHTML = '';
    const $message = document.createElement('div');
    for (const item of items) {
        if (Array.isArray(item)) {
            const [username] = item;
            $message.append(makeUserLink(username));
        }
        else {
            $message.append(item);
        }
    }
    $container.append($message);
    return $message;
}
function rewriteErrorMessage($container, ...items) {
    const $message = rewriteMessage($container, ...items);
    $message.classList.add('error');
    return $message;
}
function rewriteFetchErrorMessage($container, username, responseKindText, fetchErrorText) {
    const $message = rewriteErrorMessage($container, `Loading notes of user `, [username], ` ${responseKindText}:`);
    const $error = document.createElement('pre');
    $error.textContent = fetchErrorText;
    $message.append($error);
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
        this.addLayer(L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>",
            maxZoom: 19
        })).fitWorld();
        this.noteLayer = L.featureGroup().addTo(this);
        this.trackLayer = L.featureGroup().addTo(this);
    }
    clearNotes() {
        this.noteLayer.clearLayers();
        this.trackLayer.clearLayers();
    }
    fitNotes() {
        this.fitBounds(this.noteLayer.getBounds());
    }
    addNote(note) {
        return new NoteMarker(note).addTo(this.noteLayer);
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

const storage = new NoteViewerStorage('osm-note-viewer-');
main();
function main() {
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
    const $extrasContainer = document.createElement('div');
    $extrasContainer.classList.add('panel');
    const $notesContainer = document.createElement('div');
    $notesContainer.classList.add('notes');
    const $moreContainer = document.createElement('div');
    $moreContainer.classList.add('more');
    const $commandContainer = document.createElement('div');
    $commandContainer.classList.add('panel', 'command');
    $scrollingPart.append($fetchContainer, $extrasContainer, $notesContainer, $moreContainer);
    $stickyPart.append($commandContainer);
    const map = new NoteMap($mapSide);
    writeFlipLayoutButton($fetchContainer, map);
    const $fetchButton = writeFetchForm($fetchContainer, $extrasContainer, $notesContainer, $moreContainer, $commandContainer, map);
    writeStoredQueryResults($extrasContainer, $notesContainer, $moreContainer, $commandContainer, map, $fetchButton);
}
function writeFlipLayoutButton($container, map) {
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
function writeFetchForm($container, $extrasContainer, $notesContainer, $moreContainer, $commandContainer, map) {
    const query = {
        user: '',
        status: 'mixed',
        sort: 'created_at',
        order: 'newest',
        limit: 20,
    };
    try {
        const queryString = storage.getItem('query');
        if (queryString != null) {
            const parsedQuery = JSON.parse(queryString);
            if (typeof parsedQuery == 'object') {
                Object.assign(query, parsedQuery);
            }
        }
    }
    catch { }
    const $form = document.createElement('form');
    const $userInput = document.createElement('input');
    const $statusSelect = document.createElement('select');
    const $sortSelect = document.createElement('select');
    const $orderSelect = document.createElement('select');
    const $limitSelect = document.createElement('select');
    const $fetchButton = document.createElement('button');
    {
        $userInput.type = 'text';
        $userInput.name = 'user';
        $userInput.value = query.user;
        const $div = document.createElement('div');
        const $label = document.createElement('label');
        $label.append(`OSM username: `, $userInput);
        $div.append($label);
        $form.append($div);
    }
    {
        const $div = document.createElement('div');
        $statusSelect.append(new Option(`both open and closed`, 'mixed'), new Option(`open and recently closed`, 'recent'), new Option(`only open`, 'open'));
        $statusSelect.value = query.status;
        $sortSelect.append(new Option(`creation`, 'created_at'), new Option(`last update`, 'updated_at'));
        $sortSelect.value = query.sort;
        $orderSelect.append(new Option('newest'), new Option('oldest'));
        $orderSelect.value = query.order;
        $limitSelect.append(new Option('20'), new Option('100'), new Option('500'), new Option('2500'));
        $limitSelect.value = String(query.limit);
        $div.append(span(`Fetch `, $statusSelect, ` notes`), ` `, span(`sorted by `, $sortSelect, ` date`), `, `, span($orderSelect, ` first`), `, `, span(`in batches of `, $limitSelect, ` notes`));
        $form.append($div);
        function span(...items) {
            const $span = document.createElement('span');
            $span.append(...items);
            return $span;
        }
    }
    {
        $fetchButton.textContent = `Fetch notes`;
        $fetchButton.type = 'submit';
        const $div = document.createElement('div');
        $div.append($fetchButton);
        $form.append($div);
    }
    $form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        query.user = $userInput.value;
        query.status = toNoteQueryStatus($statusSelect.value);
        query.sort = toNoteQuerySort($sortSelect.value);
        query.order = toNoteQueryOrder($orderSelect.value);
        query.limit = Number($limitSelect.value);
        query.beganAt = Date.now();
        query.endedAt = undefined;
        rewriteExtras($extrasContainer, query.user);
        startFetcher(saveToQueryStorage, $notesContainer, $moreContainer, $commandContainer, map, $fetchButton, query, [], {});
    });
    $container.append($form);
    return $fetchButton;
}
function writeStoredQueryResults($extrasContainer, $notesContainer, $moreContainer, $commandContainer, map, $fetchButton) {
    const queryString = storage.getItem('query');
    if (queryString == null) {
        rewriteExtras($extrasContainer);
        return;
    }
    try {
        const query = JSON.parse(queryString);
        rewriteExtras($extrasContainer, query.user);
        const notesString = storage.getItem('notes');
        if (notesString == null)
            return;
        const usersString = storage.getItem('users');
        if (usersString == null)
            return;
        const notes = JSON.parse(notesString);
        const users = JSON.parse(usersString);
        startFetcher(saveToQueryStorage, $notesContainer, $moreContainer, $commandContainer, map, $fetchButton, query, notes, users);
    }
    catch { }
}
function saveToQueryStorage(query, notes, users) {
    storage.setItem('query', JSON.stringify(query));
    storage.setItem('notes', JSON.stringify(notes));
    storage.setItem('users', JSON.stringify(users));
}
function rewriteExtras($container, username) {
    $container.innerHTML = '';
    const $details = document.createElement('details');
    {
        const $summary = document.createElement('summary');
        $summary.textContent = `Extra information`;
        $details.append($summary);
    }
    writeBlock(() => {
        const $clearButton = document.createElement('button');
        $clearButton.textContent = `Clear storage`;
        const $computeButton = document.createElement('button');
        $computeButton.textContent = `Compute storage size`;
        const $computeResult = document.createElement('span');
        $clearButton.addEventListener('click', () => {
            storage.clear();
        });
        $computeButton.addEventListener('click', () => {
            const size = storage.computeSize();
            $computeResult.textContent = (size / 1024).toFixed(2) + " KB";
        });
        return [$clearButton, ` `, $computeButton, ` `, $computeResult];
    });
    if (username != null)
        writeBlock(() => [
            `Fetch up to 10000 notes of `,
            makeLink(`this user`, `https://www.openstreetmap.org/user/${encodeURIComponent(username)}`),
            ` (may be slow): `,
            makeLink(`json`, `https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=10000&display_name=${encodeURIComponent(username)}`)
        ]);
    writeBlock(() => [
        `Notes documentation: `,
        makeLink(`wiki`, `https://wiki.openstreetmap.org/wiki/Notes`),
        `, `,
        makeLink(`api`, `https://wiki.openstreetmap.org/wiki/API_v0.6#Map_Notes_API`),
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
    }
    $container.append($details);
}
