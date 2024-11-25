import { NoteManager } from "./notemanager.js"
import { CommentaryViewer } from "./commviewer.js"
import { SearchManager } from "./searchmanager.js"


export class PlayViewer {
    constructor(viewer_id, config) {
        showLoadingModal()

        // configurable options
        this.minLineHeight = 'minLineHeight' in config ? config.minLineHeight : 40
        this.doIdleLoading = 'doIdleLoading' in config? config.doIdleLoading : true

        // data structures for managing lines
        this.lines = {}
        this.lineNoIDMap = {}
        this.registeredLineNos = new Set()
        this.placedLineNos = new Set()
        this.visibleLineNos = new Set()
        this.lineWindowSize = Math.round(window.innerHeight / this.minLineHeight)
        this.lineWindowBuffer = this.lineWindowSize * 5
        this.lastLineWindow = null
        this.lowestLineNo = null
        this.highestLineNo = 0
        this.observedLineHeight = this.minLineHeight
        this.actScenes = []
        this.isFiltered = false
        this.fullyRegistered = false
        this.noteManager = null
        this.commViewer = null
        this.searchManager = null
        this.initializeLineObserver()
        this.highlightCommLemmas = true

        // initial viewer init
        this.viewer = getEl(viewer_id)
        this.scrollTimer = null
        this.idleTimer = null
        this.placementTimer = null
        this.lastRendered = null
        this.currentBreakpoint = null
        this.resizeTimer = null

        this.buildSkeleton()
    }

    rigUpEvents(all=false) {
        // the events inside this "all" block are intended to only be set up once.
        // the "rigUpEvents" function will be called every time a swath of lines is
        // placed, so we don't want to set these up repeatedly:
        if (all) {
            // click on commentary notes or headers
            document.body.onclick = (e) => {
                let searchForTargets = true
                let clickedElements = document.elementsFromPoint(e.clientX, e.clientY)
                clickedElements.forEach(el => {
                    if (el.classList.contains('ref-modal')) {
                        searchForTargets = false
                    } else if (searchForTargets && el.tagName === 'COMSPAN' && this.highlightCommLemmas) {
                        let commInfo = el.className
                        let commID = commInfo
                            .replace('commentary-lemma-', '')
                            .replace('highlight', '')
                            .replace(' ', '')
                        this.commViewer.navigateTo(commID)
                        searchForTargets = false
                    } else if (searchForTargets && el.classList.contains('comm-heading')) {
                        let lineRow = getEl(`${el.dataset.first_line}-row`)
                        if (lineRow) lineRow.scrollIntoView({behavior: 'smooth'})
                        searchForTargets = false
                    }
                })
            }

            // window resize
            window.onresize = (e) => {
                clearTimeout(this.resizeTimer)
                this.resizeTimer = setTimeout(() => {
                    this.viewerResize()
                }, 1000)
            }

            // commentary highlight toggle
            let commentaryHighlightToggler = getEl('show-commentary-referents')
            commentaryHighlightToggler.onchange = (e) => {
                if (commentaryHighlightToggler.checked) {
                    this.highlightCommLemmas = true
                    this.rigUpEvents()
                } else {
                    this.highlightCommLemmas = false
                    forElsMatching('comspan.highlight', (el) => {
                        el.removeEventListener('mouseenter', this.comspanHover)
                        el.removeEventListener('mouseleave', this.comspanLeave)
                        el.classList.remove('highlight')
                    })
                }
            }

            // filter lines button
            getEl('filter-lines-button').onclick = (e) => {
                this.searchManager.filterLines()
            }

            // set up "go to line #" box
            let lineNoGoBox = getEl('hdr-line-no-box')
            lineNoGoBox.onkeyup = (e) => {
                if (e.key === 'Enter') {
                    let lineNo = lineNoGoBox.value
                    lineNoGoBox.value = ''
                    lineNoGoBox.blur()

                    let lineRow = getEl(`tln_${lineNo}-row`)
                    if (lineRow) lineRow.scrollIntoView({behavior: 'smooth'})
                    else {
                        while (lineNo.length < 4) {
                            lineNo = '0' + lineNo
                        }
                        lineRow = getEl(`tln_${lineNo}-row`)
                        if (lineRow) lineRow.scrollIntoView({behavior: 'smooth'})
                        else {
                            fetch(`${window.nvs.endpoints.line}?f_alt_xml_ids=tln_${lineNo}&page-size=1&only=xml_id`)
                                .then(res => res.json())
                                .then(lineInfo => {
                                    if (lineInfo.records && lineInfo.records.length === 1) {
                                        let lineID = lineInfo.records[0].xml_id
                                        getEl(`${lineID}-row`).scrollIntoView({behavior: 'smooth'})
                                    }
                                })
                        }
                    }
                }
            }
        }

        // these events are to be set up repeatedly

        // find all commspans and add the 'highlight' class if appropriate.
        // also rig up hover events
        forElsMatching('comspan:not(.highlight)', (el) => {
            if (this.highlightCommLemmas) {
                el.classList.add('highlight')

                // add the hover events
                el.addEventListener('mouseenter', this.comspanHover)
                el.addEventListener('mouseleave', this.comspanLeave)
            }
        })
    }

