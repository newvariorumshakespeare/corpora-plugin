class CommentaryViewer {
    constructor(commFrameID, config) {
        this.commFrame = getEl(commFrameID)
        // register configuration
        this.configure('play', 'wt', config)
        this.configure('host', 'corpora.dh.tamu.edu', config)
        this.configure('corpusID', '5f3d7c81cfcceb0074aa7f55', config)
        this.configure('swathSize', 10, config)

        this.commObserver = null
        this.commsLoaded = new Set()
        this.commEndpoint = `${this.host}/api/corpus/${this.corpusID}/Commentary/`
        this.swathCursors = {}
        this.navigating = false
        this.setupCommObserver()
        this.buildSkeleton()
    }

    noteTemplate(comm, area, swathLoader) {
        return `
            <div id="commentary-container-${comm.xml_id}" class="row g-0"><div class="col-sm-12">
            <div class="row">
                <div id="commentary-note-${comm.xml_id}"
                        class="col-sm-12 comm-heading${swathLoader ? ' swath-loader' : ''}"
                        data-xml_id="${comm.xml_id}"
                        data-first_line="${comm.lines.length ? comm.lines[0].xml_id : ''}"
                        data-status="stub"
                        data-area="${area}"
                        data-sequence="${comm.sequence}"
                        data-corpora_id="${comm.id}">
                    <span class="comm-indicator">n. ${comm.line_label}:</span> ${comm.subject_matter}
                </div>
            </div>
            <div class="row">
                <div id="commentary-content-${comm.xml_id}" class="col-sm-12 comm-block">${comm.contents}</div>
            </div>
            </div></div>
        `
    }

    async navigateTo(commID, callback=null) {
        let comm = getEl(`commentary-note-${commID}`)
        if (comm) {
            console.log(`${commID} already loaded--scrolling`)
            this.navigating = true
            comm.scrollIntoView({
                behavior: 'smooth'
            })
            if (callback !== null) { callback() }
            setTimeout(() => {this.navigating = false}, 1000)
        } else {
            await this.focusOnComm(commID)
            if (callback !== null) {
                let attempts = 0
                while (!this.commsLoaded.has(commID) && attempts < 20) {
                    await sleep(200)
                    attempts += 1
                }
                if (this.commsLoaded.has(commID)) callback()
                else console.log(`It took too long to load ${commID}`)
            }
        }
    }

    focusOnComm(commID) {
        let sender = this
        sender.clearFrame('Up')
        sender.clearFrame('Down')

        return fetch(`${this.commEndpoint}?f_play.prefix=${this.play}&f_xml_id=${commID}`)
            .then(response => response.json())
            .then(commInfo => {
                if (commInfo.records && commInfo.records.length === 1) {
                    let comm = commInfo.records[0]
                    sender.commFrameFocus.innerHTML = sender.noteTemplate(comm, 'Focus', false)
                    sender.swathCursors['Up'] = comm.sequence - 1
                    sender.swathCursors['Down'] = comm.sequence + 1
                    Promise.all([sender.loadSwath('Up'), sender.loadSwath('Down')])
                        .then(() => {
                            getEl(`commentary-note-${commID}`).scrollIntoView()
                            sender.commsLoaded.add(commID)
                        })

                }
            })
    }

    buildSkeleton() {
        // build infrastructure (topDiv, upDiv, focusDiv, downDiv, botDiv)
        this.commFrame.classList.add('w-100')

        this.commFrame.innerHTML = `
            <div class="d-flex flex-column w-100">
                <div class="d-flex flex-row align-items-start"><div id="commFrameTop" class="d-flex flex-column w-100"></div></div>
                <div class="d-flex flex-row align-items-end flex-grow-1"><div id="commFrameUp" class="d-flex flex-column-reverse w-100" style="min-height: 1000px;"></div></div>
                <div class="d-flex flex-row align-items-start" style="min-height: 40px;"><div id="commFrameFocus" class="d-flex flex-column w-100"></div></div>
                <div class="d-flex flex-row align-items-start flex-grow-1"><div id="commFrameDown" class="d-flex flex-column w-100" style="min-height: 1000px;"></div></div>
                <div class="d-flex flex-row align-items-end"><div id="commFrameBottom" class="d-flex flex-column-reverse w-100"></div></div>
            </div>
        `
        this.commFrameTop = getEl('commFrameTop')
        this.commFrameUp = getEl('commFrameUp')
        this.commFrameFocus = getEl('commFrameFocus')
        this.commFrameDown = getEl('commFrameDown')
        this.commFrameBottom = getEl('commFrameBottom')

        this.loadSwath('Top')
        this.loadSwath('Bottom')
    }

    setupCommObserver() {
        let sender = this
        this.commObserver = new IntersectionObserver(function(entries) {
            entries.map(entry => {
                if (entry.isIntersecting && !sender.navigating) {
                    if (entry.target.classList.contains('swath-loader') && !entry.target.dataset.swath_loaded) {
                        entry.target.dataset.swath_loaded = 'true'
                        console.log(`loading swath for ${entry.target.dataset.area}`)
                        sender.navigating = true
                        Promise.all([sender.loadSwath(entry.target.dataset.area)]).then(() => {
                            if (['Up', 'Bottom'].includes(entry.target.dataset.area)) entry.target.scrollIntoView()
                            sender.navigating = false
                        })
                    }
                }
            })
        })
    }

    loadSwath(area) {
        let params = {
            'page-size': this.swathSize,
        }
        let frame = this[`commFrame${area}`]
        let swathLoaderIndexes = [this.swathSize - 1]

        if (area in this.swathCursors) params['r_sequence'] = `${this.swathCursors[area]}to`

        if (['Bottom', 'Up'].includes(area)) {
            params['s_sequence'] = 'desc'
            if (area in this.swathCursors) params['r_sequence'] = `to${this.swathCursors[area]}`
        }

        let sender = this

        let url = `${this.commEndpoint}?${this.getEndpointParams(params).toString()}`
        return fetch(url).then(swath => swath.json()).then(swath => {
            let html = ''
            let records = swath.records
            let lastOfSequence = swath.records[swath.records.length - 1].sequence

            records.forEach((comm, index) => {
                if (!sender.commsLoaded.has(comm.xml_id)) {
                    let swathLoader = swathLoaderIndexes.includes(index)
                    html += sender.noteTemplate(comm, area, swathLoader)
                } else {
                    console.log(`${comm.xml_id} already loaded!`)
                }
            })

            appendToEl(frame, html)
            sender.swathCursors[area] = lastOfSequence

            forElsMatching(`#commFrame${area} .comm-heading[data-status="stub"]`, (newStub) => {
                newStub.dataset.status = 'observed'
                sender.commObserver.observe(newStub)
                sender.commsLoaded.add(newStub.dataset.xml_id)
            })
        })
    }

    clearFrame(area) {
        forElsMatching(`.comm-heading[data-area="${area}"]`, (comm) => this.commsLoaded.delete(comm.dataset.xml_id))
        clearEl(this['commFrame' + area])
    }

    configure(setting, default_value, config) {
        if (setting in config) this[setting] = config[setting]
        else this[setting] = default_value
    }

    getEndpointParams(params) {
        let endpointParams = new URLSearchParams()
        endpointParams.set('f_play.prefix', this.play)
        endpointParams.set('s_sequence', 'asc')
        Object.keys(params).forEach(key => endpointParams.set(key, params[key]))
        return endpointParams
    }
}