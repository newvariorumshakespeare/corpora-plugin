class PlayViewer {
    constructor(viewer_id, config) {
        showLoadingModal()

        // register configuration
        this.configure('play', 'wt', config)
        this.configure('host', 'corpora.dh.tamu.edu', config)
        this.configure('corpusID', '5f3d7c81cfcceb0074aa7f55', config)
        this.configure('templatesPath', '/static/templates', config)
        this.configure('witnessMeterEndpoint', 'https://newvariorumshakespeare.org/witnessmeter/', config)
        this.configure('witnessesEndpointHost', 'http://localhost/', config)
        this.configure('miniMapEndpoint', 'http://localhost/', config)
        this.configure('lineHeight', 20, config)
        this.configure('viewerHeight', '90vh', config)
        this.configure('initialLineCount', 100, config)
        this.configure('doIdleLoading', true, config)

        // data structures for managing lines
        this.lines = {}
        this.lineNoIDMap = {}
        this.registeredLineNos = new Set()
        this.placedLineNos = new Set()
        this.visibleLineNos = new Set()
        this.lineWindowSize = Math.round(window.innerHeight / this.lineHeight)
        this.lineWindowBuffer = this.lineWindowSize * 5
        this.lastLineWindow = null
        this.lowestLineNo = null
        this.highestLineNo = 0
        this.actScenes = []
        this.isFiltered = false
        this.fullyRegistered = false
        this.commViewer = null
        this.searchManager = null
        this.initializeLineObserver()

        // data structures for managing notes and commentary
        this.notes = {}
        this.lastCenturyBuffer = 20
        this.highlightCommLemmas = true

        // initial viewer init
        this.viewer = getEl(viewer_id)
        this.scrollTimer = null
        this.idleTimer = null
        this.placementTimer = null
        this.lastRendered = null
        this.currentBreakpoint = null
        this.resizeTimer = null

        // set up endpoints
        this.lineEndpoint = `${this.host}/api/corpus/${this.corpusID}/PlayLine/`
        this.noteEndpoint = `${this.host}/api/corpus/${this.corpusID}/TextualNote/`
        this.witnessesEndpoint = `${this.witnessesEndpointHost}api/corpus/${this.corpusID}/nvs-witnesses/${this.play}/`

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

            this.visibleLineNos.forEach(lineNo => {
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
                        if (lineRow.offsetHeight === this.lineHeight) {
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
                if (parseInt(line.witness_meter)) {
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
                let witnessMeterCol = getEl(`${line.xml_id}-witness-col`)
                let witnessMeterImg = getEl(`${line.xml_id}-witness-meter`)
                this.drawWitnessMeter(
                    line.witness_meter,
                    witnessMeterImg,
                    witnessMeterCol.clientWidth,
                    witnessMeterCol.clientHeight - 8
                )

                if (hasVariants) {
                    getEl(`${line.xml_id}-variant-div`).addEventListener('show.bs.collapse', (e) => {
                        forElsMatching(`#${e.target.id} .variant-witness-meter img`, (img) => {
                            console.log('drawing variant meter')
                            this.drawWitnessMeter(
                                img.dataset.witness_indicators,
                                img,
                                witnessMeterCol.offsetWidth,
                                25,
                                "#FFFFFF"
                            )
                        })
                    })
                }

                this.placedLineNos.add(line.line_number)
                this.placeNotes(line.xml_id)
            }
        }
        let sender = this
        this.placementTimer = setTimeout(() => {sender.rigUpEvents()}, 500)
    }

    placeNotes(lineID) {
        let line = this.lines[lineID]
        let line_variant_div = getEl(`${lineID}-variant-div`)
        let line_varients_html = ''

        // make note/variant elements
        try {
            line.notes.forEach(note_id => {
                let note = this.notes[note_id]
                let description_displayed = false

                if (note.variants) {
                    note.variants.forEach(variant => {
                        let variant_words = variant.variant;
                        if (!variant_words) {
                            if (variant.description === null) {
                                variant_words = `<span class="variant-note">Due to the site being in beta, an error occurred when parsing this variant.</span>`
                            } else {
                                description_displayed = true
                                variant_words = `<span class="variant-note">${variant.description}</span>`
                            }
                        }
                        variant_words = note.line_range + variant_words

                        line_varients_html += `
                        <div class="row gx-0 variant-row">
                            <div class="col-sm-4 p-0 m-0">
                                <div class="row gx-0">
                                    <div id="variant-${variant.id}" class="col-sm-12 p-0 m-0 variant-witness-meter clickable">
                                        <img id="${lineID}-${variant.id}-witness-meter" height="15" width="100%" src="/static/img/blank-meter.png" data-witness_indicators="${variant.witness_meter}" />
                                    </div>
                                </div>
                                <div class="row gx-0">
                                    <div class="col-sm-12 witness-formula" data-line-id="${lineID}" data-variant-id="${variant.id}">
                                        ${variant.witness_formula}${variant.description && !description_displayed ? ' ' + variant.description : ''}
                                    </div>
                                </div>
                            </div>
                            <div class="col-sm-8 p-0 m-0 variant-words align-self-center">${variant_words}</div>
                        </div>
                        `
                    })

                    line_variant_div.innerHTML = line_varients_html
                }
            })
        } catch(error) {
            console.log(`Error placing lines for ${lineID}`)
        }
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

    drawWitnessMeter(witness_meter, img_element, width, height, inactive_color="#CFCFCF") {
        if (!['xs', 'sm'].includes(this.currentBreakpoint))
            img_element.src = `${this.witnessMeterEndpoint}${witness_meter}/${Math.floor(height)}/${Math.floor(width)}/${inactive_color.replace('#', '')}/0/`
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

        let headerRow = getEl('playviewer-header-row')
        let controlsRow = getEl('playtext-controls-row')
        let actSceneFrameHolder = getEl('act-scene-frame-holder')
        let actSceneFrame = getEl('act-scene-frame')
        let commFrame = getEl('commentary-frame')
        let playtextCol = getEl('playtext-col')
        console.log(this.currentBreakpoint)

        if (['xs', 'sm'].includes(this.currentBreakpoint)) {
            console.log('doing small')
            // clear out medium style specs
            actSceneFrameHolder.removeAttribute('style')
            actSceneFrame.removeAttribute('style')
            commFrame.removeAttribute('style')

            headerRow.style.position = 'sticky'
            headerRow.style.top = '0'
            setCssVar('--nvs-playtext-viewport-size', 'calc(100vh - 200px)')
            this.disableMiniMap()
            commFrame.style.maxHeight = '200px'
            actSceneFrame.style.maxHeight = '200px'
            actSceneFrame.style.overflowY = 'scroll'
            setTimeout(() => {
                headerRow.scrollIntoView()
            }, 1000)

        } else if (this.currentBreakpoint === 'md') {
            // clear out small style specs
            headerRow.style.removeProperty('position')
            headerRow.style.removeProperty('top')
            commFrame.style.removeProperty('max-height')
            document.body.classList.add('mobile')

            setCssVar('--nvs-playtext-viewport-size', 'calc(100vh - 90px)')
            this.disableMiniMap()
            setTimeout(() => {
                actSceneFrameHolder.style.height = '100%'
                commFrame.style.position = 'absolute'
                commFrame.style.top = `${document.body.clientHeight - 200}px`
                commFrame.style.left = '0'
                commFrame.style.width = `${controlsRow.clientWidth + controlsRow.getBoundingClientRect().left}px`
                commFrame.style.maxHeight = '200px'
                playtextCol.style.paddingBottom = '200px'
            }, 500)

        } else {
            actSceneFrameHolder.removeAttribute('style')
            actSceneFrame.removeAttribute('style')
            commFrame.removeAttribute('style')
            headerRow.style.removeProperty('position')
            headerRow.style.removeProperty('top')
            setCssVar('--nvs-playtext-viewport-size', 'calc(100vh - 90px)')
            this.renderMiniMap()
            commFrame.style.removeProperty('max-height')
            document.body.classList.remove('mobile')
        }

        if (lastBreakpoint != null && !['xs', 'sm'].includes(this.currentBreakpoint)) {
            console.log('redrawing meters')
            this.placedLineNos.forEach(lineNo => {
                let lineID = this.lineNoIDMap[lineNo]
                let witnessMeterImg = getEl(`${lineID}-witness-meter`)
                let witnessMeterCol = witnessMeterImg.parentElement

                this.drawWitnessMeter(
                    witnessMeterImg.dataset.witness_indicators,
                    witnessMeterImg,
                    witnessMeterCol.clientWidth,
                    witnessMeterCol.clientHeight - 8
                )
            })

            this.drawWitnessHeaderAndBackground()
        }
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
                this.lineNoIDMap[line.line_number] = line.xml_id
                linesToMarkAsRegistered.push({line_number: line.line_number, xml_id: line.xml_id})
            }
        })

        notes.forEach(note => {
            note.lines.forEach(line => {
                if (line.xml_id in this.lines) {
                    this.lines[line.xml_id].notes.push(note.xml_id)
                }
            })

            note.line_range = ''
            if (note.lines.length > 1) {
                let startLineEl = getEl(`${note.lines[0].xml_id}-row`)
                let endLineEl = getEl(`${note.lines[note.lines.length - 1].xml_id}-row`)
                note.line_range = `<span class='text-muted'>${startLineEl.dataset.line_label}-${endLineEl.dataset.line_label}: </span>`;
            }
            delete note.lines
            this.notes[note.xml_id] = note
        })

        linesToMarkAsRegistered.forEach(line => {
            this.registeredLineNos.add(line.line_number)

            getEl(`${line.xml_id}-row`)
                .setAttribute('data-registered', true)

            if (place) this.placeLine(line.line_number, line.xml_id)
        })
    }

    buildSkeleton() {
        // load the playviewer template
        fetch(`${this.templatesPath}/playviewer.html`).then(html => html.text()).then(html => {
            this.viewer.innerHTML = html
            this.viewer = getEl('playtext-col')
            this.viewer.onscroll = (event) => this.viewerScroll(event)

            // make sure lines are displayed right away
            let params = this.getEndpointParams({
                only: 'xml_id,line_number,line_label,act,scene',
                'page-size': 10000
            })
            let url = `${this.lineEndpoint}?${params.toString()}`

            let sender = this
            fetch(url).then(lineResults => lineResults.json()).then(lineResults => {
                sender.totalLines = lineResults.meta.total
                sender.viewerHeight = sender.totalLines * sender.lineHeight

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
                        data-actscene="${actScene}"
                        style="min-height: ${this.lineHeight}px; box-sizing: border-box;"></div>`

                    if (sender.lowestLineNo === null) sender.lowestLineNo = line.line_number
                    sender.highestLineNo = line.line_number
                })

                sender.viewer.innerHTML = skelHTML
                forElsMatching('.play-row', (playRow) => sender.lineObserver.observe(playRow))

                sender.renderActSceneNav()
                sender.renderMiniMap()
                setTimeout(() => {
                    sender.viewerScroll()
                    sender.viewerResize()
                    hideLoadingModal()
                }, 500)
            })

            // rig up commentary viewer
            sender.commViewer = new CommentaryViewer('commentary-frame', {
                play: sender.play,
                host: sender.host,
                corpusID: sender.corpusID
            })

            // rig up search manager
            sender.searchManager = new SearchManager(sender,{
                play: sender.play,
                host: sender.host,
                corpusID: sender.corpusID,
                templatesPath: sender.templatesPath,
                playViewer: sender,
                commViewer: sender.commViewer
            })

            // rig up events
            sender.rigUpEvents(true)

            // now fetch all the witness info
            fetch(sender.witnessesEndpoint).then(witResults => witResults.json()).then(witResults => {
                sender.witnessCount = witResults.witness_count
                sender.witnesses = witResults.witnesses
                sender.witnessCenturies = witResults.witness_centuries

                sender.drawWitnessHeaderAndBackground()
            })
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
        let miniMapURL = `${this.miniMapEndpoint}corpus/${this.corpusID}/play-minimap/${this.play}/`
        miniMapURL += `?width=40&height=${parseInt(height)}`
        if (noCache) miniMapURL += `&no-cache=${Math.floor(Date.now() / 1000)}`
        setCssVar('--scrollbarURL', `url(${miniMapURL})`)
    }
    
    disableMiniMap() {
        setCssVar('--scrollbarURL', 'none')
    }

    drawWitnessHeaderAndBackground() {
        if (!['xs', 'sm'].includes(this.currentBreakpoint)) {
            let witHeader = getEl('witness-header')
            let witHeaderCol = getEl('playtext-header-col')
            let width = witHeader.offsetWidth
            let selectivelyQuotedWidth = 20
            let witnessWidth = (width - selectivelyQuotedWidth) / this.witnessCount
            let centuries = Object.keys(this.witnessCenturies)
            let lastCentury = centuries[centuries.length - 1]

            if (this.witnessCenturies[lastCentury] * witnessWidth < 20) {
                this.lastCenturyBuffer = 20 - this.witnessCenturies[lastCentury] * witnessWidth
                witnessWidth = (width - (this.lastCenturyBuffer + selectivelyQuotedWidth)) / this.witnessCount
            }

            let headerHeight = witHeader.offsetHeight
            let headerCanvas = document.createElement('canvas')
            let headerContext = headerCanvas.getContext('2d')

            let fontColor = getCssVar('nvs-mid-gray')
            let lightOrange = getCssVar('nvs-light-orange')
            let delimiterColor = getCssVar('nvs-background-color')
            let fontSize = 12
            headerContext.font = `${fontSize}px Roboto Condensed`
            headerContext.textAlign = "left"
            headerContext.textBaseline = "bottom"

            let playtextCol = getEl('playtext-col')
            let backgroundCanvas = document.createElement('canvas')
            backgroundCanvas.height = playtextCol.clientHeight
            backgroundCanvas.width = width
            let backgroundContext = backgroundCanvas.getContext('2d')

            // DRAW LIGHT ORANGE BACKGROUND ON BOTH CANVASES
            headerContext.beginPath()
            headerContext.fillStyle = lightOrange
            headerContext.fillRect(0, 0, width, headerHeight)

            backgroundContext.beginPath()
            backgroundContext.fillStyle = lightOrange
            backgroundContext.fillRect(0, 0, width, playtextCol.clientHeight)

            let centuryCursor = 0
            let widthCursor = 0
            let delimiterWidth = 2
            let centuryWidth = 0
            for (let century in this.witnessCenturies) {
                centuryWidth = this.witnessCenturies[century] * witnessWidth

                headerContext.beginPath()
                headerContext.fillStyle = delimiterColor
                headerContext.fillRect(widthCursor, 0, delimiterWidth, headerHeight)

                backgroundContext.beginPath()
                backgroundContext.fillStyle = delimiterColor
                backgroundContext.fillRect(widthCursor, 0, delimiterWidth, playtextCol.clientHeight)

                headerContext.save()
                headerContext.fillStyle = fontColor
                headerContext.translate(widthCursor + 5, headerHeight - 5)
                headerContext.rotate(-Math.PI / 2)
                headerContext.fillText(century, 0, fontSize)
                headerContext.restore()

                centuryCursor += 1
                widthCursor += centuryWidth
            }

            if (centuryWidth < 20) {
                widthCursor += 20 - centuryWidth
            }

            headerContext.beginPath()
            headerContext.fillStyle = delimiterColor
            headerContext.fillRect(widthCursor, 0, delimiterWidth, headerHeight)

            backgroundContext.beginPath()
            backgroundContext.fillStyle = delimiterColor
            backgroundContext.fillRect(widthCursor, 0, delimiterWidth, playtextCol.clientHeight)

            headerContext.save()
            headerContext.fillStyle = fontColor
            headerContext.translate(widthCursor + 5, headerHeight - 5)
            headerContext.rotate(-Math.PI / 2)
            headerContext.fillText("OCC.", 0, fontSize)
            headerContext.restore()

            witHeaderCol.style.backgroundImage = `url(${headerCanvas.toDataURL()})`
            witHeaderCol.style.backgroundPosition = `${witHeader.offsetLeft + 6}px 5px`

            playtextCol.style.backgroundImage = `url(${backgroundCanvas.toDataURL()})`
            playtextCol.style.backgroundPosition = `${witHeader.offsetLeft + 6}px 0px`
            playtextCol.style.backgroundColor = lightOrange
        }
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
        if (lineCursor < this.lowestLineNo) lineCursor = this.lowestLineNo

        let maxLineNo = Math.max(...this.visibleLineNos) + this.lineWindowBuffer
        let windowNos = new Set()
        while (lineCursor <= maxLineNo) {
            if (lineCursor >= this.lowestLineNo && lineCursor <= this.highestLineNo)
                windowNos.add(lineCursor)

            lineCursor += 1
        }
        return windowNos
    }

    configure(setting, default_value, config) {
        if (setting in config) this[setting] = config[setting]
        else this[setting] = default_value
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
        endpointParams.set('f_play.prefix', this.play)

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

        let lineURL = `${this.lineEndpoint}?${lineParams.toString()}`
        let noteURL = `${this.noteEndpoint}?${noteParams.toString()}`

        const responses = await Promise.all([fetch(lineURL), fetch(noteURL)])
        let [lineResults, noteResults] = await Promise.all(responses.map(response => response.json()))

        callback(lineResults, noteResults)
    }
}