    render() {
        // since we're looking at a filtered set of lines, we can't count on them
        // being contiguous and we must only render visible lines
        if (this.isFiltered) {
            let lineChunkStart = null
            let lineChunkEnd = null
            let sender = this

            this.getLineWindowNos().forEach(lineNo => {
                if (!this.registeredLineNos.has(lineNo)) {
                    if (lineChunkStart === null) lineChunkStart = lineChunkEnd = lineNo
                    else if (lineNo - lineChunkEnd > 1) {
                        this.fetchLines(lineChunkStart, lineChunkEnd, (lineResults, noteResults) => {
                            sender.registerLines(lineResults.records, noteResults.records, true)
                        })
                        lineChunkStart = lineChunkEnd = lineNo
                    } else {
                        lineChunkEnd = lineNo
                    }
                } else if (!this.placedLineNos.has(lineNo)) this.placeLine(lineNo)
            })

            if (lineChunkStart !== null) {
                this.fetchLines(lineChunkStart, lineChunkEnd, (lineResults, noteResults) => {
                    sender.registerLines(lineResults.records, noteResults.records, true)
                })
            }
        }
        // this is the normal strategy for rendering lines, which establishes a
        // "window" of lines to render with buffers on either side of the first and last
        // visible line
        else {
            // get all visible lines plus a buffer before and after them
            let currentLineWindow = this.getLineWindowNos()

            // if this is our first render, however, force the loading of the first lines
            if (this.lastLineWindow === null) {
                currentLineWindow.clear()
                for (let lineNo = this.lowestLineNo; lineNo <= (this.lineWindowSize + this.lineWindowBuffer); lineNo++) {
                    if (lineNo <= this.highestLineNo) currentLineWindow.add(lineNo)
                }
            } else {
                // since this is not our first render, determine what lines are no longer
                // in the window and schedule them for retirement
                this.lastLineWindow.forEach(lineNo => {
                    if (!currentLineWindow.has(lineNo) && this.placedLineNos.has(lineNo)) {
                        let lineID = this.lineNoIDMap[lineNo]
                        let lineRow = getEl(`${lineID}-row`)
                        if (lineRow.offsetHeight == this.observedLineHeight) {
                            this.lines[lineID].retirementTimer = setTimeout(() => {
                                this.retireLine(lineRow, lineNo)
                            }, 3000)
                        }

                    }
                })
            }

            // iterate over line window and either place the line
            // or establish a range of lines that need to be registered
            let lowestLineNoToRegister = null
            let highestLineNoToRegister = null
            currentLineWindow.forEach(lineNo => {
                if (this.registeredLineNos.has(lineNo)) {
                    this.placeLine(lineNo)
                } else {
                    if (lowestLineNoToRegister === null || lineNo < lowestLineNoToRegister)
                        lowestLineNoToRegister = lineNo

                    if (highestLineNoToRegister === null || lineNo > highestLineNoToRegister)
                        highestLineNoToRegister = lineNo
                }
            })

            // go ahead and register + place unregistered lines
            if (lowestLineNoToRegister !== null && lowestLineNoToRegister <= highestLineNoToRegister) {
                let sender = this
                this.fetchLines(lowestLineNoToRegister, highestLineNoToRegister, (lineResults, noteResults) => {
                    sender.registerLines(lineResults.records, noteResults.records, true)
                })
            }

            this.lastLineWindow = currentLineWindow
        }

        // set active actsene indicator
        let lowestVisibleLineNo = Math.min(...this.visibleLineNos)
        if (lowestVisibleLineNo < this.highestLineNo) lowestVisibleLineNo++
        let actScene = getElWithQuery(`.play-row[data-line_number="${lowestVisibleLineNo}"]`).dataset.actscene
        let currentActiveIndicator = getElWithQuery('.actscene-indicator.active')
        if (currentActiveIndicator.dataset.actscene !== actScene) {
            currentActiveIndicator.classList.remove('active')
            getElWithQuery(`.actscene-indicator[data-actscene="${actScene}"]`).classList.add('active')
        }

        this.lastRendered = new Date().getTime()
    }

