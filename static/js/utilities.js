function getEl(id) { return document.getElementById(id) }
function getElWithQuery(query) { return document.querySelector(query) }
function getElsWithQuery(query) { return document.querySelectorAll(query) }
function forElsMatching(query, callback) { [].forEach.call(document.querySelectorAll(query), callback) }
function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild) }
function appendToEl(el, html) {
    el.append(htmlToEl(html))
}
function prependToEl(el, html) {
    el.prepend(htmlToEl(html))
}
function htmlToEl(html) {
    let docFrag = document.createDocumentFragment()
    let range = document.createRange()
    range.setStart(docFrag, 0)
    docFrag.appendChild(range.createContextualFragment(html))
    return docFrag
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function getModal(el) { return bootstrap.Modal.getOrCreateInstance(el) }
function getCollapse(el, config={}, callback=null) {
    let collapser = bootstrap.Collapse.getOrCreateInstance(el, config)
    if (callback !== null) {
        el.addEventListener('shown.bs.collapse', e => callback(e))
        el.addEventListener('hidden.bs.collapse', e => callback(e))
    }
    return collapser

}
function getTab(el) { return bootstrap.Tab.getOrCreateInstance(el) }
function getBreakpoint() {
    let breakpointNames = ["xxl", "xl", "lg", "md", "sm", "xs"]
    let breakpointValues = []
    for (const breakpointName of breakpointNames) {
        const value = window.getComputedStyle(document.documentElement).getPropertyValue(`--bs-breakpoint-${breakpointName}`)
        if(value) {
            breakpointValues[breakpointName] = value
        }
    }
    for (const breakpointName of breakpointNames) {
        if (window.matchMedia("(min-width: " + breakpointValues[breakpointName] + ")").matches) {
            return breakpointName
        }
    }
    return null
}
function showLoadingModal() {
    let loadingModal = getEl('loading-overlay')
    if (!loadingModal) {
        prependToEl(document.body, `
            <div id="loading-overlay" class="d-flex align-items-center justify-content-center">
                <div id="loading-modal" class="w-25 h-25">
                    <div class="row no-gutters">
                        <div class="col-sm-12">
                            LOADING...
                        </div>
                    </div>
                    <div class="row no-gutters">
                        <div class="col-sm-12 d-flex align-items-center justify-content-center h-100">
                            <img src="/static/img/nvs-logo-animated.gif" class="loading-spinner img-responsive" />
                        </div>
                    </div>
                </div>
            </div>
        `)
        loadingModal = getEl('loading-overlay')
    }
    loadingModal.classList.remove('d-none')
    loadingModal.classList.add('d-flex')
}
function hideLoadingModal() {
    let loadingModal = getEl('loading-overlay')
    loadingModal.classList.add('d-none')
    loadingModal.classList.remove('d-flex')
}
function makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (handle.length) {
        // if present, the header is where you move the DIV from:
        handle[0].onmousedown = dragMouseDown;
        handle[0].ontouchstart = dragMouseDown;
    } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        el.onmousedown = dragMouseDown;
        el.ontouchstart = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();

        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.ontouchend = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
        document.ontouchmove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        if (e.type === "touchmove") {
            pos1 = pos3 - e.touches[0].clientX;
            pos2 = pos4 - e.touches[0].clientY;
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
        } else {
            e.preventDefault();
            // calculate the new cursor position:
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
        }

        // set the element's new position:
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
    }
}
function displayNavModal(title, content, link, controls='', arrowSide='right') {
    let modalID = ''
    let modalEl = null

    if (link) {
        let modalIDCounter = 0
        while(getEl(`ref-modal-${modalIDCounter}`)) modalIDCounter++
        modalID = `ref-modal-${modalIDCounter}`

        let linkRect = link.getBoundingClientRect()

        if (arrowSide !== 'top' && linkRect.x <= window.innerWidth / 2) {
            arrowSide = 'left'
        }
        appendToEl(document.body, `
            <div id="${modalID}" class="ref-modal">
                <div class="arrow-${arrowSide}">
                    <div class="ref-modal-header d-flex justify-content-between">
                        <span id="${modalID}-header">
                            ${title}
                        </span>
                        <span style="white-space: nowrap;">
                            ${controls}
                            <i id="${modalID}-close-button" class="ref-modal-control close" data-modal_id="${modalID}" aria-label="Close"></i>
                        </span>
                    </div>
                    <div class="ref-modal-content">${content}</div>
                </div>
            </div>
        `)
        modalEl = getEl(modalID)

        if (arrowSide === 'right') {
            modalEl.style.top = `${linkRect.top + window.pageYOffset - 20}px`
            modalEl.style.left = `${linkRect.left - (modalEl.width() + 20)}px`
        } else if (arrowSide === 'left') {
            modalEl.style.top = `${linkRect.top + window.pageYOffset - 20}px`
            modalEl.style.left = `${linkRect.right + 20}px`
        }

        getEl(`${modalID}-close-button`).onclick = (e) => {
            getEl(e.target.dataset.modal_id).remove()
        }

        makeDraggable(modalEl)
    }
    else {
        if (!getEl('nav-modal')) prependToEl(document.body, `
            <div class="modal fade" id="nav-modal" tabindex="-1" role="dialog" aria-labelledby="nav-modal-label" aria-hidden="true">
                <div class="modal-dialog" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="nav-modal-label"></h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                        <div id="nav-modal-body" class="modal-body"></div>
                    </div>
                </div>
            </div>
        `)
        getEl('nav-modal-label').innerHTML = title
        getEl('nav-modal-body').innerHTML = content
        getModal(getEl('nav-modal')).show()
    }

    return modalID
}
function getCssVar(variableName) {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${variableName}`)
}
function setCssVar(variableName, value) {
    document.documentElement.style.setProperty(variableName, value)
}
function hasProp(obj, path) {
    return path.split(".").every(function(x) {
        if(typeof obj != "object" || obj === null || ! x in obj)
            return false
        obj = obj[x]
        return true
    })
}
function makeActScene(act, scene) {
    if (act === 'Dramatis Personae') return 'DP'
    else if (act === 'Trailer') return 'TR'
    else return `${act}.${scene}`
}
