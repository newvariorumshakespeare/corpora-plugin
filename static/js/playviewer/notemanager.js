export class NoteManager {
    constructor() {
        this.notes = {}
        this.lastCenturyBuffer = 20
        this.witnessMeterWidth = 100
    }

    placeNotes(lineID) {
        let line = window.nvs.playViewer.lines[lineID]
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
                                    <div id="variant-${variant.id}" class="col-sm-12 p-0 m-0 variant-witness-meter clickable${['xs', 'xm'].includes(this.currentBreakpoint) ? ' d-none' : ''}">
                                        <img id="${lineID}-${variant.id}-witness-meter" height="15" width="100%" src="/static/img/blank-meter.png" data-witness_indicators="${variant.witness_meter}" data-line_id="${lineID}" />
                                    </div>
                                </div>
                                <div class="row gx-0">
                                    <div class="col-sm-12 witness-formula" data-line_id="${lineID}" data-variant_id="${variant.id}">
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

    drawWitnessMeter(img, isVariantMeter) {
        if (!['xs', 'sm'].includes(window.nvs.playViewer.currentBreakpoint)) {
            let width =  this.witnessMeterWidth
            let height, inactive_color = null

            if (isVariantMeter) {
                height = 15
                inactive_color = "FFFFFF"
            } else {
                height = img.parentElement.parentElement.offsetHeight - 8
                if (height < 15) height = 15
                inactive_color="CFCFCF"
            }

            img.setAttribute('height', height)
            img.src = `${window.nvs.endpoints.witnessMeter}${img.dataset.witness_indicators}/${Math.floor(height)}/${Math.floor(width)}/${inactive_color}/0/`
        }
        if (!img.dataset.events_rigged) {
            img.onclick = (e) => this.displayVariantEditions(e.target)
            img.dataset.events_rigged = 'true'
        }
    }

    drawWitnessHeaderAndBackground() {
        if (!['xs', 'sm'].includes(window.nvs.playViewer.currentBreakpoint)) {
            if (window.nvs.witnesses === null) {
                fetchWitnesses(()=> { this.drawWitnessHeaderAndBackground() })
                return
            }

            let witHeader = getEl('witness-header')
            let witHeaderCol = getEl('playtext-header-col')
            let width = witHeader.offsetWidth
            let selectivelyQuotedWidth = 20
            let witnessWidth = (width - selectivelyQuotedWidth) / window.nvs.witnessCount
            let centuries = Object.keys(window.nvs.witnessCenturies)
            let lastCentury = centuries[centuries.length - 1]

            if (window.nvs.witnessCenturies[lastCentury] * witnessWidth < 20) {
                this.lastCenturyBuffer = 20 - window.nvs.witnessCenturies[lastCentury] * witnessWidth
                witnessWidth = (width - (this.lastCenturyBuffer + selectivelyQuotedWidth)) / window.nvs.witnessCount
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
            for (let century in window.nvs.witnessCenturies) {
                centuryWidth = window.nvs.witnessCenturies[century] * witnessWidth

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

    redrawMeters() {
        console.log('redrawing meters')
        forElsMatching('.variant-witness-meter', (el) => el.classList.remove('d-none'))

        forElsMatching('.show .variant-row .variant-witness-meter img', (el) => {
            this.drawWitnessMeter(el, true)
        })

        window.nvs.playViewer.placedLineNos.forEach(lineNo => {
            let lineID = window.nvs.playViewer.lineNoIDMap[lineNo]
            this.drawWitnessMeter(getEl(`${lineID}-witness-meter`))
        })

        this.drawWitnessHeaderAndBackground()
    }

    displayVariantEditions(meter) {
        let witSigla = Object.keys(window.nvs.witnesses)
        let sigla = []
        for (let slot = 0; slot < meter.dataset.witness_indicators.length - 1; slot++) {
            let indicator = meter.dataset.witness_indicators.charAt(slot)
            if (indicator !== '0') {
                for (let sigIndex = 0; sigIndex < witSigla.length; sigIndex++) {
                    if (window.nvs.witnesses[witSigla[sigIndex]].slots.includes(slot) && !sigla.includes(witSigla[sigIndex])) {
                        sigla.push(witSigla[sigIndex])
                        break
                    }
                }
            }
        }

        if (sigla.length) {
            let title = "Collated Editions for Variant";
            let content = "";
            sigla.map(siglum => {
                content += `<p>${window.nvs.witnesses[siglum].bibliographic_entry}</p>`;
            });
            displayNavModal(title, content, meter)
        }
    }

    rigUpNoteEvents(lineID) {
        let variantDiv = getEl(`${lineID}-variant-div`)
        if (!variantDiv.dataset.events_rigged) {
            forElsMatching(`#${lineID}-variant-div .variant-siglum`, (link) => {
                link.addEventListener('mouseenter', (e) => {
                    let link = e.target
                    let siglum = `s_${link.text.toLowerCase()}`
                    let parentDiv = link.parentElement
                    let lineID = parentDiv.dataset.line_id
                    let variantID = parentDiv.dataset.variant_id
                    let witMeter = getEl(`${lineID}-${variantID}-witness-meter`)
                    let witIndicators = witMeter.dataset.witness_indicators

                    if (!(siglum in window.nvs.witnesses))
                        siglum = `${siglum}_${window.nvs.playViewer.play}`

                    if (siglum in window.nvs.witnesses) {
                        window.nvs.witnesses[siglum].slots.map(slot => {
                            witIndicators = witIndicators.substring(0, slot) + 'x' + witIndicators.substring(slot + 1)
                        })
                    } else {
                        witIndicators = witIndicators.slice(0, -1) + 'x'
                    }

                    let urlParts = witMeter.getAttribute('src').split('/')
                    urlParts[urlParts.length - 6] = witIndicators
                    witMeter.setAttribute('src', urlParts.join('/'))
                })

            })

            forElsMatching('.variant-witness-meter img', (el) => {
                el.onclick = (e) => {
                    this.displayVariantEditions(e.target)
                }
            })

            variantDiv.dataset.events_rigged = 'true'
        }
    }

    registerNotes(notes) {
        notes.forEach(note => {
            note.lines.forEach(line => {
                if (line.xml_id in window.nvs.playViewer.lines) {
                    window.nvs.playViewer.lines[line.xml_id].notes.push(note.xml_id)
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
    }
}