    placeLine(lineNo, lineID=null) {
        clearTimeout(this.placementTimer)
        if (lineID === null && (lineNo in this.lineNoIDMap)) lineID = this.lineNoIDMap[lineNo]
        if (lineID in this.lines) {
            this.cancelRetirement(lineID)
            let line = this.lines[lineID]

            if (!this.placedLineNos.has(line.line_number)) {
                let lineRow = getEl(`${lineID}-row`)
                lineRow.dataset.act = line.act
                lineRow.dataset.scene = line.scene
                lineRow.dataset.witness_meter = line.witness_meter
                
                let hasVariants = parseInt(line.witness_meter) > 0
                let disclosureTriangle = ''
                if (hasVariants) {
                    disclosureTriangle = `
                        <a id="${line.xml_id}-variant-toggler"
                               class="variant-toggler"
                               data-bs-toggle="collapse"
                               data-bs-target="#${line.xml_id}-variant-div"
                               role="button"
                               aria-expanded="false"
                               aria-controls="${line.xml_id}-variant-div">
                        </a>
                    `
                }
                
                lineRow.innerHTML = `
                    <div class="row gx-0 flex-grow-1">
                        <div id="${line.xml_id}-witness-col" class="d-none d-md-flex col-md-4 m-0 p-0 witness-meter${hasVariants ? ' clickable' : ''}">
                            <img id="${line.xml_id}-witness-meter" height="30" width="100%" src="/static/img/blank-meter.png" loading="lazy" data-witness_indicators="${line.witness_meter}" />
                        </div>
                        <div id="${line.xml_id}-text-col" class="col-11 col-md-7 m-0 p-0 play-words${hasVariants ? '' : ' no-variants'}">
                            ${disclosureTriangle}
                            <div class="w-100 play-html">${line.rendered_html}</div>
                        </div>
                        <div id="${line.xml_id}-number-col" class="col-1 m-0 p-0">
                            <div class="row gx-0 h-100 bg-nvs">
                                <div class="col-12 col-md-8 offset-md-4 play-label d-flex justify-content-center align-items-center">
                                    ${line.line_label}
                                </div>
                            </div>
                        </div>
                    </div>
                    ${hasVariants ? `<div class="collapse" id="${line.xml_id}-variant-div"></div>` : '' }
                `
                if (this.currentBreakpoint != null) this.noteManager.drawWitnessMeter(getEl(`${line.xml_id}-witness-meter`))

                if (hasVariants) {
                    getEl(`${line.xml_id}-variant-div`).addEventListener('show.bs.collapse', (e) => {
                        forElsMatching(`#${e.target.id} .variant-witness-meter img`, (img) => {
                            this.noteManager.drawWitnessMeter(img, true)
                            this.noteManager.rigUpNoteEvents(line.xml_id)
                        })
                    })
                }

                this.placedLineNos.add(line.line_number)
                this.noteManager.placeNotes(line.xml_id)
            }
        }
        let sender = this
        this.placementTimer = setTimeout(() => {
            sender.rigUpEvents()
            if (this.currentBreakpoint == null) sender.viewerResize()
            else sender.calculateObservedLineHeight()
        }, 500)
    }

