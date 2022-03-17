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

function toUserQueryPart(value) {
    const s = value.trim();
    if (s == '')
        return {
            userType: 'invalid',
            message: `cannot be empty`
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
                return {
                    userType: 'invalid',
                    message: `URL has to be of an OSM domain, was given ${url.host}`
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
                            user OR display_name;
                            sort, order - these don't change within a query;
                            closed - this may change between phases;
                            limit - this may change within a phase in rare circumstances;
                            from, to - this change for pagination purposes, from needs to be present with a dummy date if to is used
 */
function getNextFetchDetails(query, requestedLimit, lastNote, prevLastNote, lastLimit) {
    let closed = -1;
    if (query.status == 'open') {
        closed = 0;
    }
    else if (query.status == 'recent') {
        closed = 7;
    }
    let lowerDateLimit;
    let upperDateLimit;
    let limit = requestedLimit;
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
                limit = lastLimit + requestedLimit;
            }
        }
    }
    if (lowerDateLimit == null && upperDateLimit != null) {
        lowerDateLimit = '2001-01-01T00:00:00Z';
    }
    const parameters = [];
    if (query.userType == 'id') {
        parameters.push(['user', query.uid]);
    }
    else {
        parameters.push(['display_name', query.username]);
    }
    parameters.push(['sort', query.sort], ['order', query.order], ['closed', closed], ['limit', limit]);
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
    constructor($container, map) {
        this.$overpassButtons = [];
        this.checkedNoteIds = [];
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
            const $div = document.createElement('div');
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
            $loadMapButton.textContent = `Load map area`;
            $loadMapButton.addEventListener('click', () => {
                const bounds = map.getBounds();
                const rcUrl = `http://127.0.0.1:8111/load_and_zoom` +
                    `?left=` + encodeURIComponent(bounds.getWest()) +
                    `&right=` + encodeURIComponent(bounds.getEast()) +
                    `&top=` + encodeURIComponent(bounds.getNorth()) +
                    `&bottom=` + encodeURIComponent(bounds.getSouth());
                openRcUrl($loadMapButton, rcUrl);
            });
            $div.append(makeLink(`RC`, 'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl', `JOSM (or another editor) Remote Control`), `: `, $loadNotesButton, ` `, $loadMapButton);
            $container.append($div);
            this.$loadNotesButton = $loadNotesButton;
        }
        {
            const $div = document.createElement('div');
            const $commentTimeSelectLabel = document.createElement('label');
            const $commentTimeSelect = document.createElement('select');
            $commentTimeSelect.append(new Option('in text', 'text'), new Option('of comment', 'comment'));
            $commentTimeSelectLabel.append(`at time `, $commentTimeSelect);
            $commentTimeSelectLabel.title = `"In text" looks for time inside the comment text. Useful for MAPS.ME-generated comments. Falls back to the comment time if no time detected in the text.`;
            this.$commentTimeSelect = $commentTimeSelect;
            const $commentTimeInputLabel = document.createElement('label');
            const $commentTimeInput = document.createElement('input');
            $commentTimeInput.type = 'text';
            $commentTimeInput.size = 20;
            $commentTimeInput.readOnly = true;
            $commentTimeInputLabel.append(`that is `, $commentTimeInput);
            this.$commentTimeInput = $commentTimeInput;
            $commentTimeSelect.addEventListener('input', () => this.registerCommentTime());
            const buttonClickListener = (withRelations, onlyAround) => {
                const time = this.$commentTimeInput.value;
                if (!time)
                    return;
                const center = map.getCenter();
                const bounds = map.getBounds();
                let query = '';
                query += `[date:"${time}"]\n`;
                query += `[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}]\n`;
                // query+=`[bbox:${bounds.toBBoxString()}];\n` // nope, different format
                query += `;\n`;
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
                $button.disabled = true;
                $button.textContent = `map area without relations`;
                $button.addEventListener('click', () => buttonClickListener(false, false));
                this.$overpassButtons.push($button);
            }
            {
                const $button = document.createElement('button');
                $button.disabled = true;
                $button.textContent = `map area with relations`;
                $button.title = `May fetch large unwanted relations like routes.`;
                $button.addEventListener('click', () => buttonClickListener(true, false));
                this.$overpassButtons.push($button);
            }
            {
                const $button = document.createElement('button');
                $button.disabled = true;
                $button.textContent = `around map center`;
                $button.addEventListener('click', () => buttonClickListener(false, true));
                this.$overpassButtons.push($button);
            }
            $div.append(makeLink(`Overpass turbo`, 'https://wiki.openstreetmap.org/wiki/Overpass_turbo'), `: `, $commentTimeSelectLabel, ` `, $commentTimeInputLabel, ` load:`);
            for (const $button of this.$overpassButtons) {
                $div.append(` `, $button);
            }
            $container.append($div);
        }
        {
            const $div = document.createElement('div');
            const $yandexPanoramasButton = document.createElement('button');
            $yandexPanoramasButton.textContent = `Open map center`;
            $yandexPanoramasButton.addEventListener('click', () => {
                const center = map.getCenter();
                const coords = center.lng + ',' + center.lat;
                const url = `https://yandex.ru/maps/2/saint-petersburg/` +
                    `?ll=` + encodeURIComponent(coords) + // required if 'z' argument is present
                    `&panorama%5Bpoint%5D=` + encodeURIComponent(coords) +
                    `&z=` + encodeURIComponent(map.getZoom());
                open(url, 'yandex');
            });
            $div.append(makeLink(`Y.Panoramas`, 'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B', `Yandex.Panoramas (Яндекс.Панорамы)`), `: `, $yandexPanoramasButton);
            $container.append($div);
        }
    }
    receiveCheckedNoteIds(checkedNoteIds) {
        this.checkedNoteIds = checkedNoteIds;
        this.$loadNotesButton.disabled = checkedNoteIds.length <= 0;
    }
    receiveCheckedComment(checkedCommentTime, checkedCommentText) {
        this.checkedCommentTime = checkedCommentTime;
        this.checkedCommentText = checkedCommentText;
        for (const $button of this.$overpassButtons) {
            $button.disabled = checkedCommentTime == null;
        }
        this.registerCommentTime();
    }
    isTracking() {
        return this.$trackCheckbox.checked;
    }
    disableTracking() {
        this.$trackCheckbox.checked = false;
    }
    registerCommentTime() {
        if (this.$commentTimeSelect.value == 'text' && this.checkedCommentText != null) {
            const match = this.checkedCommentText.match(/\d\d\d\d-\d\d-\d\d[T ]\d\d:\d\d:\d\dZ/);
            if (match) {
                const [time] = match;
                this.$commentTimeInput.value = time;
                return;
            }
        }
        this.$commentTimeInput.value = this.checkedCommentTime ?? '';
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

function writeNotesTableHeaderAndGetNoteAdder($container, $commandContainer, map) {
    const commandPanel = new CommandPanel($commandContainer, map);
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
        $row.append(makeHeaderCell(''), makeHeaderCell('id'), makeHeaderCell('date'), makeHeaderCell('user'), makeHeaderCell('?', `Action performed along with adding the comment. Also a radio button. Click to select comment for Overpass turbo commands.`), makeHeaderCell('comment'));
    }
    function makeHeaderCell(text, title) {
        const $cell = document.createElement('th');
        $cell.textContent = text;
        if (title)
            $cell.title = title;
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
        commandPanel.disableTracking();
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
        if (commandPanel.isTracking())
            map.fitNoteTrack();
    }
    function noteCheckboxClickListener(ev) {
        ev.stopPropagation();
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
        commandPanel.receiveCheckedNoteIds(getCheckedNoteIds($table));
    }
    function commentRadioClickListener(ev) {
        ev.stopPropagation();
        const $clickedRow = this.closest('tr');
        if (!$clickedRow)
            return;
        const $time = $clickedRow.querySelector('time');
        if (!$time)
            return;
        const $text = $clickedRow.querySelector('td.note-comment');
        commandPanel.receiveCheckedComment($time.dateTime, $text?.textContent ?? undefined);
    }
    commandPanel.receiveCheckedNoteIds(getCheckedNoteIds($table));
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
            let iComment = 0;
            for (const comment of note.comments) {
                {
                    if (iComment > 0) {
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
                    const $span = document.createElement('span');
                    $span.classList.add('icon', getActionClass(comment.action));
                    $span.title = comment.action;
                    const $radio = document.createElement('input');
                    $radio.type = 'radio';
                    $radio.name = 'comment';
                    $radio.value = `${note.id}-${iComment}`;
                    $radio.addEventListener('click', commentRadioClickListener);
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
async function startFetcher(saveToQueryStorage, $notesContainer, $moreContainer, $commandContainer, map, $limitSelect, $autoLoadCheckbox, $fetchButton, query, initialNotes, initialUsers) {
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
                    rewriteMessage($moreContainer, `User `, [query], ` has no ${query.status == 'open' ? 'open ' : ''}notes`);
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
                if (notes.length > maxTotalAutoLoadLimit) {
                    $moreButton.append(` (no auto download because displaying too many notes)`);
                }
                else if (getNextFetchDetails(query, limit, lastNote, prevLastNote, lastLimit).limit > maxSingleAutoLoadLimit) {
                    $moreButton.append(` (no auto download because required batch too large)`);
                }
                else {
                    const moreButtonIntersectionObserver = new IntersectionObserver((entries) => {
                        if (entries.length <= 0)
                            return;
                        if (!entries[0].isIntersecting)
                            return;
                        if (!$autoLoadCheckbox.checked)
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
function rewriteFetchErrorMessage($container, user, responseKindText, fetchErrorText) {
    const $message = rewriteErrorMessage($container, `Loading notes of user `, [user], ` ${responseKindText}:`);
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
    const $formInputs = writeFetchForm($fetchContainer, $extrasContainer, $notesContainer, $moreContainer, $commandContainer, map);
    writeStoredQueryResults($extrasContainer, $notesContainer, $moreContainer, $commandContainer, map, ...$formInputs);
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
    const partialQuery = {};
    try {
        const queryString = storage.getItem('query');
        if (queryString != null) {
            const parsedQuery = JSON.parse(queryString);
            if (typeof parsedQuery == 'object') {
                Object.assign(partialQuery, parsedQuery);
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
    const $autoLoadCheckbox = document.createElement('input');
    const $fetchButton = document.createElement('button');
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
            $userInput.required = true;
            if (partialQuery.userType == 'id' && partialQuery.uid != null) {
                $userInput.value = '#' + partialQuery.uid;
            }
            else if (partialQuery.userType == 'name' && partialQuery.username != null) {
                $userInput.value = partialQuery.username;
            }
            const $div = document.createElement('div');
            $div.classList.add('major-input');
            const $label = document.createElement('label');
            $label.append(`OSM username, URL or #id: `, $userInput);
            $div.append($label);
            $fieldset.append($div);
        }
        {
            const $div = document.createElement('div');
            $statusSelect.append(new Option(`both open and closed`, 'mixed'), new Option(`open and recently closed`, 'recent'), new Option(`only open`, 'open'));
            if (partialQuery.status != null)
                $statusSelect.value = partialQuery.status;
            $sortSelect.append(new Option(`creation`, 'created_at'), new Option(`last update`, 'updated_at'));
            if (partialQuery.sort != null)
                $sortSelect.value = partialQuery.sort;
            $orderSelect.append(new Option('newest'), new Option('oldest'));
            if (partialQuery.order != null)
                $orderSelect.value = partialQuery.order;
            $div.append(span(`Fetch this user's `, $statusSelect, ` notes`), ` `, span(`sorted by `, $sortSelect, ` date`), `, `, span($orderSelect, ` first`));
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
        const uqp = toUserQueryPart($userInput.value);
        if (uqp.userType == 'invalid') {
            $userInput.setCustomValidity(uqp.message);
        }
        else {
            $userInput.setCustomValidity('');
        }
    });
    $form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const uqp = toUserQueryPart($userInput.value);
        if (uqp.userType == 'invalid')
            return;
        const query = {
            ...uqp,
            status: toNoteQueryStatus($statusSelect.value),
            sort: toNoteQuerySort($sortSelect.value),
            order: toNoteQueryOrder($orderSelect.value),
            beganAt: Date.now()
        };
        rewriteExtras($extrasContainer, query, Number($limitSelect.value));
        startFetcher(saveToQueryStorage, $notesContainer, $moreContainer, $commandContainer, map, $limitSelect, $autoLoadCheckbox, $fetchButton, query, [], {});
    });
    $container.append($form);
    return [$limitSelect, $autoLoadCheckbox, $fetchButton];
}
function writeStoredQueryResults($extrasContainer, $notesContainer, $moreContainer, $commandContainer, map, $limitSelect, $autoLoadCheckbox, $fetchButton) {
    const queryString = storage.getItem('query');
    if (queryString == null) {
        rewriteExtras($extrasContainer);
        return;
    }
    try {
        const query = JSON.parse(queryString);
        rewriteExtras($extrasContainer, query, Number($limitSelect.value));
        const notesString = storage.getItem('notes');
        if (notesString == null)
            return;
        const usersString = storage.getItem('users');
        if (usersString == null)
            return;
        const notes = JSON.parse(notesString);
        const users = JSON.parse(usersString);
        startFetcher(saveToQueryStorage, $notesContainer, $moreContainer, $commandContainer, map, $limitSelect, $autoLoadCheckbox, $fetchButton, query, notes, users);
    }
    catch { }
}
function saveToQueryStorage(query, notes, users) {
    storage.setItem('query', JSON.stringify(query));
    storage.setItem('notes', JSON.stringify(notes));
    storage.setItem('users', JSON.stringify(users));
}
function rewriteExtras($container, query, limit) {
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
    if (query != null && limit != null)
        writeBlock(() => [
            `API links to queries on `,
            makeUserLink(query, `this user`),
            `: `,
            makeNoteQueryLink(`with specified limit`, query, limit),
            `, `,
            makeNoteQueryLink(`with max limit`, query, 10000),
            ` (may be slow)`
        ]);
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
    }
    function makeCode(s) {
        const $code = document.createElement('code');
        $code.textContent = s;
        return $code;
    }
    function makeNoteQueryLink(text, query, limit) {
        return makeLink(text, `https://api.openstreetmap.org/api/0.6/notes/search.json?` + getNextFetchDetails(query, limit).parameters);
    }
    $container.append($details);
}
