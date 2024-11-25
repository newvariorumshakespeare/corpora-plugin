// for getting/manipulating DOM
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
function getCssVar(variableName) {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${variableName}`)
}
function setCssVar(variableName, value) {
    document.documentElement.style.setProperty(variableName, value)
}

// basic utility functions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function romanize (num) {
    if (isNaN(num))
        return num;
    let digits = String(+num).split(""),
        key = ["","C","CC","CCC","CD","D","DC","DCC","DCCC","CM",
            "","X","XX","XXX","XL","L","LX","LXX","LXXX","XC",
            "","I","II","III","IV","V","VI","VII","VIII","IX"],
        roman = "",
        i = 3;
    while (i--)
        roman = (key[+digits.pop() + (i * 10)] || "") + roman;
    return Array(+digits.join("") + 1).join("M") + roman;
}
function hasProp(obj, path) {
    return path.split(".").every(function(x) {
        if(typeof obj != "object" || obj === null || ! x in obj)
            return false
        obj = obj[x]
        return true
    })
}

// bootstrap modals, collapses, tabs, and breakpoints
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

// nvs specific
function showLoadingModal() {
    let loadingModal = getEl('loading-overlay')
    if (!loadingModal) {
        prependToEl(document.body, `
            <div id="loading-overlay" class="d-flex align-items-center justify-content-center">
                <div id="loading-modal" class="w-25 h-25">
                    <div class="row gx-0">
                        <div class="col-sm-12">
                            LOADING...
                        </div>
                    </div>
                    <div class="row gx-0">
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
function makeActScene(act, scene) {
    if (act === 'Dramatis Personae') return 'DP'
    else if (act === 'Trailer') return 'TR'
    else return `${act}.${scene}`
}
function fetchWitnesses(callback=null) {
    fetch(window.nvs.endpoints.witness).then(witResults => witResults.json()).then(witResults => {
        window.nvs.witnessCount = witResults.witness_count
        window.nvs.witnesses = witResults.witnesses
        window.nvs.witnessCenturies = witResults.witness_centuries

        if (callback !== null) callback()
    })
}

// for navigating/displaying lines, bibliographic refs, appendix locations, etc.
var navMap = {
    'lb': {
        'content_type': 'PlayLine',
        'xml_id_field': 'xml_id',
        'content_field': 'rendered_html',
        'title': 'LINE',
        'title_plural': 'LINES',
        'scroll_anchor': false,
        'filter_play': true,
    },
    'bibl': {
        'content_type': 'Reference',
        'xml_id_field': 'document.siglum',
        'content_field': 'bibliographic_entry',
        'title': "BIBLIOGRAPHY",
        'title_plural': "BIBLIOGRAPHY",
        'scroll_anchor': false,
        'filter_play': false,
    },
    'siglum': {
        'content_type': 'Reference',
        'xml_id_field': 'document.siglum',
        'content_field': 'bibliographic_entry',
        'title': "COLLATED EDITION",
        'title_plural': "COLLATED EDITIONS",
        'scroll_anchor': false,
        'filter_play': false,
    },
    'note_cn': {
        'content_type': 'Commentary',
        'xml_id_field': 'xml_id',
        'content_field': 'contents',
        'title': "COMMENTARY",
        'title_plural': "COMMENTARY",
        'scroll_anchor': false,
        'filter_play': true,
    },
    'div': {
        'content_type': 'ParaText',
        'xml_id_field': 'xml_id',
        'content_field': 'html_content',
        'title': "APPENDIX",
        'title_plural': "APPENDIX",
        'scroll_anchor': true,
        'filter_play': true,
    },
    'anchor': {
        'content_type': 'ParaText',
        'xml_id_field': 'child_xml_ids',
        'content_field': 'html_content',
        'title': "APPENDIX",
        'title_plural': "APPENDIX",
        'scroll_anchor': true,
        'filter_play': true,
    }
}
function navigate_to(navType, xmlID, link=null) { navigateTo(navType, xmlID, link) }
function navigateTo(navType, xmlID, link=null) {
    // handle navigation to playlines
    if (navType === 'lb') {
        let startID = xmlID
        let endID = null
        if (startID.includes(' ')) {
            let idParts = startID.split(' ')
            startID = idParts[0]
            endID = idParts[1]
        }

        let lineEndpointSuffix = `${startID}/`
        if (endID) lineEndpointSuffix += `${endID}/`

        fetch(window.nvs.endpoints.lineRange + lineEndpointSuffix)
            .then(res => res.json())
            .then(data => {
                if (data.length) {
                    let linesLabel = data.length === 1 ? `Line ${data[0].line_label}` : `Lines ${data[0].line_label}-${data[data.length - 1].line_label}`;
                    let linesHTML = '';
                    let lineTemplate = (line) =>
                        `<div class="row gx-0 ref-row">
                            <div class="col-sm-10 m-0 p-0 play-words">
                                ${line.text}
                            </div>
                            <div class="col-sm-1 m-0 p-1 play-label d-flex justify-content-center">
                                ${line.line_label}
                            </div>
                            <div class="col-sm-1 m-0 p-1 bg-nvs-lightest-gray actscene-indicator d-flex justify-content-center">
                                ${romanize(line.act)},${line.scene}
                            </div>
                        </div>`;
                    data.forEach(line => { linesHTML += lineTemplate(line) })

                    let controls = `
                        <a href="${window.nvsPlayViewerURL}#${startID}-row" target="_blank"><img src="/static/img/controls/Modal-NEWTAB.svg"
                            class="ref-modal-control"
                            border="0"
                        ></a>`
                    displayNavModal(linesLabel, linesHTML, link, controls)
                }
            })
        // end fetch
    } else if (navType === 'siglum'){
        if (window.nvs.witnesses === null) {
            fetchWitnesses(() => navigateTo(navType, xmlID, link))
            return
        }

        if (!xmlID.startsWith('s_')) xmlID = `s_${xmlID.toLowerCase().replace('&', '')}`

        if(!(xmlID in window.nvs.witnesses)) {
            xmlID = `${xmlID}_${window.nvs.play}`
        }

        if (xmlID in window.nvs.witnesses) {
            let title = 'Collated Edition'
            if (window.nvs.witnesses[xmlID].bibliographic_entry.includes('<br /><br />')) title += 's'
            let biblioURL = window.nvs.paratextPrefix
            if (biblioURL) {
                biblioURL += `Front Matter/#${xmlID}`
            } else {
                biblioURL = `/front/${window.nvs.play}/#${xmlID}`
            }
            let controls = `<a href="${biblioURL}" target="_blank"><i class="ref-modal-control new-tab"></i></a>`
            displayNavModal(title, window.nvs.witnesses[xmlID].bibliographic_entry, link, controls)
        }
    } else {
        if (!navMap.hasOwnProperty(navType)) navType = 'anchor'

        let xmlIDs = xmlID.split(' ');
        let searchParams = {
            page: 1,
            'page-size': xmlIDs.length,
            only: 'id',
        };

        if (navMap[navType]['filter_play']) {
            searchParams['f_play.prefix'] = window.nvs.play
        }

        let contentType = navMap[navType]['content_type']
        let searchField = navMap[navType]['xml_id_field']
        searchParams[`t_${searchField}`] = xmlIDs.join('__')

        let endpointParams = new URLSearchParams()
        Object.keys(searchParams).forEach(key => endpointParams.set(key, searchParams[key]))

        fetch(`${window.nvs.host}/api/corpus/${window.nvs.corpusID}/${contentType}/?${endpointParams.toString()}`)
            .then(resp => resp.json())
            .then(searchData => {
                if (searchData.records && searchData.records.length) {
                    let ids = searchData.records.map(record => record.id)
                    populateNavContents(navType, ids, [], xmlIDs[0], link)
                } else if (navType == 'div') {
                    navigateTo('anchor', xmlID, link)
                }
            })
    }
}
function populateNavContents(navType, ids, contents=[], firstXMLid=null, link=null) {
    if (ids.length > 0) {
        let contentType = navMap[navType]['content_type']
        fetch(`${window.nvs.host}/api/corpus/${window.nvs.corpusID}/${contentType}/${ids[0]}/`)
            .then(resp => resp.json())
            .then(contentData => {
                contents.push(contentData)
                ids.shift()

                if (ids.length > 0) {
                    populateNavContents(navType, ids, contents, firstXMLid, link)
                } else {
                    let navTitle = navMap[navType]['title']
                    if (contents.length > 1) { navTitle = navMap[navType]['title_plural']; }
                    let controls = '';
                    let navContent = '';

                    contents.map(function(content, contentIndex) {
                        if (navContent === '') navContent += '<a name="nav-content-start"></a>'
                        else navContent += '<br><br>'

                        if (navType === 'note_cn') {
                            navContent += `
                                <div class="comm-heading">
                                    <span class="comm-indicator">n. ${content.line_label}:</span> ${content.subject_matter}
                                </div>
                            `
                        } else if (navType === 'bibl' && firstXMLid && !controls) {
                            let biblioURL = window.nvs.paratextPrefix
                            if (firstXMLid.startsWith('b_')) {
                                if (biblioURL) {
                                    biblioURL += `Bibliography/#${firstXMLid}`
                                } else {
                                    biblioURL = `/bibliography/${window.nvs.play}/#${firstXMLid}`
                                }
                            } else if (firstXMLid.startsWith('pw_') || firstXMLid.startsWith('s_')) {
                                if (biblioURL) {
                                    biblioURL += `Front Matter/#${firstXMLid}`
                                } else {
                                    biblioURL = `/front/${window.nvs.play}/#${firstXMLid}`
                                }
                            }
                            controls += `<a href="${biblioURL}" target="_blank"><i class="ref-modal-control new-tab"></i></a>`
                        } else if (navType === 'anchor') {
                            if (contentIndex === 0) {
                                navTitle = `
                                    <span>
                                        ${content.section}
                                        <br/>
                                        <div class="ref-subtitle-marker">&nbsp;</div>
                                        <span class="text-nvs-dark-blue">
                                            ${content.title}
                                        </span>
                                    </span>
                                `
                            }

                            let paratextURL = ''
                            let paratextSectionMap = {
                                'Front Matter': 'front',
                                'Appendix': 'appendix',
                                'Bibliography': 'bibliography'
                            }

                            if (window.nvs.paratextPrefix.length) {
                                paratextURL = `${window.nvs.paratextPrefix}${content.section}/`
                            } else {
                                paratextURL = `/${paratextSectionMap[content.section]}/${window.nvs.play}/`
                            }
                            paratextURL += `#paratext-${content.id}`;

                            if (!controls) {
                                controls += `<a href="${paratextURL}" target="_blank"><i class="ref-modal-control new-tab"></i></a>`
                            }
                        }

                        navContent += content[navMap[navType]['content_field']]
                    })

                    let modalID = displayNavModal(navTitle, navContent, link, controls)
                    if (navMap[navType].scroll_anchor) {
                        setTimeout(delayedScroll.bind(null, firstXMLid, true, modalID), 2000)
                    }
                }
            })
        // end fetch
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
            modalEl.style.top = `${linkRect.top + window.scrollY - 20}px`
            modalEl.style.left = `${linkRect.left - (modalEl.offsetWidth + 20)}px`
        } else if (arrowSide === 'left') {
            modalEl.style.top = `${linkRect.top + window.scrollY - 20}px`
            modalEl.style.left = `${linkRect.right + 20}px`
        }

        let closeButton = getEl(`${modalID}-close-button`)
        let closeFunc = (e) => getEl(e.target.dataset.modal_id).remove()
        closeButton.addEventListener('click', closeFunc)
        closeButton.addEventListener('touchstart', closeFunc)

        makeDraggable(modalEl, getElWithQuery(`#${modalID} .ref-modal-header`))
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
function makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0
    if (handle) {
        // if present, the header is where you move the DIV from:
        handle.onmousedown = dragMouseDown
        handle.ontouchstart = dragMouseDown
    } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        el.onmousedown = dragMouseDown
        el.ontouchstart = dragMouseDown
    }

    function dragMouseDown(e) {
        e = e || window.event
        e.preventDefault()

        // get the mouse cursor position at startup:
        pos3 = e.clientX
        pos4 = e.clientY
        document.onmouseup = closeDragElement
        document.ontouchend = closeDragElement
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag
        document.ontouchmove = elementDrag
    }

    function elementDrag(e) {
        e = e || window.event
        if (e.type === "touchmove") {
            pos1 = pos3 - e.touches[0].clientX
            pos2 = pos4 - e.touches[0].clientY
            pos3 = e.touches[0].clientX
            pos4 = e.touches[0].clientY
        } else {
            e.preventDefault();
            // calculate the new cursor position:
            pos1 = pos3 - e.clientX
            pos2 = pos4 - e.clientY
            pos3 = e.clientX
            pos4 = e.clientY
        }

        // set the element's new position:
        el.style.top = (el.offsetTop - pos2) + "px"
        el.style.left = (el.offsetLeft - pos1) + "px"
    }

    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null
        document.onmousemove = null
        document.ontouchend = null
        document.ontouchmove = null
    }
}
function delayedScroll(anchor, smooth=true, parent=null) {
    let scrollOpts = {behavior: 'smooth'}
    if (!smooth) scrollOpts = null

    let idSelectedEl = getElWithQuery(`${parent ? '#' + parent + ' ' : ''}#${anchor}`)
    if (idSelectedEl) idSelectedEl.scrollIntoView(scrollOpts)
    else {
        let anchorSelectedEl = getElWithQuery(`${parent ? '#' + parent + ' ' : ''}a[name=${anchor}]`)
        if (anchorSelectedEl) anchorSelectedEl.scrollIntoView(scrollOpts)
    }
}