    initializeLineObserver() {
        let sender = this
        this.lineObserver = new IntersectionObserver(function(entries) {
            clearTimeout(sender.idleTimer)
            entries.forEach((entry, index) => {
                let lineNo = parseInt(entry.target.dataset.line_number)
                if (entry.isIntersecting) {
                    sender.visibleLineNos.add(lineNo)
                } else {
                    sender.visibleLineNos.delete(lineNo)
                }
            })
            if (!sender.fullyRegistered && sender.doIdleLoading) sender.startIdleTimer()
        })
    }

    retireLine(lineRow, lineNo) {
        if (!this.getLineWindowNos().has(lineNo)) {
            clearEl(lineRow)
            this.placedLineNos.delete(parseInt(lineRow.dataset.line_number))
            this.lines[lineRow.dataset.line_id].retirementTimer = null
        }
    }

    cancelRetirement(lineID) {
        if ((lineID in this.lines) && this.lines[lineID].retirementTimer != null) {
            clearTimeout(this.lines[lineID].retirementTimer)
        }
    }

    viewerScroll() {
        clearTimeout(this.scrollTimer)
        this.scrollTimer = setTimeout(() => {
            this.render()
        }, 200)

        if (this.lastRendered != null) {
            if (Math.abs((new Date().getTime() - this.lastRendered) / 1000) >= 1) {
                this.render()
            }
        }
    }

    viewerResize() {
        let lastBreakpoint = this.currentBreakpoint
        this.currentBreakpoint = getBreakpoint()
        this.noteManager.witnessMeterWidth = getEl('witness-header').clientWidth

        let headerRow = getEl('playviewer-header-row')
        let controlsRow = getEl('playtext-controls-row')
        let actSceneFrameHolder = getEl('act-scene-frame-holder')
        let commFrame = getEl('commentary-frame')
        let playtextCol = getEl('playtext-col')
        let playtextHeaderLabel = getEl('playtext-header-label')
        console.log(this.currentBreakpoint)

        if (['xs', 'sm'].includes(this.currentBreakpoint)) {
            // clear out medium style specs
            if (lastBreakpoint != null) {
                actSceneFrameHolder.removeAttribute('style')
                commFrame.removeAttribute('style')
                playtextCol.style.removeProperty('padding-bottom')
            }

            document.body.classList.add('mobile')
            headerRow.style.position = 'sticky'
            headerRow.style.top = '0'
            setCssVar('--nvs-playtext-viewport-size', 'calc(100vh - 200px)')
            this.disableMiniMap()
            playtextCol.style.removeProperty('background-image')
            playtextCol.style.scrollPaddingTop = `${this.observedLineHeight}px`
            forElsMatching('.variant-witness-meter', (el) => el.classList.add('d-none'))
            commFrame.style.maxHeight = '200px'
            actSceneFrameHolder.classList.add('d-none')
            playtextHeaderLabel.style.removeProperty('padding-left')

        } else if (this.currentBreakpoint === 'md') {
            // clear out small style specs
            if (lastBreakpoint != null) {
                headerRow.style.removeProperty('position')
                headerRow.style.removeProperty('top')
                playtextCol.style.removeProperty('scroll-padding-top')
                commFrame.removeAttribute('style')
                actSceneFrameHolder.classList.remove('d-none')
                playtextHeaderLabel.style.paddingLeft = `200px`
            }

            document.body.classList.add('mobile')
            setCssVar('--nvs-playtext-viewport-size', 'calc(100vh - 90px)')
            this.disableMiniMap()
            actSceneFrameHolder.style.height = '100%'
            commFrame.style.position = 'absolute'
            commFrame.style.top = `${document.body.clientHeight - 200}px`
            commFrame.style.left = '0'
            commFrame.style.width = `${controlsRow.clientWidth + controlsRow.getBoundingClientRect().left}px`
            commFrame.style.maxHeight = '200px'
            playtextCol.style.paddingBottom = '200px'

        } else if (lastBreakpoint != null) {
            // clear out styling from small size
            document.body.classList.remove('mobile')
            headerRow.style.removeProperty('position')
            headerRow.style.removeProperty('top')
            setCssVar('--nvs-playtext-viewport-size', 'calc(100vh - 90px)')
            this.renderMiniMap()
            playtextCol.style.removeProperty('scroll-padding-top')
            commFrame.removeAttribute('style')
            actSceneFrameHolder.classList.remove('d-none')
            playtextHeaderLabel.style.paddingLeft = `200px`

            // clear out styling from medium size
            actSceneFrameHolder.removeAttribute('style')
            commFrame.removeAttribute('style')
            playtextCol.style.removeProperty('padding-bottom')
        }

        // since the window has resized, it's possible that the most frequent
        // line height has changed. as such, we need to reset the min height
        // for playline rows and recalculate what it should be now
        setCssVar('--nvs-play-row-min-height', `${this.minLineHeight}px`)
        setTimeout(() => {
            let heightChanged = this.calculateObservedLineHeight()

            setTimeout(() => {
                // since witness meters are drawn on the fly based on dimensions, we
                // need to a) make sure any meters that got hidden due to resizing are
                // restored, b) redraw any variant meters that are visible, and c)
                // redraw all visible line-level meters
                if ((lastBreakpoint != null || heightChanged) && !['xs', 'sm'].includes(this.currentBreakpoint)) {
                    this.noteManager.redrawMeters()
                }
            }, 500)
        }, 500)
    }

    calculateObservedLineHeight() {
        let heightCounts = {}
        this.placedLineNos.forEach(lineNo => {
            let lineRow = getEl(`${this.lineNoIDMap[lineNo]}-row`)
            let lineHeight = lineRow.offsetHeight

            if (lineHeight in heightCounts) heightCounts[lineHeight] += 1
            else heightCounts[lineHeight] = 1
        })
        let highestCount = 0
        let mostFrequentHeight = 0
        Object.keys(heightCounts).forEach(lineHeight => {
            if (heightCounts[lineHeight] > highestCount) {
                highestCount = heightCounts[lineHeight]
                mostFrequentHeight = lineHeight
            }
        })
        if (this.observedLineHeight !== mostFrequentHeight) {
            if (mostFrequentHeight >= this.minLineHeight) this.observedLineHeight = mostFrequentHeight
            else this.observedLineHeight = this.minLineHeight

            setCssVar('--nvs-play-row-min-height', `${this.observedLineHeight}px`)
            return true
        }
        return false
    }

    async navigateTo(lineID, openVariants=false, callback=null) {
        getEl(`${lineID}-row`).scrollIntoView({behavior: 'smooth'})

        if (callback !== null) {
            let attempts = 0
            while (!(lineID in this.lines) && attempts < 20) {
                await sleep(200)
                attempts += 1
            }
            while (!this.placedLineNos.has(this.lines[lineID].line_number) && attempts < 20) {
                await sleep(200)
                attempts += 1
            }
            if (this.placedLineNos.has(this.lines[lineID].line_number)) {
                if (openVariants && this.lines[lineID].notes && this.lines[lineID].notes.length) {
                    getCollapse(getEl(`${lineID}-variant-div`), {}, callback).show()
                } else callback()
            } else {
                console.log(`It took too long to load ${lineID}`)
            }
        }
    }
    
    registerLines(lines, notes, place=false) {
        let linesToMarkAsRegistered = []

        lines.forEach(line => {
            if (!(line.xml_id in this.lines)) {
                this.lines[line.xml_id] = line
                this.lines[line.xml_id]['notes'] = []
                this.lines[line.xml_id]['retirementTimer'] = null
                linesToMarkAsRegistered.push({line_number: line.line_number, xml_id: line.xml_id})
            }
        })

        this.noteManager.registerNotes(notes)

        linesToMarkAsRegistered.forEach(line => {
            this.registeredLineNos.add(line.line_number)

            getEl(`${line.xml_id}-row`)
                .setAttribute('data-registered', true)

            if (place) this.placeLine(line.line_number, line.xml_id)
        })
    }

    buildSkeleton() {
        // load the playviewer template
        fetch(`${window.nvs.staticPath}/templates/playviewer.html`).then(html => html.text()).then(html => {
            this.viewer.innerHTML = html
            this.viewer = getEl('playtext-col')
            this.viewer.onscroll = (event) => this.viewerScroll(event)
            setCssVar('--nvs-play-row-min-height', `${this.minLineHeight}px`)

            // make sure lines are displayed right away
            let params = this.getEndpointParams({
                only: 'xml_id,line_number,line_label,act,scene',
                'page-size': 10000
            })
            let url = `${window.nvs.endpoints.line}?${params.toString()}`

            let sender = this
            fetch(url).then(lineResults => lineResults.json()).then(lineResults => {
                sender.totalLines = lineResults.meta.total

                let lines = lineResults.records
                let skelHTML = ''

                lines.forEach(line => {
                    let actScene = makeActScene(line.act, line.scene)
                    if (!sender.actScenes.includes(actScene)) {
                        sender.actScenes.push(actScene)
                    }

                    skelHTML += `<div id="${line.xml_id}-row"
                        class="play-row d-flex flex-column"
                        data-line_id="${line.xml_id}"
                        data-line_number="${line.line_number}"
                        data-line_label="${line.line_label}"
                        data-act="${line.act}"
                        data-scene="${line.scene}"
                        data-actscene="${actScene}">
                        </div>`

                    sender.lineNoIDMap[line.line_number] = line.xml_id
                    if (sender.lowestLineNo === null) sender.lowestLineNo = line.line_number
                    sender.highestLineNo = line.line_number
                })

                sender.viewer.innerHTML = skelHTML
                forElsMatching('.play-row', (playRow) => sender.lineObserver.observe(playRow))

                sender.renderActSceneNav()
                sender.renderMiniMap()
                setTimeout(() => {
                    sender.viewerScroll()
                    hideLoadingModal()
                }, 500)
            })

            // rig up commentary viewer
            sender.commViewer = new CommentaryViewer('commentary-frame')

            // rig up note manager
            sender.noteManager = new NoteManager()

            // rig up search manager
            sender.searchManager = new SearchManager(sender.commViewer)

            // rig up events
            sender.rigUpEvents(true)
        })
    }

    renderActSceneNav() {
        let actSceneFrame = getEl('act-scene-frame')
        let actSceneHTML = ''

        this.actScenes.forEach((actScene) => {
            if (getElWithQuery(`.play-row[data-actscene="${actScene}"]:not(.d-none)`)) {
                actSceneHTML += `
                    <div class="actscene-indicator${actSceneHTML.length === 0 ? ' active' : ''}" data-actscene="${actScene}">
                        ${actScene}
                    </div>
                `
            }
        })

        actSceneFrame.innerHTML = actSceneHTML
        forElsMatching('.actscene-indicator', (el) => {
            el.onclick = (e) => {
                getElWithQuery(`.play-row[data-actscene="${el.dataset.actscene}"]`).scrollIntoView({behavior: 'smooth'})
            }
        })
    }

    renderMiniMap(noCache=false) {
        let height = getEl('playtext-col').offsetHeight
        let miniMapURL = `${window.nvs.endpoints.minimap}?width=40&height=${parseInt(height)}`
        if (noCache) miniMapURL += `&no-cache=${Math.floor(Date.now() / 1000)}`
        setCssVar('--scrollbarURL', `url(${miniMapURL})`)
    }
    
    disableMiniMap() {
        setCssVar('--scrollbarURL', 'none')
    }

    comspanHover(e){
        e.target.classList.forEach(commClass => {
            if (commClass !== 'highlight') {
                forElsMatching(`.${commClass}`, hovered => {
                    hovered.style.borderBottom = 'solid 1px var(--nvs-primary-orange) !important'
                })
            }
        })
    }

    comspanLeave(e) {
        e.target.classList.forEach(commClass => {
            if (commClass !== 'highlight') {
                forElsMatching(`.${commClass}`, hovered => hovered.removeAttribute('style'))
            }
        })
    }

    getLineWindowNos() {
        let lineCursor = Math.min(...this.visibleLineNos) - this.lineWindowBuffer
        let windowNos = new Set()

        if (!this.isFiltered) {
            if (lineCursor < this.lowestLineNo) lineCursor = this.lowestLineNo

            let maxLineNo = Math.max(...this.visibleLineNos) + this.lineWindowBuffer

            while (lineCursor <= maxLineNo) {
                if (lineCursor >= this.lowestLineNo && lineCursor <= this.highestLineNo)
                    windowNos.add(lineCursor)

                lineCursor += 1
            }
        } else {
            let sortableNos = []
            const getVisibleSibling = (el, dir) => {
                let sibling = null
                if (dir === 'next') sibling = el.nextElementSibling
                else sibling = el.previousElementSibling
                if (sibling) {
                    if (sibling.classList.contains('d-none')) return getVisibleSibling(sibling, dir)
                    else return sibling
                }
                return null
            }

            let rowCursor = getEl(`${this.lineNoIDMap[lineCursor]}-row`)
            sortableNos.push(parseInt(rowCursor.dataset.line_number))
            for (let noCursor = 0; noCursor < this.lineWindowBuffer; noCursor++) {
                rowCursor = getVisibleSibling(rowCursor, 'previous')
                if (rowCursor) sortableNos.push(parseInt(rowCursor.dataset.line_number))
                else break
            }
            rowCursor = getEl(`${this.lineNoIDMap[lineCursor]}-row`)
            for (let noCursor = 0; noCursor < this.lineWindowBuffer * 2; noCursor++) {
                rowCursor = getVisibleSibling(rowCursor, 'next')
                if (rowCursor) sortableNos.push(parseInt(rowCursor.dataset.line_number))
                else break
            }
            sortableNos.sort().forEach(lineNo => windowNos.add(lineNo))
        }

        return windowNos
    }

    startIdleTimer() {
        let sender = this
        sender.idleTimer = setTimeout(() => {
            console.log('idle loading...')
            sender.lastRendered = null
            let firstRemainingLine = getElWithQuery('.play-row:not([data-registered])')
            if (firstRemainingLine) {
                let startLineNo = parseInt(firstRemainingLine.dataset.line_number)
                sender.fetchLines(startLineNo, startLineNo + 500, (lineResults, noteResults) => {
                    sender.registerLines(lineResults.records, noteResults.records)
                    sender.startIdleTimer()
                })
            } else {
                sender.fullyRegistered = true
                console.log('fully registered!')
            }
        }, 3000)
    }

    getEndpointParams(params, forEndpoint='line') {
        let endpointParams = new URLSearchParams()
        endpointParams.set('f_play.prefix', window.nvs.play)

        if (forEndpoint === 'line') endpointParams.set('s_line_number', 'asc')
        else if (forEndpoint === 'note') endpointParams.set('s_lines.line_number', 'asc')

        Object.keys(params).forEach(key => endpointParams.set(key, params[key]))
        return endpointParams
    }

    async fetchLines(startLineNo, endLineNo, callback) {
        let lineParams = this.getEndpointParams({
            r_line_number: `${startLineNo}to${endLineNo}`,
            only: 'xml_id,line_number,rendered_html,act,scene,line_label,witness_meter',
            'page-size': 1000
        }, 'line')

        let noteParams = this.getEndpointParams({
            'r_lines.line_number': `${startLineNo}to${endLineNo}`,
            only: 'xml_id,lines.line_number,lines.xml_id,variants,witness_meter',
            'page-size': 1000
        }, 'note')

        let lineURL = `${window.nvs.endpoints.line}?${lineParams.toString()}`
        let noteURL = `${window.nvs.endpoints.note}?${noteParams.toString()}`

        const responses = await Promise.all([fetch(lineURL), fetch(noteURL)])
        let [lineResults, noteResults] = await Promise.all(responses.map(response => response.json()))

        callback(lineResults, noteResults)
    }
}